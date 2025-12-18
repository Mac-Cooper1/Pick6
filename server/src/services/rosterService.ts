/**
 * Roster & Waiver Service
 *
 * Handles roster management and waiver wire functionality:
 * - View rosters
 * - Submit waiver claims
 * - Process waivers by priority
 * - Free agent pickups
 */

import prisma from '../lib/prisma';
import { AcquisitionType, WaiverStatus } from '@prisma/client';

/**
 * Get a user's current roster in a league
 */
export async function getUserRoster(leagueId: number, userId: number) {
  // First try RosterTeam (new system)
  let rosterTeams = await prisma.rosterTeam.findMany({
    where: {
      leagueId,
      userId,
      droppedAt: null,
    },
    include: { team: true },
    orderBy: { acquiredAt: 'asc' },
  });

  // Fall back to DraftPicks if no RosterTeam entries
  if (rosterTeams.length === 0) {
    const draftPicks = await prisma.draftPick.findMany({
      where: { leagueId, userId },
      include: { team: true },
      orderBy: { pickNumber: 'asc' },
    });

    return draftPicks.map((p) => ({
      teamId: p.teamId,
      teamName: p.team.name,
      conference: p.team.conference,
      abbreviation: p.team.abbreviation,
      acquiredVia: 'DRAFT' as AcquisitionType,
      acquiredAt: p.pickedAt,
    }));
  }

  return rosterTeams.map((rt) => ({
    teamId: rt.teamId,
    teamName: rt.team.name,
    conference: rt.team.conference,
    abbreviation: rt.team.abbreviation,
    acquiredVia: rt.acquiredVia,
    acquiredAt: rt.acquiredAt,
  }));
}

/**
 * Get all rosters in a league
 */
export async function getAllRosters(leagueId: number) {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: true },
  });

  const rosters = await Promise.all(
    members.map(async (m) => ({
      userId: m.userId,
      userName: m.user.name,
      roster: await getUserRoster(leagueId, m.userId),
    }))
  );

  return rosters;
}

/**
 * Get available teams (not on any roster in the league)
 */
export async function getAvailableTeams(leagueId: number) {
  // Get all rostered team IDs
  const rosteredTeams = await prisma.rosterTeam.findMany({
    where: { leagueId, droppedAt: null },
    select: { teamId: true },
  });

  // Also check draft picks for backwards compatibility
  const draftedTeams = await prisma.draftPick.findMany({
    where: { leagueId },
    select: { teamId: true },
  });

  const takenTeamIds = new Set([
    ...rosteredTeams.map((rt) => rt.teamId),
    ...draftedTeams.map((dp) => dp.teamId),
  ]);

  const allTeams = await prisma.team.findMany({
    orderBy: [{ conference: 'asc' }, { name: 'asc' }],
  });

  return allTeams.filter((t) => !takenTeamIds.has(t.id));
}

/**
 * Get waiver priority for the league (based on inverse standings)
 */
export async function getWaiverPriority(leagueId: number) {
  // Get all members
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: true },
  });

  // Get total scores for each user
  const scores = await prisma.weeklyScore.groupBy({
    by: ['userId'],
    where: { leagueId },
    _sum: { points: true },
  });

  const scoreMap = new Map(scores.map((s) => [s.userId, s._sum.points || 0]));

  // Sort by points ascending (worst record = highest priority = lowest number)
  const sorted = members
    .map((m) => ({
      userId: m.userId,
      userName: m.user.name,
      totalPoints: scoreMap.get(m.userId) || 0,
    }))
    .sort((a, b) => a.totalPoints - b.totalPoints);

  return sorted.map((item, index) => ({
    ...item,
    priority: index + 1,
  }));
}

/**
 * Submit a waiver claim
 */
export async function submitWaiverClaim(
  leagueId: number,
  userId: number,
  addTeamId: number,
  dropTeamId: number
) {
  // Verify user is in league
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member) {
    throw new Error('User is not a member of this league');
  }

  // Verify add team is available
  const available = await getAvailableTeams(leagueId);
  if (!available.some((t) => t.id === addTeamId)) {
    throw new Error('Team is not available');
  }

  // Verify drop team is on user's roster
  const roster = await getUserRoster(leagueId, userId);
  if (!roster.some((r) => r.teamId === dropTeamId)) {
    throw new Error('You do not own this team');
  }

  // Get user's waiver priority
  const priorities = await getWaiverPriority(leagueId);
  const userPriority = priorities.find((p) => p.userId === userId)?.priority || 999;

  // Check for existing pending claim for same add team
  const existingClaim = await prisma.waiverClaim.findFirst({
    where: {
      leagueId,
      userId,
      addTeamId,
      status: WaiverStatus.PENDING,
    },
  });

  if (existingClaim) {
    throw new Error('You already have a pending claim for this team');
  }

  const claim = await prisma.waiverClaim.create({
    data: {
      leagueId,
      userId,
      addTeamId,
      dropTeamId,
      priority: userPriority,
    },
  });

  return claim;
}

/**
 * Cancel a waiver claim
 */
export async function cancelWaiverClaim(claimId: number, userId: number) {
  const claim = await prisma.waiverClaim.findUnique({
    where: { id: claimId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  if (claim.userId !== userId) {
    throw new Error('Not authorized to cancel this claim');
  }

  if (claim.status !== WaiverStatus.PENDING) {
    throw new Error('Can only cancel pending claims');
  }

  return prisma.waiverClaim.update({
    where: { id: claimId },
    data: { status: WaiverStatus.CANCELLED },
  });
}

/**
 * Get user's pending waiver claims
 */
export async function getUserClaims(leagueId: number, userId: number) {
  return prisma.waiverClaim.findMany({
    where: { leagueId, userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Process all pending waivers for a league
 * Claims are processed in priority order (lowest priority number first)
 */
export async function processWaivers(leagueId: number) {
  const results: Array<{
    claimId: number;
    userId: number;
    addTeamId: number;
    dropTeamId: number;
    status: WaiverStatus;
    reason?: string;
  }> = [];

  // Get all pending claims ordered by priority then creation time
  const pendingClaims = await prisma.waiverClaim.findMany({
    where: { leagueId, status: WaiverStatus.PENDING },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  // Track which teams have been claimed this processing
  const claimedTeams = new Set<number>();

  for (const claim of pendingClaims) {
    // Check if team was already claimed by higher priority
    if (claimedTeams.has(claim.addTeamId)) {
      await prisma.waiverClaim.update({
        where: { id: claim.id },
        data: {
          status: WaiverStatus.LOST,
          processedAt: new Date(),
          rejectionReason: 'Team claimed by higher priority',
        },
      });

      results.push({
        claimId: claim.id,
        userId: claim.userId,
        addTeamId: claim.addTeamId,
        dropTeamId: claim.dropTeamId,
        status: WaiverStatus.LOST,
        reason: 'Team claimed by higher priority',
      });

      continue;
    }

    // Verify team is still available
    const available = await getAvailableTeams(leagueId);
    if (!available.some((t) => t.id === claim.addTeamId)) {
      await prisma.waiverClaim.update({
        where: { id: claim.id },
        data: {
          status: WaiverStatus.LOST,
          processedAt: new Date(),
          rejectionReason: 'Team no longer available',
        },
      });

      results.push({
        claimId: claim.id,
        userId: claim.userId,
        addTeamId: claim.addTeamId,
        dropTeamId: claim.dropTeamId,
        status: WaiverStatus.LOST,
        reason: 'Team no longer available',
      });

      continue;
    }

    // Verify drop team still on roster
    const roster = await getUserRoster(leagueId, claim.userId);
    if (!roster.some((r) => r.teamId === claim.dropTeamId)) {
      await prisma.waiverClaim.update({
        where: { id: claim.id },
        data: {
          status: WaiverStatus.LOST,
          processedAt: new Date(),
          rejectionReason: 'Drop team no longer on roster',
        },
      });

      results.push({
        claimId: claim.id,
        userId: claim.userId,
        addTeamId: claim.addTeamId,
        dropTeamId: claim.dropTeamId,
        status: WaiverStatus.LOST,
        reason: 'Drop team no longer on roster',
      });

      continue;
    }

    // Process the claim - drop old team
    await prisma.rosterTeam.updateMany({
      where: {
        leagueId,
        userId: claim.userId,
        teamId: claim.dropTeamId,
        droppedAt: null,
      },
      data: { droppedAt: new Date() },
    });

    // Add new team
    await prisma.rosterTeam.create({
      data: {
        leagueId,
        userId: claim.userId,
        teamId: claim.addTeamId,
        acquiredVia: AcquisitionType.WAIVER,
      },
    });

    // Mark claim as won
    await prisma.waiverClaim.update({
      where: { id: claim.id },
      data: {
        status: WaiverStatus.WON,
        processedAt: new Date(),
      },
    });

    claimedTeams.add(claim.addTeamId);

    results.push({
      claimId: claim.id,
      userId: claim.userId,
      addTeamId: claim.addTeamId,
      dropTeamId: claim.dropTeamId,
      status: WaiverStatus.WON,
    });
  }

  return results;
}

/**
 * Add a free agent (immediate pickup, no waiver period)
 */
export async function addFreeAgent(
  leagueId: number,
  userId: number,
  addTeamId: number,
  dropTeamId: number
) {
  // Verify team is available
  const available = await getAvailableTeams(leagueId);
  if (!available.some((t) => t.id === addTeamId)) {
    throw new Error('Team is not available');
  }

  // Verify drop team is on roster
  const roster = await getUserRoster(leagueId, userId);
  if (!roster.some((r) => r.teamId === dropTeamId)) {
    throw new Error('You do not own this team');
  }

  // Drop old team
  await prisma.rosterTeam.updateMany({
    where: {
      leagueId,
      userId,
      teamId: dropTeamId,
      droppedAt: null,
    },
    data: { droppedAt: new Date() },
  });

  // Add new team
  const newRoster = await prisma.rosterTeam.create({
    data: {
      leagueId,
      userId,
      teamId: addTeamId,
      acquiredVia: AcquisitionType.FREE_AGENT,
    },
    include: { team: true },
  });

  return {
    addedTeam: {
      id: newRoster.teamId,
      name: newRoster.team.name,
    },
    droppedTeamId: dropTeamId,
  };
}
