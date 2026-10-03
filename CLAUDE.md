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
no line = plain result. One cumulative leaderboard. **Week 6 swap**: during
week 5 everyone ranks a private list of same-slot swaps; when week 6 starts
the scheduled sync runs every league once, worst record first (Sep 30
redesign of the old turn-based week-5 window).

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
  clock, never stored**), `scoringWeekService` (Sep 11: **every game a team
  plays counts**; a second game inside one ESPN week rolls into the next
  week if the team is off then, otherwise both count that week; the one
  `pointsForTeam` formula; scoring, Week by Week and My Team all read it), `swapService` (week-6 swap: lists open/lock from
  `SeasonWeek` 5/6 start dates, `runSwap` = one transaction per league that
  takes `swapRanAt` first so it can never run twice; only teams unowned at
  the lock can be added, so dropped teams are out of play; old row closes
  at 5, new row opens at 6), `standingsService` (**the one standings
  order**: points, then the Sep 30 tiebreaker = lower combined ESPN FPI
  strength-of-schedule rank of the member's current five (`TeamSos`,
  synced by `syncSosRanks` each scheduled run; unranked/empty = last + 1),
  then join; Leaderboard, Week by Week, dashboard rank and the swap order
  (reversed) all read it), `teamMatcher` (`wasUpset` holds the
  ±3.5 threshold), `espnClient`, `oddsClient`, `matchupService` (League tab
  matchups — reads spreads from `Game` rows by `espnEventId`, **never** the
  live Odds API: 500 free credits/month, only the sync pipeline may spend
  them), `teamCardService` (Sep 30: the team card behind
  `GET /rosters/:id/teams/:teamId`; merges ESPN's team schedule with the
  team's `Game` rows by `espnEventId`: scoring truth, i.e. stored line,
  upset flag, `pointsForTeam`, scoring week, and once a row is FINAL its
  score/result too, always from the row; ESPN supplies display data, live
  scores and unsynced future games; plus ESPN team news and the pre-game
  matchup predictor; every ESPN call is cached per team or per game (never
  per player: ESPN publishes no rate limits, so traffic must track teams,
  not users), time-limited and optional: the schedule is cached until the
  team's next kickoff (max 15 min; 60s around kickoffs and live games),
  simultaneous requests share one call, and an ESPN error serves the last
  good copy and backs off 60s, so an outage leaves a card built from
  `Game` rows at worst), in-memory
  `cacheService` (cleanup timer `unref`'d so scripts can exit).
- **Client**: React 18 + Vite + Tailwind + TanStack Query. Routes: `/` =
  marketing landing (signed-out; signed-in users bounce to `/dashboard`),
  `/login` (`?mode=signup`), `/dashboard`, `/league/create|join`,
  `/league/:id` (tabs). Tabs: Leaderboard (default) · My Team (your five +
  weekly games with kickoff/venue/network/spread) ·
  Week by Week (grid + per-week drill-down) — tapping a My Team card, a
  drill-down tile, a League tab tile or a Week 6 Swap board row opens
  `components/TeamCard.tsx` (portaled sheet, ESPN fantasy player-card
  style: Matchup / Season / News tabs; Season = results and upcoming games
  in one list, right column is Pick 6 points only; an unowned team has no
  owner, so nothing greys out) ·
  League (current rosters +
  spreads; `SwapBadge` marks swapped-in teams here, on My Team and in Week
  by Week) ·
  Draft (live room) · Week 6 Swap (`SwapTab`: board of unowned teams by
  Pick 6 season points with one-tap Add, your ranked list, projected order,
  then the league's results). **Settings is not in the strip** since Sep 30:
  the header's Settings button (where Log out was) opens it (commissioner:
  schedule draft, Sync Now, 90s default clock; every member: profile name
  edit + Log out; no swap controls, the swap is automatic). The dashboard
  header still shows Log out (no settings page there). Draft Recap
  was retired Aug 29 (rosters = League tab, picks = Draft tab's final board).
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
- **The repo is public** (Sep 30) under `LICENSE.md`: Pick 6's own
  source-available terms (read, change, share, run privately; no hosting
  for others, no packaging, no commercial or competing use; contributions
  licensed to Mac). Both `package.json` files say `SEE LICENSE IN
  ../LICENSE.md`. Never commit secrets: `.env` files and
  `.claude/db-access.md` are git-ignored, and on Sep 30 no secret value
  appeared anywhere in git history.
- **Production = ONE Render service** (`render.yaml` blueprint) at
  https://pick6-o4qw.onrender.com (the "official Pick 6" LICENSE.md and the
  README point to), on the Node major in the root `.node-version` (CI reads
  the same file): Express serves `client/dist` with an SPA fallback → everything same-origin, **no
  CORS config, no VITE_API_URL** (that env var exists only as a split-deploy
  override; leave it unset). **Domain: `pick6cfb.com`** (Oct 2), bought at
  Cloudflare Registrar, DNS at Cloudflare: CNAMEs `@` and `www` →
  `pick6-o4qw.onrender.com`, **DNS only (grey cloud)**, never proxied
  (Render issues the cert; proxying breaks it). Render redirects `www` to
  the bare domain. The `onrender.com` URL still answers but nobody uses it;
  no redirect code, the app is domain-agnostic (links come from
  `window.location.origin`). Email plan (not built yet): Cloudflare Email
  Routing forwards inbound to Mac's Gmail, Resend free tier sends.
  Postgres = `pick6-db` (Basic plan). Scheduled
  scoring = GitHub Actions cron (`.github/workflows/sync.yml`, 3 schedules)
  hitting `POST /api/admin/sync-current` with the `x-admin-secret` header.
  Admin routes accept that secret OR a commissioner JWT.

### Data invariants (the load-bearing ones)

- `RosterSlot` rows have effective-week windows (`fromWeek`/`toWeek`, null =
  active). **Scoring always reads the roster as of the scored week** — this is
  what makes the week-6 swap unable to rewrite history. Never bypass it.
- One-owner-per-team and one-team-per-user-per-slot are enforced by
  **partial unique indexes that exist ONLY in migration SQL**
  (`WHERE "toWeek" IS NULL` — Prisma can't express them). ⚠️ If you ever run
  `prisma migrate dev`, review the generated SQL so it doesn't drop them.
- Migrations are hand-authored (`prisma/migrations/202608*`) and applied with
  `migrate deploy` only. `db:reset` drops everything — dev only.
- **Rosters come from `RosterSlot`, never `DraftPick`.** DraftPick is draft
  history (the Draft tab's board); the week-6 swap and hand-added rosters
  (league 8's late joiner) make the two differ. The League tab read draft
  picks until Sep 30 (`getLeagueMembers` now uses `getAllRosters`).
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
`cd server && npx tsx scripts/smoke-test.ts` — 110 assertions covering the
whole draft, DB constraints, every scoring case incl. the exact ±3.5
boundary, the week-6 swap (list validation, privacy, run order,
fallthrough, dropped-team rule, kickoff safety net, idempotent re-run; the
swap functions take a `now` so it stays date-independent), the SOS
tiebreaker (both directions, unranked fallback) and the swap board, double-game
week attribution, the odds matcher and the team card (ESPN/Game-row merge,
which game it opens on, the schedule cache timing, the Game-row-only fallback: ESPN has no 2099 season,
so the card's end-to-end checks run exactly like an ESPN outage). It wipes/recreates its own data (league `SMOKE1`,
`smoke1@test.local`/`smoke123`) in its **own season year 2099** with a
copied calendar, so real Game rows synced into the local DB can never
collide with its synthetic games — **never point it at prod**. Before ending a turn: `npm run lint` in both packages, `npx tsc` in `server/`, `npm run build` in
`client/`.

**Lint + PR check (Sep 30)**: ESLint 10 flat configs (`client/eslint.config.js`,
`server/eslint.config.mjs`), `npm run lint` = `--max-warnings 0`. Deliberate
choices: no `any`, except the server files that parse untyped ESPN/Odds
JSON (espnClient, oddsClient, seasonService) and scripts/ + prisma/ (a
`files` override in the server config). Caught errors are `unknown`: the
server goes through `utils/errors.ts` (`errorMessage` for logs/admin text,
`clientMessage` for anything a client sees, which hides Prisma's text), the
client through `apiErrorMessage`/`apiErrorStatus` in `services/api.ts`.
React hooks = the classic two rules only (the plugin's React Compiler
rules assume a compiler this app doesn't use); unused args may be
`_`-prefixed (Express's 4-argument error handler). The global error
handler only sends AppError and Express 4xx messages; anything else is a
generic 500 with details in the log. The server's tsconfig `lib` is ES2022
so `new Error(msg, { cause })` types; `target` stays ES2020.
`.github/workflows/checks.yml` runs on every PR and push to `main`: server
lint + `tsc`, then `prisma migrate deploy` against a throwaway Postgres
service and a boot + `/health` check; client lint + `vite build`. It can't
run the smoke test (needs seeded teams and live ESPN).

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
- **Render exports `NODE_ENV=production`**, so `npm ci` skips devDependencies.
  The server keeps everything its build and preDeploy need (prisma,
  typescript, tsx) in `dependencies` and installs without dev tooling; the
  client's install uses `--include=dev` (vite/typescript live there). A new
  server build-time package belongs in `dependencies`, or Render's build
  breaks. Never use Render's free Postgres (self-deletes after 30 days).
- **The odds matcher must never "match" on ignorance.** Until Sep 11 it
  compared alias-table lookups with `===`, so two un-aliased teams gave
  `null === null` and any same-kickoff game could inherit another game's
  line (Hawai'i vs UNLV got -29.5; the real line was UNLV -2.5).
  `teamNamesAgree` now needs a positive signal. If a game has no line, that
  is the correct outcome, not something to loosen. The flip side: when ESPN
  and the Odds API name a school differently enough (App State /
  Appalachian State, The Citadel / Citadel, UAlbany / Albany: 7 schools
  as of Sep 24, all in `TEAM_ALIASES` now), every game that team plays
  goes lineless until the pair is aliased. Full audit recipe: ESPN
  scoreboards for weeks 1–15 vs the Odds API `/participants` list (1
  credit), run through `teamNamesAgree`. `/events` (0 credits) only shows
  games with posted lines. ESPN's game summary
  (`pickcenter`) keeps the DraftKings closing line after the game, keyed by
  event id: `POST /api/admin/repair-spreads/:season/:week` (dry run;
  `?apply=true` writes + rescores) uses it to find and fix cross-matched
  lines.
- **`sync-current` covers three weeks**: previous (late finals, e.g. a game
  that ends after ESPN's week boundary), current (full pipeline), next
  (schedule only, so the attribution can tell a bye from an unsynced week).
  Still one Odds API credit per run.
- **Odds only attach to games that haven't kicked off** — after kickoff the
  spread is unrecoverable. The daily 11:00 UTC cron exists for this. Missing
  lines on FBS-vs-FCS blowouts are books-not-posting, not a bug; they
  self-heal or score as plain results.
- **ESPN API quirks**: the site `/teams?groups=` filter is a silent no-op
  (returns D3 schools); conference membership needs the core API. There is
  no "Week 0" — ESPN's Week 1 spans the late-Aug openers through Labor Day.
  Never compute week boundaries; read `SeasonWeek`. Scoreboard `limit=300`
  (Week 1 2026 has 104 games; the old 100 truncated). Team schedule
  (`/teams/{id}/schedule?season=&seasontype=2`): its `team` block always
  describes ESPN's *current* season whatever season you ask for (trust its
  record only when `seasonSummary` matches), scores are `{value,
  displayValue}` objects (scoreboard: strings), `curatedRank.current` 99 =
  unranked, `timeValid: false` = kickoff TBD (the 04:00Z/05:00Z placeholder
  times are not real). Team news (`/news?team={id}`) mixes in league-wide
  roundups tagged with 20-70 teams; the card prefers stories tagging 4 or
  fewer. Logos: `a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/{id}.png&w=160&h=160`
  (resized by ESPN's CDN: 8-16KB vs ~30KB for the 500px original).
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
slate). League drafts before Sep 5. Week 5 (**Sep 28**) → swap lists open.
Week 6 starts **Mon Oct 5, 3am ET** → lists lock, and the 08:30 UTC sync
runs every league's swap (first week-6 kickoff: Tue Oct 6). Season ends
Dec 12 (Army-Navy, week 15). No bowls, no CFP.

## Status (as of Sep 11, 2026)

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
Draft Recap tab retired, its swap UI moved into My Team. Also Aug 29:
league membership locks at draft start — `joinLeague` rejects new members
once `draftStarted` (a mid-draft join would corrupt the snake math), and
Settings greys the player capacity + hides the share button when locked.
**Aug 30**: My Team gained a Viewing dropdown — any member's team via
`GET /rosters/:id/matchups?userId=` (swap card stays self-only) — and each
card shows the team's season net points (computed from FINAL `Game` rows,
effective-week windows respected; nothing new stored).
**Sep 11 (after weeks 1–2)**: three real-data bugs fixed. (1) Teams that
played twice in ESPN's two-weekend Week 1 had their second game silently
dropped (`findFirst`); now every game counts via `scoringWeekService`, with
Mac's rule that the extra game rolls into a bye week (FSU's Sep 7 game =
week 2). (2) FSU vs SMU ended after week 1 closed and was never re-synced
(SMU stuck on TBD); `sync-current` now re-syncs the previous week too.
(3) The odds matcher cross-matched un-aliased teams at the same kickoff
(Hawai'i vs UNLV stored -29.5, real line UNLV -2.5; 8 week-1 games and
several week-2 games carried another game's line); matcher fixed, plus the
`repair-spreads` admin endpoint backed by ESPN's closing line. Idea parked
in NOTES: ESPN's scoreboard embeds DraftKings lines per event id, which
would retire the Odds API and name matching entirely.
Week 2 games kick off Sep 12.
**Sep 30**: the week-5 swap window (24h turns) was replaced by the **week-6
swap**: private ranked lists during week 5, one run per league by the first
sync of week 6 (README changelog has the why). New table `SwapClaim`,
`League.swapRanAt`; the old `swapStatus`/`swapTurnDeadline`/`swapSkipped`
columns are dead but kept for rollback safety until the offseason. Same day,
after Mac's review: the swap got its own tab (board sorted by Pick 6 season
points), Settings moved behind a header button, and standings got a
tiebreaker (combined ESPN FPI SOS rank, `TeamSos` + `standingsService`).
Late Sep 30: the **team card** (tap a team on My Team / Week by Week; see
`teamCardService` above): no migration, no Odds API calls. Local 2026 Game
rows are weeks stale on this Mac (last synced Sep 11), so local 2026 cards
show "·" (not scored yet) for points until a local sync runs; the smoke
league shows real points. Same night after Mac merged it (PR #19): one
Season tab instead of Game Log + Schedule, the League tab opens the card,
and the speed/ESPN-safety pass on `teamCardService`'s cache. Mac OK'd two
follow-ups for later (NOTES.md parking lot): ESLint across the repo and
the `npm audit` findings in Render's deploy log. Both done right after
PR #20: `npm audit` server 14 -> 0 (bcrypt 5 -> 6: same `hash`/`compare`,
prebuilt binaries instead of the install-time downloader that pulled in
the critical `tar`; bcrypt-5 hashes verified to log in), client 30 -> 4
(major-version-only; vite/esbuild are dev-server-only, React Router ships
but its open redirect only matters for user-controlled navigation targets,
of which Login's `?next=` is the only one; parked in NOTES.md); Login's
`?next=` now goes through `internalPath` (resolved against our origin, so
`/\evil.com` and tab tricks can't redirect off-site); ESLint + the PR check
above. Oct 1: a max-effort code review of PR #21 found 15 issues, all fixed
except Dependabot (a GitHub settings toggle for Mac): `internalPath` also
rejects results starting with `//` (`/.//evil.com` resolved to
`//evil.com`); the error handler stops returning Prisma text; the draft
room's auto-queue keeps teams you queued yourself; League tab tiles say
Loading/Couldn't load instead of "No Game"; Node pinned to 22 via
`.node-version`; `getDatabaseHost` parses the URL; MIT notice for
`.agents/skills`; `"private": true`; CI applies migrations and boots the
server; Render's server install skips dev tooling; `no-explicit-any` is on
outside the JSON-parsing files.
