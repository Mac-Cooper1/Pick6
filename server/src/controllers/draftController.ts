import { Response } from 'express';
import { AuthRequest, DraftPickRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import {
  startDraft,
  getDraftState,
  makePick,
  processAutoPick,
  getDraftQueue,
  setDraftQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  getRoundNumber,
} from '../services/draftService';

/**
 * Get all available teams
 * GET /api/draft/teams
 */
export async function getAllTeams(req: AuthRequest, res: Response) {
  try {
    const teams = await prisma.team.findMany({
      orderBy: [{ conference: 'asc' }, { name: 'asc' }],
    });

    res.json(teams);
  } catch (error) {
    throw error;
  }
}

/**
 * Get all draft picks for a league
 * GET /api/draft/:leagueId/picks
 */
export async function getDraftPicks(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    // Verify user is a member
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId,
        },
      },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    // Get all draft picks
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

    const response = picks.map((pick) => ({
      id: pick.id,
      pickNumber: pick.pickNumber,
      round: pick.round,
      user: {
        id: pick.user.id,
        name: pick.user.name,
      },
      team: {
        id: pick.team.id,
        name: pick.team.name,
        conference: pick.team.conference,
      },
      wasAutoPick: pick.wasAutoPick,
    }));

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * Draft a team (legacy endpoint, kept for backwards compatibility)
 * POST /api/draft/:leagueId/pick
 * Body: { teamId }
 */
export async function draftTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const { teamId }: DraftPickRequest = req.body;

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    if (!teamId) {
      throw new AppError('Team ID is required', 400);
    }

    // Verify user is a member
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId,
        },
      },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    // Use the new draft service
    const result = await makePick(leagueId, userId, teamId);

    res.status(201).json(result);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Get available teams (not yet drafted in league)
 * GET /api/draft/:leagueId/available
 */
export async function getAvailableTeams(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    // Verify user is a member
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId,
        },
      },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    // Get all drafted team IDs in this league
    const draftedPicks = await prisma.draftPick.findMany({
      where: { leagueId },
      select: { teamId: true },
    });

    const draftedTeamIds = draftedPicks.map((pick) => pick.teamId);

    // Get all teams not in the drafted list
    const availableTeams = await prisma.team.findMany({
      where: {
        id: {
          notIn: draftedTeamIds,
        },
      },
      orderBy: [{ conference: 'asc' }, { name: 'asc' }],
    });

    res.json(availableTeams);
  } catch (error) {
    throw error;
  }
}

// ============= New Enhanced Draft Endpoints =============

/**
 * Start the draft for a league
 * POST /api/draft/:leagueId/start
 */
export async function startDraftEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    // Verify user is a member (ideally should be league creator/admin)
    const member = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    const result = await startDraft(leagueId);
    res.json(result);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Get current draft state
 * GET /api/draft/:leagueId/state
 */
export async function getDraftStateEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    // Verify user is a member
    const member = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    const state = await getDraftState(leagueId);
    res.json(state);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Trigger autopick (for admin/scheduled job)
 * POST /api/draft/:leagueId/autopick
 */
export async function triggerAutopick(req: AuthRequest, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    const result = await processAutoPick(leagueId);

    if (!result) {
      res.json({ message: 'No autopick needed', executed: false });
    } else {
      res.json({ ...result, executed: true });
    }
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Get user's draft queue
 * GET /api/draft/:leagueId/queue
 */
export async function getQueueEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    const queue = await getDraftQueue(leagueId, userId);

    res.json(
      queue.map((q) => ({
        teamId: q.teamId,
        teamName: q.team.name,
        conference: q.team.conference,
        priority: q.priority,
      }))
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Set user's draft queue
 * PUT /api/draft/:leagueId/queue
 * Body: { teamIds: number[] }
 */
export async function setQueueEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const { teamIds } = req.body;

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    if (!Array.isArray(teamIds)) {
      throw new AppError('teamIds must be an array', 400);
    }

    const queue = await setDraftQueue(leagueId, userId, teamIds);

    res.json(
      queue.map((q) => ({
        teamId: q.teamId,
        teamName: q.team.name,
        conference: q.team.conference,
        priority: q.priority,
      }))
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Add team to queue
 * POST /api/draft/:leagueId/queue/:teamId
 */
export async function addToQueueEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const teamId = parseInt(req.params.teamId);

    if (isNaN(leagueId) || isNaN(teamId)) {
      throw new AppError('Invalid league ID or team ID', 400);
    }

    const item = await addToQueue(leagueId, userId, teamId);

    res.json({
      teamId: item.teamId,
      teamName: item.team.name,
      priority: item.priority,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Remove team from queue
 * DELETE /api/draft/:leagueId/queue/:teamId
 */
export async function removeFromQueueEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const teamId = parseInt(req.params.teamId);

    if (isNaN(leagueId) || isNaN(teamId)) {
      throw new AppError('Invalid league ID or team ID', 400);
    }

    await removeFromQueue(leagueId, userId, teamId);

    res.json({ success: true });
  } catch (error) {
    throw error;
  }
}
