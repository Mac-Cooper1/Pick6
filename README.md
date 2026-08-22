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

- **Accounts**: email + password (bcrypt), JWT sessions; leagues joined by a 6-character code
- **Live snake draft**: Socket.IO rooms, countdown clock, scheduled auto-start, slot-aware pick validation, draft queue with AP-rank autopick fallback
- **Draft Recap**: everyone's roster in a players × slots grid plus the pick-by-pick order
- **Automated scoring**: ESPN scores + The Odds API spreads → upset detection (±3.5 rule) → weekly rescore, on a GitHub Actions schedule
- **Effective-week rosters**: scoring always uses the roster that was active during that week — the week-5 swap can never rewrite history
- **Matchup board**: each rostered team's upcoming opponent, kickoff, and moneyline with AP rank badges
- **Commissioner tools**: schedule the draft, "Sync now", manual game-result override, member password reset
- **DB-enforced integrity**: partial unique indexes guarantee one owner per team and one team per slot

## Tech Stack

**Frontend**: React 18 + TypeScript, Vite, Tailwind, React Router, TanStack Query, socket.io-client
**Backend**: Node/Express + TypeScript, Prisma + PostgreSQL, Socket.IO, JWT + bcrypt
**Data**: ESPN hidden API (scores, schedules, rankings, season calendar, team/conference membership) + The Odds API (spreads; 500 req/mo free tier, ~90 used)

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
| Auth (public) | `POST /api/auth/register` `POST /api/auth/login` · `GET /api/auth/me` |
| Leagues | `GET /my` · `POST /create` · `POST /join` (code only) · `GET /:id` · `GET /:id/members` · `PATCH /:id/settings` |
| Draft | `GET /:id/picks` · `GET /:id/available` · `GET /:id/state` · `POST /:id/start` (commissioner) · queue CRUD — live picks go over Socket.IO |
| Rosters | `GET /:id` · `GET /:id/my` · `GET /:id/user/:userId` · `GET /:id/available` · `GET /:id/matchups[/all]` |
| Standings | `GET /:id/week/:n` · `GET /:id/overall` |
| Admin | `POST /sync-current` · `POST /sync-calendar/:year` · `POST /sync-week/:id/:n` · `POST /sync-games\|sync-odds\|finalize-games\|sync-all-leagues` · `POST /game-override` · `POST /reset-password` · read-only previews |
| CFB/Odds | scoreboard, schedule, AP rankings, raw odds (cached 60s–1h) |

## Project Structure

```
pick6/
├── client/src/            # React app (pages, components, contexts, services)
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
