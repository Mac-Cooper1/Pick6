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

- (add future deferrals here)
