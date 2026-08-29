# CLAUDE.md — Pick 6

Read this first, trust it, and keep it current — it's written by a past session
that verified everything in it.

## What this is

College football pick'em for Mac's friends league, 2026 season. Each player
drafts **5 teams, one per conference slot** — SEC, Big Ten, ACC+Notre Dame,
Big 12, Group of 6 (AAC/CUSA/MAC/MWC/Sun Belt/rebuilt Pac-12) — in a **live
snake draft** (Socket.IO, pick clock, autopick). Scoring per team per week
from real games and betting lines: **+1 win · +2 win as underdog of +3.5 or
more · 0 loss · −1 loss as favorite of −3.5 or more** — mutually exclusive,
no line = plain result. One cumulative leaderboard. After week 5, everyone
gets one same-slot swap (auto-opening window, worst-record-first turns).

Documents: `RULES.md` = game spec · `LAUNCH_PLAN.md` = build history +
decisions D1–D7 + audit trail · `NOTES.md` = deferred design/V2 ideas ·
`README.md` = setup + **Changelog (update it at the end of every working
turn — standing instruction from Mac)**.

## Architecture (monorepo: `server/` + `client/`)

- **Server**: Express + TypeScript, Prisma/Postgres, Socket.IO (live draft
  only). Key services: `draftService` (slot-aware snake, transactional picks;
  draft order is assigned at *scheduling* time — random or
  commissioner-manual via `assignDraftOrder` — and `startDraft` respects it,
  shuffling only members without positions),
  `syncService` (ESPN games → odds → finalize upsets → rescore; idempotent),
  `seasonService` (D6: ESPN week calendar, **current week is derived from the
  clock, never stored**), `swapService` (WS8: turn order, 24h lazy-expiry
  clock, effective-week roster math), `teamMatcher` (`wasUpset` holds the
  ±3.5 threshold), `espnClient`, `oddsClient`, `matchupService` (League tab
  matchups — reads spreads from `Game` rows by `espnEventId`, **never** the
  live Odds API: 500 free credits/month, only the sync pipeline may spend
  them), in-memory `cacheService`.
- **Client**: React 18 + Vite + Tailwind + TanStack Query. Routes: `/` =
  marketing landing (signed-out; signed-in users bounce to `/dashboard`),
  `/login` (`?mode=signup`), `/dashboard`, `/league/create|join`,
  `/league/:id` (tabs). Tabs: Leaderboard (default) · My Team (your five +
  weekly games with kickoff/venue/network/spread, and the week-5 swap UI) ·
  Week by Week (grid + per-week drill-down) · League (rosters + spreads) ·
  Draft (live room) · Settings (commissioner: schedule draft, Sync Now, swap
  window, 90s default clock; every member: profile name edit). Draft Recap
  was retired Aug 29 (rosters = League tab, picks = Draft tab's final board,
  swap UI moved to My Team).
  **Design system (Aug 23)**: Barlow (UI) + Barlow Condensed (`font-display`:
  headlines, tab labels, clock, big numbers), self-hosted via `@fontsource`
  imports in `main.tsx`; icons from `@phosphor-icons/react` only, no emoji.
  `index.css` defines `.card` (rounded-xl, 1px border, green-tinted shadow),
  `.section-title`/`.section-sub` (page headings), `.label` (small caps
  labels) — use those, don't reinvent. `components/AppHeader.tsx` = the
  signed-in header (green band, tab strip inside it, gold active underline);
  `components/Logo.tsx` = mark + wordmark (same geometry as
  `public/favicon.svg`; `favicon-32.png` / `apple-touch-icon.png` are
  rendered from it — re-render them if the mark changes).
  `components/Button.tsx` is **the one button** (variants primary ·
  secondary · outline · danger · amber=swap · blue=sync · nav; sizes sm/md/lg;
  44px tap height on phones) — route every action through it; raw `<button>`s
  are only for purpose-built controls (tab strip, slot chips, team cards,
  icon ×s). Mobile-first via `sm:`/`md:`/`lg:` prefixes: phones get `p-4`, a
  sideways-scrolling tab strip, and a reordered draft room (`contents` +
  `order-N` on the panels; desktop keeps DOM order). Visible UI copy: no
  em-dashes (periods/commas/colons instead), light theme only (dark mode is
  parked in NOTES.md).
- **Production = ONE Render service** (`render.yaml` blueprint): Express
  serves `client/dist` with an SPA fallback → everything same-origin, **no
  CORS config, no VITE_API_URL** (that env var exists only as a split-deploy
  override; leave it unset). Postgres = `pick6-db` (Basic plan). Scheduled
  scoring = GitHub Actions cron (`.github/workflows/sync.yml`, 3 schedules)
  hitting `POST /api/admin/sync-current` with the `x-admin-secret` header.
  Admin routes accept that secret OR a commissioner JWT.

### Data invariants (the load-bearing ones)

- `RosterSlot` rows have effective-week windows (`fromWeek`/`toWeek`, null =
  active). **Scoring always reads the roster as of the scored week** — this is
  what makes the week-5 swap unable to rewrite history. Never bypass it.
- One-owner-per-team and one-team-per-user-per-slot are enforced by
  **partial unique indexes that exist ONLY in migration SQL**
  (`WHERE "toWeek" IS NULL` — Prisma can't express them). ⚠️ If you ever run
  `prisma migrate dev`, review the generated SQL so it doesn't drop them.
- Migrations are hand-authored (`prisma/migrations/202608*`) and applied with
  `migrate deploy` only. `db:reset` drops everything — dev only.
- Teams are keyed by `espnTeamId`; the seed fetches conference membership
  live from ESPN's **core** API per season (`/seasons/{yr}/types/2/groups/
  {id}/teams`) — realignment is a seed re-run, not a code change.

## Local dev (this Mac)

**DB queries for context**: read `.claude/db-access.md` (git-ignored) for
connection strings and Mac's rules — always query through its read-only
`PGOPTIONS` wrapper; INSERT/UPDATE need Mac's per-case OK; DELETE/DROP never.
If the file is missing, ask Mac before touching a database.

```bash
colima start                      # Docker runtime (not Docker Desktop)
docker compose up -d              # Postgres on host port 5433 (see gotchas)
cd server && npx prisma migrate deploy && npm run prisma:seed   # seed hits ESPN live
npm run dev                       # server :3001
cd client && npm run dev          # client :3000 (Vite proxy → same-origin)
```

**The regression harness** (run after any server-side change):
`cd server && npx tsx scripts/smoke-test.ts` — 43 assertions covering the
whole draft, DB constraints, every scoring case incl. the exact ±3.5
boundary, and the full swap lifecycle. It wipes/recreates its own data
(league `SMOKE1`, `smoke1@test.local`/`smoke123`) — **never point it at
prod**. Before ending a turn: `npx tsc` in `server/`, `npm run build` in
`client/`.

**Phone-viewport checks** (no device needed): headless Chrome is installed —
drive it with `puppeteer-core` from the scratchpad, mint a JWT for a test
user with `JWT_SECRET` from `server/.env` and drop it into `localStorage`
(`pick6_token` + `pick6_user` = `{id,name,email}` JSON), then screenshot at
375×812 (`isMobile`, `deviceScaleFactor: 2`) and 1280×800. Local test data:
league 6 `SMOKE1` (complete + scored), LIVE repro leagues 9–11 (users 21–32,
`*@repro.local`) whose stalled pick clocks resume the moment a client
connects. Tabs are component state, not routes — click the button by label.

## Gotchas (each one cost real debugging time)

- **Port 5433 locally.** A native Homebrew postgresql@15 owns 5432 for Mac's
  other projects — never stop it, never rebind 5432.
- **Prisma error "Tenant or user not found"** = a dead Supabase pooler URL
  leaked into `DATABASE_URL` (the December corpse). Prod must always use the
  Render-internal Postgres URL.
- **Render exports `NODE_ENV=production`**, so `npm ci` skips devDependencies
  — build commands must use `--include=dev` (prisma/vite/typescript live
  there). Never use Render's free Postgres (self-deletes after 30 days).
- **Odds only attach to games that haven't kicked off** — after kickoff the
  spread is unrecoverable. The daily 11:00 UTC cron exists for this. Missing
  lines on FBS-vs-FCS blowouts are books-not-posting, not a bug; they
  self-heal or score as plain results.
- **ESPN API quirks**: the site `/teams?groups=` filter is a silent no-op
  (returns D3 schools); conference membership needs the core API. There is
  no "Week 0" — ESPN's Week 1 spans the late-Aug openers through Labor Day.
  Never compute week boundaries; read `SeasonWeek`. Scoreboard `limit=300`
  (Week 1 2026 has 104 games; the old 100 truncated).
- Vercel is retired (Aug 5) — don't suggest it. Old service
  `pick6-r5q0.onrender.com` was a pre-rebuild corpse; the blueprint service
  replaced it.
- Tailwind `future.hoverOnlyWhenSupported` is on: `hover:` styles only apply
  on devices that can hover, so tapped buttons don't stick in their hover
  color — give tappable things an `active:` state instead. Inputs must stay
  ≥16px on phones or iOS Safari zooms the page on focus.

## How Mac works (respect this)

- **Decisive delegator.** He makes the league-rule calls fast (the D1–D7
  pattern in LAUNCH_PLAN), then hands implementation judgment over — "I'm
  leaving these decisions up to you." Give ONE recommendation with reasoning,
  not an options menu. When he overrules, update the plan doc and move.
- **QA by voice note.** He records observations from real use and expects
  them turned into a numbered punch list, then attacked item by item. Bugs
  get fixed immediately; design and V2 ideas get **parked in NOTES.md**, not
  built. Investigate before fixing — half his "bugs" are explainable behavior
  (e.g. missing FCS odds) and he values the explanation.
- **README every turn.** End each working turn by updating the README
  Changelog (dated entry) and any sections the work invalidated.
- **He commits and pushes himself** (Render auto-deploys from `main`). Offer
  commit/PR text when asked; don't commit unprompted. He drives the Render/
  Vercel/GitHub dashboards — give exact click-paths for anything there.
- Verify claims with real runs (smoke test, curl probes against live
  services, DB queries) and lead reports with the finding, not the process.
- League context: he's the commissioner; league code `2026`; friends are
  non-technical. Trust model is deliberately casual, but admin surfaces stay
  gated.

## Season clock (why deadlines matter)

Week 1 games: **Aug 27–Sep 7** (dress-rehearsal target: the Aug 27–29
slate). League drafts before Sep 5. Week 5 ends **Oct 4** → swap window
auto-opens. Season ends Dec 12 (Army-Navy, week 15). No bowls, no CFP.

## Status (as of Aug 23, 2026)

Live on Render, single-service, cron active. All launch workstreams
(WS1–WS10, D1–D7) done — LAUNCH_PLAN is history now, not a todo list. QA
round 1 (Aug 7) fixed the draft clock / timeout / clear-button / copy items.
The **mobile design pass** landed Aug 22 and the **visual design pass +
landing page** landed Aug 23 (type system, brand mark/favicon, scoreboard
header, Leaderboard showpiece, `/` landing, auth at `/login` — design only,
no logic touched). **QA round 2 (Aug 24, after the first real draft)**:
draft clock fixed (stale 5s broadcast intervals killed with their timeout;
client counts down on a server-clock offset from `serverNow`; autopick's
ESPN rankings fetch cached 10 min + 3s timeout), search filter now clears
when its team gets drafted, scheduled drafts get a full **lobby** (room
renders pre-start with countdown, draft order, presence dots, queue
building), and commissioners can set the order (random/manual) in Settings.
Weekly awards / team-points pages and the 2027 six-team question are parked
in NOTES.md. **Aug 25**: Odds API quota fix — user traffic (League tab
matchups, old `/api/odds` routes) was burning ~8 credits/hour of the
500/month free tier; matchups now read stored spreads from `Game` rows and
the `/api/odds` routes are deleted, leaving the cron as the only spender
(~65 credits/month). Also Aug 25: signup collects first + last name but joins
them into the single `User.name` column (deliberately no migration — DB is
live prod; server `register` normalizes whitespace, stays one-field lenient
for scripts). Also Aug 25: share button next to the join code (native share
sheet or clipboard; link = `/league/join?code=X`, which presets the code),
auth preserves the destination through login/signup via a validated
`?next=` param, and a Your Profile card in Settings lets any member edit
their name (`PATCH /api/auth/me`). **Aug 29**: My Team tab added (slot cards
with opponent/kickoff/venue/TV network/spread; ESPN scoreboard parser now
captures `broadcasts`; matchups carry `slot`/`fromWeek`/`broadcast`) and the
Draft Recap tab retired, its swap UI moved into My Team. Week 1 games are
underway (dress rehearsal weekend).
