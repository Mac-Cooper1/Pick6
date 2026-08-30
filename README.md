# Pick 6 — College Football Pick'em League

Draft **5 college football teams — one per conference slot — and ride their wins all season.** Live snake draft with your league, automated scoring from real games and betting lines, one cumulative leaderboard. Built for the 2026 season.

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

**The season.** ESPN's official calendar, regular season only (2026: weeks 1–15, from the Aug 22 window through Army-Navy on Dec 12). Bowls and the CFP don't count. There is no "Week 0" — ESPN folds the late-August openers into Week 1.

**Week-5 swap.** After week 5, every player gets one same-slot team swap (worst record picks first). Past weeks keep their points — scoring is roster-as-of-that-week. *(Automation lands in WS8.)*

**Standings.** One cumulative leaderboard. No head-to-head.

## Features

- **Accounts**: email + password (bcrypt), JWT sessions; leagues joined by a 6-character code or a shared join link that presets it; members edit their display name in Settings
- **Live snake draft**: Socket.IO rooms, server-time countdown clock, scheduled auto-start with a pre-draft lobby (order, presence, queue building), slot-aware pick validation, draft queue with AP-rank autopick fallback
- **Draft order**: assigned when the draft is scheduled — random or set manually by the commissioner in Settings — and visible in the lobby before the first pick
- **My Team**: your five teams with this week's game each — opponent, kickoff, venue, TV network (from ESPN), and the stored spread with what it means for scoring; also home of the week-5 swap flow
- **Automated scoring**: ESPN scores + The Odds API spreads → upset detection (±3.5 rule) → weekly rescore, on a GitHub Actions schedule
- **Effective-week rosters**: scoring always uses the roster that was active during that week — the week-5 swap can never rewrite history
- **Matchup board**: each rostered team's upcoming opponent, kickoff, and spread (read from the DB — the exact line scoring will use) with AP rank badges
- **Commissioner tools**: schedule the draft, "Sync now", manual game-result override, member password reset
- **DB-enforced integrity**: partial unique indexes guarantee one owner per team and one team per slot

## Tech Stack

**Frontend**: React 18 + TypeScript, Vite, Tailwind, React Router, TanStack Query, socket.io-client, Phosphor icons, self-hosted Barlow / Barlow Condensed (`@fontsource`)
**Backend**: Node/Express + TypeScript, Prisma + PostgreSQL, Socket.IO, JWT + bcrypt
**Data**: ESPN hidden API (scores, schedules, rankings, season calendar, team/conference membership) + The Odds API (spreads; 500 credits/mo free tier — only the sync pipeline spends them, ~1 credit per cron run; user traffic reads spreads from the DB)

## Getting Started (local)

Prereqs: Node 18+, Docker (Docker Desktop or [Colima](https://github.com/abiosoft/colima): `brew install colima docker docker-compose && colima start`).

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

`.github/workflows/sync.yml` hits `POST /api/admin/sync-current` (resolves the current week from the ESPN calendar, then games → odds → finalize → rescore, idempotent):

- **Daily 11:00 UTC** (~7am ET) — games + odds land before any kickoff (spreads only attach pre-kickoff)
- **Daily 08:30 UTC** — overnight scores for Tue–Sat night finals
- **Sat 23:00 UTC** — mid-slate refresh
- Manual: Actions tab → "Scheduled sync" → Run workflow

**Activate**: set repo secrets `API_URL` and `ADMIN_SECRET` (Settings → Secrets and variables → Actions). The cron lives outside the app server on purpose — a restart or deploy can never silently kill the schedule.

## API Overview

All routes JWT-protected unless noted; admin routes take `x-admin-secret` **or** a commissioner JWT.

| Area | Routes |
|---|---|
| Auth | public: `POST /api/auth/register` `POST /api/auth/login` · JWT: `GET /api/auth/me` `PATCH /api/auth/me` (name) |
| Leagues | `GET /my` · `POST /create` · `POST /join` (code only) · `GET /:id` · `GET /:id/members` · `PATCH /:id/settings` |
| Draft | `GET /:id/picks` · `GET /:id/available` · `GET /:id/state` · `POST /:id/start` (commissioner) · queue CRUD — live picks go over Socket.IO |
| Rosters | `GET /:id` · `GET /:id/my` · `GET /:id/user/:userId` · `GET /:id/available` · `GET /:id/matchups[/all]` |
| Standings | `GET /:id/week/:n` · `GET /:id/overall` |
| Admin | `POST /sync-current` · `POST /sync-calendar/:year` · `POST /sync-week/:id/:n` · `POST /sync-games\|sync-odds\|finalize-games\|sync-all-leagues` · `POST /game-override` · `POST /reset-password` · read-only previews |
| CFB | scoreboard, schedule, AP rankings (cached 60s–1h) |

## Project Structure

```
pick6/
├── client/src/            # React app (pages, components, contexts, services)
│   └── pages/             # Landing (/), Login (/login), Dashboard, LeagueSetup, MainApp (tabs)
├── server/src/
│   ├── controllers/       # auth, leagues, draft, rosters, standings, admin
│   ├── services/          # draft, roster, sync (ESPN+odds pipeline), season calendar,
│   │                      # matchups, teamMatcher, cache
│   ├── socket/            # live draft room
│   ├── middleware/        # JWT auth, admin gate, error handler
│   └── lib/, utils/, types/
├── server/prisma/         # schema, migrations, ESPN-driven seed
├── server/scripts/        # smoke-test.ts (end-to-end draft + scoring)
├── .github/workflows/     # scheduled sync cron
├── docker-compose.yml     # local Postgres on host port 5433
└── LAUNCH_PLAN.md         # workstream plan, decisions D1–D7, defect audit
```

## Deployment

**Single service on Render** (`render.yaml` blueprint): one web service (~$7/mo Starter) runs the Express API *and* serves the built client from the same origin — no CORS, no build-time API URLs, one URL to share — plus managed Postgres (~$6/mo Basic) and the GitHub Actions cron. Full runbook: [LAUNCH_PLAN.md](LAUNCH_PLAN.md) → WS9. Key facts: `prisma migrate deploy` is the only migrate command that touches prod (the blueprint runs it pre-deploy); Render free Postgres expires after 30 days (never use it); Render's `NODE_ENV=production` makes `npm ci` skip devDependencies, so the build commands use `--include=dev`.

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
