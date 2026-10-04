import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  User,
  ConferenceSlot,
  League,
  CreateLeagueData,
  JoinLeagueData,
  Team,
  DraftPick,
  LeagueMember,
  MemberRoster,
  RosterEntry,
  Standing,
  ErrorResponse,
} from '../types';
import type { DraftState } from './socket';

// Same-origin by default: in dev the Vite proxy forwards /api, and in
// production the Express server serves this bundle itself (single-service
// deploy). VITE_API_URL exists only as an override for split deployments.
const API_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance
const api = axios.create({
  baseURL: API_URL ? `${API_URL}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pick6_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorResponse>) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login, remembering where the user was
      // so signing back in returns them there (e.g. a shared join link)
      localStorage.removeItem('pick6_token');
      localStorage.removeItem('pick6_user');
      if (window.location.pathname !== '/login') {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
    }
    return Promise.reject(error);
  }
);

/** The server's message for a failed API call (its ErrorResponse), else the fallback */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return (axios.isAxiosError<ErrorResponse>(err) && err.response?.data?.message) || fallback;
}

/** The HTTP status of a failed API call, if it got a response */
export function apiErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

// Auth API
export const authApi = {
  register: async (name: string, email: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', { name, email, password });
    return data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    return data;
  },

  getCurrentUser: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },

  updateMe: async (name: string): Promise<User> => {
    const { data } = await api.patch<User>('/auth/me', { name });
    return data;
  },

  // Always the same reply, whether or not the email has an account
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/reset-password', { token, password });
    return data;
  },
};

// My Leagues response type
export interface MyLeague {
  id: number;
  name: string;
  joinCode: string;
  memberCount: number;
  maxPlayers: number;
  seasonYear: number;
  currentWeek: number;
  draftStatus: 'NOT_STARTED' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETE';
  draftScheduledAt: string | null;
  draftComplete: boolean;
  isCommissioner: boolean;
  userStats: {
    totalPoints: number;
    rank: number | null;
    totalMembers: number;
  };
  members: Array<{ id: number; name: string; role: string; draftPosition: number | null }>;
}

// PATCH /leagues/:id/settings response
export interface LeagueSettingsResult {
  id: number;
  name: string;
  draftScheduledAt: string | null;
  draftStatus: MyLeague['draftStatus'];
  pickDeadlineSeconds: number;
  memberOrder: Array<{ userId: number; draftPosition: number }> | null;
}

// League API
export const leagueApi = {
  createLeague: async (leagueData: CreateLeagueData): Promise<League> => {
    const { data } = await api.post<League>('/leagues/create', leagueData);
    return data;
  },

  joinLeague: async (joinData: JoinLeagueData): Promise<League> => {
    const { data } = await api.post<League>('/leagues/join', joinData);
    return data;
  },

  getLeague: async (leagueId: number): Promise<League> => {
    const { data } = await api.get<League>(`/leagues/${leagueId}`);
    return data;
  },

  getLeagueMembers: async (leagueId: number): Promise<LeagueMember[]> => {
    const { data } = await api.get<LeagueMember[]>(`/leagues/${leagueId}/members`);
    return data;
  },

  getMyLeagues: async (): Promise<MyLeague[]> => {
    const { data } = await api.get<MyLeague[]>('/leagues/my');
    return data;
  },

  updateSettings: async (leagueId: number, settings: {
    draftScheduledAt?: string | null;
    pickDeadlineSeconds?: number;
    draftOrder?: number[] | 'randomize';
  }): Promise<LeagueSettingsResult> => {
    const { data } = await api.patch<LeagueSettingsResult>(`/leagues/${leagueId}/settings`, settings);
    return data;
  },
};

// Draft API
export const draftApi = {
  getDraftPicks: async (leagueId: number): Promise<DraftPick[]> => {
    const { data } = await api.get<DraftPick[]>(`/draft/${leagueId}/picks`);
    return data;
  },

  getAvailableTeams: async (leagueId: number): Promise<Team[]> => {
    const { data } = await api.get<Team[]>(`/draft/${leagueId}/available`);
    return data;
  },

  getDraftState: async (leagueId: number): Promise<DraftState> => {
    const { data } = await api.get<DraftState>(`/draft/${leagueId}/state`);
    return data;
  },

  getQueue: async (leagueId: number): Promise<DraftQueueEntry[]> => {
    const { data } = await api.get<DraftQueueEntry[]>(`/draft/${leagueId}/queue`);
    return data;
  },
};

// A team on your draft queue (GET /draft/:id/queue), first choice first
export interface DraftQueueEntry {
  teamId: number;
  teamName: string;
  conference: string;
  slot: ConferenceSlot;
  priority: number;
}

// Standings API
export interface SeasonGridWeek {
  weekNumber: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface SeasonGridRow {
  rank: number;
  userId: number;
  userName: string;
  byWeek: Record<number, number>;
  total: number;
}

export interface SeasonGrid {
  seasonYear: number;
  currentWeek: number;
  weeks: SeasonGridWeek[];
  rows: SeasonGridRow[];
}

export interface WeekDetailTeam {
  slot: string;
  slotLabel: string;
  teamId: number;
  teamName: string;
  fromWeek: number; // > 1 = added in the week-6 swap
  espnEventId: string | null; // null on a bye
  opponent: string | null;
  result: 'W' | 'L' | 'pending' | 'none';
  scoreLine: string | null;
  points: number;
  wasUpset: boolean;
  teamSpread: number | null;
  gameStatus: string | null;
  // ESPN week the game was played in; differs from the viewed week when a
  // double-game (ESPN's two-weekend Week 1) rolled forward into a bye week
  playedWeek: number | null;
}

export interface WeekDetailMember {
  userId: number;
  userName: string;
  weekTotal: number;
  teams: WeekDetailTeam[];
}

export const standingsApi = {
  getWeeklyStandings: async (leagueId: number, weekNumber: number): Promise<Standing[]> => {
    const { data } = await api.get<Standing[]>(`/standings/${leagueId}/week/${weekNumber}`);
    return data;
  },

  getOverallStandings: async (leagueId: number): Promise<Standing[]> => {
    const { data } = await api.get<Standing[]>(`/standings/${leagueId}/overall`);
    return data;
  },

  getSeasonGrid: async (leagueId: number): Promise<SeasonGrid> => {
    const { data } = await api.get<SeasonGrid>(`/standings/${leagueId}/weeks`);
    return data;
  },

  getWeekDetail: async (
    leagueId: number,
    weekNumber: number
  ): Promise<{ weekNumber: number; members: WeekDetailMember[] }> => {
    const { data } = await api.get(`/standings/${leagueId}/week/${weekNumber}/detail`);
    return data;
  },
};

// Week-6 swap API
export interface SwapLine {
  dropTeamId: number;
  addTeamId: number;
}

export interface SwapClaim extends SwapLine {
  priority: number;
  slot: ConferenceSlot;
  slotLabel: string;
  dropTeamName: string;
  addTeamName: string;
  // PENDING until the run, then how this line went
  status: 'PENDING' | 'SWAPPED' | 'MISSED' | 'UNUSED';
  note: string | null;
}

export interface SwapState {
  swapWeek: number;
  // upcoming: before week 5 · open: lists editable (week 5) · locked: week 6
  // started, waiting for the sync to run it · complete: ran
  phase: 'upcoming' | 'open' | 'locked' | 'complete';
  opensAt: string;
  locksAt: string;
  ranAt: string | null;
  maxClaims: number;
  swapUsed: boolean;
  // Projected from current standings until the run, then the run's order
  // (points and SOS as they were when it ran)
  order: Array<{
    position: number;
    userId: number;
    userName: string;
    points: number;
    sosTotal: number; // tiebreaker: lower combined SOS rank ranks higher
    swapUsed: boolean;
    listSize: number | null; // after the run only
    swap: {
      slotLabel: string;
      dropTeamName: string;
      addTeamName: string;
      choice: number; // which line of their list went through
    } | null;
  }>;
  myClaims: SwapClaim[];
}

// A team on the swap page's board: its Pick 6 season, whoever owned it
export interface SwapTeam {
  teamId: number;
  name: string;
  conference: string;
  slot: ConferenceSlot;
  slotLabel: string;
  points: number;
  wins: number;
  losses: number;
}

export const swapApi = {
  getState: async (leagueId: number): Promise<SwapState> => {
    const { data } = await api.get<SwapState>(`/leagues/${leagueId}/swap`);
    return data;
  },

  // Unowned teams (most Pick 6 points first) plus your own five
  getTeams: async (leagueId: number): Promise<{ available: SwapTeam[]; mine: SwapTeam[] }> => {
    const { data } = await api.get(`/leagues/${leagueId}/swap/teams`);
    return data;
  },

  // Replaces your whole list; first line = first choice
  saveClaims: async (leagueId: number, claims: SwapLine[]): Promise<SwapState> => {
    const { data } = await api.put<SwapState>(`/leagues/${leagueId}/swap/claims`, { claims });
    return data;
  },
};

// POST /admin/sync-week response (Settings' Sync Now)
export interface SyncWeekResult {
  success: boolean;
  leagueId: number;
  weekNumber: number;
  seasonYear: number;
  gamesCreated: number;
  gamesUpdated: number;
  oddsUpdated: number;
  scoresCalculated: number;
  errors: string[];
}

// Admin API (commissioner sync controls)
export const adminApi = {
  syncWeek: async (leagueId: number, weekNumber: number, seasonYear?: number): Promise<SyncWeekResult> => {
    const url = seasonYear
      ? `/admin/sync-week/${leagueId}/${weekNumber}?seasonYear=${seasonYear}`
      : `/admin/sync-week/${leagueId}/${weekNumber}`;
    const { data } = await api.post<SyncWeekResult>(url);
    return data;
  },
};

// Roster API (slot-based rosters)
export const rosterApi = {
  getMyRoster: async (leagueId: number): Promise<RosterEntry[]> => {
    const { data } = await api.get<RosterEntry[]>(`/rosters/${leagueId}/my`);
    return data;
  },

  getAllRosters: async (leagueId: number): Promise<MemberRoster[]> => {
    const { data } = await api.get<MemberRoster[]>(`/rosters/${leagueId}`);
    return data;
  },
};

// Rankings API
export interface RankedTeam {
  rank: number;
  teamId: string;
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
  cached: boolean;
}

export const cfbApi = {
  getRankings: async (): Promise<RankingsResponse> => {
    const { data } = await api.get<RankingsResponse>('/cfb/rankings');
    return data;
  },
};

// Matchup API (roster teams with odds)
export interface TeamMatchup {
  teamId: number;
  teamName: string;
  abbreviation: string | null;
  slot: ConferenceSlot;
  fromWeek: number;
  seasonPoints: number;
  game: {
    espnEventId: string;
    opponent: string;
    opponentAbbreviation: string;
    startTime: string;
    isHomeTeam: boolean;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    venue: string | null;
    broadcast: string | null;
    playedWeek: number;
  } | null;
  odds: {
    spread: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
    bookmaker: string | null;
    isHomeTeam: boolean;
    teamSpread: number | null;
    teamMoneyline: number | null;
  } | null;
}

export const matchupApi = {
  getMyMatchups: async (leagueId: number, week?: number, userId?: number): Promise<TeamMatchup[]> => {
    const params = new URLSearchParams();
    if (week) params.set('week', String(week));
    if (userId) params.set('userId', String(userId));
    const qs = params.toString();
    const { data } = await api.get(`/rosters/${leagueId}/matchups${qs ? `?${qs}` : ''}`);
    return data;
  },

  getAllMatchups: async (leagueId: number, week?: number): Promise<Array<{ userId: number; userName: string; matchups: TeamMatchup[] }>> => {
    const params = week ? `?week=${week}` : '';
    const { data } = await api.get(`/rosters/${leagueId}/matchups/all${params}`);
    return data;
  },
};

// Team card (tap a team on My Team or Week by Week)
export interface TeamCardGame {
  espnEventId: string;
  week: number; // the Pick 6 week it counts in
  playedWeek: number; // ESPN week; differs when a double-game rolled forward
  startTime: string;
  timeTbd: boolean;
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'cancelled';
  statusDetail: string | null; // ESPN's short status, e.g. "Q3 4:12"
  isHome: boolean;
  neutralSite: boolean;
  teamRank: number | null; // AP/CFP rank going into the game
  opponent: {
    name: string;
    abbreviation: string | null;
    logo: string | null;
    rank: number | null;
    record: string | null;
  };
  teamScore: number | null;
  opponentScore: number | null;
  result: 'W' | 'L' | null;
  teamSpread: number | null; // stored line, team-relative (+ = underdog)
  wasUpset: boolean;
  points: number | null; // null until scored
  counted: boolean; // false = outside the owner's roster window (the swap)
  venue: string | null;
  broadcast: string | null;
  espnUrl: string | null;
  live: TeamCardLive | null; // only while the game is in progress
}

// Where the ball is, from this team's side of the field
export interface TeamCardLive {
  possession: 'team' | 'opponent' | null; // null: kickoff, timeout, break
  ballOn: number | null; // yards from this team's own goal line (0-100)
  downDistance: string | null; // ESPN's text, e.g. "3rd & 6 at NE 15"
  redZone: boolean;
}

export interface TeamHeadline {
  headline: string;
  url: string;
  published: string;
  type: string; // Story, HeadlineNews, Recap, Preview or Media (video)
}

export interface TeamCardData {
  seasonYear: number;
  currentWeek: number;
  lastWeek: number;
  team: {
    teamId: number;
    name: string;
    abbreviation: string | null;
    conference: string;
    slot: ConferenceSlot;
    slotLabel: string;
    logo: string | null;
    color: string | null; // ESPN hex, no '#'
    record: string | null;
    standing: string | null;
    apRank: number | null;
    sosRank: number | null; // ESPN FPI strength of schedule, 1 = hardest
    sosOutOf: number | null;
    espnUrl: string | null;
  };
  owner: { userId: number; userName: string; fromWeek: number; toWeek: number | null } | null;
  pick6: { points: number; wins: number; losses: number; ownerPoints: number | null };
  games: TeamCardGame[];
  previewEventId: string | null;
  predictor: { teamWinPct: number; opponentWinPct: number } | null;
  news: TeamHeadline[];
}

export const teamApi = {
  // eventId = the tapped game; userId = whose roster it was tapped on
  getTeamCard: async (
    leagueId: number,
    teamId: number,
    { eventId, userId }: { eventId?: string | null; userId?: number } = {}
  ): Promise<TeamCardData> => {
    const params = new URLSearchParams();
    if (eventId) params.set('event', eventId);
    if (userId) params.set('userId', String(userId));
    const qs = params.toString();
    const { data } = await api.get<TeamCardData>(`/rosters/${leagueId}/teams/${teamId}${qs ? `?${qs}` : ''}`);
    return data;
  },
};

export default api;
