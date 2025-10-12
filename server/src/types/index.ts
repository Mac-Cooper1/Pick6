import { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

export interface CreateLeagueRequest {
  name: string;
  maxPlayers: number;
  password: string;
  customJoinCode?: string;
}

export interface JoinLeagueRequest {
  joinCode: string;
  password: string;
}

export interface DraftPickRequest {
  teamId: number;
}

export interface GameResultRequest {
  teamId: number;
  weekNumber: number;
  opponent: string;
  result: 'win' | 'loss';
  wasUpset: boolean;
  gameDate: string;
}
