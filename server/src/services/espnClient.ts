/**
 * ESPN API Client for College Football Data
 *
 * Uses ESPN's hidden API endpoints to fetch:
 * - Scoreboard data (games for a given week/date)
 * - Game summaries with detailed stats
 *
 * API Reference: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
 */

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

// ESPN group IDs: 80 = FBS, 81 = FCS
const DEFAULT_GROUP_ID = process.env.ESPN_GROUP_ID || '80';

export interface ESPNTeam {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logo?: string;
}

export interface ESPNCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: ESPNTeam;
  score?: string;
  winner?: boolean;
}

export interface ESPNGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: {
    type: {
      id: string;
      name: string;
      state: 'pre' | 'in' | 'post';
      completed: boolean;
      description: string;
    };
  };
  competitions: Array<{
    id: string;
    date: string;
    venue?: {
      fullName: string;
      address?: {
        city: string;
        state: string;
      };
    };
    competitors: ESPNCompetitor[];
    status: {
      type: {
        state: 'pre' | 'in' | 'post';
        completed: boolean;
      };
    };
  }>;
  week?: {
    number: number;
  };
  season?: {
    year: number;
    type: number;
  };
}

export interface ESPNScoreboardResponse {
  events: ESPNGame[];
  season?: {
    year: number;
    type: number;
  };
  week?: {
    number: number;
  };
}

export interface ParsedGame {
  espnEventId: string;
  seasonYear: number;
  weekNumber: number;
  homeTeam: {
    espnId: string;
    name: string;
    abbreviation: string;
    displayName: string;
  };
  awayTeam: {
    espnId: string;
    name: string;
    abbreviation: string;
    displayName: string;
  };
  startTime: Date;
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  isCompleted: boolean;
  winnerId: string | null;
}

/**
 * Fetch scoreboard data for a specific week
 */
export async function fetchScoreboard(
  seasonYear: number,
  weekNumber: number,
  seasonType: number = 2 // 2 = regular season
): Promise<ESPNScoreboardResponse> {
  const url = new URL(`${ESPN_BASE_URL}/scoreboard`);
  url.searchParams.set('groups', DEFAULT_GROUP_ID);
  url.searchParams.set('limit', '100');
  url.searchParams.set('seasontype', seasonType.toString());
  url.searchParams.set('week', weekNumber.toString());
  url.searchParams.set('dates', seasonYear.toString());

  console.log(`[ESPN] Fetching scoreboard: ${url.toString()}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as ESPNScoreboardResponse;
}

/**
 * Fetch scoreboard by date range (YYYYMMDD format)
 */
export async function fetchScoreboardByDate(
  startDate: string,
  endDate?: string
): Promise<ESPNScoreboardResponse> {
  const url = new URL(`${ESPN_BASE_URL}/scoreboard`);
  url.searchParams.set('groups', DEFAULT_GROUP_ID);
  url.searchParams.set('limit', '100');

  if (endDate) {
    url.searchParams.set('dates', `${startDate}-${endDate}`);
  } else {
    url.searchParams.set('dates', startDate);
  }

  console.log(`[ESPN] Fetching scoreboard by date: ${url.toString()}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as ESPNScoreboardResponse;
}

/**
 * Fetch detailed game summary
 */
export async function fetchGameSummary(eventId: string): Promise<any> {
  const url = `${ESPN_BASE_URL}/summary?event=${eventId}`;

  console.log(`[ESPN] Fetching game summary: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Parse ESPN scoreboard response into normalized game data
 */
export function parseScoreboardGames(
  response: ESPNScoreboardResponse,
  seasonYear: number,
  weekNumber: number
): ParsedGame[] {
  return response.events.map((event) => {
    const competition = event.competitions[0];
    const homeCompetitor = competition.competitors.find((c) => c.homeAway === 'home');
    const awayCompetitor = competition.competitors.find((c) => c.homeAway === 'away');

    if (!homeCompetitor || !awayCompetitor) {
      throw new Error(`Invalid game data for event ${event.id}: missing home/away team`);
    }

    // Map ESPN status to our status
    let status: ParsedGame['status'] = 'scheduled';
    const statusState = event.status.type.state;
    const statusName = event.status.type.name.toLowerCase();

    if (statusState === 'post' || event.status.type.completed) {
      status = 'final';
    } else if (statusState === 'in') {
      status = 'in_progress';
    } else if (statusName.includes('postponed')) {
      status = 'postponed';
    } else if (statusName.includes('canceled') || statusName.includes('cancelled')) {
      status = 'cancelled';
    }

    // Determine winner
    let winnerId: string | null = null;
    if (status === 'final') {
      const homeScore = parseInt(homeCompetitor.score || '0', 10);
      const awayScore = parseInt(awayCompetitor.score || '0', 10);
      if (homeScore > awayScore) {
        winnerId = homeCompetitor.team.id;
      } else if (awayScore > homeScore) {
        winnerId = awayCompetitor.team.id;
      }
      // Ties leave winnerId as null
    }

    return {
      espnEventId: event.id,
      seasonYear: event.season?.year || seasonYear,
      weekNumber: event.week?.number || weekNumber,
      homeTeam: {
        espnId: homeCompetitor.team.id,
        name: homeCompetitor.team.name,
        abbreviation: homeCompetitor.team.abbreviation,
        displayName: homeCompetitor.team.displayName,
      },
      awayTeam: {
        espnId: awayCompetitor.team.id,
        name: awayCompetitor.team.name,
        abbreviation: awayCompetitor.team.abbreviation,
        displayName: awayCompetitor.team.displayName,
      },
      startTime: new Date(event.date),
      status,
      homeScore: homeCompetitor.score ? parseInt(homeCompetitor.score, 10) : null,
      awayScore: awayCompetitor.score ? parseInt(awayCompetitor.score, 10) : null,
      venue: competition.venue?.fullName || null,
      isCompleted: event.status.type.completed,
      winnerId,
    };
  });
}

/**
 * Convenience function to get games for a week
 */
export async function getGamesForWeek(
  seasonYear: number,
  weekNumber: number
): Promise<ParsedGame[]> {
  const response = await fetchScoreboard(seasonYear, weekNumber);
  return parseScoreboardGames(response, seasonYear, weekNumber);
}

/**
 * Get all teams from ESPN (useful for initial setup/verification)
 */
export async function fetchAllTeams(): Promise<ESPNTeam[]> {
  const url = `${ESPN_BASE_URL}/teams?groups=${DEFAULT_GROUP_ID}&limit=200`;

  console.log(`[ESPN] Fetching all teams: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.sports[0]?.leagues[0]?.teams?.map((t: any) => t.team) || [];
}

// ============================================
// KICKOFF LOCK HELPERS FOR FAAB AUCTION
// ============================================

// Simple in-memory cache for kickoff times (5 minute TTL)
const kickoffCache = new Map<string, { time: Date | null; fetchedAt: Date }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a team's next kickoff time for a given week
 * Returns null if team has a bye week or kickoff time can't be determined
 * Uses caching to reduce ESPN API calls
 */
export async function getTeamNextKickoff(
  teamId: number,
  seasonYear: number,
  weekNumber: number
): Promise<Date | null> {
  // Import prisma lazily to avoid circular dependencies
  const prisma = (await import('../lib/prisma')).default;

  // Get the team's ESPN ID
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { espnTeamId: true, name: true },
  });

  if (!team?.espnTeamId) {
    console.log(`[ESPN] Team ${teamId} has no ESPN ID, treating as locked (conservative)`);
    return new Date(0); // Return epoch = always locked (conservative)
  }

  // Check cache first
  const cacheKey = `${team.espnTeamId}-${seasonYear}-${weekNumber}`;
  const cached = kickoffCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.time;
  }

  try {
    // First check if we have the game in our database
    const gameInDb = await prisma.game.findFirst({
      where: {
        seasonYear,
        weekNumber,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      select: { startTime: true },
    });

    if (gameInDb) {
      kickoffCache.set(cacheKey, { time: gameInDb.startTime, fetchedAt: new Date() });
      return gameInDb.startTime;
    }

    // Fall back to ESPN API
    const scoreboard = await fetchScoreboard(seasonYear, weekNumber);
    const games = parseScoreboardGames(scoreboard, seasonYear, weekNumber);

    // Find game involving this team
    const teamGame = games.find(
      (g) => g.homeTeam.espnId === team.espnTeamId || g.awayTeam.espnId === team.espnTeamId
    );

    const kickoffTime = teamGame ? teamGame.startTime : null;
    kickoffCache.set(cacheKey, { time: kickoffTime, fetchedAt: new Date() });

    return kickoffTime;
  } catch (error) {
    console.error(`[ESPN] Error fetching kickoff for team ${team.name}:`, error);
    // Conservative: if we can't determine kickoff, treat as locked
    return new Date(0);
  }
}

/**
 * Check if a team's game has already started or is in progress
 */
export async function hasGameStarted(
  teamId: number,
  seasonYear: number,
  weekNumber: number
): Promise<boolean> {
  const kickoff = await getTeamNextKickoff(teamId, seasonYear, weekNumber);
  if (!kickoff) return false; // Bye week
  return new Date() >= kickoff;
}

// ============================================
// RANKINGS API
// ============================================

export interface RankedTeam {
  rank: number;
  teamId: string; // ESPN team ID
  teamName: string;
  abbreviation: string;
  record: string;
  previousRank?: number;
}

export interface RankingsResponse {
  pollName: string;
  pollId: string;
  teams: RankedTeam[];
  updatedAt: string;
}

/**
 * Fetch college football rankings from ESPN
 * Uses AP Top 25 by default (pollId 1)
 */
export async function fetchRankings(): Promise<RankingsResponse> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings`;

  console.log(`[ESPN] Fetching rankings: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ESPN Rankings API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();

  // Find the AP Top 25 poll (typically first, or use Playoff rankings if available)
  const poll = data.rankings?.[0];

  if (!poll) {
    return {
      pollName: 'Unknown',
      pollId: '0',
      teams: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const teams: RankedTeam[] = poll.ranks.map((r: any) => ({
    rank: r.current,
    teamId: r.team?.id || '',
    teamName: r.team?.name || r.team?.shortDisplayName || '',
    abbreviation: r.team?.abbreviation || '',
    record: r.recordSummary || '',
    previousRank: r.previous,
  }));

  return {
    pollName: poll.name,
    pollId: poll.id,
    teams,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get a map of ESPN team ID to rank (for quick lookups)
 */
export async function getRankingsMap(): Promise<Map<string, number>> {
  const rankings = await fetchRankings();
  const map = new Map<string, number>();

  for (const team of rankings.teams) {
    if (team.teamId) {
      map.set(team.teamId, team.rank);
    }
  }

  return map;
}
