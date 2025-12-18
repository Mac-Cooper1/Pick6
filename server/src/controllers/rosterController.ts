import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import {
  getUserRoster,
  getAllRosters,
  getAvailableTeams,
  getWaiverPriority,
  submitWaiverClaim,
  cancelWaiverClaim,
  getUserClaims,
  processWaivers,
  addFreeAgent,
} from '../services/rosterService';
import { getRosterMatchups, getAllRosterMatchups } from '../services/matchupService';

/**
 * Get current user's roster
 * GET /api/rosters/:leagueId/my
 */
export async function getMyRoster(req: AuthRequest, res: Response) {
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

    const roster = await getUserRoster(leagueId, userId);
    res.json(roster);
  } catch (error) {
    throw error;
  }
}

/**
 * Get a specific user's roster
 * GET /api/rosters/:leagueId/user/:userId
 */
export async function getUserRosterEndpoint(req: AuthRequest, res: Response) {
  try {
    const currentUserId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const targetUserId = parseInt(req.params.userId);

    if (isNaN(leagueId) || isNaN(targetUserId)) {
      throw new AppError('Invalid league ID or user ID', 400);
    }

    // Verify current user is a member
    const member = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: currentUserId } },
    });

    if (!member) {
      throw new AppError('Not a member of this league', 403);
    }

    const roster = await getUserRoster(leagueId, targetUserId);
    res.json(roster);
  } catch (error) {
    throw error;
  }
}

/**
 * Get all rosters in a league
 * GET /api/rosters/:leagueId
 */
export async function getAllRostersEndpoint(req: AuthRequest, res: Response) {
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

    const rosters = await getAllRosters(leagueId);
    res.json(rosters);
  } catch (error) {
    throw error;
  }
}

/**
 * Get available teams (free agents)
 * GET /api/rosters/:leagueId/available
 */
export async function getAvailableTeamsEndpoint(req: AuthRequest, res: Response) {
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

    const teams = await getAvailableTeams(leagueId);
    res.json(teams);
  } catch (error) {
    throw error;
  }
}

/**
 * Get waiver priority order
 * GET /api/rosters/:leagueId/waiver-priority
 */
export async function getWaiverPriorityEndpoint(req: AuthRequest, res: Response) {
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

    const priority = await getWaiverPriority(leagueId);
    res.json(priority);
  } catch (error) {
    throw error;
  }
}

/**
 * Submit a waiver claim
 * POST /api/rosters/:leagueId/waivers
 * Body: { addTeamId, dropTeamId }
 */
export async function submitWaiverClaimEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const { addTeamId, dropTeamId } = req.body;

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    if (!addTeamId || !dropTeamId) {
      throw new AppError('addTeamId and dropTeamId are required', 400);
    }

    const claim = await submitWaiverClaim(leagueId, userId, addTeamId, dropTeamId);
    res.status(201).json(claim);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Cancel a waiver claim
 * DELETE /api/rosters/:leagueId/waivers/:claimId
 */
export async function cancelWaiverClaimEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const claimId = parseInt(req.params.claimId);

    if (isNaN(leagueId) || isNaN(claimId)) {
      throw new AppError('Invalid league ID or claim ID', 400);
    }

    const claim = await cancelWaiverClaim(claimId, userId);
    res.json(claim);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Get user's waiver claims
 * GET /api/rosters/:leagueId/waivers/my
 */
export async function getMyWaiverClaims(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    const claims = await getUserClaims(leagueId, userId);
    res.json(claims);
  } catch (error) {
    throw error;
  }
}

/**
 * Process waivers for a league (admin endpoint)
 * POST /api/rosters/:leagueId/waivers/process
 */
export async function processWaiversEndpoint(req: AuthRequest, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    const results = await processWaivers(leagueId);
    res.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Add a free agent (immediate pickup)
 * POST /api/rosters/:leagueId/free-agent
 * Body: { addTeamId, dropTeamId }
 */
export async function addFreeAgentEndpoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const { addTeamId, dropTeamId } = req.body;

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    if (!addTeamId || !dropTeamId) {
      throw new AppError('addTeamId and dropTeamId are required', 400);
    }

    const result = await addFreeAgent(leagueId, userId, addTeamId, dropTeamId);
    res.json(result);
  } catch (error: any) {
    if (error.message) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

/**
 * Get matchups with odds for current user's roster
 * GET /api/rosters/:leagueId/matchups
 */
export async function getMyMatchups(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const weekNumber = req.query.week ? parseInt(req.query.week as string) : undefined;

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

    const matchups = await getRosterMatchups(leagueId, userId, weekNumber);
    res.json(matchups);
  } catch (error) {
    throw error;
  }
}

/**
 * Get matchups with odds for all rosters in a league
 * GET /api/rosters/:leagueId/matchups/all
 */
export async function getAllMatchups(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const weekNumber = req.query.week ? parseInt(req.query.week as string) : undefined;

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

    const allMatchups = await getAllRosterMatchups(leagueId, weekNumber);
    res.json(allMatchups);
  } catch (error) {
    throw error;
  }
}
