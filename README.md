# Pick 6 — College Football Pick'em League

Draft **5 college football teams — one per conference slot — and ride their wins all season.** Live snake draft with your league, automated scoring from real games and betting lines, one cumulative leaderboard. Built for the 2026 season.

**Play:** https://pick6-o4qw.onrender.com (the official Pick 6; any league can sign up there)

## Game Rules

**The draft.** Each player fills 5 conference slots, one team per slot:

| Slot | Pool |
|---|---|
| SEC | 16 teams |
| Big Ten | 18 teams |
| ACC + Notre Dame | 17 ACC teams + Notre Dame |
| Big 12 | 16 teams |
| Group of 6 | AAC, C-USA, MAC, Mountain West, Sun Belt, and the rebuilt Pac-12 |

No two players in a league may roster the same team. Drafting happens in a **live snake draft room** (5 rounds, pick clock, autopick from your queue).

**Scoring (per team, per week)** — favorite/underdog comes from the pre-game betting line:

| Result | Points |
|---|---|
| Win | +1 |
| Win as underdog of **+3.5 or more** | +2 |
| Loss | 0 |
| Loss as favorite of **−3.5 or more** | −1 |

Smaller spreads and pick'ems score as regular results.

**The season.** ESPN's official calendar, regular season only (2026: weeks 1–15, from the Aug 22 window through Army-Navy on Dec 12). Bowls and the CFP don't count. There is no "Week 0" — ESPN folds the late-August openers into Week 1, so some teams play twice in it. **Every game counts**: a team's second game in an ESPN week counts as the next week's game if the team is off that week (FSU's Sep 7 game = week 2); if the team also plays the next week, both games count in the same week.

**Week-6 swap.** Every player gets one same-slot swap. During week 5 each player ranks a private list of swaps ("drop X, add Y", up to 10) on the Week 6 Swap tab, picking from every unowned team sorted by its Pick 6 points this season; when week 6 starts the scheduled sync runs every league at once in reverse standings (worst record first, ties by the tiebreaker below), and each player gets the highest swap on their list that's still possible. Only teams unowned at the lock can be added, so dropped teams stay out of play. Past weeks keep their points (scoring is roster-as-of-that-week); new teams count from week 6.

**Standings.** One cumulative leaderboard. No head-to-head. **Tiebreaker**: on equal points, the lower combined ESPN FPI strength-of-schedule rank of a player's five teams ranks higher (1 = hardest schedule in FBS).

## Features

- **Accounts**: email + password (bcrypt), JWT sessions; leagues joined by a 6-character code or a shared join link that presets it; members edit their display name in Settings
- **Live snake draft**: Socket.IO rooms, server-time countdown clock, scheduled auto-start with a pre-draft lobby (order, presence, queue building), slot-aware pick validation, draft queue with AP-rank autopick fallback
- **Draft order**: assigned when the draft is scheduled — random or set manually by the commissioner in Settings — and visible in the lobby before the first pick
- **My Team**: your five teams with this week's game each — opponent, kickoff, venue, TV network (from ESPN), and the stored spread with what it means for scoring
- **Team card**: tap a team on My Team, Week by Week, League or the Week 6 Swap board for its season, ESPN fantasy player-card style: the tapped game (preview with ESPN's matchup predictor, live, or final), the season (results with each game's Pick 6 points, then upcoming games and byes), ESPN headlines, record, rank and FPI SOS rank
- **Week 6 Swap tab**: every unowned team sorted by Pick 6 points this season (slot filters, your own team in that slot for comparison, one-tap Add), your ranked swap list, the projected order with the tiebreaker, and a recap of how the swap went after the run; swapped-in teams carry a "Week 6 Swap" badge on My Team, Week by Week and League
- **Standings tiebreaker**: ESPN FPI strength of schedule, refreshed on every scheduled sync; one ordering (`standingsService`) drives the Leaderboard, Week by Week, the dashboard rank and the swap order
- **Settings** opens from the header button (Log out lives in Settings; the dashboard, which has no settings page, keeps Log out in its header)
- **Automated scoring**: ESPN scores + The Odds API spreads → upset detection (±3.5 rule) → weekly rescore, on a GitHub Actions schedule
- **Effective-week rosters**: scoring always uses the roster that was active during that week — the week-6 swap can never rewrite history
- **Matchup board**: each rostered team's upcoming opponent, kickoff, and spread (read from the DB — the exact line scoring will use) with AP rank badges
- **Commissioner tools**: schedule the draft, "Sync now", manual game-result override, member password reset
- **DB-enforced integrity**: partial unique indexes guarantee one owner per team and one team per slot

## Tech Stack

**Frontend**: React 18 + TypeScript, Vite, Tailwind, React Router, TanStack Query, socket.io-client, Phosphor icons, self-hosted Barlow / Barlow Condensed (`@fontsource`)
**Backend**: Node/Express + TypeScript, Prisma + PostgreSQL, Socket.IO, JWT + bcrypt
**Data**: ESPN hidden API (scores, schedules, rankings, season calendar, team/conference membership, FPI strength of schedule; team schedules, team news and the matchup predictor for the team card) + The Odds API (spreads; 500 credits/mo free tier — only the sync pipeline spends them, ~1 credit per cron run; user traffic reads spreads from the DB)

## Getting Started (local)

Prereqs: Node 22 (pinned in `.node-version`, which CI and Render also read; ESLint 10 needs 22.13+), Docker (Docker Desktop or [Colima](https://github.com/abiosoft/colima): `brew install colima docker docker-compose && colima start`).

```bash
# 1. Postgres (NOTE: host port 5433 — 5432 is left free for any native Postgres)
docker compose up -d

# 2. Server
cd server
npm install
cp .env.example .env        # defaults work for local; set ODDS_API_KEY for spreads
npx prisma migrate deploy
npm run prisma:seed         # teams + slots (2026 alignment) — fetches live from ESPN
npm run dev                 # http://localhost:3001

# 3. Client (second terminal)
cd client
npm install
npm run dev                 # http://localhost:3000
```

**End-to-end check** (drives a real 2-player draft + scoring against your local DB):

```bash
cd server && npx tsx scripts/smoke-test.ts
```

Leaves an inspectable "Smoke League" — sign in as `smoke1@test.local` / `smoke123`.

**Lint** (ESLint 10; the PR check runs it too). From the repo root:

```bash
npm --prefix server run lint && npm --prefix client run lint
```

## Environment Variables

**Server** (`server/.env`):

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | local default: `postgresql://pick6:pick6local@localhost:5433/pick6` |
| `JWT_SECRET` | yes | no fallback — server refuses to sign tokens without it |
| `ADMIN_SECRET` | prod | shared secret for scheduled syncs (`openssl rand -hex 24`) |
| `ODDS_API_KEY` | recommended | [the-odds-api.com](https://the-odds-api.com/) — without it, no upset detection |
| `CORS_ORIGIN` | prod | exact client origin |
| `PORT` / `NODE_ENV` / `ESPN_GROUP_ID` | no | defaults `3001` / `development` / `80` (FBS) |

**Client**: none required — the app is same-origin in dev (Vite proxy) and in production (the server serves the built client). `VITE_API_URL` exists only as an override for split client/API deployments.

## Scheduled Scoring

`.github/workflows/sync.yml` hits `POST /api/admin/sync-current` (resolves the current week from the ESPN calendar, then runs the idempotent pipeline over a three-week window: **previous week** games → finalize → rescore, so a game that ends after ESPN's week boundary still lands; **current week** games → odds → finalize → rescore; **next week** schedule only, so the double-game attribution can tell a bye from a not-yet-synced week. One Odds API credit per run):

- **Daily 11:00 UTC** (~7am ET) — games + odds land before any kickoff (spreads only attach pre-kickoff)
- **Daily 08:30 UTC** — overnight scores for Tue–Sat night finals
- **Sat 23:00 UTC** — mid-slate refresh
- Manual: Actions tab → "Scheduled sync" → Run workflow

**Strength-of-schedule ranks refresh here too** (`syncSosRanks`: one free ESPN core-API call, `powerindex` field `avgsosrank`, stored in `TeamSos` per season); a failed fetch keeps the last stored ranks.

**The week-6 swap runs here too.** Each run ends by calling `runDueSwaps`: once week 6 has started (Mon 07:00 UTC, 3am ET), every drafted league that hasn't swapped yet is processed, right after week 5 was finalized and rescored in the same run, so the order uses final standings. In 2026 that's the Mon Oct 5 08:30 UTC run, with 11:00 UTC as the backstop (first week-6 kickoff: Tue Oct 6, 8pm ET). A league runs exactly once (`League.swapRanAt`); the response lists it under `swapsRun`. If the cron ever misses, Run workflow does the same thing.

**Activate**: set repo secrets `API_URL` and `ADMIN_SECRET` (Settings → Secrets and variables → Actions). The cron lives outside the app server on purpose — a restart or deploy can never silently kill the schedule.

## API Overview

All routes JWT-protected unless noted; admin routes take `x-admin-secret` **or** a commissioner JWT.

| Area | Routes |
|---|---|
| Auth | public: `POST /api/auth/register` `POST /api/auth/login` · JWT: `GET /api/auth/me` `PATCH /api/auth/me` (name) |
| Leagues | `GET /my` · `POST /create` · `POST /join` (code only) · `GET /:id` · `GET /:id/members` · `PATCH /:id/settings` |
| Week-6 swap | `GET /leagues/:id/swap` (phase, lock time, order with tiebreak SOS, your list, results) · `GET /leagues/:id/swap/teams` (unowned teams by Pick 6 points + your five) · `PUT /leagues/:id/swap/claims` (replace your ranked list while lists are open) — the run itself happens in the scheduled sync |
| Draft | `GET /:id/picks` · `GET /:id/available` · `GET /:id/state` · `POST /:id/start` (commissioner) · queue CRUD — live picks go over Socket.IO |
| Rosters | `GET /:id` · `GET /:id/my` · `GET /:id/user/:userId` · `GET /:id/available` · `GET /:id/matchups[/all]` · `GET /:id/teams/:teamId[?event=&userId=]` (team card: games with lines and Pick 6 points, schedule, ESPN headlines, SOS) |
| Standings | `GET /:id/week/:n` · `GET /:id/overall` |
| Admin | `POST /sync-current` · `POST /sync-calendar/:year` · `POST /sync-week/:id/:n` · `POST /sync-games\|sync-odds\|finalize-games\|sync-all-leagues` · `POST /game-override` · `POST /repair-spreads/:year/:n[?apply=true]` (stored lines vs ESPN's closing line; dry run unless applied) · `POST /reset-password` · read-only previews |
| CFB | scoreboard, schedule, AP rankings (cached 60s–1h) |

## Project Structure

```
pick6/
├── client/src/            # React app (pages, components, contexts, services)
│   └── pages/             # Landing (/), Login (/login), Dashboard, LeagueSetup, MainApp (tabs)
├── server/src/
│   ├── controllers/       # auth, leagues, draft, rosters, standings, admin
│   ├── services/          # draft, roster, sync (ESPN+odds pipeline), season calendar,
│   │                      # week-6 swap, matchups, team card, teamMatcher, cache
│   ├── socket/            # live draft room
│   ├── middleware/        # JWT auth, admin gate, error handler
│   └── lib/, utils/, types/
├── server/prisma/         # schema, migrations, ESPN-driven seed
├── server/scripts/        # smoke-test.ts (end-to-end draft + scoring)
├── .github/workflows/     # scheduled sync cron (sync.yml) + PR checks (checks.yml)
├── docker-compose.yml     # local Postgres on host port 5433
└── LAUNCH_PLAN.md         # workstream plan, decisions D1–D7, defect audit
```

## Deployment

**Single service on Render** (`render.yaml` blueprint): one web service (~$7/mo Starter) runs the Express API *and* serves the built client from the same origin — no CORS, no build-time API URLs, one URL to share — plus managed Postgres (~$6/mo Basic) and the GitHub Actions cron. Full runbook: [LAUNCH_PLAN.md](LAUNCH_PLAN.md) → WS9. Key facts: `prisma migrate deploy` is the only migrate command that touches prod (the blueprint runs it pre-deploy); Render free Postgres expires after 30 days (never use it); Render's `NODE_ENV=production` makes `npm ci` skip devDependencies, so the build commands use `--include=dev`.

## License

Source-available, not open source: see [LICENSE.md](LICENSE.md). You're welcome to read the code, change it, share it and run it privately, and pull requests are welcome; hosting a copy for other people, packaging it as an app, or using it commercially isn't allowed. Want your own league? Create one on [Pick 6](https://pick6-o4qw.onrender.com). Third-party packages, fonts and data (ESPN, The Odds API) keep their own terms.

## Changelog

**Aug 4, 2026** — The great 2026 rebuild (WS1–WS5 + D6 of [LAUNCH_PLAN.md](LAUNCH_PLAN.md)):
- **Cut**: FAAB auction, waiver wire, free agency, linear drafts, legacy manual game entry (~2k LOC)
- **Slot model**: `ConferenceSlot` on every team; rosters became 5 effective-week `RosterSlot` rows with DB-enforced (partial unique index) exclusivity; snake draft is slot-aware (5 rounds, slot validation, transactional picks, Fisher-Yates order, AP-rank autopick); new Draft Recap tab
- **Scoring correctness**: ±3.5 upset threshold, FCS opponents auto-stubbed (were silently scoring 0), odds sync scoped to the week, roster-as-of-week scoring (swap-safe), postponed/cancelled games logged
- **Auth**: real email+password accounts (bcrypt), league join by code only, JWT fallback secrets removed, crypto-random join codes
- **Automation (WS5)**: all admin routes gated (ADMIN_SECRET or commissioner JWT), `sync-current` one-call pipeline, GitHub Actions cron ×3 schedules, commissioner Sync-now button + password reset, `unhandledRejection` no longer kills the server
- **Week model (D6)**: `SeasonWeek` calendar ingested from ESPN (no "Week 0"; 2026 = weeks 1–15 ending Dec 13); current week is derived, never stored; ESPN scoreboard limit 100→300 (Week 1 2026 has 104 games)
- **Local dev**: Colima + Docker; Postgres moved to host port 5433 (native 5432 Postgres coexists); `scripts/smoke-test.ts` = 27-assertion end-to-end draft + scoring harness
- **2026 data (WS7)**: seed now pulls conference membership live from ESPN's core API (138 FBS teams; realignment = re-run the seed, not a code change); `oddsApiName` populated for exact spread matching; 4 missing FBS teams (Delaware, Missouri St, …) self-healed from FCS stubs; `RULES.md` added as the game spec
- **Tabs finished (WS6)**: new **Leaderboard** (default) and **Week by Week** tabs — full season grid with per-week, per-team drill-down (result, score, spread, upset badge); production builds now fail loudly if `VITE_API_URL` is missing instead of silently pointing at localhost; real favicon
- **Week-5 swap live (WS8)**: window auto-opens after week 5 from the scheduled sync; worst-record-first turns on a 24h clock (lazy expiry), pass-and-swap-later free phase, same-slot + availability + "game already started" guards; swap UI in Draft Recap, commissioner open/close in Settings
- **Deploy pre-staged (WS9 prep)**: `render.yaml` blueprint (API + Postgres, auto-generated secrets, migrate-on-deploy), CORS `credentials` flag removed (Bearer auth needs none)
- **Verified live**: real 104-game Week 1 slate synced, spreads attached to 101 games, 52 FCS stubs auto-created, league rescored; smoke suite now **43 assertions**, all green

**Oct 2, 2026** — Custom domain: **https://pick6cfb.com** is live:
- Registered at Cloudflare Registrar (at-cost renewals, free WHOIS privacy). DNS at Cloudflare: CNAME `@` and `www` → `pick6-o4qw.onrender.com`, both **DNS only** (grey cloud) so Render issues and renews the certificate. Added under Render → pick6 → Settings → Custom Domains; `www` 301s to the bare domain.
- No code change: the app is same-origin and builds share/login links from `window.location.origin`. The old `onrender.com` URL still works but is retired from use. Logins live in each domain's own browser storage, so everyone signs in once on the new domain.
- Email plan (not built yet): Cloudflare Email Routing forwards inbound mail to Gmail; Resend's free tier sends the automations.

**Oct 1, 2026** — Fixes from a full code review of PR #21 (15 findings; everything but Dependabot, which is a GitHub settings toggle):
- **Login redirect, closed for real**: `?next=/.//evil.com` (or `/%2e//evil.com`, `/x/..//evil.com`) passed the same-site check and resolved to `//evil.com`, which a browser reads as another host. Only React Router 6.30.6 collapsing `//` kept it on-site. `internalPath` now also rejects any result starting with `//`
- **No more database details in error responses**: the global error handler returned any error's raw message, so during a database outage clients saw Prisma's text (internal DB host and port, model and query). Now only AppErrors and Express's own 4xx messages go to the client; anything else is a generic 500 with the details in the log. Controllers and the draft socket that pass a service's message through use `clientMessage()`, which hides Prisma's text the same way
- **Draft room queue**: while it's your turn, selecting a team pins it to the front of your queue. Moving off it dropped the team even if you had queued it yourself, and saved the shorter queue (autopick could no longer fall back to it). The pin now remembers where the team came from and puts it back; a drafted team is also dropped from your local queue right away, so it can't come back
- **League tab**: tiles said "No Game" while this week's matchups were still loading or after the request failed; they now say Loading... / Couldn't load games
- **Node version pinned**: production's Node wasn't pinned (Render's default for a new service is 24) while CI tested 22. The root `.node-version` (`22`) is now read by both Render and the PR check
- **PR check catches more**: every migration is applied to an empty Postgres (the same `prisma migrate deploy` Render's preDeploy runs), then the server must boot and answer `/health`
- **Smaller deploys**: `prisma` moved to the server's dependencies, so Render's server install drops `--include=dev` and no longer installs or ships the ESLint toolchain (112 packages instead of about 250)
- **Types**: `no-explicit-any` is back on outside the files that parse untyped ESPN/Odds JSON; the other 52 `any`s got real types (`NextFunction`, Prisma's update input, typed draft state/queue/settings/sync API responses), and caught errors are `unknown` through `utils/errors.ts` (server) and `apiErrorMessage` (client)
- **Smaller fixes**: `getDatabaseHost` parses the URL (a password containing `@` printed part of itself as the "host" in startup errors); `.agents/skills` is credited as MIT with its upstream LICENSE; both packages are `"private": true` (no accidental npm publish); README/LICENSE/LAUNCH_PLAN name the official site; README's Node prereq, lint command and project tree fixed; the parked-advisories notes are accurate about React Router shipping to production; cfb routes reuse the shared `asyncHandler`
- Verified: smoke test, `tsc` and lint (both packages) and the client build green; the new CI steps replayed locally (14 migrations onto a throwaway Postgres, boot + `/health`); Render's server build replayed without dev dependencies; the queue fix, `internalPath` cases, `getDatabaseHost` cases and every error-handler case exercised directly

**Sep 30, 2026 (after PR #20)** — Security updates, ESLint, a PR check and a license (Mac's items 4 and 5, then the license):
- **Server `npm audit`: 14 -> 0** (Render's log said 13; a new advisory landed since). The 1 critical (`tar`) and 2 highs lived in bcrypt 5's install-time binary downloader (`@mapbox/node-pre-gyp`), which only runs during `npm ci`. **bcrypt 5 -> 6** removes it: same `hash`/`compare` API, Node 18+, prebuilt binaries in the package, so the downloader and about 50 install-time packages are gone. Checked: a password hash made by bcrypt 5 at production cost still logs in under bcrypt 6 (and a wrong password is still rejected), via the real login endpoint too. The other 11 were request-handling DoS bugs fixed within current majors: express 4.21 -> 4.22.3 (body-parser, qs, path-to-regexp), socket.io internals (engine.io, socket.io-parser, ws) and jws (jsonwebtoken)
- **Client `npm audit`: 30 -> 4.** Everything that ships to browsers is patched (axios 1.12 -> 1.20, react-router 6.30.1 -> 6.30.6, socket.io-client internals), as are most build tools, and the dead ESLint 8 toolchain (with its vulnerable `@typescript-eslint` v6 packages) is replaced below. The 4 left (vite, esbuild, react-router, react-router-dom) need major versions. Vite and esbuild are dev-server bugs that don't reach production (it serves the built files from Express, not Vite). React Router does ship to production: one advisory is SSR-only (not used here), the other an open redirect through user-controlled navigation targets, and the only one is Login's `?next=`, which the fix below guards. Parked in NOTES.md
- **Login redirect hardening**: `?next=` (the after-login destination) accepted `/\evil.com` and `/<tab>/evil.com`, which browsers read as another site, so a crafted login link could bounce someone off Pick 6 after they signed in. It's now resolved against our own origin (`internalPath` in Login); anything that would leave the site goes to the dashboard. Normal links (shared join links, `/league/:id`) work as before
- **ESLint 10 in both packages** (`npm run lint`, flat config, warnings fail): ESLint + typescript-eslint recommended, plus the two classic React hooks rules on the client. Off on purpose: `no-explicit-any` (83 uses, nearly all untyped ESPN/Odds JSON and caught errors) and the hooks plugin's React Compiler rules (no compiler here). Fixed the 23 findings: unused imports/variables/parameters, a dead env helper, two `try { } catch (e) { throw e }` wrappers in the standings controller, two dead assignments, `let` -> `const`, a needless regex escape, an unused eslint-disable comment, the `Function` type in `asyncHandler`, and the original error kept as `cause` when database connection errors are re-thrown (server tsconfig `lib` -> ES2022 for that; the emitted target is unchanged)
- **PR check** (`.github/workflows/checks.yml`, free on a public repo): every PR and push to `main` runs server lint + type check and client lint + build on Node 22. It can't run the smoke test (that needs Postgres), so that stays a local step
- **License** (the repo is public): new `LICENSE.md`, Pick 6's own source-available terms modeled on ZenGM's approach. Anyone may read, change and share the code and run it privately; nobody but Mac may host it for others, package it as an app, compete with it or use it commercially; contributions are licensed to Mac; third-party packages and ESPN/Odds API data keep their own terms. `server/package.json` said `"license": "MIT"`, which contradicted that; both package files now point at `LICENSE.md`. Checked before going public with all this: no secret has ever been committed (the prod database URL, Odds API key and admin secret appear in no commit; prod's JWT and admin secrets are generated by Render), and the only emails in tracked files are test accounts and the forgot-password address the app already shows
- Verified: smoke test **110/110**; `npm audit` server 0, client 4 (the major-only ones above); the workflow's exact steps replayed from a clean copy of the repo with no `.env`; login 200 / wrong password 401 on bcrypt 6; `?next=/\evil.example` lands on the dashboard while `?next=/league/10` still goes to the league; every tab plus the team card and the draft room's socket connection checked in the browser (20 API calls after a reload, none failed)
**Oct 1, 2026** — Team card on the Week 6 Swap board (Mac's request):
- **Where**: every row on Available teams opens that team's card, so you can scout an unowned team's season while ranking your list (it has no owner, so no game is greyed out). With a slot filter on, the "Your [slot] team" row opens your own team's card for comparison. Add stays its own button beside the row, and the board's intro now says "Tap a team for its season."
- Client only (`SwapTab.tsx`): the card endpoint already handled unowned teams, so no server change, no migration and no Odds API calls
- Verified: `tsc` + `vite build` green; board rows and the your-team row opened the right cards in the browser at 1280 and 375 widths (local league 10, lists open), with the card's Pick 6 points matching the board's; on a phone each row is a 269×58px tap target with Add beside it, not inside it

**Sep 30, 2026 (after PR #19)** — Team card follow-ups (Mac's review):
- **One Season tab** replaces Game Log + Schedule: the whole season in week order, results with each game's Pick 6 points, then the games still to play, byes included. The right column is Pick 6 points only (with a column head); lines moved into each row's detail line so a points "+1" can't be read as a spread
- **League tab opens the card too**: every team tile, on that team's game this week (a team on bye says so and shows its next game)
- **Faster**: the sheet opens with a 0.25s animation (it was reusing the landing page's 0.6s one). A team's ESPN schedule now stays cached until its next kickoff, up to 15 minutes, and refreshes every minute only around kickoffs and live games (it was 60s always, so most taps went to ESPN). The tapped game's matchup predictor is fetched alongside the schedule instead of after it when its Game row confirms it's this team's game and hasn't kicked off. Locally: cold card about 0.5-0.9s, cached about 20-30ms
- **ESPN limits**: ESPN publishes none (the site/core APIs are undocumented; community docs only warn that excessive requests may be blocked). Every ESPN call stays cached per team or per game, never per player, so traffic tracks how many teams are being looked at, not how many people. Now also: simultaneous requests for one team share a single ESPN call (10 parallel cold requests made 3 calls in testing), and an ESPN error or throttle serves the last good copy and leaves ESPN alone for a minute instead of retrying on every tap
- Verified: smoke test **110** (5 new for the schedule cache timing); `tsc` + `vite build` green; League tab, Season tab and the bye note checked in the browser at 1280 and 375 widths

**Sep 30, 2026 (late night)** — Team card: tap a team for its season (Mac's request, modeled on ESPN fantasy's player card, minus the roster moves):
- **Where**: every slot card on My Team (yours or any member's) and every team tile in Week by Week's drill-down opens a team card, a bottom sheet on phones and a dialog on desktop. It opens on the game you tapped (a Week by Week tile opens on that week's game; a bye tile says "Off in week N" and shows the next game). Escape, the ×, or tapping outside closes it
- **What's on it**: a header in the team's ESPN color (logo, rank, conference standing, whose team it is, with "from week 6" / "through week 5" for swap teams), a stat strip (the team's Pick 6 points this season, record, Top 25 rank, ESPN FPI SOS rank of 138) and four tabs. **Matchup**: preview, live or final; both teams with ranks and records, kickoff, venue, TV, the stored line and what it means, "At stake: Win +1 · Loss -1" before kickoff or the points it earned after, ESPN's matchup predictor (win %) before kickoff, and a link to ESPN's game page. **Game Log**: every played game with the same W / Upset W / L / Bust L chips as Week by Week, the score, the line and its Pick 6 points; byes show 0; games outside the owner's roster window (the swap) are greyed and say so. **Schedule**: the rest of the season including bye weeks, kickoff (or "time TBD"), TV, and the stored line once posted. **News**: ESPN's team feed, newest six headlines, stories about the team preferred over league-wide roundups, each linking to the article. Tapping a game in the log or schedule shows it on Matchup
- **Data**: new `GET /api/rosters/:id/teams/:teamId?event=&userId=` (`teamCardService`). Scoring truth stays in Game rows (stored line, upset flag, `pointsForTeam`, scoring-week attribution), and a final Game row also supplies the score and result, so a commissioner override shows through. Display data comes from free ESPN calls cached in memory (team schedule 60s, news 15 min, predictor 10 min; 5s timeouts); if ESPN is down the card runs on the synced Game rows. No Odds API traffic (lines are the stored ones) and no migration. Week by Week's drill-down now also returns each game's `espnEventId`
- Along the way: `cacheService`'s cleanup timer is `unref`'d (any script that loads it, like the smoke test now, would otherwise never exit) and `fetchGameSummary` takes an optional timeout
- Verified: smoke test **105** (15 new: ESPN + Game row merge order, a final row beating ESPN, ESPN-final-before-sync showing no points yet, ESPN-only future games, owner-window flags, which game the card opens on, the Game-row-only fallback end to end, the away-side line flip, unknown team); `tsc` + `vite build` green; the endpoint's 401/400/403/404 paths probed; cards driven in the browser at 1280 and 375 widths against live ESPN data (local league 10) and the smoke league

**Sep 30, 2026 (night)** — Week 6 Swap badges and the post-run recap (Mac):
- **"Week 6 Swap" badge** (new `SwapBadge`: amber pill with a swap icon) on every team added in the swap: My Team cards (replacing the small "wk 6+" label), the Week by Week drill-down (weeks 6+; week 5 and earlier still show the team it replaced) and the League tab. A team counts as swapped in when its roster row starts after week 1
- **League tab shows current rosters**: it listed each player's *draft picks*, so after the swap it would have kept showing the dropped team and never the new one. `GET /leagues/:id/members` now returns the active roster (slot order, with `fromWeek`), keeping the draft pick number when there is one. This also fixes league 8's hand-added roster, which showed "No teams drafted yet"
- **How the swap went** (Week 6 Swap tab, after the run): every player in order with the points that placed them (plus SOS for tied players), the swap they made and which choice on their list it was, or why there was none ("didn't set a list" / "none of their 3 choices went through"). The lists themselves stay private; only their length shows
- **Migration `20260930140000_swap_order_snapshot`** (additive): `LeagueMember.swapPoints` / `swapSos`, saved by the run, so the recap shows the numbers that actually set the order (SOS ranks move daily). Deploy before Monday's run, or the recap falls back to live numbers
- Verified: smoke test **90** (the recap keeps run-time SOS 300 vs 100 though live values moved to 301/141, which choice each player got, list sizes only after the run); `tsc` + `vite build` green; badges on all three pages and the recap checked in the browser at desktop and phone widths

**Sep 30, 2026 (evening)** — Swap list lines no longer show season points (Mac, after the deploy):
- "Georgia +4 → Mississippi State +5" read like the swap trades points, and it never does: past points stay with the player, and a new team only scores for them from week 6. List lines now show just the teams. Points stay on the Available teams board (that's what it's sorted by) under a new "Points don't transfer" note saying exactly that. Client only (`SwapTab`); `tsc` + `vite build` green, checked in the browser at desktop and phone widths

**Sep 30, 2026 (later)** — Week 6 Swap tab, Settings in the header, and a standings tiebreaker (Mac's review of the swap build):
- **Week 6 Swap tab** replaces the Settings tab in the strip. It holds the ranked list (moved off My Team) next to a board of **every unowned team sorted by its Pick 6 points this season**: the league's own formula over every game (win +1, upset win +2, loss 0, bust −1), whoever owned the team, plus W-L. Slot filter chips; picking a slot shows your team in it for comparison; **Add** puts a team on your list against your team in the same slot (one team per slot, so the drop is implied and a cross-slot line can't be built); listed teams show their list position. The board hides once the swap has run. New `GET /leagues/:id/swap/teams` (unowned teams + your five, via `seasonRecord` in `scoringWeekService`)
- **Settings moved to the header**: the Log out button's spot is now a Settings button (gear, gold ring while open) and Log out lives in Settings' Your Profile card. The dashboard has no settings page, so its header keeps Log out
- **Tiebreaker (standings and the swap order)**: on equal points, the **lower combined ESPN FPI strength-of-schedule rank** of a player's current five ranks higher. Source checked first: ESPN's core API `seasons/{year}/powerindex` field `avgsosrank` is exactly the SOS column on espn.com's FPI resume page (Western Kentucky 1st, UMass 138th today; 138 FBS teams, no gaps, matches the page's own feed for all 138) and every one of prod's 137 draftable teams maps to it by ESPN id. New `TeamSos` table (migration `20260930130000_team_sos`), refreshed by every scheduled sync (`syncSosRanks`, reported as `sosRanksSynced`) and right before the swap runs. An unranked team or empty slot counts as last rank + 1; exact ties on points and SOS fall back to join order
- **One ordering everywhere**: new `standingsService.getStandings` (points → SOS → join) now drives the Leaderboard, Week by Week, the dashboard rank and the swap order, which is that list read bottom to top (the easier combined schedule swaps first). The Leaderboard shows "SOS n" under tied scores with a one-line explanation; the swap order chips show it for tied players. Prod today (read-only): every drafted league has at least one tie on points, and 8 of the 12 Kirven Pool players sit in tied groups, so this decides real swap positions
- Verified: smoke test **88 assertions** (tie broken both directions, unranked fallback, leaderboard order, board sorting/records/ownership); `tsc` + `vite build` green; the SOS sync run against live ESPN into the local DB (138 teams); tab, board, one-tap Add, Settings/Log out and the post-run view driven in the browser at 1280 and 375 widths

**Sep 30, 2026** — Week 6 Swap replaces the week-5 swap window (Mac's redesign, before week 5 kicks off):
- **Why**: the WS8 window gave each player a 24h turn, worst record first, starting after week 5. In a 4+ player league that runs for days, so a turn could straddle a team's game (whose points? can you still drop it?), and anything dropped late in the order went to the players after, the best records, which is the opposite of what the swap is for
- **New flow**: during week 5 every player ranks a private list of up to 10 same-slot swaps on My Team ("drop X, add Y", reorder/remove, saves on every change). Lists lock when week 6 starts on ESPN's calendar (Mon Oct 5, 3am ET), and the scheduled sync's first run of week 6 (08:30 UTC, after it finalizes and rescores week 5) runs every drafted league once: worst record through week 5 first (ties: earlier join), each player gets their highest line still possible, and every line records how it went (swapped / missed with the reason, e.g. "Dave took Florida earlier in the order" / not needed). Old team keeps weeks 1–5, new team counts from week 6
- **Dropped teams are out of play**: only teams unowned at the lock can be added, so nobody later in the order can pick up a team someone ahead of them dropped. Safety net for a late run: a line whose team already kicked off in week 6 misses (first week-6 game is Tue Oct 6, so the Monday runs have a full day of slack)
- **Server**: `swapService` rewritten (`getSwapSchedule` from `SeasonWeek`, `getSwapState`, `saveSwapClaims`, `runSwap` in one transaction that takes the league first so two syncs can't double-run it, `runDueSwaps` called by `syncCurrentWindow` / `syncAllLeagues`; `sync-current` now reports `swapsRun`). Routes: `GET /leagues/:id/swap` + `PUT /leagues/:id/swap/claims`; the turn-based `POST /swap`, `/swap/pass`, `/swap/open`, `/swap/close` are gone. The swap is automatic for every league, so the commissioner open/close card left Settings
- **Migration `20260930120000_week6_swap_lists`** (additive): `SwapClaim` table + `SwapClaimStatus` enum, `League.swapRanAt`. The old `swapStatus` / `swapTurnDeadline` / `swapSkipped` columns stay unused so a rollback to the previous deploy still boots; dropping them is parked in NOTES.md. Prod check before the change (read-only): every drafted league still had its window unopened except test league 3, where the old window was opened early and one member already swapped; that swap stands and that member can't set a list
- **Client**: swap UI with lists open → locked → done, the projected order and "You go 3rd of 10" (first built on My Team; moved to its own tab the same day, see the entry above), landing page and RULES.md copy updated
- Verified: smoke test **81 assertions** (was 66; the turn-based swap section is replaced by lists, validation, privacy, run order, fallthrough, the dropped-team rule, the kickoff safety net, history and week-6 scoring, idempotent re-run), `tsc` + `vite build` green; list editor and results driven in the browser at 1280 and 375 widths against local leagues

**Sep 24, 2026** — App State games had no betting line (NC State vs App State, week 4):
- **Cause**: ESPN calls the school "App State Mountaineers", The Odds API "Appalachian State Mountaineers". Since the Sep 11 matcher fix, names must agree positively (exact, alias, or same first word + mascot) and this pair is none of those, so every App State game from week 3 on went lineless. Weeks 1–2 only got lines through the old `null === null` bug (both happened to be the right game: stored -19.5 / ECU -6.5 vs ESPN's DraftKings close APP -21 / ECU -6.5). Same failure for Massachusetts (odds feed: "UMass Minutemen") and the FCS stub Long Island University ("LIU Sharks")
- **Full audit**: every school on ESPN's 2026 schedule (all 15 weeks, 240 teams incl. FCS opponents) checked against The Odds API's full participant list (`/participants`, 1 credit). Four more FCS schools missed: The Citadel ("Citadel Bulldogs"), SE Louisiana ("Southeastern Louisiana Lions"), UAlbany (plain "Albany") and Arkansas-Pine Bluff (odds feed drops the hyphen). The only one with a game still to play is The Citadel at Texas A&M (Oct 17), and A&M is rostered in four leagues. Their week-1 lines were right (old matcher; each within a point of ESPN's DraftKings close)
- **Fix**: all seven name pairs added to `TEAM_ALIASES`, and the alias keys now get the same normalization as lookups. They were only lowercased, so any alias with punctuation (hyphen, `&`, parentheses) could never match. Across all 66,203 schedule-name × odds-name pairs, exactly those 7 changed (all new matches, none lost); all 238 real schools now match (the 2 leftovers are ESPN's TBD placeholders). The next scheduled sync after deploy attaches lines to this week's NC State–App State, UMass–Sacramento State and LIU–FIU games (odds only attach before kickoff)
- Week 3's three lineless finals (App State–Charlotte, UMass–Stonehill, UL Monroe–SE Louisiana) changed no scores: none of those teams is rostered in a drafted league
- Smoke test: 66 assertions (was 58)

**Sep 11, 2026** — Three real-data bugs from weeks 1–2 (Mac's voice note), plus the tooling to fix prod:
- **Double-game weeks**: ESPN's Week 1 spans two weekends, so 12 teams (FSU, UNLV, USC, Stanford, Memphis, Hawai'i, NDSU, NMSU, …) played twice in it and scoring's `findFirst` silently dropped the second game for everyone. New `scoringWeekService` attributes every game to a scoring week under Mac's rule: the extra game rolls into the next week when the team is off then (FSU: Aug 29 = week 1, Sep 7 vs SMU = week 2), otherwise both count in the same week (UNLV). Scoring, the Week by Week drill-down (a team can now show two cards, with a "played wk N" tag on rolled games) and My Team (season points; a rolled game shows on the bye week with a note) all read the same map. `game-override` rescores the game's week and the next
- **Late finals never landed**: FSU–SMU ended ~2am ET Tuesday, after ESPN's week 1 closed, and `sync-current` only ever touched the current week, so SMU sat on TBD with its win uncounted. `sync-current` now syncs previous + current + next week (see Scheduled Scoring). Game rows also follow ESPN's kickoff/week/venue on update (rescheduled games used to stay in their original week)
- **Odds cross-matching**: the matcher compared alias-table lookups with `===`, so two un-aliased teams gave `null === null` and any game could inherit another same-kickoff game's line. Hawai'i vs UNLV stored -29.5 (real line UNLV -2.5) and scored as a +2 upset; 7 more week-1 games and several week-2 games carried wrong lines. `teamNamesAgree` now needs a positive signal (exact name, exact alias, or same first word + mascot), folds diacritics (San José), and a book listing home/away reversed gets its spread flipped. New `POST /api/admin/repair-spreads/:year/:week` compares stored lines with ESPN's DraftKings closing line (game summary `pickcenter`, keyed by event id) and, with `?apply=true`, rewrites lines that name a different favorite or sit 5+ points away, then re-runs upset detection and rescoring
- **Applied to prod the same day** (Mac ran the commands after the deploy): `repair-spreads/2026/1?apply=true` rewrote exactly the 8 cross-matched week-1 lines, then `sync-current` finalized FSU–SMU and rescored weeks 1–2 for 5 leagues (11 week-1 score rows moved, all matching the pre-run simulation). Every week-2 line was re-checked against ESPN's embedded DraftKings odds: 0 disagreements. Week 3 schedule loaded
- Smoke test: 58 assertions (was 43), now in its own season year 2099 with a copied calendar so synced local Game rows can't collide with its synthetic games
- Docs: RULES.md gets the every-game-counts paragraph; NOTES.md parks "take lines from ESPN's scoreboard instead of the Odds API"

**Aug 30, 2026** — Season net points on My Team cards:
- Each My Team card now shows the team's **net season points for that roster** next to its slot label ("+2 pts season", green/red/grey), computed on the fly from FINAL `Game` rows with the exact scoring formula (win 1, upset win 2, loss 0, upset loss −1) — same source the Week by Week drill-down uses, nothing new stored. `TeamMatchup` carries `seasonPoints`
- **Effective-week windows are respected**: a swapped-in team counts only from its `fromWeek`, so its earlier wins don't inflate the current owner's card (a dropped team's contribution lives in Week by Week, not on the current five). This means a card can show a green final and "0 pts season" — correct, not a bug
- Verified against an independent SQL recomputation (all five teams matched exactly, including a fromWeek-6 swap-in and an upset-loss −1); smoke 43/43, `tsc` + build green

**Aug 30, 2026** — My Team viewer dropdown:
- The My Team tab gained a **Viewing** dropdown (defaults to "My team") that loads any league-mate's team with the same cards: slot, rank, opponent, kickoff, venue, network, spread with its scoring meaning, live/final scores. `GET /rosters/:id/matchups` now takes an optional `?userId=` (any member may view any member; non-member targets get a clean 404). The week-5 swap card renders only on your own view since the swap is your move; the title flips to "Name's Team"
- Verified: API returns a league-mate's five with the viewer param and rejects outsiders; headless phone run defaults to self (swap card present), switches to another member (title, cards, swap card hidden). Smoke 43/43, `tsc` + build green

**Aug 29, 2026** — Manual roster add (prod data fix, no code change):
- Charlie Hodgkins joined league 8 (The Fighting Bagels) after its draft completed; per Mac's approval his roster was added by hand: five `RosterSlot` rows (`fromWeek` 1) — Auburn (SEC), Michigan State (Big Ten), Virginia (ACC+ND), Oklahoma State (Big 12), Boise State (G6). All five were unowned in the league; verified against live prod data before and after. He scores from week 1 on the next sync; he won't appear on the Draft tab's pick board (no `DraftPick` rows), which is expected for a manual add

**Aug 29, 2026** — League membership locks at draft start:
- **Joining is now blocked once the draft has started** (LIVE, PAUSED, or COMPLETE): `POST /leagues/join` rejects new members with "This league's draft has already happened, so new players can't join." Before this, anyone with the code could join a drafted league — and a join during a **live** draft would have shifted the snake-order math (turn index and total picks derive from member count). Existing members entering the code still get passed through, and pre-draft joins (including SCHEDULED, where late joiners append to the draft order) are unchanged
- **Settings shows the lock**: once locked, the Players cell greys out the capacity (e.g. **6**/10 with "locked at draft") and the share-join-link button disappears, since the link would only lead to the rejection
- Verified with live requests: stranger vs. completed league → 400 with the message; same stranger vs. scheduled league → joins; existing member re-entering the code → "Already a member" passthrough. Smoke 43/43, `tsc` + build green

**Aug 29, 2026** — My Team tab; Draft Recap retired:
- **New My Team tab** (second position, between Leaderboard and Week by Week): one card per conference slot with your team (AP rank badge, "wk 6+" swap-in note), the week's game — vs./at opponent with rank, kickoff day + time, venue, **TV network** — and the stored team-relative spread with its scoring meaning ("upset pays +2" / "loss costs 1"); live and final games show the score instead. Data is the existing matchup pipeline (`GET /rosters/:id/matchups`, DB spreads + cached ESPN scoreboard — zero Odds API spend); the scoreboard parser now also captures `broadcasts` (ESPN/NBC/CBSSN/ESPN+ etc., confirmed live for every 2026 week-1 game) and matchups carry `slot`/`fromWeek`/`broadcast`
- **Draft Recap tab removed**: everyone's rosters live on the League tab and the pick-by-pick board on the Draft tab, so the only unique content was the **week-5 swap flow — moved wholesale into My Team** (window status, turn-order strip, drop/add selects, pass). Copy that pointed at Draft Recap (Settings swap message, draft-complete banner) now points at My Team
- Verified against the smoke league with real data: five cards rendered with real kickoffs, venues, networks (SEC Network, NBC, ESPN, ESPN+), spreads incl. a "no line yet" FCS matchup, rank badge, swap annotations, and the closed swap window card; phone (375×812) + desktop screenshots, smoke 43/43, `tsc` + build green both sides

**Aug 25, 2026** — Schedule-draft calendar wouldn't allow today late in the evening (Mac, ~11pm):
- The date picker's `min` was the **UTC** date (`toISOString()`), which flips to tomorrow at 8pm ET, so the calendar greyed out today; typing the date manually still worked because the save-button and server checks compare real timestamps. `min` now uses local date components (same UTC-vs-local class as the schedule-form seed bug fixed earlier today; a shared `toLocalDateString` helper now covers both, and the unused UTC-based `getMinDateTime` is deleted). Verified in the live repro window: with UTC already on tomorrow's date, the picker's `min` is local today and today validates

**Aug 25, 2026** — Share links + member profile settings:
- **Share button next to the join code** (Settings tab): opens the native share sheet where the browser has one (phones, macOS Chrome/Safari), otherwise copies the link with a "Link copied" confirmation. The link is `/league/join?code=XXXXXX` — it presets the code on the join page, and everyone still goes through the normal sign-in/sign-up first
- **Auth remembers where you were headed**: `ProtectedRoute` and the 401 interceptor now send signed-out visitors to `/login?next=<destination>` (internal paths only), the destination survives the sign-in ↔ sign-up toggle, and both flows land there afterward. This is what makes a shared join link work for a friend with no account yet: link → sign up → join page with the code filled in → one tap
- **Your Profile card in Settings** (every member, not just the commissioner): shows the signed-in email and lets you edit your display name. New `PATCH /api/auth/me` (name only; same normalization as register), synced into the auth context + localStorage, all tabs refreshed
- Verified end-to-end in headless Chrome: signed-out visitor opened a share link, signed up as a brand-new user, landed on the join page with the code preset, joined the league, then renamed themselves from Settings (header + storage updated). Share fallback confirmed by stubbing out `navigator.share`: clipboard got the exact URL + feedback shown. Smoke 43/43, `tsc` + build green both sides

**Aug 25, 2026** — Signup asks for first + last name (form-level split, no DB change):
- The signup form now collects **First name** and **Last name** (side by side on desktop, stacked on phones, proper `given-name`/`family-name` autocomplete) and submits them as one string into the existing `User.name` column. Deliberately **not** a schema migration: the DB is live prod, every display surface reads `name`, and backfilling a split from existing values means guessing where nicknames break. If dedicated columns are ever wanted (e.g. "J. Kirven" short forms on tight board columns), that's an offseason migration — by then all post-change signups are guaranteed clean two-part names
- Server `register` normalizes the name (trim, collapse inner whitespace, 60-char cap) but stays one-field lenient so scripts and tests that create one-word users keep working
- Existing accounts are untouched; any nickname-y names among the real league can be fixed with a couple of hand-approved `UPDATE`s (see `.claude/db-access.md` rules)
- Verified: headless-Chrome signup at 375×812 (typed `"  Testy "` / `"  McNameface "` → stored `"Testy McNameface"`, redirected to dashboard); smoke 43/43, `tsc` + build green both sides

**Aug 25, 2026** — Odds API quota fix (230 of 500 monthly credits burned before the season even started):
- **User traffic no longer touches The Odds API.** The League tab's matchup endpoint was fetching live odds (spreads + moneylines = 2 credits) on every 15-minute cache expiry, from an in-memory cache that every deploy wiped — one open League tab cost up to 8 credits/hour, which doesn't survive a football Saturday on the free tier. `matchupService` now reads spreads straight from the `Game` rows the daily 11:00 UTC sync already populates, joined by `espnEventId` (no fuzzy name matching), so the League tab shows the exact line scoring will use and costs 0 credits
- **`/api/odds/*` routes deleted** — nothing in the client called them; they were a second 2-credit live-fetch path under its own cache key. The admin-gated `GET /api/admin/current-odds` preview (spreads only, manual use) stays
- Steady-state spend is now just the cron: 1 credit per run, ~65/month. Verified against SMOKE1 (all 10 roster teams matched to stored spreads with correct home/away signs); smoke test 43/43, `tsc` + client build green

**Aug 24, 2026** — QA round 2 (Mac + Johnny's notes from the first real league draft):
- **Draft clock fixed** (the "adds 15 seconds at zero" bug — three compounding defects, no 15 anywhere in the code): (1) every pick started a 5s deadline-broadcast interval that `clearPickTimer` never cleared, so stale intervals kept emitting the *previous* deadline and clients' clocks jumped between two values — the interval now dies with its timeout; (2) the client counted down on the device clock, so a phone 15s off hit 0:00 early/late and blipped on every server sync — the countdown now runs on a server-clock offset (`serverNow` is in every `draft:timer` and `draft:state` event); (3) autopick's AP-rankings lookup was a live uncached ESPN call — now cached 10 min with a 3s abort timeout (falls back to random, as before)
- **Search filter clears after a pick**: selecting a team wrote its name into the search box; once drafted, the filter matched nothing and the board "disappeared". The box now clears when the team it names gets drafted (yours or anyone's)
- **Pre-draft lobby**: a scheduled draft now renders the full room ahead of time — countdown to start in the scoreboard header, "First pick" callout, a Draft Order card with live presence dots (new `draft:presence` socket event), queue building, and the empty board — so nobody meets the interface for the first time on the clock. The commissioner gets a "Start draft now" button in the lobby. The bare "scheduled for..." card is gone (only unscheduled drafts show a placeholder)
- **Draft order is set at scheduling, not at start**: scheduling a draft assigns a random order immediately (so the lobby can show it), Settings gains a Draft Order section — Random or Set manually (up/down reorder list) — plus "Shuffle order now" while scheduled; changes push to open lobbies live. `startDraft` respects preassigned positions and only shuffles members who lack one; late joiners append to the end
- **Settings date bug** (found while testing): the schedule form seeded its date field from UTC (`toISOString`) but its time field from local time, so re-saving an evening draft without touching the fields silently moved it a day later. Both now use local components
- **DB access for Claude**: git-ignored `.claude/db-access.md` with connection strings and a Postgres-enforced read-only query wrapper (`PGOPTIONS default_transaction_read_only`); CLAUDE.md points to it
- Parked in NOTES.md: weekly awards + team net-points pages (one data layer), and a new **2027 ideas** section — go to 6 teams with two G6 slots to fix the odd-round snake advantage Johnny spotted
- Verified: 43-assertion smoke suite green, `tsc` + `vite build` both sides, and a real headless-Chrome draft on a fresh test league (LOBBY1, league 14) — lobby at phone + desktop widths, pick via search (filter clears, board intact), 20 clock samples with zero upward jumps, autopick landing seconds after zero

**Aug 23, 2026** — Visual design pass + landing page (design only; every query, socket call, mutation and `onClick` is untouched, no server changes):
- **Type system**: self-hosted Barlow (UI) + Barlow Condensed (headlines, tab labels, the draft clock, every big number) via `@fontsource`, tabular numerals everywhere. Shape system documented in `index.css`: cards `rounded-xl` + 1px border + green-tinted shadow (`.card`), buttons/inputs `rounded-lg`, chips pills. New utility classes `.section-title` / `.section-sub` / `.label` replace the per-card green header bars
- **Brand mark + favicon**: the brown-football SVG is replaced by a deep-green tile with a bold 6 and a gold goal line (`public/favicon.svg`, plus `favicon-32.png` and a full-bleed `apple-touch-icon.png` rendered with the real font for Safari / iOS home screens; `theme-color` set). `components/Logo.tsx` renders the same mark + wordmark in the app (inverted to white on the green header)
- **App chrome**: one `AppHeader` (deep green, logo, name, Log out, optional back arrow) with the tab strip *inside* the band: condensed uppercase labels, gold underline on the active tab, still sideways-scrolling on phones. Emoji retired: podium ranks are gold/silver/bronze medallions (`RankBadge`), the ⚡ upset bolt is now an explicit `UPSET W` / `BUST L` badge, the 🏈 empty state uses the mark; icons from `@phosphor-icons/react` (back arrow, queue caret, CTA arrows)
- **Tabs**: Leaderboard is the showpiece (big condensed point totals, leader callout, four tinted scoring tiles); Week by Week, League, Draft Recap, Settings and the draft room get typographic section headers, `.card` panels, and `label`-style column heads; the live draft header is now a dark-green scoreboard (clock turns gold on your turn, amber-outlined Make Your Pick panel); one shared `Loading inline` replaced seven copy-pasted spinners; `Input` always renders its label (no placeholder-as-label) and `ErrorMessage` is a left-accent alert
- **Landing page** (new, signed-out `/`): hero with the rules in one line and a *real* mini Leaderboard / week-card preview built from the app's own components with labelled sample data, "How it works" numbered stack, the five slot tiles (scroll-snap on phones), 2×2 scoring bento, week-5 swap band, season dates (Aug 27 / Sep 5 / Oct 4 / Dec 12), closing CTA. Signed-in users are redirected to `/dashboard`
- **Auth moved to `/login`** (`?mode=signup` for the sign-up form): split layout with a brand panel on desktop, labelled fields, autocomplete hints. `ProtectedRoute` and the 401 interceptor now send you to `/login`; LeagueSetup got the same header + form treatment. Copy sweep: em-dashes out of every visible string, "Logout" → "Log out", status badges in condensed caps
- Verified with headless-Chrome screenshots of every screen at 375×812 and 1280×800 (before/after, incl. a live draft on the clock); `tsc` + `vite build` green. Deliberately parked in `NOTES.md`: dark mode, a bottom tab bar, photography on the landing page

**Aug 22, 2026** — Mobile design pass (design only — no logic changed; every `onClick`/`disabled`/query/socket call is byte-identical):
- **Tab bar**: six equal-width tabs wrapped to 2–3 lines at 375px and clipped on an iPhone SE. Now a single-row strip that scrolls sideways on phones (the 4th tab peeks at the edge; the active tab auto-scrolls into view) and stays equal-width on desktop; active state is green text + underline instead of a solid green block
- **One button kit**: `Button.tsx` gained `variant` (primary · secondary · outline · danger · amber = swap · blue = sync · nav) and `size` (sm · md · lg) with uniform radius/weight/disabled/pressed states and a 44px minimum tap height on phones; 17 ad-hoc `<button>`s migrated onto it (Dashboard, Settings, Draft Recap, draft room, Landing, LeagueSetup). The raw buttons that remain are purpose-built controls (tab strip, ← back, slot chips, team cards, clear-×s, queue ×, week numbers) — all re-sized to ≥36px tap targets
- **Touch fixes**: Tailwind `hoverOnlyWhenSupported` (a tapped button no longer sticks in its hover color) + `active:` pressed states everywhere; the draft-room Filter input is 16px on phones so iOS Safari stops zooming the page on focus
- **Draft room on phones**: sticky header is one row (~70px instead of ~180px — connection dot folded into the LIVE badge, timer one size smaller, on-the-clock label reads "YOUR TURN!" on phones so it never truncates); panels reorder to Make Your Pick → Available Teams → Your Roster → Draft Board → Queue → Activity (the desktop 2:1 layout is untouched); draft board / recap / final-results tables get real minimum column widths so they scroll instead of truncating names to "Missi…"; slot chips scroll in one row
- **Everywhere**: page and card padding `p-4` on phones (`p-6` from `sm`), page headers one step smaller on phones; Dashboard header stacks (title, then two equal buttons) and the league-card title row wraps; navbar name truncates; Week by Week's sticky Player column got explicit row backgrounds (week cells no longer show through it when the grid scrolls sideways) and a border; swap / Settings action rows stack full-width on phones; Landing and LeagueSetup cards tightened
- Verified with headless-Chrome screenshots of every screen at 375×812 and 1280×800 (before/after, incl. a live draft on the clock); `tsc` + `vite build` green. No server changes, so no smoke run

**Aug 7, 2026** — QA round 1 (first real draft + league-page review):
- **Draft room**: clock header is now sticky (follows you while browsing teams); clear-× buttons on both search inputs; **timeout now drafts your selected team** — while you're on the clock, your selection is pinned to the front of your queue so autopick takes exactly it, with an inline hint; default pick clock 60s → **90s** (migration `20260807000000`; existing leagues keep their setting)
- **League tab shows spreads, not moneylines** (the league scores off spreads): color-coded — green at +3.5+ (upset-bonus territory), red at −3.5+ (bust risk) — plus an explicit "no line yet" state
- **Missing-odds investigation**: games without lines (FBS-vs-FCS blowouts, e.g. Georgia–Tennessee State) are books not posting yet, not a pipeline bug — the daily cron re-syncs odds until kickoff, and BYU–Utah Tech already carries −48.5 locally; a permanently line-less game correctly scores as a regular result
- **Week by Week**: long team names/opponents wrap instead of truncating (result badge stays pinned)
- **Scoring copy**: legend + RULES.md now say explicitly that outcomes are mutually exclusive — an upset win is 2 points *total*, not 1+2 (the code always worked this way; smoke-verified)
- `NOTES.md` added: design backlog (mobile overhaul) + V2 ideas (best-available ordering with team rankings)

**Aug 5, 2026** — League size for testing:
- League `maxPlayers` range widened from 8–12 to **4–16** (server validation + create form). 16 is the hard ceiling — SEC and Big 12 have exactly 16 teams each. Drafts still start with as few as 2 joined members regardless of the cap.

**Aug 5, 2026** — Single-service deployment:
- Consolidated onto **one Render service**: Express now serves the built client (`client/dist`) with an SPA fallback, so the app is fully same-origin in production — the CORS/`VITE_API_URL` failure class is gone by construction. Client defaults to relative URLs (`VITE_API_URL` is now only a split-deploy override); `render.yaml` rebuilt for the combined build; `vercel.json` removed (Vercel retired — the old Render service from December ran pre-rebuild code against a deleted Supabase DB and is being replaced by the blueprint)
