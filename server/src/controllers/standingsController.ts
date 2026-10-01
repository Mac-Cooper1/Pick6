import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { getCurrentWeek } from '../services/seasonService';
import { SLOT_LABELS } from '../services/draftService';
import { getStandings } from '../services/standingsService';
import {
  gamesForTeamWeek,
  loadScoringWeekMap,
  pointsForTeam,
} from '../services/scoringWeekService';

interface WeekDetailTeam {
  slot: string;
  slotLabel: string;
  teamId: number;
  teamName: string;
  fromWeek: number; // > 1 = added in the week-6 swap
  espnEventId: string | null; // null on a bye (the team card opens on this game)
  opponent: string | null;
  result: 'W' | 'L' | 'pending' | 'none';
  scoreLine: string | null;
  points: number;
  wasUpset: boolean;
  teamSpread: number | null;
  gameStatus: string | null;
  // ESPN week the game was played in; null on a bye, and it differs from
  // the requested week when a double-game rolled forward
  playedWeek: number | null;
}

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

  const [weeks, scores, standings, currentWeek] = await Promise.all([
    prisma.seasonWeek.findMany({
      where: { seasonYear: league.seasonYear },
      orderBy: { weekNumber: 'asc' },
      select: { weekNumber: true, label: true, startDate: true, endDate: true },
    }),
    prisma.weeklyScore.findMany({ where: { leagueId } }),
    getStandings(leagueId), // points, then the SOS tiebreaker
    getCurrentWeek(league.seasonYear),
  ]);

  const rows = standings.map(({ member: m }) => {
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

  // Every game attributed to this scoring week (a double-game week shows
  // both; a rolled-forward game shows under the week it counts for)
  const scoringWeeks = await loadScoringWeekMap(
    league.seasonYear,
    rosterSlots.map((rs) => rs.teamId)
  );

  const detail = members.map((m) => {
    const slots = rosterSlots
      .filter((rs) => rs.userId === m.userId)
      .sort((a, b) => a.slot.localeCompare(b.slot));

    let weekTotal = 0;
    const teams = slots.flatMap((rs): WeekDetailTeam[] => {
      const base = {
        slot: rs.slot,
        slotLabel: SLOT_LABELS[rs.slot],
        teamId: rs.teamId,
        teamName: rs.team.name,
        fromWeek: rs.fromWeek,
      };
      const games = gamesForTeamWeek(scoringWeeks, rs.teamId, weekNumber);

      if (games.length === 0) {
        return [
          {
            ...base,
            espnEventId: null,
            opponent: null,
            result: 'none' as const,
            scoreLine: null,
            points: 0,
            wasUpset: false,
            teamSpread: null,
            gameStatus: null,
            playedWeek: null,
          },
        ];
      }

      return games.map((game): WeekDetailTeam => {
        const isHome = game.homeTeamId === rs.teamId;
        const opponent = (isHome ? game.awayTeam : game.homeTeam).name;
        const teamSpread =
          game.spread !== null ? (isHome ? game.spread : -game.spread) : null;

        let result: 'W' | 'L' | 'pending' = 'pending';
        let points = 0;
        let scoreLine: string | null = null;

        if (game.status === 'FINAL' && game.winnerTeamId) {
          result = game.winnerTeamId === rs.teamId ? 'W' : 'L';
          points = pointsForTeam(game, rs.teamId);
          const my = isHome ? game.homeScore : game.awayScore;
          const their = isHome ? game.awayScore : game.homeScore;
          scoreLine = `${my}–${their}`;
        }

        weekTotal += points;

        return {
          ...base,
          espnEventId: game.espnEventId,
          opponent,
          result,
          scoreLine,
          points,
          wasUpset: game.wasUpset,
          teamSpread,
          gameStatus: game.status,
          playedWeek: game.weekNumber,
        };
      });
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
}

/**
 * Get overall season standings
 * GET /api/standings/:leagueId/overall
 */
export async function getOverallStandings(req: AuthRequest, res: Response) {
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

  // Points, then the SOS tiebreaker (standingsService)
  const standings = await getStandings(leagueId);

  res.json(
    standings.map((s, index) => ({
      rank: index + 1,
      user: {
        id: s.member.user.id,
        name: s.member.user.name,
      },
      points: s.points,
      sosTotal: s.sosTotal,
    }))
  );
}
