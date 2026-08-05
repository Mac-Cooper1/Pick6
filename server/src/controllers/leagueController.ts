import { Response } from 'express';
import { AuthRequest, CreateLeagueRequest, JoinLeagueRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { generateJoinCode, validateJoinCode } from '../utils/joinCode';
import { getCurrentWeek } from '../services/seasonService';
import prisma from '../lib/prisma';
import { MemberRole, DraftStatus } from '@prisma/client';

/**
 * Create a new league
 * POST /api/leagues/create
 * Body: { name, maxPlayers, customJoinCode? }
 */
export async function createLeague(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const { name, maxPlayers, customJoinCode }: CreateLeagueRequest = req.body;

    // Validation
    if (!name || !maxPlayers) {
      throw new AppError('Name and maxPlayers are required', 400);
    }

    if (name.length < 1 || name.length > 50) {
      throw new AppError('League name must be between 1 and 50 characters', 400);
    }

    if (maxPlayers < 8 || maxPlayers > 12) {
      throw new AppError('Max players must be between 8 and 12', 400);
    }

    // Generate or validate join code
    let joinCode: string;
    if (customJoinCode && customJoinCode.trim() !== '') {
      joinCode = customJoinCode.toUpperCase().trim();
      if (!validateJoinCode(joinCode)) {
        throw new AppError('Join code must be 6 alphanumeric characters', 400);
      }

      // Check if code already exists
      const existing = await prisma.league.findUnique({
        where: { joinCode },
      });

      if (existing) {
        throw new AppError('Join code already in use', 409);
      }
    } else {
      // Generate unique join code
      let attempts = 0;
      do {
        joinCode = generateJoinCode();
        const existing = await prisma.league.findUnique({
          where: { joinCode },
        });
        if (!existing) break;
        attempts++;
      } while (attempts < 10);

      if (attempts >= 10) {
        throw new AppError('Could not generate unique join code', 500);
      }
    }

    // Create league with commissioner
    const league = await prisma.league.create({
      data: {
        name,
        joinCode,
        maxPlayers,
        commissionerUserId: userId,
      },
    });

    // Add creator as first member (commissioner)
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId,
        role: MemberRole.COMMISSIONER,
      },
    });

    res.status(201).json({
      id: league.id,
      name: league.name,
      joinCode: league.joinCode,
      maxPlayers: league.maxPlayers,
      draftComplete: league.draftComplete,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Join an existing league
 * POST /api/leagues/join
 * Body: { joinCode }
 */
export async function joinLeague(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const { joinCode }: JoinLeagueRequest = req.body;

    if (!joinCode) {
      throw new AppError('Join code is required', 400);
    }

    const normalizedCode = joinCode.toUpperCase();

    // Find league
    const league = await prisma.league.findUnique({
      where: { joinCode: normalizedCode },
      include: {
        members: true,
      },
    });

    if (!league) {
      throw new AppError('League not found', 404);
    }

    // Check if league is full
    if (league.members.length >= league.maxPlayers) {
      throw new AppError('League is full', 400);
    }

    // Check if user is already a member
    const existingMember = league.members.find((m) => m.userId === userId);
    if (existingMember) {
      // Return league info if already a member
      return res.json({
        id: league.id,
        name: league.name,
        joinCode: league.joinCode,
        maxPlayers: league.maxPlayers,
        draftComplete: league.draftComplete,
        message: 'Already a member of this league',
      });
    }

    // Add user as member
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId,
      },
    });

    res.json({
      id: league.id,
      name: league.name,
      joinCode: league.joinCode,
      maxPlayers: league.maxPlayers,
      draftComplete: league.draftComplete,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get league details
 * GET /api/leagues/:leagueId
 */
export async function getLeague(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!league) {
      throw new AppError('League not found', 404);
    }

    // Check if user is a member
    const isMember = league.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new AppError('Not a member of this league', 403);
    }

    res.json({
      id: league.id,
      name: league.name,
      joinCode: league.joinCode,
      maxPlayers: league.maxPlayers,
      draftComplete: league.draftComplete,
      memberCount: league.members.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all league members with their teams
 * GET /api/leagues/:leagueId/members
 */
export async function getLeagueMembers(req: AuthRequest, res: Response, next: any) {
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

    // Get all members with their drafted teams
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      include: {
        user: {
          include: {
            draftPicks: {
              where: { leagueId },
              include: {
                team: true,
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    const response = members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt,
      teams: m.user.draftPicks.map((pick) => ({
        id: pick.team.id,
        name: pick.team.name,
        conference: pick.team.conference,
        slot: pick.team.slot,
        pickNumber: pick.pickNumber,
        round: pick.round,
      })),
    }));

    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * Get all leagues for the current user
 * GET /api/leagues/my
 */
export async function getMyLeagues(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;

    // Get all leagues the user is a member of
    const memberships = await prisma.leagueMember.findMany({
      where: { userId },
      include: {
        league: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
            weeklyScores: {
              where: { userId },
              orderBy: { weekNumber: 'desc' },
            },
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    // Derived current week per season (one lookup per distinct season year)
    const seasonYears = [...new Set(memberships.map((m) => m.league.seasonYear))];
    const weekBySeason = new Map<number, number>();
    for (const year of seasonYears) {
      weekBySeason.set(year, await getCurrentWeek(year));
    }

    const leagues = await Promise.all(
      memberships.map(async (membership) => {
        const league = membership.league;

        // Calculate user's record (wins/losses based on weekly standings)
        const totalPoints = league.weeklyScores.reduce((sum, score) => sum + score.points, 0);

        // Get user's rank in the league
        const allScores = await prisma.weeklyScore.groupBy({
          by: ['userId'],
          where: { leagueId: league.id },
          _sum: { points: true },
          orderBy: { _sum: { points: 'desc' } },
        });

        const userRank = allScores.findIndex((s) => s.userId === userId) + 1;

        return {
          id: league.id,
          name: league.name,
          joinCode: league.joinCode,
          memberCount: league.members.length,
          maxPlayers: league.maxPlayers,
          seasonYear: league.seasonYear,
          currentWeek: weekBySeason.get(league.seasonYear) ?? 1,
          draftStatus: league.draftStatus,
          draftScheduledAt: league.draftScheduledAt,
          draftComplete: league.draftComplete,
          isCommissioner: membership.role === MemberRole.COMMISSIONER,
          userStats: {
            totalPoints,
            rank: userRank || null,
            totalMembers: allScores.length,
          },
          members: league.members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            role: m.role,
          })),
        };
      })
    );

    res.json(leagues);
  } catch (error) {
    next(error);
  }
}

/**
 * Update league settings (commissioner only)
 * PATCH /api/leagues/:leagueId/settings
 */
export async function updateLeagueSettings(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;
    const leagueId = parseInt(req.params.leagueId);
    const { draftScheduledAt, pickDeadlineSeconds } = req.body;

    if (isNaN(leagueId)) {
      throw new AppError('Invalid league ID', 400);
    }

    // Check if user is commissioner
    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });

    if (!membership || membership.role !== MemberRole.COMMISSIONER) {
      throw new AppError('Only the commissioner can update league settings', 403);
    }

    // Get current league state
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (!league) {
      throw new AppError('League not found', 404);
    }

    if (league.draftStarted) {
      throw new AppError('Cannot modify draft settings after draft has started', 400);
    }

    // Build update data
    const updateData: any = {};

    if (draftScheduledAt !== undefined) {
      if (draftScheduledAt === null) {
        updateData.draftScheduledAt = null;
        updateData.draftStatus = DraftStatus.NOT_STARTED;
      } else {
        const scheduledDate = new Date(draftScheduledAt);
        if (scheduledDate <= new Date()) {
          throw new AppError('Draft must be scheduled in the future', 400);
        }
        updateData.draftScheduledAt = scheduledDate;
        updateData.draftStatus = DraftStatus.SCHEDULED;
      }
    }

    if (pickDeadlineSeconds !== undefined) {
      if (pickDeadlineSeconds < 30 || pickDeadlineSeconds > 300) {
        throw new AppError('Pick deadline must be between 30 and 300 seconds', 400);
      }
      updateData.pickDeadlineSeconds = pickDeadlineSeconds;
    }

    const updatedLeague = await prisma.league.update({
      where: { id: leagueId },
      data: updateData,
    });

    res.json({
      id: updatedLeague.id,
      name: updatedLeague.name,
      draftScheduledAt: updatedLeague.draftScheduledAt,
      draftStatus: updatedLeague.draftStatus,
      pickDeadlineSeconds: updatedLeague.pickDeadlineSeconds,
    });
  } catch (error) {
    next(error);
  }
}
