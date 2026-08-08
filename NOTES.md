# Notes — Design Backlog & V2 Ideas

Running list of deliberate deferrals. QA bugs go straight into work, not here.

## Design backlog

- **Mobile overhaul (top priority once features freeze).** Current mobile layout
  is rough everywhere. Known offenders from the first real draft (Aug 5 QA):
  the draft room board/grid, the six-tab nav, Week by Week grid, and the swap
  panel. Needs a real pass: nav that collapses, draft room laid out
  mobile-first, tables that scroll or reflow deliberately.
- General visual design pass after mobile (spacing, type scale, empty states,
  loading states) — the app is utility-styled Tailwind right now.

## V2 ideas

- **"Best available" ordering + team rankings in the draft room.** The
  available-teams list (and the "All" filter) is alphabetical within slot
  today. V2: give every team a power ranking (AP where ranked; something like
  returning-production/SP+/odds-derived for the rest) and sort "All" by best
  available, like a real draft board. The AP-rank autopick fallback already
  exists server-side — this extends it into a full visible ranking.
- Show each team's ranking chip in the draft list/board once rankings exist.

## Parking lot

- (add future deferrals here)
