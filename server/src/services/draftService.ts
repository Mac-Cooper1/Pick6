/**
 * Draft Service
 *
 * Slot-aware snake draft: 5 rounds, each player fills one team per
 * conference slot (SEC, Big Ten, ACC+ND, Big 12, Group of 6). No two
 * players may roster the same team in a league.
 *
 * Handles snake order, scheduled auto-start, timed picks with deadlines,
 * draft queues, and autopick on timeout.
 */

import prisma from '../lib/prisma';
import { ConferenceSlot, DraftStatus } from '@prisma/client';
import { getRankingsMap } from './espnClient';

export const DRAFT_SLOTS: ConferenceSlot[] = [
  ConferenceSlot.SEC,
  ConferenceSlot.BIG_TEN,
  ConferenceSlot.ACC_ND,
  ConferenceSlot.BIG_12,
  ConferenceSlot.G6,
];

export const TEAMS_PER_ROSTER = DRAFT_SLOTS.length; // 5

export const SLOT_LABELS: Record<ConferenceSlot, string> = {
  SEC: 'SEC',
  BIG_TEN: 'Big Ten',
  ACC_ND: 'ACC + Notre Dame',
  BIG_12: 'Big 12',
  G6: 'Group of 6',
  NONE: 'Unslotted',
};

/**
 * Check if a scheduled draft should start
 */
export async function checkScheduledDraft(leagueId: number): Promise<boolean> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) return false;

  if (
    league.draftStatus === DraftStatus.SCHEDULED &&
    league.draftScheduledAt &&
    new Date() >= league.draftScheduledAt &&
    !league.draftStarted
  ) {
    await startDraft(leagueId);
    return true;
  }

  return false;
}

/**
 * Get snake draft user index for a given pick
 * Odd rounds go forward, even rounds go backward
 */
export function getSnakeDraftUserIndex(
  pickNumber: number,
  memberCount: number
): number {
  const round = Math.ceil(pickNumber / memberCount);
  const positionInRound = ((pickNumber - 1) % memberCount) + 1;

  if (round % 2 === 1) {
    return positionInRound - 1;
  } else {
    return memberCount - positionInRound;
  }
}

/**
 * Get round number for a pick
 */
export function getRoundNumber(pickNumber: number, memberCount: number): number {
  return Math.ceil(pickNumber / memberCount);
}

/**
 * Slots a user has already filled in this league's draft
 */
async function getFilledSlots(
  leagueId: number,
  userId: number
): Promise<ConferenceSlot[]> {
  const picks = await prisma.draftPick.findMany({
    where: { leagueId, userId },
    include: { team: { select: { slot: true } } },
  });
  return picks.map((p) => p.team.slot);
}

/**
 * Start the draft for a league
 */
export async function startDraft(leagueId: number) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { members: true },
  });

  if (!league) {
    throw new Error('League not found');
  }

  if (league.draftStarted) {
    throw new Error('Draft has already started');
  }

  if (league.members.length < 2) {
    throw new Error('Need at least 2 members to start draft');
  }

  // Preassigned order (set when the draft was scheduled, so the lobby can
  // show it) is respected. Members without a position — nobody set an order,
  // or they joined after it was set — get shuffled into the remaining spots.
  const positioned = league.members
    .filter((m) => m.draftPosition !== null)
    .sort((a, b) => (a.draftPosition || 0) - (b.draftPosition || 0));
  const unpositioned = shuffle(league.members.filter((m) => m.draftPosition === null));
  const orderedMembers = [...positioned, ...unpositioned];

  for (let i = 0; i < orderedMembers.length; i++) {
    await prisma.leagueMember.update({
      where: { id: orderedMembers[i].id },
      data: { draftPosition: i + 1 },
    });
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + league.pickDeadlineSeconds * 1000);

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      draftStarted: true,
      draftStatus: DraftStatus.LIVE,
      draftStartTime: now,
      currentPickNumber: 1,
      currentPickDeadline: deadline,
    },
  });

  return {
    draftStarted: true,
    currentPickNumber: 1,
    deadline,
    memberOrder: orderedMembers.map((m, i) => ({
      userId: m.userId,
      draftPosition: i + 1,
    })),
  };
}

/** Fisher-Yates shuffle (returns a new array) */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Assign the draft order ahead of the draft, so the lobby can show it.
 * `order` = userIds first-to-last for a commissioner-set order; omit it to
 * randomize. Throws if the draft already started or the order doesn't cover
 * exactly the current member set.
 */
export async function assignDraftOrder(leagueId: number, order?: number[]) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { members: true },
  });

  if (!league) {
    throw new Error('League not found');
  }
  if (league.draftStarted) {
    throw new Error('Cannot change draft order after the draft has started');
  }

  let orderedMembers;
  if (order && order.length > 0) {
    const memberByUserId = new Map(league.members.map((m) => [m.userId, m]));
    if (
      order.length !== league.members.length ||
      new Set(order).size !== order.length ||
      order.some((userId) => !memberByUserId.has(userId))
    ) {
      throw new Error('Draft order must include each league member exactly once');
    }
    orderedMembers = order.map((userId) => memberByUserId.get(userId)!);
  } else {
    orderedMembers = shuffle(league.members);
  }

  await prisma.$transaction(
    orderedMembers.map((m, i) =>
      prisma.leagueMember.update({
        where: { id: m.id },
        data: { draftPosition: i + 1 },
      })
    )
  );

  return orderedMembers.map((m, i) => ({
    userId: m.userId,
    draftPosition: i + 1,
  }));
}

/**
 * Get current draft state for a league
 */
export async function getDraftState(leagueId: number) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: {
        include: { user: true },
        orderBy: { draftPosition: 'asc' },
      },
      draftPicks: {
        include: { user: true, team: true },
        orderBy: { pickNumber: 'asc' },
      },
    },
  });

  if (!league) {
    throw new Error('League not found');
  }

  const memberCount = league.members.length;
  const totalPicks = memberCount * TEAMS_PER_ROSTER;
  const currentPick = league.currentPickNumber;

  let onTheClockUserId: number | null = null;
  if (league.draftStarted && !league.draftComplete && currentPick <= totalPicks) {
    const userIndex = getSnakeDraftUserIndex(currentPick, memberCount);
    const orderedMembers = league.members.filter((m) => m.draftPosition !== null)
      .sort((a, b) => (a.draftPosition || 0) - (b.draftPosition || 0));
    onTheClockUserId = orderedMembers[userIndex]?.userId || null;
  }

  // Per-member filled slots (drives the slot-picker UI)
  const filledSlotsByUser = new Map<number, ConferenceSlot[]>();
  for (const pick of league.draftPicks) {
    const list = filledSlotsByUser.get(pick.userId) || [];
    list.push(pick.team.slot);
    filledSlotsByUser.set(pick.userId, list);
  }

  return {
    leagueId,
    // Server clock stamp so clients can correct for device-clock skew
    serverNow: new Date().toISOString(),
    draftStarted: league.draftStarted,
    draftComplete: league.draftComplete,
    draftStatus: league.draftStatus,
    draftScheduledAt: league.draftScheduledAt,
    currentPickNumber: currentPick,
    totalPicks,
    rounds: TEAMS_PER_ROSTER,
    slots: DRAFT_SLOTS,
    currentRound: currentPick > 0 ? getRoundNumber(currentPick, memberCount) : 0,
    onTheClockUserId,
    pickDeadline: league.currentPickDeadline,
    pickDeadlineSeconds: league.pickDeadlineSeconds,
    members: league.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      draftPosition: m.draftPosition,
      filledSlots: filledSlotsByUser.get(m.userId) || [],
    })),
    picks: league.draftPicks.map((p) => ({
      pickNumber: p.pickNumber,
      round: p.round,
      userId: p.userId,
      userName: p.user.name,
      teamId: p.teamId,
      teamName: p.team.name,
      teamSlot: p.team.slot,
      conference: p.team.conference,
      wasAutoPick: p.wasAutoPick,
    })),
  };
}

/**
 * Make a draft pick.
 * Validates turn order, league-wide team availability, and that the team's
 * conference slot is still open for the picking user. Pick + roster writes
 * happen in one transaction.
 */
export async function makePick(
  leagueId: number,
  userId: number,
  teamId: number,
  isAutoPick: boolean = false
) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { members: true },
  });

  if (!league) {
    throw new Error('League not found');
  }

  if (!league.draftStarted) {
    throw new Error('Draft has not started');
  }

  if (league.draftComplete) {
    throw new Error('Draft is complete');
  }

  const memberCount = league.members.length;
  const currentPick = league.currentPickNumber;

  // Verify it's this user's turn
  const userIndex = getSnakeDraftUserIndex(currentPick, memberCount);
  const orderedMembers = league.members
    .filter((m) => m.draftPosition !== null)
    .sort((a, b) => (a.draftPosition || 0) - (b.draftPosition || 0));

  const expectedUserId = orderedMembers[userIndex]?.userId;

  if (!isAutoPick && userId !== expectedUserId) {
    throw new Error('Not your turn to pick');
  }

  const pickingUserId = isAutoPick ? expectedUserId! : userId;

  // Verify team exists and is in the draft pool
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new Error('Team not found');
  }
  if (team.slot === ConferenceSlot.NONE) {
    throw new Error(`${team.name} is not in the draft pool`);
  }

  // Verify team is available league-wide
  const existingPick = await prisma.draftPick.findUnique({
    where: { leagueId_teamId: { leagueId, teamId } },
  });

  if (existingPick) {
    throw new Error('Team already drafted');
  }

  // Verify the user's slot for this team is still open
  const filledSlots = await getFilledSlots(leagueId, pickingUserId);

  if (filledSlots.length >= TEAMS_PER_ROSTER) {
    throw new Error(`User has already drafted ${TEAMS_PER_ROSTER} teams`);
  }

  if (filledSlots.includes(team.slot)) {
    throw new Error(`${SLOT_LABELS[team.slot]} slot is already filled`);
  }

  const round = getRoundNumber(currentPick, memberCount);
  const totalPicks = memberCount * TEAMS_PER_ROSTER;
  const nextPick = currentPick + 1;
  const draftComplete = nextPick > totalPicks;
  const now = new Date();
  const nextDeadline = draftComplete
    ? null
    : new Date(now.getTime() + league.pickDeadlineSeconds * 1000);

  // Pick, roster row, queue cleanup, and league advance — atomically.
  // The DB uniques (DraftPick leagueId+teamId, RosterSlot partial indexes)
  // are the backstop against concurrent picks of the same team.
  const draftPick = await prisma.$transaction(async (tx) => {
    const pick = await tx.draftPick.create({
      data: {
        leagueId,
        userId: pickingUserId,
        teamId,
        pickNumber: currentPick,
        round,
        wasAutoPick: isAutoPick,
      },
      include: { team: true, user: true },
    });

    await tx.rosterSlot.create({
      data: {
        leagueId,
        userId: pickingUserId,
        slot: team.slot,
        teamId,
        fromWeek: 1,
      },
    });

    await tx.draftQueue.deleteMany({
      where: { leagueId, userId: pickingUserId, teamId },
    });

    await tx.league.update({
      where: { id: leagueId },
      data: draftComplete
        ? {
            draftComplete: true,
            draftStatus: DraftStatus.COMPLETE,
            currentPickNumber: nextPick,
            currentPickDeadline: null,
          }
        : {
            currentPickNumber: nextPick,
            currentPickDeadline: nextDeadline,
          },
    });

    return pick;
  });

  // Next user on the clock
  let nextOnClock: { userId: number; userName: string } | null = null;
  if (!draftComplete) {
    const nextUserIndex = getSnakeDraftUserIndex(nextPick, memberCount);
    const nextUser = orderedMembers[nextUserIndex];
    if (nextUser) {
      const user = await prisma.user.findUnique({ where: { id: nextUser.userId } });
      nextOnClock = user ? { userId: nextUser.userId, userName: user.name } : null;
    }
  }

  const totalTeams = await prisma.team.count({
    where: { slot: { not: ConferenceSlot.NONE } },
  });
  const availableCount = totalTeams - currentPick;

  return {
    pick: {
      pickNumber: draftPick.pickNumber,
      round: draftPick.round,
      userId: draftPick.userId,
      userName: draftPick.user.name,
      teamId: draftPick.teamId,
      teamName: draftPick.team.name,
      teamSlot: draftPick.team.slot,
      wasAutoPick: draftPick.wasAutoPick,
    },
    isComplete: draftComplete,
    nextOnClock,
    availableCount,
    currentPickDeadline: nextDeadline,
    nextPickNumber: draftComplete ? null : nextPick,
  };
}

/**
 * Process autopick when time expires.
 * Prefers the user's queue (first queued team that is available and fills an
 * open slot); falls back to the best available AP-ranked team in an open
 * slot, then random.
 */
export async function processAutoPick(leagueId: number) {
  const state = await getDraftState(leagueId);

  if (!state.draftStarted || state.draftComplete) {
    return null;
  }

  if (!state.onTheClockUserId) {
    return null;
  }

  if (state.pickDeadline && new Date() < state.pickDeadline) {
    return null; // Not yet expired
  }

  const userId = state.onTheClockUserId;

  const draftedTeamIds = state.picks.map((p) => p.teamId);
  const member = state.members.find((m) => m.userId === userId);
  const filledSlots = member?.filledSlots || [];
  const openSlots = DRAFT_SLOTS.filter((s) => !filledSlots.includes(s));

  // First choice: user's queue
  const queue = await prisma.draftQueue.findMany({
    where: { leagueId, userId },
    orderBy: { priority: 'asc' },
    include: { team: true },
  });

  let teamToPick: { id: number; name: string } | null = null;

  for (const item of queue) {
    if (
      !draftedTeamIds.includes(item.teamId) &&
      openSlots.includes(item.team.slot)
    ) {
      teamToPick = { id: item.teamId, name: item.team.name };
      break;
    }
  }

  // Fallback: best available by AP rank among open slots, else random
  if (!teamToPick) {
    const availableTeams = await prisma.team.findMany({
      where: {
        id: { notIn: draftedTeamIds },
        slot: { in: openSlots },
      },
    });

    if (availableTeams.length > 0) {
      let rankings: Map<string, number> | null = null;
      try {
        rankings = await getRankingsMap();
      } catch {
        rankings = null;
      }

      let best = null as (typeof availableTeams)[number] | null;
      let bestRank = Infinity;
      if (rankings) {
        for (const t of availableTeams) {
          const rank = t.espnTeamId ? rankings.get(t.espnTeamId) : undefined;
          if (rank !== undefined && rank < bestRank) {
            best = t;
            bestRank = rank;
          }
        }
      }

      const chosen =
        best || availableTeams[Math.floor(Math.random() * availableTeams.length)];
      teamToPick = { id: chosen.id, name: chosen.name };
    }
  }

  if (!teamToPick) {
    throw new Error('No teams available for autopick');
  }

  return makePick(leagueId, userId, teamToPick.id, true);
}

/**
 * Get user's draft queue
 */
export async function getDraftQueue(leagueId: number, userId: number) {
  return prisma.draftQueue.findMany({
    where: { leagueId, userId },
    include: { team: true },
    orderBy: { priority: 'asc' },
  });
}

/**
 * Set user's draft queue
 */
export async function setDraftQueue(
  leagueId: number,
  userId: number,
  teamIds: number[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.draftQueue.deleteMany({
      where: { leagueId, userId },
    });

    if (teamIds.length > 0) {
      await tx.draftQueue.createMany({
        data: teamIds.map((teamId, index) => ({
          leagueId,
          userId,
          teamId,
          priority: index + 1,
        })),
      });
    }
  });

  return getDraftQueue(leagueId, userId);
}

/**
 * Add team to queue
 */
export async function addToQueue(
  leagueId: number,
  userId: number,
  teamId: number
) {
  const maxItem = await prisma.draftQueue.findFirst({
    where: { leagueId, userId },
    orderBy: { priority: 'desc' },
  });

  const priority = (maxItem?.priority || 0) + 1;

  return prisma.draftQueue.create({
    data: { leagueId, userId, teamId, priority },
    include: { team: true },
  });
}

/**
 * Remove team from queue
 */
export async function removeFromQueue(
  leagueId: number,
  userId: number,
  teamId: number
) {
  return prisma.draftQueue.deleteMany({
    where: { leagueId, userId, teamId },
  });
}
