/**
 * Week-6 Swap Service
 *
 * League rule: every member gets at most one same-slot swap, and the whole
 * league's swaps run at once at the start of week 6. This replaced the WS8
 * week-5 window on Sep 30, 2026: its 24h turns could straddle a team's game
 * (whose points? can you still drop it?), took days in a big league, and
 * let the best records pick up whatever a worse record had just dropped.
 *
 *  - Lists open in week 5: each member saves a private priority list of
 *    "drop X, add Y" lines (same slot, Y unowned). Editing stops when week 6
 *    starts on ESPN's calendar (Monday 3am ET), before any week-6 game.
 *  - The first scheduled sync of week 6 finalizes and rescores week 5, then
 *    runs every drafted league once in reverse standings through week 5
 *    (standingsService: ties broken by combined SOS rank), and each member
 *    gets the highest line on their list that is still possible.
 *  - Only teams nobody owned when lists locked can be added, so a team
 *    dropped in the run is out of play: nobody later in the order (a better
 *    record) can pick it up.
 *  - Roster effect is effective-week: the old team keeps weeks 1-5, the new
 *    team counts from week 6. A line whose team already kicked off in week 6
 *    misses (only possible if the run happens late).
 */

import prisma from '../lib/prisma';
import { ConferenceSlot, GameStatus, SwapClaim, SwapClaimStatus, Team } from '@prisma/client';
import { DRAFT_SLOTS, SLOT_LABELS } from './draftService';
import { getAvailableTeams } from './rosterService';
import { syncSeasonCalendar } from './seasonService';
import { gamesForTeamWeek, loadScoringWeekMap, seasonRecord } from './scoringWeekService';
import { getStandings } from './standingsService';

export const SWAP_WEEK = 6; // new teams count from here; lists run at its start
export const SWAP_MAX_CLAIMS = 10;

export type SwapPhase = 'upcoming' | 'open' | 'locked' | 'complete';

export interface SwapLine {
  dropTeamId: number;
  addTeamId: number;
}

interface SwapClaimView {
  priority: number;
  slot: ConferenceSlot;
  slotLabel: string;
  dropTeamId: number;
  dropTeamName: string;
  addTeamId: number;
  addTeamName: string;
  status: SwapClaimStatus;
  note: string | null;
}

interface SwapOrderEntry {
  position: number;
  userId: number;
  userName: string;
  points: number; // through week 5: the standings that set the order
  sosTotal: number; // the tiebreaker on equal points (lower = ranks higher)
  swapUsed: boolean;
  swap: { slotLabel: string; dropTeamName: string; addTeamName: string } | null;
}

export interface SwapState {
  swapWeek: number;
  phase: SwapPhase;
  opensAt: Date;
  locksAt: Date;
  ranAt: Date | null;
  maxClaims: number;
  swapUsed: boolean;
  // Projected from current standings until the run, then the run's order
  order: SwapOrderEntry[];
  // The viewer's own list; nobody else's is ever returned
  myClaims: SwapClaimView[];
}

export interface SwapRunResult {
  leagueId: number;
  members: number;
  swaps: number;
  error?: string; // the run rolled back; the next sync retries it
}

export interface SwapTeam {
  teamId: number;
  name: string;
  conference: string;
  slot: ConferenceSlot;
  slotLabel: string;
  points: number; // Pick 6 points this season, whoever owned the team
  wins: number;
  losses: number;
}

/**
 * Lists open when week 5 starts and lock when week 6 starts (ESPN calendar)
 */
export async function getSwapSchedule(seasonYear: number) {
  const find = () =>
    prisma.seasonWeek.findMany({
      where: { seasonYear, weekNumber: { in: [SWAP_WEEK - 1, SWAP_WEEK] } },
    });

  let weeks = await find();
  if (weeks.length < 2) {
    await syncSeasonCalendar(seasonYear);
    weeks = await find();
  }

  const opens = weeks.find((w) => w.weekNumber === SWAP_WEEK - 1);
  const locks = weeks.find((w) => w.weekNumber === SWAP_WEEK);
  if (!opens || !locks) {
    throw new Error(`No week ${SWAP_WEEK - 1}-${SWAP_WEEK} calendar for ${seasonYear}`);
  }
  return { opensAt: opens.startDate, locksAt: locks.startDate };
}

function phaseFor(
  league: { draftComplete: boolean; swapRanAt: Date | null },
  schedule: { opensAt: Date; locksAt: Date },
  now: Date
): SwapPhase {
  if (league.swapRanAt) return 'complete';
  if (!league.draftComplete || now < schedule.opensAt) return 'upcoming';
  return now < schedule.locksAt ? 'open' : 'locked';
}

function toClaimView(claim: SwapClaim & { dropTeam: Team; addTeam: Team }): SwapClaimView {
  return {
    priority: claim.priority,
    slot: claim.addTeam.slot,
    slotLabel: SLOT_LABELS[claim.addTeam.slot],
    dropTeamId: claim.dropTeamId,
    dropTeamName: claim.dropTeam.name,
    addTeamId: claim.addTeamId,
    addTeamName: claim.addTeam.name,
    status: claim.status,
    note: claim.note,
  };
}

/**
 * The viewer's swap state: phase, schedule, order, own list, and each
 * member's swap once the run is done
 */
export async function getSwapState(
  leagueId: number,
  userId: number,
  now: Date = new Date()
): Promise<SwapState> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');

  const schedule = await getSwapSchedule(league.seasonYear);
  const phase = phaseFor(league, schedule, now);

  const [standings, claims] = await Promise.all([
    // Reverse standings: worst first
    getStandings(leagueId, { throughWeek: SWAP_WEEK - 1 }).then((rows) => rows.reverse()),
    // Lists stay private: only the viewer's lines, plus every member's
    // winning line once the run is done
    prisma.swapClaim.findMany({
      where: {
        leagueId,
        OR: [
          { userId },
          ...(phase === 'complete' ? [{ status: SwapClaimStatus.SWAPPED }] : []),
        ],
      },
      include: { dropTeam: true, addTeam: true },
      orderBy: { priority: 'asc' },
    }),
  ]);

  const ordered =
    phase === 'complete'
      ? [...standings].sort(
          (a, b) => (a.member.swapOrder ?? Infinity) - (b.member.swapOrder ?? Infinity)
        )
      : standings;
  const swappedByUser = new Map(
    claims.filter((c) => c.status === SwapClaimStatus.SWAPPED).map((c) => [c.userId, c])
  );

  return {
    swapWeek: SWAP_WEEK,
    phase,
    opensAt: schedule.opensAt,
    locksAt: schedule.locksAt,
    ranAt: league.swapRanAt,
    maxClaims: SWAP_MAX_CLAIMS,
    swapUsed: standings.some((s) => s.member.userId === userId && s.member.swapUsed),
    order: ordered.map(({ member, points, sosTotal }, index) => {
      const swapped = swappedByUser.get(member.userId);
      return {
        position: index + 1,
        userId: member.userId,
        userName: member.user.name,
        points,
        sosTotal,
        swapUsed: member.swapUsed,
        swap: swapped
          ? {
              slotLabel: SLOT_LABELS[swapped.addTeam.slot],
              dropTeamName: swapped.dropTeam.name,
              addTeamName: swapped.addTeam.name,
            }
          : null,
      };
    }),
    myClaims: claims.filter((c) => c.userId === userId).map(toClaimView),
  };
}

/**
 * The swap page's board: every unowned draft-pool team, most Pick 6 points
 * this season first, plus the viewer's own five (slot order) to compare
 */
export async function getSwapTeams(
  leagueId: number,
  userId: number
): Promise<{ available: SwapTeam[]; mine: SwapTeam[] }> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');

  const [available, myRows] = await Promise.all([
    getAvailableTeams(leagueId),
    prisma.rosterSlot.findMany({
      where: { leagueId, userId, toWeek: null },
      include: { team: true },
    }),
  ]);
  const mine = myRows
    .map((r) => r.team)
    .sort((a, b) => DRAFT_SLOTS.indexOf(a.slot) - DRAFT_SLOTS.indexOf(b.slot));

  const scoringWeeks = await loadScoringWeekMap(
    league.seasonYear,
    [...available, ...mine].map((t) => t.id)
  );
  const toSwapTeam = (team: Team): SwapTeam => ({
    teamId: team.id,
    name: team.name,
    conference: team.conference,
    slot: team.slot,
    slotLabel: SLOT_LABELS[team.slot],
    ...seasonRecord(scoringWeeks, team.id),
  });

  return {
    available: available
      .map(toSwapTeam)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    mine: mine.map(toSwapTeam),
  };
}

/**
 * Replace a member's list (index 0 = first choice) while lists are open
 */
export async function saveSwapClaims(
  leagueId: number,
  userId: number,
  lines: SwapLine[],
  now: Date = new Date()
): Promise<SwapState> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');

  const phase = phaseFor(league, await getSwapSchedule(league.seasonYear), now);
  if (phase === 'upcoming') {
    throw new Error(`Swap lists open when week ${SWAP_WEEK - 1} starts`);
  }
  if (phase !== 'open') throw new Error('Swap lists are locked');

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!member) throw new Error('Not a member of this league');
  if (member.swapUsed) throw new Error('You have already used your swap');
  if (lines.length > SWAP_MAX_CLAIMS) {
    throw new Error(`Your list can hold up to ${SWAP_MAX_CLAIMS} swaps`);
  }

  const [myRows, rostered, addTeams] = await Promise.all([
    prisma.rosterSlot.findMany({ where: { leagueId, userId, toWeek: null } }),
    prisma.rosterSlot.findMany({ where: { leagueId, toWeek: null }, select: { teamId: true } }),
    prisma.team.findMany({ where: { id: { in: lines.map((l) => l.addTeamId) } } }),
  ]);
  const owned = new Set(rostered.map((r) => r.teamId));
  const teamById = new Map(addTeams.map((t) => [t.id, t]));
  const listed = new Set<number>();

  for (const line of lines) {
    const dropRow = myRows.find((r) => r.teamId === line.dropTeamId);
    if (!dropRow) throw new Error('You can only drop a team on your roster');

    const add = teamById.get(line.addTeamId);
    if (!add) throw new Error('Team not found');
    if (add.slot === ConferenceSlot.NONE) throw new Error(`${add.name} is not in the draft pool`);
    if (add.slot !== dropRow.slot) {
      throw new Error(`Swaps stay in one slot: ${add.name} can't replace your ${SLOT_LABELS[dropRow.slot]} team`);
    }
    if (owned.has(add.id)) throw new Error(`${add.name} is already on a roster`);
    if (listed.has(add.id)) throw new Error(`${add.name} is on your list twice`);
    listed.add(add.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.swapClaim.deleteMany({ where: { leagueId, userId } });
    if (lines.length > 0) {
      await tx.swapClaim.createMany({
        data: lines.map((line, index) => ({
          leagueId,
          userId,
          priority: index + 1,
          dropTeamId: line.dropTeamId,
          addTeamId: line.addTeamId,
        })),
      });
    }
  });

  return getSwapState(leagueId, userId, now);
}

/**
 * Run a league's swap once lists have locked. Returns null when it isn't
 * due (lists still open, draft unfinished) or has already run.
 */
export async function runSwap(
  leagueId: number,
  now: Date = new Date()
): Promise<SwapRunResult | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');

  const schedule = await getSwapSchedule(league.seasonYear);
  if (phaseFor(league, schedule, now) !== 'locked') return null;

  const claims = await prisma.swapClaim.findMany({
    where: { leagueId },
    include: { dropTeam: true, addTeam: true },
    orderBy: { priority: 'asc' },
  });

  // Safety net for a late run: a team whose week-6 game has kicked off
  // stays put (no picking up a team that already won, no dodging a loss)
  const scoringWeeks = await loadScoringWeekMap(
    league.seasonYear,
    claims.flatMap((c) => [c.dropTeamId, c.addTeamId])
  );
  const kickedOff = (teamId: number) =>
    gamesForTeamWeek(scoringWeeks, teamId, SWAP_WEEK).some(
      (g) =>
        g.status === GameStatus.IN_PROGRESS ||
        g.status === GameStatus.FINAL ||
        (g.status === GameStatus.SCHEDULED && g.startTime <= now)
    );

  return prisma.$transaction(
    async (tx) => {
      // Take the run first: a concurrent sync blocks on this row, then sees
      // swapRanAt set and backs off, so a league can never run twice
      const taken = await tx.league.updateMany({
        where: { id: leagueId, swapRanAt: null },
        data: { swapRanAt: now },
      });
      if (taken.count === 0) return null;

      // Reverse standings through week 5 (ties: combined SOS rank)
      const standings = (
        await getStandings(leagueId, { throughWeek: SWAP_WEEK - 1, db: tx })
      ).reverse();
      const rosterRows = await tx.rosterSlot.findMany({ where: { leagueId, toWeek: null } });

      // Everything owned at lock is off the board, which also keeps every
      // team dropped in this run out of play for the rest of the order
      const ownedAtLock = new Set(rosterRows.map((r) => r.teamId));
      const droppedThisRun = new Set<number>();
      const addedBy = new Map<number, string>();
      let swaps = 0;

      for (const [index, { member }] of standings.entries()) {
        await tx.leagueMember.update({
          where: { id: member.id },
          data: { swapOrder: index + 1 },
        });

        // swapUsed can already be true from the retired turn-based window
        let swapped = member.swapUsed;
        for (const claim of claims.filter((c) => c.userId === member.userId)) {
          if (swapped) break;

          const dropRow = rosterRows.find(
            (r) => r.userId === member.userId && r.teamId === claim.dropTeamId
          );
          const { dropTeam, addTeam } = claim;
          const note = !dropRow
            ? `${dropTeam.name} is no longer on your roster`
            : addTeam.slot !== dropRow.slot
            ? `${addTeam.name} is not a ${SLOT_LABELS[dropRow.slot]} team`
            : addedBy.has(addTeam.id)
            ? `${addedBy.get(addTeam.id)} took ${addTeam.name} earlier in the order`
            : droppedThisRun.has(addTeam.id)
            ? `${addTeam.name} was dropped in the swap, and dropped teams can't be picked up`
            : ownedAtLock.has(addTeam.id)
            ? `${addTeam.name} was on a roster when lists locked`
            : kickedOff(dropTeam.id)
            ? `${dropTeam.name} already played in week ${SWAP_WEEK}`
            : kickedOff(addTeam.id)
            ? `${addTeam.name} already played in week ${SWAP_WEEK}`
            : dropRow.fromWeek >= SWAP_WEEK
            ? `${dropTeam.name} only joined your roster in week ${dropRow.fromWeek}`
            : null;

          if (note || !dropRow) {
            await tx.swapClaim.update({
              where: { id: claim.id },
              data: { status: SwapClaimStatus.MISSED, note },
            });
            continue;
          }

          await tx.rosterSlot.update({
            where: { id: dropRow.id },
            data: { toWeek: SWAP_WEEK - 1 },
          });
          await tx.rosterSlot.create({
            data: {
              leagueId,
              userId: member.userId,
              slot: dropRow.slot,
              teamId: addTeam.id,
              fromWeek: SWAP_WEEK,
            },
          });
          await tx.leagueMember.update({
            where: { id: member.id },
            data: { swapUsed: true },
          });
          await tx.swapClaim.update({
            where: { id: claim.id },
            data: { status: SwapClaimStatus.SWAPPED },
          });

          droppedThisRun.add(dropTeam.id);
          addedBy.set(addTeam.id, member.user.name);
          swapped = true;
          swaps++;
          console.log(
            `[Swap] League ${leagueId}: #${index + 1} ${member.user.name} ${dropTeam.name} → ${addTeam.name} (${SLOT_LABELS[dropRow.slot]}, from week ${SWAP_WEEK})`
          );
        }

        // Lines below the one that went through
        await tx.swapClaim.updateMany({
          where: { leagueId, userId: member.userId, status: SwapClaimStatus.PENDING },
          data: { status: SwapClaimStatus.UNUSED },
        });
      }

      console.log(
        `[Swap] League ${leagueId}: week ${SWAP_WEEK} swap ran, ${swaps} swaps across ${standings.length} members`
      );
      return { leagueId, members: standings.length, swaps };
    },
    { timeout: 60000 }
  );
}

/**
 * Run every drafted league whose lists have locked and hasn't run yet.
 * Called from the scheduled sync after it finalizes and rescores week 5,
 * so the order comes from final standings. Safe to call on every sync.
 */
export async function runDueSwaps(
  seasonYear: number,
  now: Date = new Date()
): Promise<SwapRunResult[]> {
  const { locksAt } = await getSwapSchedule(seasonYear);
  if (now < locksAt) return [];

  const leagues = await prisma.league.findMany({
    where: { seasonYear, draftComplete: true, swapRanAt: null },
    select: { id: true },
  });

  const results: SwapRunResult[] = [];
  for (const { id } of leagues) {
    try {
      const result = await runSwap(id, now);
      if (result) results.push(result);
    } catch (e: any) {
      console.error(`[Swap] Run failed for league ${id}: ${e.message}`);
      results.push({ leagueId: id, members: 0, swaps: 0, error: e.message });
    }
  }
  return results;
}
