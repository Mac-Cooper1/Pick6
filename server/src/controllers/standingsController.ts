import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { getCurrentWeek } from '../services/seasonService';
import { SLOT_LABELS } from '../services/draftService';

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
 * Season grid: every member × every week in one call (Week by Week tab)
 * GET /api/standings/:leagueId/weeks
 */
export async function getSeasonGrid(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) {
    throw new AppError('League not found', 404);
  }

  const [weeks, scores, members, currentWeek] = await Promise.all([
    prisma.seasonWeek.findMany({
      where: { seasonYear: league.seasonYear },
      orderBy: { weekNumber: 'asc' },
      select: { weekNumber: true, label: true, startDate: true, endDate: true },
    }),
    prisma.weeklyScore.findMany({ where: { leagueId } }),
    prisma.leagueMember.findMany({
      where: { leagueId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    }),
    getCurrentWeek(league.seasonYear),
  ]);

  const rows = members.map((m) => {
    const byWeek: Record<number, number> = {};
    let total = 0;
    for (const score of scores) {
      if (score.userId === m.userId) {
        byWeek[score.weekNumber] = score.points;
        total += score.points;
      }
    }
    return { userId: m.userId, userName: m.user.name, byWeek, total };
  });

  rows.sort((a, b) => b.total - a.total);

  res.json({
    seasonYear: league.seasonYear,
    currentWeek,
    weeks,
    rows: rows.map((r, i) => ({ rank: i + 1, ...r })),
  });
}

/**
 * Per-team results for one week (Week by Week drill-down): each member's
 * effective roster that week with game outcome, points, and upset flag
 * GET /api/standings/:leagueId/week/:weekNumber/detail
 */
export async function getWeekDetail(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const weekNumber = parseInt(req.params.weekNumber);
  await requireMembership(leagueId, req.userId!);

  if (isNaN(weekNumber)) {
    throw new AppError('Invalid week number', 400);
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) {
    throw new AppError('League not found', 404);
  }

  const [members, rosterSlots] = await Promise.all([
    prisma.leagueMember.findMany({
      where: { leagueId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.rosterSlot.findMany({
      where: {
        leagueId,
        fromWeek: { lte: weekNumber },
        OR: [{ toWeek: null }, { toWeek: { gte: weekNumber } }],
      },
      include: { team: true },
    }),
  ]);

  const teamIds = rosterSlots.map((rs) => rs.teamId);
  const games = await prisma.game.findMany({
    where: {
      seasonYear: league.seasonYear,
      weekNumber,
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    include: { homeTeam: true, awayTeam: true },
  });

  const gameByTeam = new Map<number, (typeof games)[number]>();
  for (const game of games) {
    // FINAL games win over duplicates (e.g. postponed placeholder rows)
    for (const tid of [game.homeTeamId, game.awayTeamId]) {
      const existing = gameByTeam.get(tid);
      if (!existing || (existing.status !== 'FINAL' && game.status === 'FINAL')) {
        gameByTeam.set(tid, game);
      }
    }
  }

  const detail = members.map((m) => {
    const slots = rosterSlots
      .filter((rs) => rs.userId === m.userId)
      .sort((a, b) => a.slot.localeCompare(b.slot));

    let weekTotal = 0;
    const teams = slots.map((rs) => {
      const game = gameByTeam.get(rs.teamId);
      let result: 'W' | 'L' | 'pending' | 'none' = 'none';
      let points = 0;
      let opponent: string | null = null;
      let scoreLine: string | null = null;
      let teamSpread: number | null = null;

      if (game) {
        const isHome = game.homeTeamId === rs.teamId;
        opponent = (isHome ? game.awayTeam : game.homeTeam).name;
        teamSpread = game.spread !== null ? (isHome ? game.spread : -game.spread) : null;

        if (game.status === 'FINAL' && game.winnerTeamId) {
          const won = game.winnerTeamId === rs.teamId;
          result = won ? 'W' : 'L';
          points = won ? (game.wasUpset ? 2 : 1) : game.wasUpset ? -1 : 0;
          const my = isHome ? game.homeScore : game.awayScore;
          const their = isHome ? game.awayScore : game.homeScore;
          scoreLine = `${my}–${their}`;
        } else {
          result = 'pending';
        }
      }

      weekTotal += points;

      return {
        slot: rs.slot,
        slotLabel: SLOT_LABELS[rs.slot],
        teamId: rs.teamId,
        teamName: rs.team.name,
        opponent,
        result,
        scoreLine,
        points,
        wasUpset: game?.wasUpset ?? false,
        teamSpread,
        gameStatus: game?.status ?? null,
      };
    });

    return { userId: m.userId, userName: m.user.name, weekTotal, teams };
  });

  detail.sort((a, b) => b.weekTotal - a.weekTotal);

  res.json({ leagueId, weekNumber, members: detail });
}

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
