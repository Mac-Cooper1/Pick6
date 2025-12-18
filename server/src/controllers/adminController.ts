import { Response } from 'express';
import { AuthRequest, GameResultRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { syncWeek, syncWeekGames, syncOdds, finalizeGames, calculateLeagueScores, syncAllLeagues } from '../services/syncService';
import { getGamesForWeek } from '../services/espnClient';
import { getNCAAFSpreads, isOddsApiConfigured } from '../services/oddsClient';

/**
 * Calculate points for a game result
 * Win = +1, Loss = 0, Upset Win = +2, Upset Loss = -1
 */
function calculatePoints(result: 'win' | 'loss', wasUpset: boolean): number {
  if (result === 'win') {
    return wasUpset ? 2 : 1; // Upset win = 2 points, regular win = 1 point
  } else {
    return wasUpset ? -1 : 0; // Upset loss = -1 point, regular loss = 0 points
  }
}

/**
 * Enter a game result (admin only for MVP)
 * POST /api/admin/game-result
 * Body: { teamId, weekNumber, opponent, result, wasUpset, gameDate }
 */
export async function enterGameResult(req: AuthRequest, res: Response) {
  try {
    const {
      teamId,
      weekNumber,
      opponent,
      result,
      wasUpset,
      gameDate,
    }: GameResultRequest = req.body;

    // Validation
    if (!teamId || !weekNumber || !opponent || !result || !gameDate) {
      throw new AppError(
        'teamId, weekNumber, opponent, result, and gameDate are required',
        400
      );
    }

    if (result !== 'win' && result !== 'loss') {
      throw new AppError('Result must be either "win" or "loss"', 400);
    }

    // Check if team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    // Calculate points
    const points = calculatePoints(result, wasUpset || false);

    // Create or update game result
    const gameResult = await prisma.gameResult.upsert({
      where: {
        teamId_weekNumber: {
          teamId,
          weekNumber,
        },
      },
      update: {
        opponent,
        result,
        wasUpset: wasUpset || false,
        points,
        gameDate: new Date(gameDate),
      },
      create: {
        teamId,
        weekNumber,
        opponent,
        result,
        wasUpset: wasUpset || false,
        points,
        gameDate: new Date(gameDate),
      },
    });

    res.status(201).json({
      id: gameResult.id,
      teamId: gameResult.teamId,
      weekNumber: gameResult.weekNumber,
      opponent: gameResult.opponent,
      result: gameResult.result,
      wasUpset: gameResult.wasUpset,
      points: gameResult.points,
      gameDate: gameResult.gameDate,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Calculate weekly scores for all users in a league
 * POST /api/admin/calculate-scores/:leagueId/:weekNumber
 */
export async function calculateWeeklyScores(req: AuthRequest, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(leagueId) || isNaN(weekNumber)) {
      throw new AppError('Invalid league ID or week number', 400);
    }

    // Get all league members with their drafted teams
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      include: {
        user: {
          include: {
            draftPicks: {
              where: { leagueId },
              include: {
                team: {
                  include: {
                    gameResults: {
                      where: { weekNumber },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const updatedScores = [];

    // Calculate score for each member
    for (const member of members) {
      let totalPoints = 0;

      // Sum up points from all their teams' game results
      for (const pick of member.user.draftPicks) {
        const gameResult = pick.team.gameResults[0]; // Should be only one result per week
        if (gameResult) {
          totalPoints += gameResult.points;
        }
      }

      // Create or update weekly score
      const weeklyScore = await prisma.weeklyScore.upsert({
        where: {
          leagueId_userId_weekNumber: {
            leagueId,
            userId: member.userId,
            weekNumber,
          },
        },
        update: {
          points: totalPoints,
        },
        create: {
          leagueId,
          userId: member.userId,
          weekNumber,
          points: totalPoints,
        },
        include: {
          user: true,
        },
      });

      updatedScores.push({
        userId: weeklyScore.user.id,
        userName: weeklyScore.user.name,
        points: weeklyScore.points,
      });
    }

    res.json({
      leagueId,
      weekNumber,
      scores: updatedScores,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get all game results for a specific week (admin helper)
 * GET /api/admin/game-results/:weekNumber
 */
export async function getGameResults(req: AuthRequest, res: Response) {
  try {
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(weekNumber)) {
      throw new AppError('Invalid week number', 400);
    }

    const gameResults = await prisma.gameResult.findMany({
      where: { weekNumber },
      include: {
        team: true,
      },
      orderBy: {
        gameDate: 'asc',
      },
    });

    const response = gameResults.map((gr) => ({
      id: gr.id,
      team: {
        id: gr.team.id,
        name: gr.team.name,
        conference: gr.team.conference,
      },
      weekNumber: gr.weekNumber,
      opponent: gr.opponent,
      result: gr.result,
      wasUpset: gr.wasUpset,
      points: gr.points,
      gameDate: gr.gameDate,
    }));

    res.json(response);
  } catch (error) {
    throw error;
  }
}

/**
 * Sync a week's games, odds, and calculate scores for a league
 * POST /api/admin/sync-week/:leagueId/:weekNumber
 * Query: ?seasonYear=2024 (optional, defaults to league's seasonYear)
 */
export async function syncWeekEndpoint(req: AuthRequest, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const weekNumber = parseInt(req.params.weekNumber);
    const seasonYear = req.query.seasonYear
      ? parseInt(req.query.seasonYear as string)
      : undefined;

    if (isNaN(leagueId) || isNaN(weekNumber)) {
      throw new AppError('Invalid league ID or week number', 400);
    }

    // Get league to get season year
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (!league) {
      throw new AppError('League not found', 404);
    }

    const year = seasonYear || league.seasonYear;

    console.log(`[Admin] Starting sync for league ${leagueId}, week ${weekNumber}, season ${year}`);

    const result = await syncWeek(leagueId, year, weekNumber);

    res.json({
      success: true,
      leagueId,
      weekNumber,
      seasonYear: year,
      ...result,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Sync games only (no scores calculation)
 * POST /api/admin/sync-games/:seasonYear/:weekNumber
 */
export async function syncGamesEndpoint(req: AuthRequest, res: Response) {
  try {
    const seasonYear = parseInt(req.params.seasonYear);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(seasonYear) || isNaN(weekNumber)) {
      throw new AppError('Invalid season year or week number', 400);
    }

    const { games, errors } = await syncWeekGames(seasonYear, weekNumber);

    res.json({
      success: true,
      seasonYear,
      weekNumber,
      gamesSync: games.length,
      errors,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Sync odds only
 * POST /api/admin/sync-odds
 */
export async function syncOddsEndpoint(req: AuthRequest, res: Response) {
  try {
    const { updated, errors } = await syncOdds();

    res.json({
      success: true,
      oddsUpdated: updated,
      errors,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Finalize games and detect upsets
 * POST /api/admin/finalize-games/:seasonYear/:weekNumber
 */
export async function finalizeGamesEndpoint(req: AuthRequest, res: Response) {
  try {
    const seasonYear = parseInt(req.params.seasonYear);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(seasonYear) || isNaN(weekNumber)) {
      throw new AppError('Invalid season year or week number', 400);
    }

    const { finalized, upsets } = await finalizeGames(seasonYear, weekNumber);

    res.json({
      success: true,
      seasonYear,
      weekNumber,
      gamesFinalized: finalized,
      upsetsDetected: upsets,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get ESPN games for a week (preview without saving)
 * GET /api/admin/espn-games/:seasonYear/:weekNumber
 */
export async function previewEspnGames(req: AuthRequest, res: Response) {
  try {
    const seasonYear = parseInt(req.params.seasonYear);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(seasonYear) || isNaN(weekNumber)) {
      throw new AppError('Invalid season year or week number', 400);
    }

    const games = await getGamesForWeek(seasonYear, weekNumber);

    res.json({
      seasonYear,
      weekNumber,
      gameCount: games.length,
      games: games.map((g) => ({
        espnEventId: g.espnEventId,
        homeTeam: g.homeTeam.displayName,
        awayTeam: g.awayTeam.displayName,
        startTime: g.startTime,
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        isCompleted: g.isCompleted,
      })),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get current odds (preview without saving)
 * GET /api/admin/current-odds
 */
export async function previewCurrentOdds(req: AuthRequest, res: Response) {
  try {
    if (!isOddsApiConfigured()) {
      throw new AppError('ODDS_API_KEY is not configured', 400);
    }

    const odds = await getNCAAFSpreads();

    res.json({
      gameCount: odds.length,
      games: odds.map((o) => ({
        homeTeam: o.homeTeam,
        awayTeam: o.awayTeam,
        commenceTime: o.commenceTime,
        spread: o.spread,
        favoriteTeam: o.favoriteTeam,
        bookmaker: o.bookmaker,
      })),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get games from database for a week
 * GET /api/admin/games/:seasonYear/:weekNumber
 */
export async function getGames(req: AuthRequest, res: Response) {
  try {
    const seasonYear = parseInt(req.params.seasonYear);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(seasonYear) || isNaN(weekNumber)) {
      throw new AppError('Invalid season year or week number', 400);
    }

    const games = await prisma.game.findMany({
      where: {
        seasonYear,
        weekNumber,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        winnerTeam: true,
        favoriteTeam: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    res.json({
      seasonYear,
      weekNumber,
      gameCount: games.length,
      games: games.map((g) => ({
        id: g.id,
        espnEventId: g.espnEventId,
        homeTeam: g.homeTeam.name,
        awayTeam: g.awayTeam.name,
        startTime: g.startTime,
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        winner: g.winnerTeam?.name,
        spread: g.spread,
        favorite: g.favoriteTeam?.name,
        wasUpset: g.wasUpset,
      })),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Sync all leagues for a week (after games are synced)
 * POST /api/admin/sync-all-leagues/:seasonYear/:weekNumber
 */
export async function syncAllLeaguesEndpoint(req: AuthRequest, res: Response) {
  try {
    const seasonYear = parseInt(req.params.seasonYear);
    const weekNumber = parseInt(req.params.weekNumber);

    if (isNaN(seasonYear) || isNaN(weekNumber)) {
      throw new AppError('Invalid season year or week number', 400);
    }

    const { leagueResults } = await syncAllLeagues(seasonYear, weekNumber);

    res.json({
      success: true,
      seasonYear,
      weekNumber,
      leagueResults,
    });
  } catch (error) {
    throw error;
  }
}
