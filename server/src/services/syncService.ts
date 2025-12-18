/**
 * Sync Service
 *
 * Handles syncing game data from ESPN and odds from The Odds API,
 * then updates our database and calculates scores.
 */

import prisma from '../lib/prisma';
import { GameStatus } from '@prisma/client';
import { getGamesForWeek, ParsedGame } from './espnClient';
import { getNCAAFSpreads, isOddsApiConfigured, ParsedOdds } from './oddsClient';
import { findTeamByEspnId, matchGameToOdds, wasUpset } from './teamMatcher';

export interface SyncResult {
  gamesCreated: number;
  gamesUpdated: number;
  oddsUpdated: number;
  scoresCalculated: number;
  errors: string[];
}

/**
 * Sync games for a specific week
 */
export async function syncWeekGames(
  seasonYear: number,
  weekNumber: number
): Promise<{ games: ParsedGame[]; errors: string[] }> {
  const errors: string[] = [];

  console.log(`[Sync] Fetching games for ${seasonYear} week ${weekNumber}`);
  const espnGames = await getGamesForWeek(seasonYear, weekNumber);
  console.log(`[Sync] Found ${espnGames.length} games from ESPN`);

  const savedGames: ParsedGame[] = [];

  for (const espnGame of espnGames) {
    try {
      // Find teams in our database
      const homeTeam = await findTeamByEspnId(espnGame.homeTeam.espnId);
      const awayTeam = await findTeamByEspnId(espnGame.awayTeam.espnId);

      if (!homeTeam) {
        errors.push(`Home team not found: ${espnGame.homeTeam.displayName} (ESPN ID: ${espnGame.homeTeam.espnId})`);
        continue;
      }

      if (!awayTeam) {
        errors.push(`Away team not found: ${espnGame.awayTeam.displayName} (ESPN ID: ${espnGame.awayTeam.espnId})`);
        continue;
      }

      // Map ESPN status to our GameStatus enum
      let status: GameStatus = GameStatus.SCHEDULED;
      switch (espnGame.status) {
        case 'in_progress':
          status = GameStatus.IN_PROGRESS;
          break;
        case 'final':
          status = GameStatus.FINAL;
          break;
        case 'postponed':
          status = GameStatus.POSTPONED;
          break;
        case 'cancelled':
          status = GameStatus.CANCELLED;
          break;
      }

      // Determine winner
      let winnerTeamId: number | null = null;
      if (espnGame.winnerId) {
        if (espnGame.winnerId === espnGame.homeTeam.espnId) {
          winnerTeamId = homeTeam.id;
        } else if (espnGame.winnerId === espnGame.awayTeam.espnId) {
          winnerTeamId = awayTeam.id;
        }
      }

      // Upsert game
      await prisma.game.upsert({
        where: { espnEventId: espnGame.espnEventId },
        update: {
          status,
          homeScore: espnGame.homeScore,
          awayScore: espnGame.awayScore,
          winnerTeamId,
        },
        create: {
          espnEventId: espnGame.espnEventId,
          seasonYear,
          weekNumber,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: espnGame.startTime,
          status,
          homeScore: espnGame.homeScore,
          awayScore: espnGame.awayScore,
          winnerTeamId,
          venue: espnGame.venue,
        },
      });

      savedGames.push(espnGame);
    } catch (error: any) {
      errors.push(`Error saving game ${espnGame.espnEventId}: ${error.message}`);
    }
  }

  console.log(`[Sync] Saved ${savedGames.length} games, ${errors.length} errors`);
  return { games: savedGames, errors };
}

/**
 * Sync odds for upcoming games
 */
export async function syncOdds(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];

  if (!isOddsApiConfigured()) {
    console.log('[Sync] Odds API not configured, skipping odds sync');
    return { updated: 0, errors: ['ODDS_API_KEY not configured'] };
  }

  console.log('[Sync] Fetching odds from The Odds API');
  let oddsData: ParsedOdds[] = [];

  try {
    oddsData = await getNCAAFSpreads();
    console.log(`[Sync] Found ${oddsData.length} games with odds`);
  } catch (error: any) {
    errors.push(`Odds API error: ${error.message}`);
    return { updated: 0, errors };
  }

  let updated = 0;

  // Get all scheduled games
  const scheduledGames = await prisma.game.findMany({
    where: {
      status: GameStatus.SCHEDULED,
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  for (const game of scheduledGames) {
    // Convert to ParsedGame format for matching
    const parsedGame: ParsedGame = {
      espnEventId: game.espnEventId,
      seasonYear: game.seasonYear,
      weekNumber: game.weekNumber,
      homeTeam: {
        espnId: game.homeTeam.espnTeamId || '',
        name: game.homeTeam.name,
        abbreviation: game.homeTeam.abbreviation || '',
        displayName: game.homeTeam.name,
      },
      awayTeam: {
        espnId: game.awayTeam.espnTeamId || '',
        name: game.awayTeam.name,
        abbreviation: game.awayTeam.abbreviation || '',
        displayName: game.awayTeam.name,
      },
      startTime: game.startTime,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      venue: game.venue,
      isCompleted: false,
      winnerId: null,
    };

    const matchedOdds = matchGameToOdds(parsedGame, oddsData);

    if (matchedOdds && matchedOdds.spread !== null) {
      const favoriteTeamId =
        matchedOdds.favoriteTeam === 'home' ? game.homeTeamId : game.awayTeamId;

      await prisma.game.update({
        where: { id: game.id },
        data: {
          spread: matchedOdds.spread,
          favoriteTeamId,
          bookmaker: matchedOdds.bookmaker,
          oddsTimestamp: matchedOdds.timestamp,
        },
      });

      updated++;
    }
  }

  console.log(`[Sync] Updated odds for ${updated} games`);
  return { updated, errors };
}

/**
 * Finalize games and determine upsets
 */
export async function finalizeGames(
  seasonYear: number,
  weekNumber: number
): Promise<{ finalized: number; upsets: number }> {
  // Get all final games for this week that haven't been marked for upset yet
  const finalGames = await prisma.game.findMany({
    where: {
      seasonYear,
      weekNumber,
      status: GameStatus.FINAL,
      winnerTeamId: { not: null },
    },
  });

  let finalized = 0;
  let upsets = 0;

  for (const game of finalGames) {
    const winnerIsHome = game.winnerTeamId === game.homeTeamId;
    const isUpset = wasUpset(winnerIsHome, game.spread);

    await prisma.game.update({
      where: { id: game.id },
      data: { wasUpset: isUpset },
    });

    finalized++;
    if (isUpset) upsets++;
  }

  console.log(`[Sync] Finalized ${finalized} games, ${upsets} upsets detected`);
  return { finalized, upsets };
}

/**
 * Calculate weekly scores for a league based on Game data
 */
export async function calculateLeagueScores(
  leagueId: number,
  weekNumber: number
): Promise<{ scores: Array<{ userId: number; userName: string; points: number }> }> {
  // Get all league members with their roster teams
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: {
      user: true,
    },
  });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) {
    throw new Error(`League ${leagueId} not found`);
  }

  const scores: Array<{ userId: number; userName: string; points: number }> = [];

  for (const member of members) {
    // Get user's roster teams (either from RosterTeam or DraftPicks)
    let teamIds: number[] = [];

    // First try RosterTeam (new system)
    const rosterTeams = await prisma.rosterTeam.findMany({
      where: {
        leagueId,
        userId: member.userId,
        droppedAt: null, // Currently on roster
      },
    });

    if (rosterTeams.length > 0) {
      teamIds = rosterTeams.map((rt) => rt.teamId);
    } else {
      // Fall back to DraftPicks (legacy)
      const draftPicks = await prisma.draftPick.findMany({
        where: {
          leagueId,
          userId: member.userId,
        },
      });
      teamIds = draftPicks.map((dp) => dp.teamId);
    }

    // Calculate points from Game data
    let totalPoints = 0;

    for (const teamId of teamIds) {
      // Find games where this team played this week
      const game = await prisma.game.findFirst({
        where: {
          seasonYear: league.seasonYear,
          weekNumber,
          status: GameStatus.FINAL,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      });

      if (game && game.winnerTeamId) {
        const teamWon = game.winnerTeamId === teamId;

        if (teamWon) {
          totalPoints += game.wasUpset ? 2 : 1; // Upset win = 2, regular win = 1
        } else {
          totalPoints += game.wasUpset ? -1 : 0; // Upset loss = -1, regular loss = 0
        }
      }
    }

    // Upsert weekly score
    await prisma.weeklyScore.upsert({
      where: {
        leagueId_userId_weekNumber: {
          leagueId,
          userId: member.userId,
          weekNumber,
        },
      },
      update: { points: totalPoints },
      create: {
        leagueId,
        userId: member.userId,
        weekNumber,
        points: totalPoints,
      },
    });

    scores.push({
      userId: member.userId,
      userName: member.user.name,
      points: totalPoints,
    });
  }

  // Sort by points descending
  scores.sort((a, b) => b.points - a.points);

  console.log(`[Sync] Calculated scores for ${scores.length} members in league ${leagueId}`);
  return { scores };
}

/**
 * Full sync for a week: fetch games, fetch odds, finalize, calculate scores
 */
export async function syncWeek(
  leagueId: number,
  seasonYear: number,
  weekNumber: number
): Promise<SyncResult> {
  const result: SyncResult = {
    gamesCreated: 0,
    gamesUpdated: 0,
    oddsUpdated: 0,
    scoresCalculated: 0,
    errors: [],
  };

  // Step 1: Sync games from ESPN
  const { games, errors: gameErrors } = await syncWeekGames(seasonYear, weekNumber);
  result.gamesCreated = games.length;
  result.errors.push(...gameErrors);

  // Step 2: Sync odds
  const { updated: oddsUpdated, errors: oddsErrors } = await syncOdds();
  result.oddsUpdated = oddsUpdated;
  result.errors.push(...oddsErrors);

  // Step 3: Finalize games and detect upsets
  const { finalized } = await finalizeGames(seasonYear, weekNumber);
  result.gamesUpdated = finalized;

  // Step 4: Calculate scores for the league
  const { scores } = await calculateLeagueScores(leagueId, weekNumber);
  result.scoresCalculated = scores.length;

  return result;
}

/**
 * Sync all leagues for a week
 */
export async function syncAllLeagues(
  seasonYear: number,
  weekNumber: number
): Promise<{ leagueResults: Record<number, SyncResult> }> {
  // First sync games (shared across all leagues)
  await syncWeekGames(seasonYear, weekNumber);
  await syncOdds();
  await finalizeGames(seasonYear, weekNumber);

  // Then calculate scores for each league
  const leagues = await prisma.league.findMany({
    where: { draftComplete: true },
  });

  const leagueResults: Record<number, SyncResult> = {};

  for (const league of leagues) {
    const { scores } = await calculateLeagueScores(league.id, weekNumber);
    leagueResults[league.id] = {
      gamesCreated: 0,
      gamesUpdated: 0,
      oddsUpdated: 0,
      scoresCalculated: scores.length,
      errors: [],
    };
  }

  return { leagueResults };
}
