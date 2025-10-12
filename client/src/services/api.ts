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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance
const api = axios.create({
  baseURL: `${API_URL}/api`,
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
};

export default api;
