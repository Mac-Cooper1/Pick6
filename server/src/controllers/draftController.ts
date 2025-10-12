import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, DraftPickRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getRoundNumber } from '../utils/draft';

const prisma = new PrismaClient();

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
    }));

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * Draft a team
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

    // Check if team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    // Check if team is already drafted in this league
    const existingPick = await prisma.draftPick.findUnique({
      where: {
        leagueId_teamId: {
          leagueId,
          teamId,
        },
      },
    });

    if (existingPick) {
      throw new AppError('Team already drafted', 400);
    }

    // Check if user has already drafted 6 teams
    const userPicks = await prisma.draftPick.count({
      where: {
        leagueId,
        userId,
      },
    });

    if (userPicks >= 6) {
      throw new AppError('You have already drafted 6 teams', 400);
    }

    // Get league members count
    const memberCount = await prisma.leagueMember.count({
      where: { leagueId },
    });

    // Calculate pick number
    const currentPicks = await prisma.draftPick.count({
      where: { leagueId },
    });
    const pickNumber = currentPicks + 1;

    // Calculate round
    const round = getRoundNumber(pickNumber, memberCount);

    // Create draft pick
    const draftPick = await prisma.draftPick.create({
      data: {
        leagueId,
        userId,
        teamId,
        pickNumber,
        round,
      },
      include: {
        team: true,
        user: true,
      },
    });

    // Check if draft is complete (all members have 6 teams)
    const totalPicks = await prisma.draftPick.count({
      where: { leagueId },
    });

    if (totalPicks === memberCount * 6) {
      await prisma.league.update({
        where: { id: leagueId },
        data: { draftComplete: true },
      });
    }

    res.status(201).json({
      id: draftPick.id,
      pickNumber: draftPick.pickNumber,
      round: draftPick.round,
      user: {
        id: draftPick.user.id,
        name: draftPick.user.name,
      },
      team: {
        id: draftPick.team.id,
        name: draftPick.team.name,
        conference: draftPick.team.conference,
      },
    });
  } catch (error) {
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
