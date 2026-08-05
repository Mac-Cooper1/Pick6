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
  customJoinCode?: string;
}

export interface JoinLeagueRequest {
  joinCode: string;
}
