/**
 * Sync Service
 *
 * Handles syncing game data from ESPN and odds from The Odds API,
 * then updates our database and calculates scores.
 */

import prisma from '../lib/prisma';
import { ConferenceSlot, GameStatus } from '@prisma/client';
import { fetchSosRanks, getGamesForWeek, ParsedGame } from './espnClient';
import { getNCAAFSpreads, isOddsApiConfigured, ParsedOdds } from './oddsClient';
import { findTeamByEspnId, matchGameToOdds, wasUpset } from './teamMatcher';
import {
  gamesForTeamWeek,
  getLastWeek,
  loadScoringWeekMap,
  pointsForTeam,
} from './scoringWeekService';
import { runDueSwaps, SwapRunResult } from './swapService';

/**
 * Resolve an ESPN team to a DB team, creating an unslotted stub for unknown
 * opponents (usually FCS schools). Without this, any game against a non-FBS
 * opponent was silently dropped and the rostered FBS team scored 0 for the
 * week even after a win.
 */
async function findOrCreateTeam(espnTeam: {
  espnId: string;
  displayName: string;
  abbreviation: string;
}) {
  if (espnTeam.espnId) {
    const existing = await findTeamByEspnId(espnTeam.espnId);
    if (existing) return existing;
  }

  return prisma.team.upsert({
    where: { name: espnTeam.displayName },
    update: { espnTeamId: espnTeam.espnId || undefined },
    create: {
      name: espnTeam.displayName,
      conference: 'Non-FBS',
      slot: ConferenceSlot.NONE,
      abbreviation: espnTeam.abbreviation || null,
      espnTeamId: espnTeam.espnId || null,
    },
  });
}

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
      // Find teams in our database (creating unslotted stubs for unknown
      // opponents so FBS-vs-FCS games still land and score)
      const homeTeam = await findOrCreateTeam(espnGame.homeTeam);
      const awayTeam = await findOrCreateTeam(espnGame.awayTeam);

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
          // ESPN moves games (weather, TV); the row must follow so the
          // scoring-week attribution sees the real kickoff and week
          startTime: espnGame.startTime,
          weekNumber,
          venue: espnGame.venue,
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
 * Sync odds for upcoming games. Scoped to a season/week when provided —
 * the unscoped form previously scanned every SCHEDULED game across all
 * seasons. Odds only attach to games that haven't kicked off, so run this
 * before game day (the daily cron handles it).
 */
export async function syncOdds(
  seasonYear?: number,
  weekNumber?: number | number[]
): Promise<{ updated: number; errors: string[] }> {
  const weekNumbers =
    weekNumber === undefined ? undefined : Array.isArray(weekNumber) ? weekNumber : [weekNumber];
  const errors: string[] = [];

  if (!isOddsApiConfigured()) {
    console.log('[Sync] Odds API not configured, skipping odds sync');
    return { updated: 0, errors: ['ODDS_API_KEY not configured'] };
  }

  console.log('[Sync] Fetching odds from The Odds API');
  let oddsData: ParsedOdds[];

  try {
    oddsData = await getNCAAFSpreads();
    console.log(`[Sync] Found ${oddsData.length} games with odds`);
  } catch (error: any) {
    errors.push(`Odds API error: ${error.message}`);
    return { updated: 0, errors };
  }

  let updated = 0;

  // Get scheduled games (scoped to the target week when given)
  const scheduledGames = await prisma.game.findMany({
    where: {
      status: GameStatus.SCHEDULED,
      ...(seasonYear !== undefined ? { seasonYear } : {}),
      ...(weekNumbers !== undefined ? { weekNumber: { in: weekNumbers } } : {}),
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
        // Full display names match The Odds API's naming — better hit rate
        displayName:
          game.homeTeam.oddsApiName || game.homeTeam.espnDisplayName || game.homeTeam.name,
      },
      awayTeam: {
        espnId: game.awayTeam.espnTeamId || '',
        name: game.awayTeam.name,
        abbreviation: game.awayTeam.abbreviation || '',
        displayName:
          game.awayTeam.oddsApiName || game.awayTeam.espnDisplayName || game.awayTeam.name,
      },
      startTime: game.startTime,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      venue: game.venue,
      broadcast: null,
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
 * Refresh every team's ESPN strength-of-schedule rank (the standings
 * tiebreaker, see standingsService). One ESPN call, no quota.
 */
export async function syncSosRanks(seasonYear: number): Promise<number> {
  const ranks = await fetchSosRanks(seasonYear);
  const teams = await prisma.team.findMany({
    where: { espnTeamId: { in: [...ranks.keys()] } },
    select: { id: true, espnTeamId: true },
  });

  for (const team of teams) {
    const sosRank = ranks.get(team.espnTeamId!)!;
    await prisma.teamSos.upsert({
      where: { seasonYear_teamId: { seasonYear, teamId: team.id } },
      update: { sosRank },
      create: { seasonYear, teamId: team.id, sosRank },
    });
  }

  console.log(`[Sync] SOS ranks updated for ${teams.length} teams`);
  return teams.length;
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
 * Calculate weekly scores for a league based on Game data.
 *
 * Each member's roster is read as of the scored week (effective-week
 * windows), and each team's games come from the scoring-week attribution
 * (scoringWeekService): every game counts, and a team that plays twice in
 * one ESPN week has its extra game rolled into its next bye week.
 */
export async function calculateLeagueScores(
  leagueId: number,
  weekNumber: number
): Promise<{ scores: Array<{ userId: number; userName: string; points: number }> }> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) {
    throw new Error(`League ${leagueId} not found`);
  }

  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: {
      user: true,
    },
  });

  // Every roster row active during this week (effective-week window), so a
  // post-week-5 swap can never rewrite already-played weeks.
  const rosterSlots = await prisma.rosterSlot.findMany({
    where: {
      leagueId,
      fromWeek: { lte: weekNumber },
      OR: [{ toWeek: null }, { toWeek: { gte: weekNumber } }],
    },
  });

  const scoringWeeks = await loadScoringWeekMap(
    league.seasonYear,
    rosterSlots.map((rs) => rs.teamId)
  );

  const scores: Array<{ userId: number; userName: string; points: number }> = [];

  for (const member of members) {
    let totalPoints = 0;

    for (const slot of rosterSlots) {
      if (slot.userId !== member.userId) continue;

      for (const game of gamesForTeamWeek(scoringWeeks, slot.teamId, weekNumber)) {
        if (game.status === GameStatus.FINAL && !game.winnerTeamId) {
          // FINAL games always carry a winner; this is a tie/override edge
          // case — explicit 0 points, logged for visibility
          console.log(
            `[Scores] No winner for game ${game.espnEventId} (status ${game.status}) — team ${slot.teamId} scores 0 in week ${weekNumber}`
          );
        }
        totalPoints += pointsForTeam(game, slot.teamId);
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
 * Rescore one week for every league that has drafted. Returns league ids.
 */
export async function rescoreWeekForAllLeagues(
  seasonYear: number,
  weekNumber: number
): Promise<number[]> {
  const leagues = await prisma.league.findMany({
    where: { draftComplete: true, seasonYear },
  });
  for (const league of leagues) {
    await calculateLeagueScores(league.id, weekNumber);
  }
  return leagues.map((l) => l.id);
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

  // Step 2: Sync odds for this week
  const { updated: oddsUpdated, errors: oddsErrors } = await syncOdds(seasonYear, weekNumber);
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
  await syncOdds(seasonYear, weekNumber);
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

  // Once week 6 starts, every league's week-6 swap runs (idempotent), with
  // fresh SOS ranks for the tiebreaker (a failure keeps the stored ones)
  await syncSosRanks(seasonYear).catch((e) => console.error(`[Sync] SOS ranks: ${e.message}`));
  await runDueSwaps(seasonYear);

  return { leagueResults };
}

export interface SyncWindowResult {
  currentWeek: number;
  weeksSynced: number[];
  weeksScored: number[];
  gamesSynced: number;
  oddsUpdated: number;
  leaguesScored: number;
  sosRanksSynced: number;
  swapsRun: SwapRunResult[];
  errors: string[];
}

/**
 * The scheduled sync: previous, current and next week in one pass.
 *
 *  - previous week: games + finalize + rescore, so a game that finishes
 *    after ESPN's week boundary (FSU vs SMU ended Tuesday 2am ET, week 1
 *    closed at 3am) still lands. Before this, only the current week was
 *    ever touched and SMU sat on TBD.
 *  - current week: the usual games → odds → finalize → rescore.
 *  - next week: games only (plus any early lines), so the scoring-week
 *    attribution can tell a bye from a not-yet-synced week when it decides
 *    whether a double-game rolls forward.
 *
 * Still ONE Odds API call per run (the response covers every upcoming game).
 */
export async function syncCurrentWindow(
  seasonYear: number,
  currentWeek: number
): Promise<SyncWindowResult> {
  const lastWeek = await getLastWeek(seasonYear);
  const previousWeek = currentWeek > 1 ? currentWeek - 1 : null;
  const nextWeek = currentWeek < lastWeek ? currentWeek + 1 : null;
  const weeksSynced = [previousWeek, currentWeek, nextWeek].filter(
    (w): w is number => w !== null
  );
  const weeksScored = [previousWeek, currentWeek].filter((w): w is number => w !== null);

  const errors: string[] = [];
  let gamesSynced = 0;

  for (const week of weeksSynced) {
    try {
      const { games, errors: gameErrors } = await syncWeekGames(seasonYear, week);
      gamesSynced += games.length;
      errors.push(...gameErrors);
    } catch (error: any) {
      errors.push(`Week ${week} games: ${error.message}`);
    }
  }

  const { updated: oddsUpdated, errors: oddsErrors } = await syncOdds(seasonYear, weeksSynced);
  errors.push(...oddsErrors);

  const leagueIds = new Set<number>();
  for (const week of weeksScored) {
    await finalizeGames(seasonYear, week);
    for (const id of await rescoreWeekForAllLeagues(seasonYear, week)) leagueIds.add(id);
  }

  // Strength-of-schedule ranks: the standings tiebreaker, refreshed before
  // the swap below reads them. A failure keeps the last stored ranks.
  let sosRanksSynced = 0;
  try {
    sosRanksSynced = await syncSosRanks(seasonYear);
  } catch (error: any) {
    errors.push(`SOS ranks: ${error.message}`);
  }

  // The week-6 swap runs here, right after week 5 was finalized and rescored
  // above, so the order uses final standings. No-op until week 6 starts and
  // for leagues that already ran.
  let swapsRun: SwapRunResult[] = [];
  try {
    swapsRun = await runDueSwaps(seasonYear);
  } catch (error: any) {
    errors.push(`Week 6 swap: ${error.message}`);
  }

  return {
    currentWeek,
    weeksSynced,
    weeksScored,
    gamesSynced,
    oddsUpdated,
    leaguesScored: leagueIds.size,
    sosRanksSynced,
    swapsRun,
    errors,
  };
}
