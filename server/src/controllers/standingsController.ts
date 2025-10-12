import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

/**
 * Get weekly standings for a specific week
 * GET /api/standings/:leagueId/week/:weekNumber
 */
export async function getWeeklyStandings(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(leagueId) || isNaN(weekNumber)) {
      throw new AppError('Invalid league ID or week number', 400);
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

    // Get all weekly scores for this week
    const weeklyScores = await prisma.weeklyScore.findMany({
      where: {
        leagueId,
        weekNumber,
      },
      include: {
        user: true,
      },
      orderBy: {
        points: 'desc',
      },
    });

    // If no scores exist yet, return all members with 0 points
    if (weeklyScores.length === 0) {
      const members = await prisma.leagueMember.findMany({
        where: { leagueId },
        include: {
          user: true,
        },
      });

      const standings = members.map((m, index) => ({
        rank: index + 1,
        user: {
          id: m.user.id,
          name: m.user.name,
        },
        points: 0,
      }));

      return res.json(standings);
    }

    const standings = weeklyScores.map((score, index) => ({
      rank: index + 1,
      user: {
        id: score.user.id,
        name: score.user.name,
      },
      points: score.points,
    }));

    res.json(standings);
  } catch (error) {
    throw error;
  }
}

/**
 * Get overall season standings
 * GET /api/standings/:leagueId/overall
 */
export async function getOverallStandings(req: AuthRequest, res: Response) {
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

    // Get all members
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      include: {
        user: {
          include: {
            weeklyScores: {
              where: { leagueId },
            },
          },
        },
      },
    });

    // Calculate total points for each user
    const standings = members.map((m) => {
      const totalPoints = m.user.weeklyScores.reduce(
        (sum, score) => sum + score.points,
        0
      );

      return {
        user: {
          id: m.user.id,
          name: m.user.name,
        },
        points: totalPoints,
      };
    });

    // Sort by points descending
    standings.sort((a, b) => b.points - a.points);

    // Add rank
    const rankedStandings = standings.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

    res.json(rankedStandings);
  } catch (error) {
    throw error;
  }
}
