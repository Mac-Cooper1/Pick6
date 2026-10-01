# Notes — Design Backlog & V2 Ideas

Running list of deliberate deferrals. QA bugs go straight into work, not here.

## Design backlog

- ~~**Mobile overhaul**~~ — **done Aug 22, 2026** (README changelog has the
  full list): sideways-scrolling tab strip, `Button` kit with 44px tap targets,
  hover-only-when-supported + pressed states, one-row sticky draft header,
  draft-room panels reordered on phones, tables that scroll instead of squish.
  Deliberately *not* done: a bottom tab bar with icons (six tabs is over the
  limit and it would mean maintaining two navs), a 2×3 tab grid (~90px of
  chrome), and any logic changes (the one copy tweak: the phone header says
  "YOUR TURN!" so it never truncates). Still open from the original list:
  the draft board is a horizontally scrolling table on phones rather than a
  reflowed layout — fine for ≤6 players, revisit if leagues get bigger.
- ~~General visual design pass~~ — **done Aug 23, 2026** (README changelog):
  Barlow / Barlow Condensed type system, `.card` / `.section-title` / `.label`
  classes, green scoreboard header with the tab strip inside it, new mark +
  favicon, landing page at `/` with auth moved to `/login`. Build on those
  classes rather than adding one-off styling. Still open:
  - **Dark mode.** The app is light-only by design for now (one theme, less
    to test before the Aug 27 rehearsal). If added: CSS-variable tokens, keep
    the green header as-is, test the draft room first.
  - **Photography on the landing page.** It's typographic + a real component
    preview today. A stadium/tailgate photo in the hero would lift it, but
    only with a real licensed image (no stock placeholders).
  - Skeleton loaders instead of the spinner on the Leaderboard / Week tabs.
  - The "How it works" section could show a short screen recording of the
    draft room once the dress rehearsal produces one.

## V2 ideas

- **Team card from the Week 6 Swap board.** The card opens from My Team,
  Week by Week and League (Sep 30). It takes `{ teamId, teamName, userId?,
  eventId?, week? }`, so another entry point is a few lines. The swap board
  is the strongest remaining case: scouting an unowned team's season while
  ranking your list (no owner there, so nothing greys out).

- **Take lines from ESPN instead of The Odds API.** ESPN's scoreboard
  response (the one the sync already fetches) embeds `competitions[0].odds`
  with the DraftKings spread for 84 of 86 week-2 games, keyed by the same
  event id we store, and the game summary keeps the closing line after the
  game. That removes the Odds API (500 credits/month, one cron spender),
  the ±60-minute time window and every name-matching heuristic in
  `teamMatcher`. Same book (DraftKings) as today. Not a mid-season change:
  the stored line is "the line scoring uses" and swapping sources could
  move a game across the 3.5 boundary. Sep 11.

- **"Best available" ordering + team rankings in the draft room.** The
  available-teams list (and the "All" filter) is alphabetical within slot
  today. V2: give every team a power ranking (AP where ranked; something like
  returning-production/SP+/odds-derived for the rest) and sort "All" by best
  available, like a real draft board. The AP-rank autopick fallback already
  exists server-side — this extends it into a full visible ranking.
- Show each team's ranking chip in the draft list/board once rankings exist.
- **Weekly awards + "your teams ranked" pages** (Mac + Johnny, Aug 24 after
  the first real draft). Two engagement pages that share one data layer
  (per-team-per-owner points, best single results, underdog wins):
  - **Weekly Awards**: one page, auto-pulled weekly. Most dominant win, best
    underdog win, etc.
  - **Team net points / best-to-worst picks**: how many points each of your
    teams has netted you, ranked best pick to worst across the league.
  Design them as one page family, not bolt-ons. Downstream: the same data
  folds into a waiver page and a "Pick 6 ranking" that seeds next season's
  draft order. Not launch-critical; build after the season is running.

## **2027 ideas**

- **Go to 6 teams: two Group of 6 slots (recommended).** Johnny spotted it
  after the first draft: with 5 rounds (odd), snake order still favors early
  picks. Position 1's pick numbers sum to 12N+3 vs position N's 13N+2; any
  odd round count does this, even counts self-balance. Fix: 6 rounds via a
  second G6 slot. G6 is the only pool deep enough to double up (Mountain
  West alone is what the rebuilt Pac-12 raided, so a mandatory-MW slot would
  be thin), and it makes the name "Pick 6" literal. This is a schema-level
  change (roster size, dual-slot uniqueness incl. the partial unique
  indexes, swap logic, TEAMS_PER_ROSTER) — do it in the 2027 offseason,
  never mid-season.
  - Stopgap if a 2026 league that hasn't drafted wants balance now:
    **third-round reversal** (round 3 repeats round 2's direction) — small,
    no schema change. Not built; ask Mac before adding.

## Parking lot

- **Client major upgrades the audit still lists (2027 offseason, or a quiet
  week).** After Sep 30's fixes `npm audit` shows 4 in `client/` (vite,
  esbuild, react-router, react-router-dom), all needing a major version.
  Vite 5 -> 6.4.3+ (8 is latest; 8 also needs @vitejs/plugin-react 6)
  clears dev-server bugs that never reach production (it serves the built
  files from Express, not Vite). React Router 6 -> 7.18+ DOES ship to
  production: it clears an SSR-only advisory (no SSR here) and an open
  redirect through user-controlled navigation targets. The only such
  target is Login's `?next=`, guarded by `internalPath` (which also
  rejects results starting with `//`); any new user-controlled
  navigate()/Link target makes this upgrade urgent. Do them as their own
  change with a full browser pass, not mixed into a fix. The server is at
  0. Dependabot alerts + security updates should be on (GitHub Settings ->
  Advanced Security) so new advisories open PRs instead of waiting for
  someone to read a deploy log.

- **Drop the dead turn-based swap columns (2027 offseason).** The Sep 30
  week-6 swap left `League.swapStatus`, `League.swapTurnDeadline`,
  `LeagueMember.swapSkipped` and the `SwapStatus` enum unused on purpose, so
  a mid-season rollback to the old deploy still boots. One migration drops
  them once nobody would roll back past Sep 30.
- **A league that finishes drafting after week 6 starts** gets its swap run
  at the next sync with no lists (nobody could set one), i.e. no swaps.
  Irrelevant for 2026 (every league drafted by Aug 29); if late drafts ever
  happen, give such leagues their own lock time instead.
