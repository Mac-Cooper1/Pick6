# Pick 6 — 2026 Launch Plan (v2)

**Audited:** Aug 4, 2026 · last commit Dec 17, 2025 (`8988d5e`) · builds pass clean on Node 22
**Deadline:** First games **Thu Aug 27** (ESPN Week 1 opens). Full slate Sep 3–5. League must draft before games kick off.
**Product:** the full infrastructure build — live snake draft rooms, real accounts, automated scoring and swap. `Rules.md` defines the *game rules* (slots, scoring, swap), not the feature ceiling.

---

## Audit TL;DR (unchanged from v1)

Never deployed — both `.env`s are localhost-only. Builds pass; the hard parts (ESPN sync, Odds API spreads, standings math, Prisma stack) work. What's missing is the rules layer: **no conference slots anywhere** (`grep -i slot` = zero hits), roster hardcoded to 6 not 5, **no ±3.5 threshold** (any underdog win pays +2 today), no week-5 swap, no Leaderboard/Week-by-Week/Draft-Recap tabs, seed data is 2024–25 alignment, and scoring has silent-zero traps (FCS opponents dropped; odds lost forever if synced after kickoff). Full defect inventory with file:line refs in the appendix.

---

## Decisions — LOCKED (Aug 4)

| # | Decision | Ruling |
|---|---|---|
| **D1** | Draft mechanism | **Keep the live snake draft room** — sockets, countdown, autopick, queue, scheduled auto-start. Make it **slot-aware** (5 rounds; each pick must fill an open conference slot). Auction, waivers, and free agency are cut — the week-5 swap is the only in-season roster move. |
| **D2** | Auth | **Real accounts: email + password** (bcrypt) to register; join leagues via league code. Drop the separate league password. |
| **D3** | "Group of 5" slot = **Group of 6** | **AAC, C-USA, MAC, Mountain West, Sun Belt + the rebuilt Pac-12** (updated Aug 4 — with the Pac-12 rebuilt it's the G6 now). Only non-ND independents (UConn) stay unslotted. Slot mapping is seed data, so future amendments are data changes, not code. |
| **D4** | League scope | Multi-league backend stays; your league is just join code `2026`. |
| **D5** | Hosting | **Render** (already started there): Starter web service **~$7/mo always-on** (required — free tier spin-down kills socket draft rooms and cron) + **Render Basic Postgres ~$6/mo** (free Postgres **expires after 30 days** and is then deleted — unusable for a season). GitHub Actions = external cron. $0 DB alternative: Neon free tier (no expiry). Runbook below. |
| **D6** | Week & season model | **Adopt ESPN's canonical calendar** (verified against their API Aug 4): regular season = seasontype 2, **weeks 1–15**; "Week 0" doesn't exist — ESPN's Week 1 spans **Aug 22 → Sep 8** and includes the Aug 27–29 games; Week 15 ends **Dec 13** (Army-Navy). Season = first game of Week 1 → last game of Week 15; bowls/CFP are seasontype 3 and never synced. Implementation below. |

### D6 implementation: the week model

ESPN's 2026 calendar (fetched live from their scoreboard API):

```
Week 1   Aug 22 → Sep 8     (includes the "Week 0" games Aug 27–29 + Labor Day)
Week 2   Sep 8  → Sep 14    (short week)
Week 3+  Mon → Sun (midnight Pacific boundaries, shifts with DST at week 9/10)
Week 15  Dec 7  → Dec 13    (ends with Army-Navy — last game of the season)
```

Boundaries are irregular — **never compute them; ingest them**:

- New `SeasonWeek` table: `(seasonYear, weekNumber, label, startDate, endDate)`, seeded from ESPN's calendar API (one fetch, ~15 rows/season).
- `currentWeek(season)` becomes a **derived lookup** (`now` between start/end; before Week 1 → 1; after Week 15 → season over). Delete the stored `League.currentWeek` and the never-written manual-advance concept entirely.
- Cron runs **daily** (CFB plays Tue–Sat): derive the week, sync that week's games + odds every morning (odds land before every kickoff, including MACtion), sync scores + finalize + rescore every night. No "advance week" job needed — Monday morning the derivation just returns the next week.
- Week-5 swap timing under this model: Week 5 = **Sep 28 → Oct 4**; the swap window auto-opens when Week 5 is finalized (~Sun Oct 4).
- Weekly views run 1–15 from `SeasonWeek`, not the hardcoded 1–15 ranges and week-5 defaults sprinkled in the client today.

---

## Workstreams

### WS1 — Cut auction/waivers/free agency ✅ DONE (Aug 4)
- [x] Server: deleted `auctionService`, `auctionController`, `auctionSocket`, `routes/auction.ts`, waiver/free-agent halves of `rosterService`/`rosterController`, `utils/draft.ts`, `leagueController.ts.backup`, `scripts/test-auction.ts`, stale `scripts/integration-test.ts`
- [x] Client: deleted `AuctionTab`, `WaiverTab`, `RosterTab`, auction/waiver/free-agent/odds API functions (~330 LOC of api.ts), legacy routes `/league-setup` + `/app/:leagueId`
- [x] Schema: dropped `WaiverClaim`, `AuctionEvent`, `AuctionBid`, FAAB columns, `waiverPriority`, `rosterSize`, `DraftType` (snake only now)
- [x] **Kept:** the entire draft stack — `draftService`, `draftSocket`, `DraftRoom`, `DraftTab`, queue, timers, scheduled auto-start, `services/socket.ts`

### WS2 — Slot model + slot-aware snake draft ✅ DONE (Aug 4)
- [x] `ConferenceSlot` enum (`SEC | BIG_TEN | ACC_ND | BIG_12 | G6 | NONE`); `Team.slot` stamped at seed (Notre Dame → `ACC_ND`; G6 per amended D3 incl. Pac-12)
- [x] `RosterSlot (leagueId, userId, slot, teamId, fromWeek, toWeek?)` with partial unique indexes (`WHERE "toWeek" IS NULL`) for one-owner-per-team + one-team-per-slot — DB-enforced, in migration `20260804120000_slots_and_simplify` (hand-authored; **not yet applied — needs a running Postgres**)
- [x] Draft = 5 rounds snake; `makePick` validates slot openness; pick + RosterSlot + queue cleanup + league advance in **one transaction**; Fisher-Yates draft order
- [x] Autopick: queue-first (skips taken teams and filled slots), fallback = best available by **AP rank** via ESPN rankings, then random — no more alphabetical Air Force
- [x] DraftRoom UI: slot filter chips, filled-slot disable states, open-slots banner on your turn, roster panel = 5 named slots, board cells show each pick's slot
- [x] Draft REST hardening: membership checks everywhere, commissioner check on `start`, removed the open `autopick` endpoint and the legacy REST `pick` path (live picks are socket-only)
- [x] **Draft Recap tab**: slots × players grid + pick-by-pick by round (also fixed MainApp's Rules-of-Hooks violation and DraftRoom's stale-closure bugs)

### WS3 — Scoring correctness ✅ DONE (Aug 4, verified by smoke test)
- [x] **±3.5 threshold**: `UPSET_SPREAD_THRESHOLD = 3.5` in `teamMatcher.wasUpset()` — smaller spreads and pick'ems score as regular results; exact ±3.5 counts (boundary-tested)
- [x] **FCS silent-zero fix**: `findOrCreateTeam` in syncService auto-creates unslotted stub `Team` rows for unknown opponents — FBS-vs-FCS games now land and score
- [x] **Effective-week scoring**: `calculateLeagueScores` reads `RosterSlot` rows where `fromWeek <= N <= (toWeek ?? ∞)`, so the week-5 swap can't corrupt already-played weeks (smoke-tested both directions)
- [x] `syncOdds(seasonYear?, weekNumber?)` scoped to the target week; `syncWeek`/`syncAllLeagues` pass it through
- [x] No-winner games (postponed/cancelled/tie) → explicit 0 + logged
- [x] Retired `GameResult` (model + table + legacy endpoints deleted, migration `20260804140000`); commissioner escape hatch = `POST /api/admin/game-override` (writes `Game`, recomputes upset from stored spread, rescores the week for all completed leagues)

**Verification:** `server/scripts/smoke-test.ts` (27 assertions, all green) drives a real 2-player draft through the services — turn order, slot/taken/NONE rejections, both partial unique indexes at the DB level, all four spread cases incl. the ±3.5 boundary, and swap-safe rescoring. Run: `npx tsx scripts/smoke-test.ts`. Leaves the inspectable "Smoke League" (code `SMOKE1`).

### Local dev on this machine (set up Aug 4)
- Docker runs via **Colima** (`colima start`, then `docker compose up -d` from repo root) — installed with Homebrew alongside the docker CLI
- **Pick 6 Postgres lives on port 5433** (compose + both server env files updated): a native Homebrew `postgresql@15` already owns 5432 on this Mac for other projects — don't stop it, don't reclaim 5432
- Fresh DB bootstrap: `npx prisma migrate deploy && npm run prisma:seed` from `server/`

### WS4 — Auth: email + password + league code ✅ DONE (Aug 4, HTTP-tested)
- [x] `User.passwordHash` (bcrypt cost 10, min 8 chars); login = email/password compare with a single generic 401 (no account-existence leak); JWT stays (7d). Migration `20260804150000_auth_passwords`
- [x] League password removed everywhere (schema column, create/join API, both client forms) — joining is by code only
- [x] JWT fallback secret removed — `getJwtSecret()` throws if `JWT_SECRET` unset (env validation at boot still fails fast with the friendly message)
- [x] Landing: password field on both signin/signup (8+ char hint), 401 → "Invalid email or password"
- [x] Crypto-random join codes via `crypto.randomInt` with an unambiguous alphabet (no 0/O/1/I/L)
- [ ] Password reset: still open — v1 answer is commissioner-assisted temp password (small admin endpoint, fits WS5's admin work); self-serve email reset is post-launch

**Verification:** 10/10 HTTP checks against the running server — register (201), duplicate email (409), short password (400), wrong password + unknown email (both generic 401), login (200), league create with no password (201), second user joins by code alone (200), `/me` with/without token (200/401). Smoke test still 27/27. Smoke UI logins: `smoke1@test.local` / `smoke123`.

### WS5 + D6 — Automation & the week model ✅ DONE (Aug 4, live-tested)
- [x] **`SeasonWeek` calendar (D6)**: ingested from ESPN's calendar API (15 weeks for 2026, Week 1 = Aug 22–Sep 8, Week 15 ends Dec 13); `getCurrentWeek()` derives the week from the clock (lazy first-use ingest); `League.currentWeek` column deleted — nothing "advances" anything. Migration `20260804160000_season_weeks`
- [x] **Admin gate**: all `/api/admin/*` behind `requireAdmin` — `x-admin-secret` header (scheduled jobs) OR commissioner JWT (in-app). Regular members and bad secrets get 403 (HTTP-tested all four paths). `ADMIN_SECRET` in env (+ prod warning if unset)
- [x] **`POST /api/admin/sync-current`** — the one idempotent endpoint cron hits: resolves current week from calendar → games → odds → finalize → rescore all leagues
- [x] **GitHub Actions workflow** (`.github/workflows/sync.yml`): daily 11:00 UTC (odds land pre-kickoff incl. weeknight MACtion), daily 08:30 UTC (overnight finals), Sat 23:00 UTC (mid-slate refresh), + manual dispatch. Retries ×3. **Activate on deploy: set `API_URL` + `ADMIN_SECRET` repo secrets.** Odds budget ≈ 90 calls/mo of 500
- [x] Architecture ruling: **no second server** — Postgres + the in-memory cache already shield the ESPN/Odds budgets from client traffic; the cron lives in Actions so server restarts can't kill the schedule
- [x] Commissioner "Sync now" button (Settings tab) + commissioner password reset (`POST /api/admin/reset-password`) — the WS4 parked item
- [x] `unhandledRejection` logs instead of killing the server; ESPN scoreboard `limit` 100 → 300 (**Week 1 2026 has 104 games — the old limit would have silently dropped 4**)

**Live verification (Aug 4):** 9/9 HTTP checks; `sync-current` pulled the real 104-game Week 1 slate, attached **real spreads to 101 games** (Odds API key confirmed working), auto-created 52 FCS stub teams, and rescored the league — the exact pipeline the Aug 27 dress rehearsal will run.

### WS6 — The tabs ✅ DONE (Aug 4)
- [x] **Leaderboard** (default tab): cumulative table with trophies + the ±3.5 scoring legend
- [x] **Week by Week**: full grid (players × ESPN weeks, color-coded cells, current week highlighted) with per-week drill-down — every team's opponent, score, spread, W/L + upset badge, and points. New endpoints: `GET /standings/:id/weeks` (grid) and `GET /standings/:id/week/:n/detail`
- [x] Final tab set: Leaderboard · Week by Week · League · Draft · Draft Recap · Settings
- [x] Landmines closed: `localhost:3001` prod fallback replaced with a build-time failure when `VITE_API_URL` is unset; favicon (football SVG) + title fixed (hooks violation, stale closures, roster-of-5 were fixed in WS2)

### WS7 — 2026 data ✅ DONE (Aug 4, seeded live)
- [x] **ESPN-driven seed**: conference membership from ESPN's **core API** per season (`/seasons/2026/types/2/groups/{id}/teams` — the site `/teams?groups=` filter turned out to be a no-op), names/abbreviations from the site catalog, keyed by `espnTeamId`. **138 FBS teams** landed: SEC 16, B1G 18, ACC+ND 18, B12 16, G6 69 (incl. Pac-12's 8), UConn unslotted. Realignment is now a seed re-run, not a code change
- [x] Slot mapping as config (conference → slot) + ND override by ESPN id; teams that drop out of all conferences auto-demote to `NONE`
- [x] Self-healing bonus: 4 former FCS "stubs" (Delaware, Missouri St, …) were actually FBS teams missing from the old hand list — matched by ESPN id and promoted into their real conferences
- [x] `oddsApiName`/`espnDisplayName` populated (e.g. "Alabama Crimson Tide" — The Odds API's exact format) and fed into odds matching ahead of the fuzzy fallback
- [x] `SeasonWeek` calendar seeds alongside; fresh-DB bootstrap is now migrate → seed → done
- [x] `RULES.md` committed as the game spec (current rules: slots incl. G6, ±3.5, snake draft, ESPN weeks 1–15, week-5 swap)

### WS8 — Automated week-5 swap ✅ DONE (Aug 4, 16 assertions green)
- [x] **Auto-opens** from the scheduled sync once the current week passes 5; order = ascending points through week 5 (tie → earlier join). Commissioner can also open/close manually (Settings)
- [x] One swap each, same slot, unrostered target; **pass** moves the clock but keeps your swap usable in the free-for-all phase; 24h turn clock with **lazy expiry** (ticks whenever swap state is read — no extra cron)
- [x] Effective-week roster math: old row closes, new row opens at `max(6, currentWeek)` — bumped a week if either team's game already started (no swapping in a team that already won). History is untouchable (smoke-verified)
- [x] UI: swap banner + order strip + drop/add pickers in Draft Recap; swapped-in teams show "(wk N+)"; commissioner window controls in Settings. Migration `20260804170000_swap_window`

### WS9 — Deploy on Render *(~1 session + dress rehearsal)*

**Postgres-in-production primer (first time ops):**
- Managed Postgres = Render runs the server, you get a `DATABASE_URL`. Use the **Internal URL** in the web service (same private network); the External URL (requires `?sslmode=require`) is for your laptop (`prisma studio`, seeding).
- **`prisma migrate deploy`** applies committed migrations, never generates them — that's the only migrate command that touches prod. `migrate dev`/`db push`/`db:reset` are dev-only (`db:reset` **drops the schema**).
- Backups: Render paid Postgres = daily snapshots (verify retention in dashboard). Before risky migrations: manual snapshot.
- Data size is trivial (~136 teams, ~800 games, 10 users) — no pooling/scaling concerns; default Prisma settings fine.

**Pre-staged Aug 4, revised Aug 5 → single-service on Render:**
- [x] Express serves `client/dist` with an SPA fallback → client + API share **one origin, one URL** (no CORS, no `VITE_API_URL`, the whole failure class gone). Verified locally: `/` and `/league/:id` serve the app, `/api/*` + `/health` stay JSON, same-origin login works
- [x] `render.yaml` rebuilt: one `pick6` web service (Starter, health check, combined server+client build with `npm ci --include=dev` — Render's `NODE_ENV=production` skips devDeps otherwise, `preDeployCommand: prisma migrate deploy`) + `pick6-db` (Basic — **never free tier: 30-day expiry then deletion**); auto-generates `JWT_SECRET` + `ADMIN_SECRET`
- [x] Vercel retired: `vercel.json` deleted; client defaults to same-origin relative URLs (`VITE_API_URL` kept only as a split-deploy override)
- [x] CORS `credentials` flag removed (Bearer auth, no cookies) — now moot anyway on a single origin

**Deploy-day findings (Aug 5):** the rebuild is merged (PR #1) and old deployments from December exist on both sides. **Vercel is healthy**: repo-connected, auto-built the new client, stable prod domain `https://pick6-m3r4.vercel.app` (deployment-hash URLs are SSO-gated for anyone but the owner — always share the stable domain). **Render `pick6-r5q0` is a corpse**: still serving pre-rebuild December code (new deploys either off or failing) and its `DATABASE_URL` points at a deleted/paused Supabase project (`FATAL: tenant/user postgres.ccxbnlfjnhyrajiurtlc not found`). Path chosen: apply the `render.yaml` Blueprint (fresh `pick6-api` + `pick6-db`), then update Vercel's `VITE_API_URL` to the new API URL and delete the old service.

**Deploy day checklist (single-service):**
- [ ] Push the single-service change to `main` (Render builds from GitHub)
- [ ] Render → New → **Blueprint** → this repo → apply; then paste `ODDS_API_KEY` in the service's Environment tab
- [ ] Seed once from laptop: `cd server && DATABASE_URL='<pick6-db external URL>' npm run prisma:seed`
- [ ] GitHub repo secrets `API_URL` (the new service URL) + `ADMIN_SECRET` (copy from Render env) → run the sync workflow once via workflow_dispatch to confirm
- [ ] Delete the old `pick6-r5q0` Render service and the Vercel project (Settings → Delete) — nothing may keep pointing at the dead Supabase URL
- [ ] Smoke on the new URL: register 2 accounts → create league → live 2-player draft (sockets same-origin) → Sync Now
- [ ] **Dress rehearsal Aug 27–29:** real Week 1 games in a test league — odds land pre-kickoff, scores finalize, ±3.5 upsets flag

### WS10 — Hardening (launch-relevant items done Aug 4)
- [x] Test harness: `scripts/smoke-test.ts` now runs **43 assertions** end-to-end (draft, DB constraints, all scoring cases incl. ±3.5 boundary, swap-safety, full swap-window lifecycle)
- [x] Log noise: per-request matchup match-logging removed (no-match warnings kept); client socket connect/disconnect logs removed; operational `[Sync]/[Season]/[Swap]/[Admin]` logs kept on purpose (they're the Render logs you'll read)
- [x] ESPN pagination guard (limit 300; Week 1 2026 = 104 games)
- [ ] Post-launch, as needed: error-class cleanup (some 400s vs 500s), matchup fan-out memoization, uptime ping on `/health`

---

## Calendar (games start Aug 27; full slate Sep 3–5)

| Week | Target |
|---|---|
| **Aug 4–10** | WS1 cut + WS4 auth + WS2 schema/slot model |
| **Aug 11–17** | WS2 slot-aware draft room end-to-end + WS7 2026 seed + WS3 scoring |
| **Aug 18–24** | WS5 automation + WS6 tabs + WS9 deploy. **League opens, friends register + schedule draft.** |
| **Aug 25–31** | Aug 27–29 dress rehearsal on real games · fix fallout · **real draft before Sep 3** |
| **Sep 3–5** | Week 1 full slate — first scored week |
| **by Oct 4** | WS8 swap live (Week 5 ends Oct 4) |
| **Dec 12** | Season ends (Army-Navy, Week 15) — leaderboard final |

---

## Appendix — defect inventory (file:line, from full audit)

**Security / access control**
- All `/api/admin/*` open to any authenticated user — `routes/admin.ts:20` *(WS5)*
- Draft REST: `start` lacks commissioner check (`draftController.ts:206`); `autopick` (`:261`) + queue endpoints (`:288,317`) lack membership checks *(WS2)*
- Email-only login, no credential — `authController.ts:63` *(WS4)*
- Two divergent hardcoded JWT fallbacks — `utils/auth.ts:3` vs `lib/env.ts:45` *(WS4)*
- `Math.random()` join codes — `utils/joinCode.ts:5` *(WS4)*
- CORS `'*'` + `credentials: true` — `server.ts:48` *(WS9)*

**Scoring correctness**
- No ±3.5 threshold — `teamMatcher.ts:226-246` *(WS3)*
- FCS/unseeded opponents silently dropped → rostered team scores 0 — `syncService.ts:44-50` *(WS3)*
- Odds never attach after kickoff — `syncService.ts:139-142` *(WS5 daily sync)*
- Scorer uses current roster for any week — `syncService.ts:267-286` *(WS3)*
- `league.currentWeek` never written by any code *(D6 deletes it)*
- `syncOdds` scans all seasons — `syncService.ts:139` *(WS3)*
- Null-winner games silently skipped — `syncService.ts:302` *(WS3)*
- `RosterTeam` uniqueness broken (NULL in unique index) — `schema.prisma:269` *(WS2 replaces)*
- `matchupService.ts:320` overrides league season with wall-clock year

**Draft stack (kept → must fix)**
- Non-transactional pick writes — `draftService.ts:262-282` *(WS2)*
- Biased shuffle for draft order — `draftService.ts:91` *(WS2)*
- Autopick fallback = alphabetical — `draftService.ts:401-405` *(WS2)*
- `draftType` LINEAR stored, never branched — *(WS1 removes)*
- DraftRoom stale closures — `DraftRoom.tsx:116-219` *(WS6)*
- Roster size 6 hardcoded: `draftService.ts:15` + 6 client sites *(WS2/WS6)*

**Reliability / client**
- `unhandledRejection` → `process.exit(1)` — `server.ts:120-123` *(WS5)*
- `localhost:3001` in prod bundle — `api.ts:21`, `socket.ts:11` *(WS6)*
- Rules-of-Hooks violation — `MainApp.tsx:20-30` *(WS6)*
- Standings hardcoded to week 5 — `StandingsTab.tsx:11` *(WS6/D6)*
- In-memory cache/timers = single instance only (fine at this scale, don't scale horizontally)
- `lint` script but no ESLint config; favicon 404; no tests anywhere

**Dead weight**
- `leagueController.ts.backup` (297 LOC), `utils/draft.ts`, client `RosterTab`+`WaiverTab` (334 LOC), ~24 unused client API fns, legacy `GameResult` dual path, ~15 unused exports, 62 `console.log`s *(WS1/WS10)*
