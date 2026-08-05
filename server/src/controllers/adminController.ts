import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { GameStatus } from '@prisma/client';
import {
  syncWeek,
  syncWeekGames,
  syncOdds,
  finalizeGames,
  calculateLeagueScores,
  syncAllLeagues,
} from '../services/syncService';
import {
  syncSeasonCalendar,
  getCurrentSeasonYear,
  getCurrentWeek,
} from '../services/seasonService';
import { wasUpset } from '../services/teamMatcher';
import { getGamesForWeek } from '../services/espnClient';
import { getNCAAFSpreads, isOddsApiConfigured } from '../services/oddsClient';

/**
 * One-call scheduled sync — the single endpoint GitHub Actions hits.
 * Resolves the current week from the ESPN-derived calendar, then runs the
 * full idempotent pipeline (games → odds → finalize → rescore) for every
 * completed league.
 * POST /api/admin/sync-current?seasonYear=2026
 */
export async function syncCurrentEndpoint(req: AuthRequest, res: Response) {
  const seasonYear = req.query.seasonYear
    ? parseInt(req.query.seasonYear as string)
    : getCurrentSeasonYear();

  const weekNumber = await getCurrentWeek(seasonYear);

  console.log(`[Admin] sync-current: season ${seasonYear}, week ${weekNumber}`);

  const { leagueResults } = await syncAllLeagues(seasonYear, weekNumber);

  res.json({
    success: true,
    seasonYear,
    weekNumber,
    leaguesScored: Object.keys(leagueResults).length,
  });
}

/**
 * Refresh the SeasonWeek calendar from ESPN (also happens lazily on first use)
 * POST /api/admin/sync-calendar/:seasonYear
 */
export async function syncCalendarEndpoint(req: AuthRequest, res: Response) {
  const seasonYear = parseInt(req.params.seasonYear);

  if (isNaN(seasonYear)) {
    throw new AppError('Invalid season year', 400);
  }

  const weeks = await syncSeasonCalendar(seasonYear);
  const currentWeek = await getCurrentWeek(seasonYear);

  res.json({ success: true, seasonYear, weeksSynced: weeks, currentWeek });
}

/**
 * Commissioner-assisted password reset (v1 — self-serve email reset is
 * post-launch). Sets a temporary password the user should change by ear.
 * POST /api/admin/reset-password
 * Body: { email, tempPassword }
 */
export async function resetPasswordEndpoint(req: AuthRequest, res: Response) {
  const { email, tempPassword } = req.body;

  if (!email || !tempPassword) {
    throw new AppError('email and tempPassword are required', 400);
  }

  if (typeof tempPassword !== 'string' || tempPassword.length < 8) {
    throw new AppError('tempPassword must be at least 8 characters', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('No user with that email', 404);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10) },
  });

  console.log(`[Admin] Password reset for ${email}`);
  res.json({ success: true, message: `Password reset for ${email}` });
}

/**
 * Sync a week's games, odds, and calculate scores for a league
 * POST /api/admin/sync-week/:leagueId/:weekNumber
 * Query: ?seasonYear=2026 (optional, defaults to league's seasonYear)
 */
export async function syncWeekEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const weekNumber = parseInt(req.params.weekNumber);
  const seasonYear = req.query.seasonYear
    ? parseInt(req.query.seasonYear as string)
    : undefined;

  if (isNaN(leagueId) || isNaN(weekNumber)) {
    throw new AppError('Invalid league ID or week number', 400);
  }

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
}

/**
 * Sync games only (no scores calculation)
 * POST /api/admin/sync-games/:seasonYear/:weekNumber
 */
export async function syncGamesEndpoint(req: AuthRequest, res: Response) {
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
}

/**
 * Sync odds, optionally scoped to a week
 * POST /api/admin/sync-odds?seasonYear=2026&weekNumber=1
 */
export async function syncOddsEndpoint(req: AuthRequest, res: Response) {
  const seasonYear = req.query.seasonYear
    ? parseInt(req.query.seasonYear as string)
    : undefined;
  const weekNumber = req.query.weekNumber
    ? parseInt(req.query.weekNumber as string)
    : undefined;

  const { updated, errors } = await syncOdds(seasonYear, weekNumber);

  res.json({
    success: true,
    oddsUpdated: updated,
    errors,
  });
}

/**
 * Finalize games and detect upsets
 * POST /api/admin/finalize-games/:seasonYear/:weekNumber
 */
export async function finalizeGamesEndpoint(req: AuthRequest, res: Response) {
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
}

/**
 * Commissioner override for a game result — the escape hatch for when ESPN
 * data is wrong or missing. Writes the Game row directly, recomputes the
 * upset flag from the stored spread, and rescores that week for every
 * completed league.
 *
 * POST /api/admin/game-override
 * Body: { espnEventId, homeScore, awayScore, status? } (status defaults FINAL)
 */
export async function gameOverrideEndpoint(req: AuthRequest, res: Response) {
  const { espnEventId, homeScore, awayScore, status } = req.body;

  if (!espnEventId || typeof homeScore !== 'number' || typeof awayScore !== 'number') {
    throw new AppError('espnEventId, homeScore, and awayScore are required', 400);
  }

  const validStatuses: GameStatus[] = [GameStatus.FINAL, GameStatus.POSTPONED, GameStatus.CANCELLED];
  const newStatus: GameStatus = status ?? GameStatus.FINAL;
  if (!validStatuses.includes(newStatus)) {
    throw new AppError('status must be FINAL, POSTPONED, or CANCELLED', 400);
  }

  const game = await prisma.game.findUnique({
    where: { espnEventId },
  });

  if (!game) {
    throw new AppError('Game not found — sync games first', 404);
  }

  // Winner from the overridden score (null on tie/non-final)
  let winnerTeamId: number | null = null;
  if (newStatus === GameStatus.FINAL && homeScore !== awayScore) {
    winnerTeamId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
  }

  const isUpset =
    winnerTeamId !== null
      ? wasUpset(winnerTeamId === game.homeTeamId, game.spread)
      : false;

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: {
      homeScore,
      awayScore,
      status: newStatus,
      winnerTeamId,
      wasUpset: isUpset,
    },
  });

  // Rescore this week for every league that has drafted
  const leagues = await prisma.league.findMany({
    where: { draftComplete: true, seasonYear: game.seasonYear },
  });

  for (const league of leagues) {
    await calculateLeagueScores(league.id, game.weekNumber);
  }

  console.log(
    `[Admin] Game ${espnEventId} overridden (${homeScore}-${awayScore}, ${newStatus}); rescored week ${game.weekNumber} for ${leagues.length} leagues`
  );

  res.json({
    success: true,
    game: {
      espnEventId: updated.espnEventId,
      homeScore: updated.homeScore,
      awayScore: updated.awayScore,
      status: updated.status,
      winnerTeamId: updated.winnerTeamId,
      wasUpset: updated.wasUpset,
    },
    leaguesRescored: leagues.length,
  });
}

/**
 * Get ESPN games for a week (preview without saving)
 * GET /api/admin/espn-games/:seasonYear/:weekNumber
 */
export async function previewEspnGames(req: AuthRequest, res: Response) {
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
}

/**
 * Get current odds (preview without saving)
 * GET /api/admin/current-odds
 */
export async function previewCurrentOdds(req: AuthRequest, res: Response) {
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
}

/**
 * Get games from database for a week
 * GET /api/admin/games/:seasonYear/:weekNumber
 */
export async function getGames(req: AuthRequest, res: Response) {
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
}

/**
 * Sync all leagues for a week (after games are synced)
 * POST /api/admin/sync-all-leagues/:seasonYear/:weekNumber
 */
export async function syncAllLeaguesEndpoint(req: AuthRequest, res: Response) {
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
}
