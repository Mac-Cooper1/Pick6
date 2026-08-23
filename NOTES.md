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
- General visual design pass after mobile (spacing, type scale, empty states,
  loading states) — the app is utility-styled Tailwind right now. The `Button`
  kit (variants + sizes) is the first piece of that system; build on it rather
  than adding one-off classes.

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
