/**
 * Week-5 Swap Service (WS8)
 *
 * League rule: after week 5, every member gets exactly one same-slot swap,
 * worst record first. Implementation:
 *  - The window auto-opens during the scheduled sync once the current week
 *    passes 5 (i.e. week 5's games are behind us).
 *  - Turn order = ascending points through week 5 (ties: earlier join).
 *  - Each turn has a 24h clock; expiry marks the member skipped and moves
 *    on (lazy tick — evaluated whenever swap state is read, plus on every
 *    scheduled sync). After the last turn the window goes free-for-all for
 *    anyone who hasn't swapped, until the commissioner closes it.
 *  - Roster effect is effective-week: the old team keeps every week it
 *    already played; the new team counts from the swap-effective week on.
 */

import prisma from '../lib/prisma';
import { ConferenceSlot, SwapStatus, GameStatus } from '@prisma/client';
import { SLOT_LABELS } from './draftService';
import { getCurrentWeek } from './seasonService';

export const SWAP_OPEN_AFTER_WEEK = 5;
const SWAP_TURN_HOURS = 24;

interface SwapOrderEntry {
  userId: number;
  userName: string;
  swapOrder: number | null;
  swapUsed: boolean;
  swapSkipped: boolean;
}

export interface SwapState {
  status: SwapStatus;
  turnDeadline: Date | null;
  onTheClockUserId: number | null;
  freePhase: boolean; // everyone had a turn; unswapped members may still swap
  order: SwapOrderEntry[];
}

function resolveOnTheClock(
  members: { userId: number; swapOrder: number | null; swapUsed: boolean; swapSkipped: boolean }[]
): number | null {
  const ordered = members
    .filter((m) => m.swapOrder !== null)
    .sort((a, b) => (a.swapOrder || 0) - (b.swapOrder || 0));
  const next = ordered.find((m) => !m.swapUsed && !m.swapSkipped);
  return next ? next.userId : null;
}

/**
 * Open the swap window: assign worst-first order and start the first clock
 */
export async function openSwapWindow(leagueId: number): Promise<SwapState> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { members: true },
  });

  if (!league) throw new Error('League not found');
  if (!league.draftComplete) throw new Error('Draft must be complete before the swap window opens');
  if (league.swapStatus !== SwapStatus.NOT_OPEN) {
    throw new Error('Swap window has already been opened');
  }

  // Standings through week 5 decide the order (worst first)
  const scores = await prisma.weeklyScore.groupBy({
    by: ['userId'],
    where: { leagueId, weekNumber: { lte: SWAP_OPEN_AFTER_WEEK } },
    _sum: { points: true },
  });
  const pointsByUser = new Map(scores.map((s) => [s.userId, s._sum.points || 0]));

  const ordered = [...league.members].sort((a, b) => {
    const diff = (pointsByUser.get(a.userId) || 0) - (pointsByUser.get(b.userId) || 0);
    if (diff !== 0) return diff;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      await tx.leagueMember.update({
        where: { id: ordered[i].id },
        data: { swapOrder: i + 1, swapSkipped: false },
      });
    }
    await tx.league.update({
      where: { id: leagueId },
      data: {
        swapStatus: SwapStatus.OPEN,
        swapTurnDeadline: new Date(Date.now() + SWAP_TURN_HOURS * 3600 * 1000),
      },
    });
  });

  console.log(`[Swap] Window opened for league ${leagueId} (${ordered.length} turns)`);
  return getSwapState(leagueId);
}

export async function closeSwapWindow(leagueId: number): Promise<SwapState> {
  await prisma.league.update({
    where: { id: leagueId },
    data: { swapStatus: SwapStatus.CLOSED, swapTurnDeadline: null },
  });
  console.log(`[Swap] Window closed for league ${leagueId}`);
  return getSwapState(leagueId);
}

/**
 * Current swap state with lazy turn-expiry handling: any expired turns are
 * marked skipped and the clock moves to the next member.
 */
export async function getSwapState(leagueId: number): Promise<SwapState> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { members: { include: { user: true } } },
  });
  if (!league) throw new Error('League not found');

  let turnDeadline = league.swapTurnDeadline;
  const members = league.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    userName: m.user.name,
    swapOrder: m.swapOrder,
    swapUsed: m.swapUsed,
    swapSkipped: m.swapSkipped,
  }));

  if (league.swapStatus === SwapStatus.OPEN) {
    // Expire overdue turns (possibly several, if nobody looked for days)
    let deadlineChanged = false;
    while (turnDeadline && new Date() > turnDeadline) {
      const onClock = resolveOnTheClock(members);
      if (!onClock) {
        turnDeadline = null;
        deadlineChanged = true;
        break;
      }
      const member = members.find((m) => m.userId === onClock)!;
      member.swapSkipped = true;
      await prisma.leagueMember.update({
        where: { id: member.id },
        data: { swapSkipped: true },
      });
      console.log(`[Swap] League ${leagueId}: ${member.userName}'s turn expired`);

      const next = resolveOnTheClock(members);
      turnDeadline = next ? new Date(Date.now() + SWAP_TURN_HOURS * 3600 * 1000) : null;
      deadlineChanged = true;
    }

    if (deadlineChanged) {
      await prisma.league.update({
        where: { id: leagueId },
        data: { swapTurnDeadline: turnDeadline },
      });
    }
  }

  const onTheClockUserId =
    league.swapStatus === SwapStatus.OPEN ? resolveOnTheClock(members) : null;

  return {
    status: league.swapStatus,
    turnDeadline,
    onTheClockUserId,
    freePhase: league.swapStatus === SwapStatus.OPEN && onTheClockUserId === null,
    order: members
      .filter((m) => m.swapOrder !== null)
      .sort((a, b) => (a.swapOrder || 0) - (b.swapOrder || 0))
      .map(({ id, ...rest }) => rest),
  };
}

/**
 * Perform a member's one swap: same slot, unrostered target, effective from
 * the right week so history is never rewritten.
 */
export async function performSwap(
  leagueId: number,
  userId: number,
  dropTeamId: number,
  addTeamId: number
) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');
  if (league.swapStatus !== SwapStatus.OPEN) throw new Error('Swap window is not open');

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!member) throw new Error('Not a member of this league');
  if (member.swapUsed) throw new Error('You have already used your swap');

  const state = await getSwapState(leagueId); // also ticks expired turns
  if (state.onTheClockUserId !== null && state.onTheClockUserId !== userId) {
    throw new Error('Not your turn to swap');
  }

  const oldRow = await prisma.rosterSlot.findFirst({
    where: { leagueId, userId, teamId: dropTeamId, toWeek: null },
  });
  if (!oldRow) throw new Error('You do not own that team');

  const addTeam = await prisma.team.findUnique({ where: { id: addTeamId } });
  if (!addTeam) throw new Error('Team not found');
  if (addTeam.slot === ConferenceSlot.NONE) throw new Error(`${addTeam.name} is not in the draft pool`);
  if (addTeam.slot !== oldRow.slot) {
    throw new Error(`Swap must stay in the ${SLOT_LABELS[oldRow.slot]} slot`);
  }

  const taken = await prisma.rosterSlot.findFirst({
    where: { leagueId, teamId: addTeamId, toWeek: null },
  });
  if (taken) throw new Error(`${addTeam.name} is already on a roster`);

  // Effective week: never before week 6; if either team's game this week has
  // already started/finished, push to next week (no swapping in a team that
  // already won, or dodging a loss that already happened)
  const currentWeek = await getCurrentWeek(league.seasonYear);
  let effectiveFrom = Math.max(SWAP_OPEN_AFTER_WEEK + 1, currentWeek);

  if (effectiveFrom === currentWeek) {
    const startedGame = await prisma.game.findFirst({
      where: {
        seasonYear: league.seasonYear,
        weekNumber: currentWeek,
        status: { in: [GameStatus.IN_PROGRESS, GameStatus.FINAL] },
        OR: [
          { homeTeamId: { in: [addTeamId, dropTeamId] } },
          { awayTeamId: { in: [addTeamId, dropTeamId] } },
        ],
      },
    });
    if (startedGame) {
      effectiveFrom = currentWeek + 1;
    }
  }

  if (oldRow.fromWeek > effectiveFrom - 1) {
    throw new Error('Swap timing conflict — contact your commissioner');
  }

  await prisma.$transaction(async (tx) => {
    await tx.rosterSlot.update({
      where: { id: oldRow.id },
      data: { toWeek: effectiveFrom - 1 },
    });
    await tx.rosterSlot.create({
      data: {
        leagueId,
        userId,
        slot: oldRow.slot,
        teamId: addTeamId,
        fromWeek: effectiveFrom,
      },
    });
    await tx.leagueMember.update({
      where: { id: member.id },
      data: { swapUsed: true },
    });
  });

  // Move the clock along
  const after = await getSwapState(leagueId);
  await prisma.league.update({
    where: { id: leagueId },
    data: {
      swapTurnDeadline:
        after.onTheClockUserId !== null
          ? new Date(Date.now() + SWAP_TURN_HOURS * 3600 * 1000)
          : null,
    },
  });

  console.log(
    `[Swap] League ${leagueId}: user ${userId} swapped team ${dropTeamId} → ${addTeamId} (${SLOT_LABELS[oldRow.slot]}, effective week ${effectiveFrom})`
  );

  return {
    droppedTeamId: dropTeamId,
    addedTeamId: addTeamId,
    slot: oldRow.slot,
    effectiveFromWeek: effectiveFrom,
  };
}

/**
 * Pass on your turn (forfeits nothing until the window closes — you can
 * still swap in the free-for-all phase, but the clock moves on)
 */
export async function passSwap(leagueId: number, userId: number): Promise<SwapState> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error('League not found');
  if (league.swapStatus !== SwapStatus.OPEN) throw new Error('Swap window is not open');

  const state = await getSwapState(leagueId);
  if (state.onTheClockUserId !== userId) {
    throw new Error('You are not on the clock');
  }

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  await prisma.leagueMember.update({
    where: { id: member!.id },
    data: { swapSkipped: true },
  });

  const after = await getSwapState(leagueId);
  await prisma.league.update({
    where: { id: leagueId },
    data: {
      swapTurnDeadline:
        after.onTheClockUserId !== null
          ? new Date(Date.now() + SWAP_TURN_HOURS * 3600 * 1000)
          : null,
    },
  });

  return getSwapState(leagueId);
}

/**
 * Auto-open swap windows once week 5 is behind us — called from the
 * scheduled sync so no one has to remember.
 */
export async function autoOpenSwapWindows(seasonYear: number, currentWeek: number) {
  if (currentWeek <= SWAP_OPEN_AFTER_WEEK) return;

  const leagues = await prisma.league.findMany({
    where: {
      seasonYear,
      draftComplete: true,
      swapStatus: SwapStatus.NOT_OPEN,
    },
  });

  for (const league of leagues) {
    try {
      await openSwapWindow(league.id);
    } catch (e: any) {
      console.error(`[Swap] Auto-open failed for league ${league.id}: ${e.message}`);
    }
  }
}
