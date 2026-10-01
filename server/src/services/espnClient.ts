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
    broadcasts?: Array<{
      market?: string;
      names?: string[];
    }>;
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
  broadcast: string | null;
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
  url.searchParams.set('limit', '300');
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
  url.searchParams.set('limit', '300');

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
 * Fetch detailed game summary. `timeoutMs` bounds user-facing callers (the
 * team card) so a slow ESPN can't hang a request.
 */
export async function fetchGameSummary(eventId: string, timeoutMs?: number): Promise<any> {
  const url = `${ESPN_BASE_URL}/summary?event=${eventId}`;

  console.log(`[ESPN] Fetching game summary: ${url}`);

  const response = await fetch(url, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * The closing line ESPN shows on a game page (`pickcenter`, DraftKings first).
 * Returns the HOME team's spread (negative = home favored), the same sign
 * convention as Game.spread. Free, keyed by event id (no name matching), and
 * it persists after the game ends, which is what makes it usable as a
 * reference when a stored Odds API line is suspect (admin repair-spreads).
 */
export interface EspnGameLine {
  spread: number; // home team spread
  details: string; // e.g. "UNLV -2.5"
  provider: string; // e.g. "DraftKings"
}

export async function fetchGameLine(eventId: string): Promise<EspnGameLine | null> {
  const summary = await fetchGameSummary(eventId);
  const entries: any[] = Array.isArray(summary?.pickcenter) ? summary.pickcenter : [];
  const entry = entries.find((p) => typeof p?.spread === 'number');
  if (!entry) return null;
  return {
    spread: entry.spread,
    details: entry.details || '',
    provider: entry.provider?.name || 'ESPN',
  };
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
      // First listed network ("ESPN", "NBC", "CBSSN", ...); streaming-only
      // games come through the same field (e.g. "ESPN+")
      broadcast: competition.broadcasts?.[0]?.names?.[0] || null,
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
 * Full team catalog (id → names/abbreviation) from the site API. The site
 * /teams endpoint IGNORES the `groups` filter (it returns every college team
 * down to D3), so it is only good as a lookup catalog — conference
 * membership comes from fetchConferenceTeamIds (core API) instead.
 */
export interface EspnCatalogTeam {
  espnId: string;
  location: string; // canonical short name, e.g. "Boise State"
  displayName: string; // full name, e.g. "Boise State Broncos"
  abbreviation: string | null;
}

export async function fetchTeamCatalog(): Promise<Map<string, EspnCatalogTeam>> {
  const url = `${ESPN_BASE_URL}/teams?limit=1000`;
  console.log(`[ESPN] Fetching team catalog: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];

  const catalog = new Map<string, EspnCatalogTeam>();
  for (const entry of teams) {
    const t = entry.team;
    if (!t?.id) continue;
    catalog.set(String(t.id), {
      espnId: String(t.id),
      location: t.location || t.displayName,
      displayName: t.displayName || t.location,
      abbreviation: t.abbreviation || null,
    });
  }

  return catalog;
}

/**
 * Team IDs for one conference in a given season, from ESPN's core API —
 * the authoritative source for season-specific conference membership
 * (this is how the seed knows the 2026 Pac-12 has 8 members).
 */
export async function fetchConferenceTeamIds(
  seasonYear: number,
  espnGroupId: number
): Promise<string[]> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${seasonYear}/types/2/groups/${espnGroupId}/teams?limit=100`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `ESPN core API error for group ${espnGroupId}: ${response.status} ${response.statusText}`
    );
  }

  const data: any = await response.json();
  const items = data.items || [];
  return items
    .map((i: any) => {
      const match = String(i.$ref || '').match(/\/teams\/(\d+)/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];
}

/**
 * ESPN FPI strength-of-schedule rank for games already played (1 = hardest
 * in FBS), keyed by ESPN team id. Field `avgsosrank`: the same numbers as
 * the SOS column on espn.com/college-football/fpi/_/view/resume. Teams with
 * no rank yet (no games played) are left out.
 */
export async function fetchSosRanks(seasonYear: number): Promise<Map<string, number>> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${seasonYear}/powerindex?limit=300`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN FPI error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const ranks = new Map<string, number>();
  for (const item of data.items || []) {
    const espnId = String(item.team?.$ref || '').match(/\/teams\/(\d+)/)?.[1];
    const rank = item.predictives?.find((p: any) => p.name === 'avgsosrank')?.value;
    if (espnId && typeof rank === 'number' && rank > 0) {
      ranks.set(espnId, Math.round(rank));
    }
  }
  return ranks;
}

// ============================================
// TEAM CARD (team schedule, headlines, matchup predictor)
// ============================================

// The team card is a tap away for every player: a slow ESPN must fail fast
// so the card falls back to the synced Game rows instead of hanging
const TEAM_CARD_TIMEOUT_MS = 5000;

/** ESPN's team logo, resized by their CDN (the 500px original is ~30KB) */
export function espnLogoUrl(espnTeamId: string | null | undefined): string | null {
  return espnTeamId
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/${espnTeamId}.png&w=160&h=160`
    : null;
}

/** ESPN's game page (gamecast before kickoff, box score after) */
export function espnGameUrl(eventId: string): string | null {
  return /^\d+$/.test(eventId)
    ? `https://www.espn.com/college-football/game/_/gameId/${eventId}`
    : null;
}

export interface EspnScheduleGame {
  espnEventId: string;
  weekNumber: number;
  startTime: Date;
  timeTbd: boolean; // ESPN has the date but no kickoff time yet
  status: ParsedGame['status'];
  statusDetail: string | null; // ESPN's short status, e.g. "Final/OT", "Q3 4:12"
  isHome: boolean;
  neutralSite: boolean;
  teamScore: number | null;
  teamWon: boolean | null; // null until final
  teamRank: number | null; // AP/CFP rank going into the game (null = unranked)
  opponent: {
    espnId: string;
    name: string;
    abbreviation: string | null;
    rank: number | null;
    record: string | null;
  };
  opponentScore: number | null;
  venue: string | null;
  broadcast: string | null;
}

export interface EspnTeamSchedule {
  color: string | null; // hex without '#'
  record: string | null; // overall W-L this season
  standing: string | null; // e.g. "1st in SEC"
  clubhouseUrl: string | null;
  games: EspnScheduleGame[];
}

// Schedule scores are { value, displayValue }; scoreboard scores are strings
function scheduleScore(score: any): number | null {
  const value = typeof score === 'object' && score !== null ? score.value : parseInt(score, 10);
  return typeof value === 'number' && !isNaN(value) ? value : null;
}

// ESPN's curatedRank: 1-25, or 99 for unranked
function curatedRank(competitor: any): number | null {
  const rank = competitor?.curatedRank?.current;
  return typeof rank === 'number' && rank >= 1 && rank <= 25 ? rank : null;
}

/**
 * One team's regular season from ESPN's team schedule: every game (played
 * and upcoming) with live/final scores, kickoff, TV and the opponent's rank
 * and record, plus the team's color, record and conference standing.
 * Display data only: the stored line, upset flag and points stay in Game
 * rows (teamCardService merges the two).
 */
export async function fetchTeamSchedule(
  espnTeamId: string,
  seasonYear: number
): Promise<EspnTeamSchedule> {
  const url = `${ESPN_BASE_URL}/teams/${espnTeamId}/schedule?season=${seasonYear}&seasontype=2`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TEAM_CARD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`ESPN team schedule error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const team = data.team || {};
  // The team block always describes ESPN's current season, whatever season
  // was asked for: only trust its record for the requested one
  const sameSeason = String(team.seasonSummary || '') === String(seasonYear);

  const games: EspnScheduleGame[] = [];
  for (const event of data.events || []) {
    if (event.season?.year !== undefined && event.season.year !== seasonYear) continue;
    const competition = event.competitions?.[0];
    const competitors: any[] = competition?.competitors || [];
    const me = competitors.find((c) => String(c.team?.id) === espnTeamId);
    const opp = competitors.find((c) => c !== me);
    if (!competition || !me || !opp) continue;

    const type = competition.status?.type || {};
    const name = String(type.name || '').toLowerCase();
    let status: ParsedGame['status'] = 'scheduled';
    if (name.includes('postponed')) status = 'postponed';
    else if (name.includes('canceled') || name.includes('cancelled')) status = 'cancelled';
    else if (type.state === 'post' || type.completed) status = 'final';
    else if (type.state === 'in') status = 'in_progress';

    const scored = status === 'final' || status === 'in_progress';
    const broadcast = competition.broadcasts?.[0];

    games.push({
      espnEventId: String(event.id),
      weekNumber: event.week?.number ?? 0,
      startTime: new Date(event.date),
      timeTbd: event.timeValid === false,
      status,
      statusDetail: type.shortDetail || null,
      isHome: me.homeAway === 'home',
      neutralSite: competition.neutralSite === true,
      teamScore: scored ? scheduleScore(me.score) : null,
      teamWon: status === 'final' && (me.winner === true || opp.winner === true) ? me.winner === true : null,
      teamRank: curatedRank(me),
      opponent: {
        espnId: String(opp.team?.id ?? ''),
        name: opp.team?.location || opp.team?.shortDisplayName || opp.team?.displayName || 'TBD',
        abbreviation: opp.team?.abbreviation || null,
        rank: curatedRank(opp),
        record: (opp.record || []).find((r: any) => r.type === 'total')?.displayValue || null,
      },
      opponentScore: scored ? scheduleScore(opp.score) : null,
      venue: competition.venue?.fullName || null,
      broadcast: broadcast?.media?.shortName || broadcast?.names?.[0] || null,
    });
  }

  return {
    color: /^[0-9a-f]{6}$/i.test(team.color || '') ? team.color : null,
    record: sameSeason ? team.recordSummary || null : null,
    standing: sameSeason ? team.standingSummary || null : null,
    clubhouseUrl: team.clubhouse || null,
    games,
  };
}

export interface EspnHeadline {
  headline: string;
  url: string;
  published: string; // ISO timestamp
  type: string; // Story, HeadlineNews, Recap, Preview or Media (video)
}

const HEADLINE_TYPES = new Set(['Story', 'HeadlineNews', 'Recap', 'Preview', 'Media']);

/**
 * A team's latest ESPN headlines, newest first. The team feed mixes in
 * league-wide roundups (Bubble Watch, Power Rankings) tagged with dozens of
 * teams, so stories about this team (4 or fewer teams tagged) win whenever
 * there are enough of them.
 */
export async function fetchTeamNews(espnTeamId: string, limit = 6): Promise<EspnHeadline[]> {
  const url = `${ESPN_BASE_URL}/news?team=${espnTeamId}&limit=40`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TEAM_CARD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`ESPN news error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const tagged = (data.articles || [])
    .map((article: any) => ({
      article,
      teams: new Set(
        (article.categories || [])
          .filter((c: any) => c.type === 'team')
          .map((c: any) => String(c.teamId ?? c.team?.id ?? ''))
      ),
      href: article.links?.web?.href as string | undefined,
    }))
    .filter(
      ({ article, teams, href }: any) =>
        HEADLINE_TYPES.has(article.type) && article.headline && href && teams.has(espnTeamId)
    )
    .sort((a: any, b: any) => String(b.article.published).localeCompare(String(a.article.published)));

  const aboutTeam = tagged.filter(({ teams }: any) => teams.size <= 4);
  return (aboutTeam.length >= 3 ? aboutTeam : tagged).slice(0, limit).map(({ article, href }: any) => ({
    headline: article.headline,
    url: href!.replace(/^http:\/\//, 'https://'),
    published: article.published,
    type: article.type,
  }));
}

/**
 * ESPN's Matchup Predictor (pre-game win %, keyed by ESPN team id), from
 * the game summary. null after kickoff or when ESPN has none (FCS games).
 */
export async function fetchMatchupPredictor(eventId: string): Promise<Record<string, number> | null> {
  const summary = await fetchGameSummary(eventId, TEAM_CARD_TIMEOUT_MS);
  const pct: Record<string, number> = {};
  for (const side of [summary?.predictor?.homeTeam, summary?.predictor?.awayTeam]) {
    const value = parseFloat(side?.gameProjection);
    if (side?.id && !isNaN(value)) pct[String(side.id)] = value;
  }
  return Object.keys(pct).length === 2 ? pct : null;
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

  // Hard timeout: autopick calls this while a player's clock sits at 0:00 —
  // a slow ESPN response must fail fast so autopick falls back to random.
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

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
 * Get a map of ESPN team ID to rank (for quick lookups).
 * Cached for 10 minutes — rankings change weekly, and autopick must never
 * wait on a live ESPN round-trip.
 */
export async function getRankingsMap(): Promise<Map<string, number>> {
  const cacheService = (await import('./cacheService')).default;
  const cacheKey = 'espn:rankings:map';

  const cached = cacheService.get<Map<string, number>>(cacheKey);
  if (cached) {
    return cached;
  }

  const rankings = await fetchRankings();
  const map = new Map<string, number>();

  for (const team of rankings.teams) {
    if (team.teamId) {
      map.set(team.teamId, team.rank);
    }
  }

  cacheService.set(cacheKey, map, 600);
  return map;
}
