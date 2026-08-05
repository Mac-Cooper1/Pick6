/**
 * Matchup Service
 *
 * Combines roster data with ESPN scores and Odds API data
 * to provide matchup information for each team on a user's roster
 */

import prisma from '../lib/prisma';
import cacheService, { CACHE_TTL } from './cacheService';
import { fetchScoreboard, parseScoreboardGames, ParsedGame } from './espnClient';
import { fetchNCAAFOdds, isOddsApiConfigured } from './oddsClient';
import { getCurrentWeek } from './seasonService';

// Normalize team names for matching
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/state$/, 'st')
    .replace(/university$/, '')
    .replace(/^the/, '');
}

interface MatchupOdds {
  spread: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  bookmaker: string | null;
  isHomeTeam: boolean;
  teamSpread: number | null;
  teamMoneyline: number | null;
}

export interface TeamMatchup {
  teamId: number;
  teamName: string;
  abbreviation: string | null;
  game: {
    espnEventId: string;
    opponent: string;
    opponentAbbreviation: string;
    startTime: Date;
    isHomeTeam: boolean;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    venue: string | null;
  } | null;
  odds: MatchupOdds | null;
}

/**
 * Modifiers that distinguish different schools with similar base names
 * e.g., "South Florida" vs "Florida", "Arizona State" vs "Arizona"
 */
const TEAM_MODIFIERS = [
  'south', 'north', 'east', 'west', 'central',
  'state', 'st',
  'southern', 'northern', 'eastern', 'western',
  'atlantic', 'international', 'coastal',
  'texas', 'louisiana', 'florida', 'carolina', 'georgia', 'alabama', 'ohio', 'penn', 'michigan',
];

/**
 * Extract the "base" name and any modifiers from a normalized team name
 * e.g., "southflorida" -> { base: "florida", modifiers: ["south"] }
 * e.g., "arizonast" -> { base: "arizona", modifiers: ["st"] }
 */
function extractTeamParts(name: string): { base: string; modifiers: string[] } {
  const modifiers: string[] = [];
  let remaining = name;

  // Check for prefix modifiers (south, north, central, etc.)
  for (const mod of TEAM_MODIFIERS) {
    if (remaining.startsWith(mod) && remaining.length > mod.length) {
      modifiers.push(mod);
      remaining = remaining.slice(mod.length);
      break; // Only one prefix
    }
  }

  // Check for suffix modifiers (state, st, etc.)
  for (const mod of ['state', 'st']) {
    if (remaining.endsWith(mod) && remaining.length > mod.length) {
      modifiers.push(mod);
      remaining = remaining.slice(0, -mod.length);
      break;
    }
  }

  return { base: remaining, modifiers };
}

/**
 * Check if two team names match, being careful about:
 * - State schools: "Arizona" vs "Arizona State"
 * - Directional schools: "Florida" vs "South Florida"
 * - Regional variants: "Carolina" vs "South Carolina" vs "North Carolina"
 */
function teamsMatch(searchName: string, gameName: string): boolean {
  // Exact match is always valid
  if (searchName === gameName) return true;

  // First, check if either name contains a modifier that the other doesn't
  // This catches cases like "arkansas" vs "arkansasstateredwolves"
  for (const mod of TEAM_MODIFIERS) {
    const searchHasMod = searchName.includes(mod);
    const gameHasMod = gameName.includes(mod);

    // If one has "state" and the other doesn't, they're different schools
    if (searchHasMod !== gameHasMod) {
      // Check if it's a meaningful modifier difference
      // e.g., "arkansas" doesn't have "state", but "arkansasstate..." does
      if (mod === 'state' || mod === 'st' || mod === 'south' || mod === 'north' ||
          mod === 'east' || mod === 'west' || mod === 'central') {
        return false;
      }
    }
  }

  // Extract base names and modifiers
  const search = extractTeamParts(searchName);
  const game = extractTeamParts(gameName);

  // Only consider exact base matches now (removed loose includes() check)
  if (search.base === game.base) {
    // If bases match exactly, check modifiers
    const searchHasMods = search.modifiers.length > 0;
    const gameHasMods = game.modifiers.length > 0;

    if (searchHasMods !== gameHasMods) {
      return false; // One has modifiers, the other doesn't - different schools
    }

    if (searchHasMods && gameHasMods) {
      // Both have modifiers - check if they're the same modifiers
      const sameModifiers = search.modifiers.every(m => game.modifiers.includes(m)) &&
        game.modifiers.every(m => search.modifiers.includes(m));
      return sameModifiers;
    }

    // Neither has modifiers and bases match exactly - same school
    return true;
  }

  // Bases don't match exactly - check for legitimate partial matches
  // But be very strict: only allow if the shorter name starts the longer one
  // AND there's no modifier in the difference
  if (gameName.startsWith(searchName) || searchName.startsWith(gameName)) {
    const longer = gameName.length > searchName.length ? gameName : searchName;
    const shorter = gameName.length > searchName.length ? searchName : gameName;
    const diff = longer.slice(shorter.length);

    // If the difference contains any modifier, they're different schools
    if (TEAM_MODIFIERS.some(mod => diff.includes(mod))) {
      return false;
    }

    // If diff is just a mascot suffix (no modifiers), might be same school
    // But be conservative - only match if diff is very short (e.g., just "s")
    if (diff.length <= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Find matching ESPN game for a team
 * IMPORTANT: ESPN ID matching is prioritized and checked across ALL games first
 * before falling back to name matching
 */
function findGameForTeam(
  teamName: string,
  espnId: string | null,
  games: ParsedGame[]
): { game: ParsedGame; isHome: boolean } | null {
  const normalizedTeamName = normalizeTeamName(teamName);

  // FIRST PASS: Try ESPN ID match across ALL games (most reliable)
  if (espnId) {
    for (const game of games) {
      if (game.homeTeam.espnId === espnId) {
        return { game, isHome: true };
      }
      if (game.awayTeam.espnId === espnId) {
        return { game, isHome: false };
      }
    }
  }

  // SECOND PASS: Fall back to name matching only if ESPN ID didn't match
  for (const game of games) {
    const homeNorm = normalizeTeamName(game.homeTeam.displayName);
    const awayNorm = normalizeTeamName(game.awayTeam.displayName);

    if (teamsMatch(normalizedTeamName, homeNorm)) {
      return { game, isHome: true };
    }
    if (teamsMatch(normalizedTeamName, awayNorm)) {
      return { game, isHome: false };
    }
  }

  // THIRD PASS: Check exact abbreviation match
  const teamLower = teamName.toLowerCase();
  for (const game of games) {
    const homeAbbr = game.homeTeam.abbreviation.toLowerCase();
    const awayAbbr = game.awayTeam.abbreviation.toLowerCase();

    if (teamLower === homeAbbr || normalizedTeamName === homeAbbr) {
      return { game, isHome: true };
    }
    if (teamLower === awayAbbr || normalizedTeamName === awayAbbr) {
      return { game, isHome: false };
    }
  }

  console.log(`[Matchup] No match found for: ${teamName} (espnId: ${espnId})`);
  return null;
}

interface OddsData {
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  bookmaker: string | null;
}

/**
 * Find odds for a specific game
 */
function findOddsForGame(
  homeTeamName: string,
  awayTeamName: string,
  oddsData: OddsData[]
): OddsData | null {
  const homeNorm = normalizeTeamName(homeTeamName);
  const awayNorm = normalizeTeamName(awayTeamName);

  for (const odds of oddsData) {
    const oddsHomeNorm = normalizeTeamName(odds.homeTeam);
    const oddsAwayNorm = normalizeTeamName(odds.awayTeam);

    const homeMatch =
      oddsHomeNorm.includes(homeNorm) ||
      homeNorm.includes(oddsHomeNorm) ||
      homeNorm.slice(0, 6) === oddsHomeNorm.slice(0, 6);

    const awayMatch =
      oddsAwayNorm.includes(awayNorm) ||
      awayNorm.includes(oddsAwayNorm) ||
      awayNorm.slice(0, 6) === oddsAwayNorm.slice(0, 6);

    if (homeMatch && awayMatch) {
      return odds;
    }
  }

  // Log mismatch for debugging
  console.log(`[Matchup] No odds found for ${homeTeamName} vs ${awayTeamName}`);
  return null;
}

/**
 * Get matchups with odds for all teams on a user's roster
 */
export async function getRosterMatchups(
  leagueId: number,
  userId: number,
  weekNumber?: number
): Promise<TeamMatchup[]> {
  // Get league info
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
  });

  if (!league) {
    throw new Error('League not found');
  }

  let seasonYear = league.seasonYear;

  // Check if we need to use current season instead of configured season
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = January, 11 = December

  // CFB season naming: "2025 season" runs from Aug 2025 to Jan 2026
  // In December, we're in the current year's season bowls
  // In January, we're in the previous year's season bowls
  const actualSeasonYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // If configured season is outdated, use the actual current season
  if (seasonYear < actualSeasonYear) {
    console.log(`[Matchup] Season ${seasonYear} is outdated, using ${actualSeasonYear} instead`);
    seasonYear = actualSeasonYear;
  }

  // Determine if we're in bowl season (late December or January)
  const isLateDecember = currentMonth === 11 && now.getDate() > 10;
  const isJanuary = currentMonth === 0;
  const isBowlSeason = isLateDecember || isJanuary;

  // Week comes from the ESPN-derived calendar (D6), not a stored counter
  const week = weekNumber || (await getCurrentWeek(seasonYear));

  // Get user's current roster
  const rosterSlots = await prisma.rosterSlot.findMany({
    where: {
      leagueId,
      userId,
      toWeek: null,
    },
    include: {
      team: true,
    },
  });

  // Get ESPN games for the week (cached)
  // In bowl season, try postseason first, otherwise try regular season
  const gamesCacheKey = `matchups:games:${seasonYear}:${isBowlSeason ? 'bowls' : week}`;
  let games = cacheService.get<ParsedGame[]>(gamesCacheKey);

  if (!games) {
    try {
      if (isBowlSeason) {
        // In bowl season, fetch postseason games first
        console.log(`[Matchup] Bowl season detected, fetching postseason games for ${seasonYear}...`);
        const postResponse = await fetchScoreboard(seasonYear, 1, 3); // type 3 = postseason
        games = parseScoreboardGames(postResponse, seasonYear, 1);
        console.log(`[Matchup] Found ${games.length} postseason games`);

        // If no postseason games, fall back to late regular season
        if (games.length === 0) {
          console.log('[Matchup] No postseason games, trying late regular season...');
          const response = await fetchScoreboard(seasonYear, 15, 2);
          games = parseScoreboardGames(response, seasonYear, 15);
        }
      } else {
        // Regular season - fetch by week
        const response = await fetchScoreboard(seasonYear, week, 2);
        games = parseScoreboardGames(response, seasonYear, week);
      }

      cacheService.set(gamesCacheKey, games, CACHE_TTL.ESPN_SCHEDULE);
    } catch (error) {
      console.error('[Matchup] Error fetching ESPN games:', error);
      games = [];
    }
  }

  // Get odds data (cached)
  let oddsData: OddsData[] = [];
  if (isOddsApiConfigured()) {
    const oddsCacheKey = 'matchups:odds:ncaaf';
    const cachedOdds = cacheService.get<OddsData[]>(oddsCacheKey);

    if (cachedOdds) {
      oddsData = cachedOdds;
    } else {
      try {
        const oddsEvents = await fetchNCAAFOdds(['spreads', 'h2h']);
        oddsData = oddsEvents.map((event) => {
          let spread: number | null = null;
          let homeMoneyline: number | null = null;
          let awayMoneyline: number | null = null;
          let bookmaker: string | null = null;

          for (const bm of event.bookmakers) {
            if (spread === null) {
              const spreadMarket = bm.markets.find((m) => m.key === 'spreads');
              if (spreadMarket) {
                const homeOutcome = spreadMarket.outcomes.find((o) => o.name === event.home_team);
                if (homeOutcome?.point !== undefined) {
                  spread = homeOutcome.point;
                  bookmaker = bm.title;
                }
              }
            }
            if (homeMoneyline === null) {
              const h2hMarket = bm.markets.find((m) => m.key === 'h2h');
              if (h2hMarket) {
                const homeH2h = h2hMarket.outcomes.find((o) => o.name === event.home_team);
                const awayH2h = h2hMarket.outcomes.find((o) => o.name === event.away_team);
                if (homeH2h) homeMoneyline = homeH2h.price;
                if (awayH2h) awayMoneyline = awayH2h.price;
              }
            }
            if (spread !== null && homeMoneyline !== null) break;
          }

          return {
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            spread,
            homeMoneyline,
            awayMoneyline,
            bookmaker,
          };
        });
        cacheService.set(oddsCacheKey, oddsData, CACHE_TTL.ODDS_API);
      } catch (error) {
        console.error('[Matchup] Error fetching odds:', error);
      }
    }
  }

  // Build matchup data for each rostered team
  const matchups: TeamMatchup[] = rosterSlots.map((rt) => {
    const team = rt.team;
    const gameMatch = findGameForTeam(team.name, team.espnTeamId, games || []);

    let matchup: TeamMatchup = {
      teamId: team.id,
      teamName: team.name,
      abbreviation: team.abbreviation,
      game: null,
      odds: null,
    };

    if (gameMatch) {
      const { game, isHome } = gameMatch;
      const opponent = isHome ? game.awayTeam : game.homeTeam;

      matchup.game = {
        espnEventId: game.espnEventId,
        opponent: opponent.displayName,
        opponentAbbreviation: opponent.abbreviation,
        startTime: game.startTime,
        isHomeTeam: isHome,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        venue: game.venue,
      };

      // Find odds for this game
      const gameOdds = findOddsForGame(
        game.homeTeam.displayName,
        game.awayTeam.displayName,
        oddsData
      );

      if (gameOdds) {
        matchup.odds = {
          spread: gameOdds.spread,
          homeMoneyline: gameOdds.homeMoneyline,
          awayMoneyline: gameOdds.awayMoneyline,
          bookmaker: gameOdds.bookmaker,
          isHomeTeam: isHome,
          // Calculate team-specific spread and moneyline
          teamSpread: gameOdds.spread !== null
            ? (isHome ? gameOdds.spread : -gameOdds.spread)
            : null,
          teamMoneyline: isHome ? gameOdds.homeMoneyline : gameOdds.awayMoneyline,
        };
      }
    }

    return matchup;
  });

  return matchups;
}

/**
 * Get matchups for all rosters in a league
 */
export async function getAllRosterMatchups(
  leagueId: number,
  weekNumber?: number
): Promise<{ userId: number; userName: string; matchups: TeamMatchup[] }[]> {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: true },
  });

  const results = await Promise.all(
    members.map(async (member) => {
      const matchups = await getRosterMatchups(leagueId, member.userId, weekNumber);
      return {
        userId: member.userId,
        userName: member.user.name,
        matchups,
      };
    })
  );

  return results;
}
