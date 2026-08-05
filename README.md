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

**Client**: `VITE_API_URL` (production builds only; dev uses the Vite proxy).

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

Target: **Render** (server ~$7/mo Starter + Postgres ~$6/mo Basic) + **Vercel** (client) + GitHub Actions cron. Full runbook: [LAUNCH_PLAN.md](LAUNCH_PLAN.md) → WS9. Key facts: `prisma migrate deploy` is the only migrate command that touches prod; Render free Postgres expires after 30 days (don't); the client needs an SPA rewrite for deep links.

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
- **Deploy pre-staged (WS9 prep)**: `render.yaml` blueprint (API + Postgres, auto-generated secrets, migrate-on-deploy), `client/vercel.json` SPA rewrite, CORS `credentials` flag removed (Bearer auth needs none)
- **Verified live**: real 104-game Week 1 slate synced, spreads attached to 101 games, 52 FCS stubs auto-created, league rescored; smoke suite now **43 assertions**, all green
