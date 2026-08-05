import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { MemberRole, ConferenceSlot } from '@prisma/client';
import {
  startDraft,
  getDraftState,
  getDraftQueue,
  setDraftQueue,
  addToQueue,
  removeFromQueue,
} from '../services/draftService';

/**
 * Assert the requesting user is a member of the league; returns the membership.
 */
async function requireMembership(leagueId: number, userId: number) {
  if (isNaN(leagueId)) {
    throw new AppError('Invalid league ID', 400);
  }

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member) {
    throw new AppError('Not a member of this league', 403);
  }

  return member;
}

/**
 * Get all draft picks for a league (Draft Recap source)
 * GET /api/draft/:leagueId/picks
 */
export async function getDraftPicks(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    include: {
      user: true,
      team: true,
    },
    orderBy: {
      pickNumber: 'asc',
    },
  });

  res.json(
    picks.map((pick) => ({
      id: pick.id,
      pickNumber: pick.pickNumber,
      round: pick.round,
      wasAutoPick: pick.wasAutoPick,
      user: {
        id: pick.user.id,
        name: pick.user.name,
      },
      team: {
        id: pick.team.id,
        name: pick.team.name,
        conference: pick.team.conference,
        slot: pick.team.slot,
        abbreviation: pick.team.abbreviation,
      },
    }))
  );
}

/**
 * Get available teams (in the draft pool, not yet drafted in this league)
 * GET /api/draft/:leagueId/available
 */
export async function getAvailableTeams(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const draftedPicks = await prisma.draftPick.findMany({
    where: { leagueId },
    select: { teamId: true },
  });

  const availableTeams = await prisma.team.findMany({
    where: {
      id: { notIn: draftedPicks.map((pick) => pick.teamId) },
      slot: { not: ConferenceSlot.NONE },
    },
    orderBy: [{ slot: 'asc' }, { name: 'asc' }],
  });

  res.json(availableTeams);
}

/**
 * Start the draft (commissioner only)
 * POST /api/draft/:leagueId/start
 */
export async function startDraftEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const member = await requireMembership(leagueId, req.userId!);

  if (member.role !== MemberRole.COMMISSIONER) {
    throw new AppError('Only the commissioner can start the draft', 403);
  }

  try {
    const result = await startDraft(leagueId);
    res.json(result);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to start draft', 400);
  }
}

/**
 * Get current draft state
 * GET /api/draft/:leagueId/state
 */
export async function getDraftStateEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const state = await getDraftState(leagueId);
  res.json(state);
}

/**
 * Get user's draft queue
 * GET /api/draft/:leagueId/queue
 */
export async function getQueueEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = req.userId!;
  await requireMembership(leagueId, userId);

  const queue = await getDraftQueue(leagueId, userId);

  res.json(
    queue.map((q) => ({
      teamId: q.teamId,
      teamName: q.team.name,
      conference: q.team.conference,
      slot: q.team.slot,
      priority: q.priority,
    }))
  );
}

/**
 * Set user's draft queue
 * PUT /api/draft/:leagueId/queue
 * Body: { teamIds: number[] }
 */
export async function setQueueEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = req.userId!;
  const { teamIds } = req.body;

  await requireMembership(leagueId, userId);

  if (!Array.isArray(teamIds)) {
    throw new AppError('teamIds must be an array', 400);
  }

  const queue = await setDraftQueue(leagueId, userId, teamIds);

  res.json(
    queue.map((q) => ({
      teamId: q.teamId,
      teamName: q.team.name,
      conference: q.team.conference,
      slot: q.team.slot,
      priority: q.priority,
    }))
  );
}

/**
 * Add team to queue
 * POST /api/draft/:leagueId/queue/:teamId
 */
export async function addToQueueEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const teamId = parseInt(req.params.teamId);
  const userId = req.userId!;

  await requireMembership(leagueId, userId);

  if (isNaN(teamId)) {
    throw new AppError('Invalid team ID', 400);
  }

  const item = await addToQueue(leagueId, userId, teamId);

  res.json({
    teamId: item.teamId,
    teamName: item.team.name,
    slot: item.team.slot,
    priority: item.priority,
  });
}

/**
 * Remove team from queue
 * DELETE /api/draft/:leagueId/queue/:teamId
 */
export async function removeFromQueueEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const teamId = parseInt(req.params.teamId);
  const userId = req.userId!;

  await requireMembership(leagueId, userId);

  if (isNaN(teamId)) {
    throw new AppError('Invalid team ID', 400);
  }

  await removeFromQueue(leagueId, userId, teamId);

  res.json({ success: true });
}
