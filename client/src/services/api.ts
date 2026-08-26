import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  User,
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
  }): Promise<any> => {
    const { data } = await api.patch(`/leagues/${leagueId}/settings`, settings);
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

  getDraftState: async (leagueId: number): Promise<any> => {
    const { data } = await api.get(`/draft/${leagueId}/state`);
    return data;
  },

  getQueue: async (leagueId: number): Promise<any[]> => {
    const { data } = await api.get(`/draft/${leagueId}/queue`);
    return data;
  },
};

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
  opponent: string | null;
  result: 'W' | 'L' | 'pending' | 'none';
  scoreLine: string | null;
  points: number;
  wasUpset: boolean;
  teamSpread: number | null;
  gameStatus: string | null;
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

// Week-5 swap API
export interface SwapState {
  status: 'NOT_OPEN' | 'OPEN' | 'CLOSED';
  turnDeadline: string | null;
  onTheClockUserId: number | null;
  freePhase: boolean;
  order: Array<{
    userId: number;
    userName: string;
    swapOrder: number | null;
    swapUsed: boolean;
    swapSkipped: boolean;
  }>;
}

export const swapApi = {
  getState: async (leagueId: number): Promise<SwapState> => {
    const { data } = await api.get<SwapState>(`/leagues/${leagueId}/swap`);
    return data;
  },

  swap: async (leagueId: number, dropTeamId: number, addTeamId: number): Promise<any> => {
    const { data } = await api.post(`/leagues/${leagueId}/swap`, { dropTeamId, addTeamId });
    return data;
  },

  pass: async (leagueId: number): Promise<SwapState> => {
    const { data } = await api.post<SwapState>(`/leagues/${leagueId}/swap/pass`);
    return data;
  },

  open: async (leagueId: number): Promise<SwapState> => {
    const { data } = await api.post<SwapState>(`/leagues/${leagueId}/swap/open`);
    return data;
  },

  close: async (leagueId: number): Promise<SwapState> => {
    const { data } = await api.post<SwapState>(`/leagues/${leagueId}/swap/close`);
    return data;
  },
};

// Admin API (commissioner sync controls)
export const adminApi = {
  syncWeek: async (leagueId: number, weekNumber: number, seasonYear?: number): Promise<any> => {
    const url = seasonYear
      ? `/admin/sync-week/${leagueId}/${weekNumber}?seasonYear=${seasonYear}`
      : `/admin/sync-week/${leagueId}/${weekNumber}`;
    const { data } = await api.post(url);
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

  getAvailableTeams: async (leagueId: number): Promise<Team[]> => {
    const { data } = await api.get<Team[]>(`/rosters/${leagueId}/available`);
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
  getAllMatchups: async (leagueId: number, week?: number): Promise<Array<{ userId: number; userName: string; matchups: TeamMatchup[] }>> => {
    const params = week ? `?week=${week}` : '';
    const { data } = await api.get(`/rosters/${leagueId}/matchups/all${params}`);
    return data;
  },
};

export default api;
