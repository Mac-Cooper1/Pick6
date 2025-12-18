import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  User,
  League,
  CreateLeagueData,
  JoinLeagueData,
  Team,
  DraftPick,
  DraftPickRequest,
  LeagueMember,
  Standing,
  GameResult,
  GameResultRequest,
  ErrorResponse,
} from '../types';

// In development, use relative URL so Vite proxy works
// In production, use the full API_URL from environment
const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  : '';

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
      // Clear token and redirect to login
      localStorage.removeItem('pick6_token');
      localStorage.removeItem('pick6_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: async (name: string, email: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', { name, email });
    return data;
  },

  login: async (email: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email });
    return data;
  },

  getCurrentUser: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me');
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
  members: Array<{ id: number; name: string; role: string }>;
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
    draftType?: 'SNAKE' | 'LINEAR';
  }): Promise<any> => {
    const { data } = await api.patch(`/leagues/${leagueId}/settings`, settings);
    return data;
  },
};

// Draft API
export const draftApi = {
  getAllTeams: async (): Promise<Team[]> => {
    const { data } = await api.get<Team[]>('/draft/teams');
    return data;
  },

  getDraftPicks: async (leagueId: number): Promise<DraftPick[]> => {
    const { data } = await api.get<DraftPick[]>(`/draft/${leagueId}/picks`);
    return data;
  },

  draftTeam: async (leagueId: number, pickData: DraftPickRequest): Promise<DraftPick> => {
    const { data } = await api.post<DraftPick>(`/draft/${leagueId}/pick`, pickData);
    return data;
  },

  getAvailableTeams: async (leagueId: number): Promise<Team[]> => {
    const { data } = await api.get<Team[]>(`/draft/${leagueId}/available`);
    return data;
  },
};

// Standings API
export const standingsApi = {
  getWeeklyStandings: async (leagueId: number, weekNumber: number): Promise<Standing[]> => {
    const { data } = await api.get<Standing[]>(`/standings/${leagueId}/week/${weekNumber}`);
    return data;
  },

  getOverallStandings: async (leagueId: number): Promise<Standing[]> => {
    const { data} = await api.get<Standing[]>(`/standings/${leagueId}/overall`);
    return data;
  },
};

// Admin API
export const adminApi = {
  enterGameResult: async (resultData: GameResultRequest): Promise<GameResult> => {
    const { data } = await api.post<GameResult>('/admin/game-result', resultData);
    return data;
  },

  calculateWeeklyScores: async (leagueId: number, weekNumber: number): Promise<any> => {
    const { data } = await api.post(`/admin/calculate-scores/${leagueId}/${weekNumber}`);
    return data;
  },

  getGameResults: async (weekNumber: number): Promise<GameResult[]> => {
    const { data } = await api.get<GameResult[]>(`/admin/game-results/${weekNumber}`);
    return data;
  },

  syncWeek: async (leagueId: number, weekNumber: number, seasonYear?: number): Promise<any> => {
    const url = seasonYear
      ? `/admin/sync-week/${leagueId}/${weekNumber}?seasonYear=${seasonYear}`
      : `/admin/sync-week/${leagueId}/${weekNumber}`;
    const { data } = await api.post(url);
    return data;
  },
};

// Roster & Waiver API
export interface RosterTeam {
  teamId: number;
  teamName: string;
  conference: string;
  abbreviation?: string;
  acquiredVia: 'DRAFT' | 'WAIVER' | 'FREE_AGENT' | 'AUCTION';
  acquiredAt: string;
}

export interface WaiverClaim {
  id: number;
  leagueId: number;
  userId: number;
  addTeamId: number;
  dropTeamId: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELLED';
  priority: number;
  createdAt: string;
  processedAt?: string;
  rejectionReason?: string;
}

export interface WaiverPriority {
  userId: number;
  userName: string;
  totalPoints: number;
  priority: number;
}

export const rosterApi = {
  getMyRoster: async (leagueId: number): Promise<RosterTeam[]> => {
    const { data } = await api.get<RosterTeam[]>(`/rosters/${leagueId}/my`);
    return data;
  },

  getAllRosters: async (leagueId: number): Promise<Array<{ userId: number; userName: string; roster: RosterTeam[] }>> => {
    const { data } = await api.get(`/rosters/${leagueId}`);
    return data;
  },

  getAvailableTeams: async (leagueId: number): Promise<Team[]> => {
    const { data } = await api.get<Team[]>(`/rosters/${leagueId}/available`);
    return data;
  },

  getWaiverPriority: async (leagueId: number): Promise<WaiverPriority[]> => {
    const { data } = await api.get<WaiverPriority[]>(`/rosters/${leagueId}/waiver-priority`);
    return data;
  },

  getMyClaims: async (leagueId: number): Promise<WaiverClaim[]> => {
    const { data } = await api.get<WaiverClaim[]>(`/rosters/${leagueId}/waivers/my`);
    return data;
  },

  submitClaim: async (leagueId: number, addTeamId: number, dropTeamId: number): Promise<WaiverClaim> => {
    const { data } = await api.post<WaiverClaim>(`/rosters/${leagueId}/waivers`, { addTeamId, dropTeamId });
    return data;
  },

  cancelClaim: async (leagueId: number, claimId: number): Promise<WaiverClaim> => {
    const { data } = await api.delete<WaiverClaim>(`/rosters/${leagueId}/waivers/${claimId}`);
    return data;
  },

  addFreeAgent: async (leagueId: number, addTeamId: number, dropTeamId: number): Promise<any> => {
    const { data } = await api.post(`/rosters/${leagueId}/free-agent`, { addTeamId, dropTeamId });
    return data;
  },
};

// Draft enhanced API
export const draftEnhancedApi = {
  getDraftState: async (leagueId: number): Promise<any> => {
    const { data } = await api.get(`/draft/${leagueId}/state`);
    return data;
  },

  startDraft: async (leagueId: number): Promise<any> => {
    const { data } = await api.post(`/draft/${leagueId}/start`);
    return data;
  },

  getQueue: async (leagueId: number): Promise<any[]> => {
    const { data } = await api.get(`/draft/${leagueId}/queue`);
    return data;
  },

  setQueue: async (leagueId: number, teamIds: number[]): Promise<any[]> => {
    const { data } = await api.put(`/draft/${leagueId}/queue`, { teamIds });
    return data;
  },

  addToQueue: async (leagueId: number, teamId: number): Promise<any> => {
    const { data } = await api.post(`/draft/${leagueId}/queue/${teamId}`);
    return data;
  },

  removeFromQueue: async (leagueId: number, teamId: number): Promise<void> => {
    await api.delete(`/draft/${leagueId}/queue/${teamId}`);
  },
};

// CFB Scoreboard API
export interface CFBGame {
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
  startTime: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  isCompleted: boolean;
  winnerId: string | null;
}

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
  getScoreboard: async (week?: number, season?: number): Promise<{ games: CFBGame[]; cached: boolean }> => {
    const params = new URLSearchParams();
    if (week) params.set('week', week.toString());
    if (season) params.set('season', season.toString());
    const { data } = await api.get(`/cfb/scoreboard?${params.toString()}`);
    return data;
  },

  getSchedule: async (week: number, season?: number): Promise<{ games: CFBGame[]; cached: boolean }> => {
    const params = new URLSearchParams();
    params.set('week', week.toString());
    if (season) params.set('season', season.toString());
    const { data } = await api.get(`/cfb/schedule?${params.toString()}`);
    return data;
  },

  getGame: async (eventId: string): Promise<any> => {
    const { data } = await api.get(`/cfb/game/${eventId}`);
    return data;
  },

  getRankings: async (): Promise<RankingsResponse> => {
    const { data } = await api.get<RankingsResponse>('/cfb/rankings');
    return data;
  },
};

// Odds API
export interface GameOdds {
  oddsEventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  spread: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  favoriteTeam: 'home' | 'away' | null;
  bookmaker: string | null;
}

export const oddsApi = {
  getNCAAFOdds: async (): Promise<{ games: GameOdds[]; cached: boolean }> => {
    const { data } = await api.get('/odds/ncaaf');
    return data;
  },

  getGameOdds: async (homeTeam: string, awayTeam: string): Promise<GameOdds> => {
    const { data } = await api.get(`/odds/ncaaf/game/${encodeURIComponent(homeTeam)}/${encodeURIComponent(awayTeam)}`);
    return data;
  },

  getStatus: async (): Promise<{ configured: boolean; cacheTTL: number; cachedGames: boolean }> => {
    const { data } = await api.get('/odds/status');
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
  getMyMatchups: async (leagueId: number, week?: number): Promise<TeamMatchup[]> => {
    const params = week ? `?week=${week}` : '';
    const { data } = await api.get<TeamMatchup[]>(`/rosters/${leagueId}/matchups${params}`);
    return data;
  },

  getAllMatchups: async (leagueId: number, week?: number): Promise<Array<{ userId: number; userName: string; matchups: TeamMatchup[] }>> => {
    const params = week ? `?week=${week}` : '';
    const { data } = await api.get(`/rosters/${leagueId}/matchups/all${params}`);
    return data;
  },
};

// Auction API
export interface AuctionBid {
  id: number;
  addTeamId: number;
  dropTeamId: number;
  amount: number;
  status: 'ACTIVE' | 'OUTBID' | 'WON' | 'LOST' | 'CANCELLED';
  createdAt: string;
}

export interface AuctionTeamHighBid {
  teamId: number;
  highBid: number;
  bidCount: number;
}

export interface AuctionAvailableTeam {
  id: number;
  name: string;
  abbreviation: string | null;
  conference: string;
  isLocked: boolean;
  kickoffTime: string | null;
}

export interface AuctionState {
  hasAuction: boolean;
  id?: number;
  leagueId?: number;
  weekNumber?: number;
  opensAt?: string;
  closesAt?: string;
  status?: 'SCHEDULED' | 'OPEN' | 'FINALIZING' | 'COMPLETE';
  myBudgetRemaining?: number;
  myBids?: AuctionBid[];
  teamHighBids?: AuctionTeamHighBid[];
}

export interface AuctionResult {
  teamId: number;
  teamName: string;
  winnerId: number;
  winnerName: string;
  amount: number;
  droppedTeamId: number;
}

export const auctionApi = {
  getAuctionState: async (leagueId: number): Promise<AuctionState> => {
    const { data } = await api.get<AuctionState>(`/auction/${leagueId}`);
    return data;
  },

  createAuction: async (
    leagueId: number,
    weekNumber: number,
    opensAt: string,
    closesAt: string
  ): Promise<any> => {
    const { data } = await api.post(`/auction/${leagueId}/create`, {
      weekNumber,
      opensAt,
      closesAt,
    });
    return data;
  },

  deleteAuction: async (leagueId: number): Promise<any> => {
    const { data } = await api.delete(`/auction/${leagueId}`);
    return data;
  },

  openAuction: async (leagueId: number): Promise<any> => {
    const { data } = await api.post(`/auction/${leagueId}/open`);
    return data;
  },

  placeBid: async (
    leagueId: number,
    addTeamId: number,
    dropTeamId: number,
    amount: number
  ): Promise<AuctionBid> => {
    const { data } = await api.post<AuctionBid>(`/auction/${leagueId}/bid`, {
      addTeamId,
      dropTeamId,
      amount,
    });
    return data;
  },

  cancelBid: async (leagueId: number, bidId: number): Promise<AuctionBid> => {
    const { data } = await api.post<AuctionBid>(`/auction/${leagueId}/cancel-bid`, { bidId });
    return data;
  },

  finalizeAuction: async (leagueId: number): Promise<{ message: string; results: AuctionResult[] }> => {
    const { data } = await api.post(`/auction/${leagueId}/finalize`);
    return data;
  },

  getAvailableTeams: async (leagueId: number): Promise<AuctionAvailableTeam[]> => {
    const { data } = await api.get<AuctionAvailableTeam[]>(`/auction/${leagueId}/available-teams`);
    return data;
  },

  getHighBids: async (leagueId: number): Promise<AuctionTeamHighBid[]> => {
    const { data } = await api.get<AuctionTeamHighBid[]>(`/auction/${leagueId}/high-bids`);
    return data;
  },

  getMyBids: async (leagueId: number): Promise<AuctionBid[]> => {
    const { data } = await api.get<AuctionBid[]>(`/auction/${leagueId}/my-bids`);
    return data;
  },

  getMyRoster: async (leagueId: number): Promise<RosterTeam[]> => {
    const { data } = await api.get<RosterTeam[]>(`/auction/${leagueId}/my-roster`);
    return data;
  },
};

export default api;
