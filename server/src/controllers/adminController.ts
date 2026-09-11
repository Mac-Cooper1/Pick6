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
  syncAllLeagues,
  syncCurrentWindow,
  rescoreWeekForAllLeagues,
} from '../services/syncService';
import {
  syncSeasonCalendar,
  getCurrentSeasonYear,
  getCurrentWeek,
} from '../services/seasonService';
import { wasUpset } from '../services/teamMatcher';
import { getGamesForWeek, fetchGameLine } from '../services/espnClient';
import { getNCAAFSpreads, isOddsApiConfigured } from '../services/oddsClient';

/**
 * One-call scheduled sync — the single endpoint GitHub Actions hits.
 * Resolves the current week from the ESPN-derived calendar, then runs the
 * idempotent pipeline over a three-week window: previous week (late
 * finals), current week (games → odds → finalize → rescore), next week
 * (schedule only). See syncCurrentWindow.
 * POST /api/admin/sync-current?seasonYear=2026
 */
export async function syncCurrentEndpoint(req: AuthRequest, res: Response) {
  const seasonYear = req.query.seasonYear
    ? parseInt(req.query.seasonYear as string)
    : getCurrentSeasonYear();

  const weekNumber = await getCurrentWeek(seasonYear);

  console.log(`[Admin] sync-current: season ${seasonYear}, week ${weekNumber}`);

  const result = await syncCurrentWindow(seasonYear, weekNumber);

  res.json({
    success: true,
    seasonYear,
    weekNumber,
    ...result,
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

  // Rescore this week AND the next for every league that has drafted: a
  // team's second game in an ESPN week may be attributed to the week after
  const leagues = await rescoreWeekForAllLeagues(game.seasonYear, game.weekNumber);
  await rescoreWeekForAllLeagues(game.seasonYear, game.weekNumber + 1);

  console.log(
    `[Admin] Game ${espnEventId} overridden (${homeScore}-${awayScore}, ${newStatus}); rescored weeks ${game.weekNumber}-${game.weekNumber + 1} for ${leagues.length} leagues`
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
 * Stored spreads vs ESPN's closing line, with optional repair.
 *
 * Why: the odds matcher used to cross-match any two un-aliased teams that
 * kicked off within an hour of each other, so a game could inherit another
 * game's line (week 1: Hawai'i vs UNLV stored -29.5, real line UNLV -2.5).
 * ESPN's game page keeps the DraftKings closing line after the game ends,
 * keyed by event id, so it is a clean reference.
 *
 * A stored line counts as cross-matched when it names a different favorite
 * than ESPN or sits SPREAD_REPAIR_DIVERGENCE or more points away (normal
 * line movement is a point or two; wrong-game lines were off by 7 to 32).
 * Games with no stored line are reported but never filled in: "no line"
 * scoring stays as it was.
 *
 * POST /api/admin/repair-spreads/:seasonYear/:weekNumber        dry run
 * POST /api/admin/repair-spreads/:seasonYear/:weekNumber?apply=true
 *   writes the ESPN line, re-runs upset detection, rescores the week and
 *   the next for every league.
 */
const SPREAD_REPAIR_DIVERGENCE = 5;

export async function repairSpreadsEndpoint(req: AuthRequest, res: Response) {
  const seasonYear = parseInt(req.params.seasonYear);
  const weekNumber = parseInt(req.params.weekNumber);
  const apply = req.query.apply === 'true';

  if (isNaN(seasonYear) || isNaN(weekNumber)) {
    throw new AppError('Invalid season year or week number', 400);
  }

  const games = await prisma.game.findMany({
    where: { seasonYear, weekNumber },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: 'asc' },
  });

  const repaired: Array<Record<string, unknown>> = [];
  const noStoredLine: string[] = [];
  const noEspnLine: string[] = [];
  const errors: string[] = [];
  let unchanged = 0;

  for (const game of games) {
    const label = `${game.awayTeam.name} at ${game.homeTeam.name}`;
    if (game.spread === null) {
      noStoredLine.push(label);
      continue;
    }

    let espn;
    try {
      espn = await fetchGameLine(game.espnEventId);
    } catch (error: any) {
      errors.push(`${label}: ${error.message}`);
      continue;
    }
    if (!espn) {
      noEspnLine.push(label);
      continue;
    }

    const favoriteDiffers = Math.sign(game.spread) !== Math.sign(espn.spread);
    const farApart = Math.abs(game.spread - espn.spread) >= SPREAD_REPAIR_DIVERGENCE;
    if (!favoriteDiffers && !farApart) {
      unchanged++;
      continue;
    }

    const favoriteTeamId =
      espn.spread < 0 ? game.homeTeamId : espn.spread > 0 ? game.awayTeamId : null;

    if (apply) {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          spread: espn.spread,
          favoriteTeamId,
          bookmaker: `${espn.provider} (ESPN closing line)`,
          oddsTimestamp: new Date(),
        },
      });
    }

    repaired.push({
      espnEventId: game.espnEventId,
      game: label,
      kickoff: game.startTime,
      storedSpread: game.spread,
      espnSpread: espn.spread,
      espnLine: espn.details,
      provider: espn.provider,
    });
  }

  let leaguesRescored = 0;
  if (apply && repaired.length > 0) {
    await finalizeGames(seasonYear, weekNumber);
    leaguesRescored = (await rescoreWeekForAllLeagues(seasonYear, weekNumber)).length;
    await rescoreWeekForAllLeagues(seasonYear, weekNumber + 1);
  }

  console.log(
    `[Admin] repair-spreads ${seasonYear} week ${weekNumber} (${apply ? 'APPLIED' : 'dry run'}): ${repaired.length} cross-matched, ${unchanged} fine, ${noEspnLine.length} without an ESPN line`
  );

  res.json({
    success: true,
    seasonYear,
    weekNumber,
    applied: apply,
    checked: games.length,
    unchanged,
    repaired,
    noStoredLine,
    noEspnLine,
    leaguesRescored,
    errors,
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
