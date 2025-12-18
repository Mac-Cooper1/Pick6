/**
 * Draft Service
 *
 * Handles advanced draft logic including:
 * - Snake draft order
 * - Scheduled draft start
 * - Timed picks with deadlines
 * - Draft queue management
 * - Autopick when user times out
 */

import prisma from '../lib/prisma';
import { AcquisitionType, DraftStatus } from '@prisma/client';

const TEAMS_PER_ROSTER = 6;

/**
 * Check if a scheduled draft should start
 */
export async function checkScheduledDraft(leagueId: number): Promise<boolean> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) return false;

  // If draft is scheduled and the time has arrived
  if (
    league.draftStatus === DraftStatus.SCHEDULED &&
    league.draftScheduledAt &&
    new Date() >= league.draftScheduledAt &&
    !league.draftStarted
  ) {
    // Auto-start the draft
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
    // Odd round: forward order (1, 2, 3, ... N)
    return positionInRound - 1;
  } else {
    // Even round: reverse order (N, N-1, ... 1)
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

  // Randomly assign draft positions
  const shuffledMembers = [...league.members].sort(() => Math.random() - 0.5);

  // Update members with draft positions
  for (let i = 0; i < shuffledMembers.length; i++) {
    await prisma.leagueMember.update({
      where: { id: shuffledMembers[i].id },
      data: { draftPosition: i + 1 },
    });
  }

  // Calculate first pick deadline
  const now = new Date();
  const deadline = new Date(now.getTime() + league.pickDeadlineSeconds * 1000);

  // Start the draft
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
    memberOrder: shuffledMembers.map((m, i) => ({
      userId: m.userId,
      draftPosition: i + 1,
    })),
  };
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

  // Get user on the clock
  let onTheClockUserId: number | null = null;
  if (league.draftStarted && !league.draftComplete && currentPick <= totalPicks) {
    const userIndex = getSnakeDraftUserIndex(currentPick, memberCount);
    const orderedMembers = league.members.filter((m) => m.draftPosition !== null)
      .sort((a, b) => (a.draftPosition || 0) - (b.draftPosition || 0));
    onTheClockUserId = orderedMembers[userIndex]?.userId || null;
  }

  return {
    leagueId,
    draftStarted: league.draftStarted,
    draftComplete: league.draftComplete,
    draftStatus: league.draftStatus,
    draftScheduledAt: league.draftScheduledAt,
    draftType: league.draftType,
    currentPickNumber: currentPick,
    totalPicks,
    currentRound: currentPick > 0 ? getRoundNumber(currentPick, memberCount) : 0,
    onTheClockUserId,
    pickDeadline: league.currentPickDeadline,
    pickDeadlineSeconds: league.pickDeadlineSeconds,
    members: league.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      draftPosition: m.draftPosition,
    })),
    picks: league.draftPicks.map((p) => ({
      pickNumber: p.pickNumber,
      round: p.round,
      userId: p.userId,
      userName: p.user.name,
      teamId: p.teamId,
      teamName: p.team.name,
      wasAutoPick: p.wasAutoPick,
    })),
  };
}

/**
 * Make a draft pick
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

  // Verify team is available
  const existingPick = await prisma.draftPick.findUnique({
    where: { leagueId_teamId: { leagueId, teamId } },
  });

  if (existingPick) {
    throw new Error('Team already drafted');
  }

  // Verify team exists
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new Error('Team not found');
  }

  // Check user hasn't drafted 6 teams already
  const userPickCount = await prisma.draftPick.count({
    where: { leagueId, userId: isAutoPick ? expectedUserId! : userId },
  });

  if (userPickCount >= TEAMS_PER_ROSTER) {
    throw new Error('User has already drafted 6 teams');
  }

  const round = getRoundNumber(currentPick, memberCount);
  const pickingUserId = isAutoPick ? expectedUserId! : userId;

  // Create the pick
  const draftPick = await prisma.draftPick.create({
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

  // Also create RosterTeam entry
  await prisma.rosterTeam.create({
    data: {
      leagueId,
      userId: pickingUserId,
      teamId,
      acquiredVia: AcquisitionType.DRAFT,
    },
  });

  // Remove from user's queue if present
  await prisma.draftQueue.deleteMany({
    where: { leagueId, userId: pickingUserId, teamId },
  });

  const totalPicks = memberCount * TEAMS_PER_ROSTER;
  const nextPick = currentPick + 1;
  const draftComplete = nextPick > totalPicks;

  // Update league state
  if (draftComplete) {
    await prisma.league.update({
      where: { id: leagueId },
      data: {
        draftComplete: true,
        draftStatus: DraftStatus.COMPLETE,
        currentPickNumber: nextPick,
        currentPickDeadline: null,
      },
    });
  } else {
    const now = new Date();
    const deadline = new Date(now.getTime() + league.pickDeadlineSeconds * 1000);

    await prisma.league.update({
      where: { id: leagueId },
      data: {
        currentPickNumber: nextPick,
        currentPickDeadline: deadline,
      },
    });
  }

  // Get next user on clock
  let nextOnClock: { userId: number; userName: string } | null = null;
  if (!draftComplete) {
    const nextUserIndex = getSnakeDraftUserIndex(nextPick, memberCount);
    const nextUser = orderedMembers[nextUserIndex];
    if (nextUser) {
      const user = await prisma.user.findUnique({ where: { id: nextUser.userId } });
      nextOnClock = user ? { userId: nextUser.userId, userName: user.name } : null;
    }
  }

  // Get available team count
  const draftedTeamCount = currentPick; // This pick was just made
  const totalTeams = await prisma.team.count();
  const availableCount = totalTeams - draftedTeamCount;

  // Get current pick deadline for next pick
  const updatedLeague = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { currentPickDeadline: true },
  });

  return {
    pick: {
      pickNumber: draftPick.pickNumber,
      round: draftPick.round,
      userId: draftPick.userId,
      userName: draftPick.user.name,
      teamId: draftPick.teamId,
      teamName: draftPick.team.name,
      wasAutoPick: draftPick.wasAutoPick,
    },
    isComplete: draftComplete,
    nextOnClock,
    availableCount,
    currentPickDeadline: updatedLeague?.currentPickDeadline,
    nextPickNumber: draftComplete ? null : nextPick,
  };
}

/**
 * Process autopick when time expires
 * Returns the best available team from user's queue, or highest ranked available
 */
export async function processAutoPick(leagueId: number) {
  const state = await getDraftState(leagueId);

  if (!state.draftStarted || state.draftComplete) {
    return null;
  }

  if (!state.onTheClockUserId) {
    return null;
  }

  // Check if deadline has passed
  if (state.pickDeadline && new Date() < state.pickDeadline) {
    return null; // Not yet expired
  }

  const userId = state.onTheClockUserId;

  // Get user's queue
  const queue = await prisma.draftQueue.findMany({
    where: { leagueId, userId },
    orderBy: { priority: 'asc' },
    include: { team: true },
  });

  // Get already drafted teams
  const draftedTeamIds = state.picks.map((p) => p.teamId);

  // Find first available team from queue
  let teamToPick: { id: number; name: string } | null = null;

  for (const item of queue) {
    if (!draftedTeamIds.includes(item.teamId)) {
      teamToPick = { id: item.teamId, name: item.team.name };
      break;
    }
  }

  // If no queue or all queued teams taken, pick best available
  if (!teamToPick) {
    const availableTeams = await prisma.team.findMany({
      where: { id: { notIn: draftedTeamIds } },
      orderBy: { name: 'asc' }, // Simple ordering by name; could use ranking
      take: 1,
    });

    if (availableTeams.length > 0) {
      teamToPick = { id: availableTeams[0].id, name: availableTeams[0].name };
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
  // Delete existing queue
  await prisma.draftQueue.deleteMany({
    where: { leagueId, userId },
  });

  // Create new queue entries
  const entries = teamIds.map((teamId, index) => ({
    leagueId,
    userId,
    teamId,
    priority: index + 1,
  }));

  await prisma.draftQueue.createMany({ data: entries });

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
  // Get current max priority
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

/**
 * Reorder queue
 */
export async function reorderQueue(
  leagueId: number,
  userId: number,
  teamIds: number[]
) {
  // Update priorities
  for (let i = 0; i < teamIds.length; i++) {
    await prisma.draftQueue.updateMany({
      where: { leagueId, userId, teamId: teamIds[i] },
      data: { priority: i + 1 },
    });
  }

  return getDraftQueue(leagueId, userId);
}
