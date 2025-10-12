// User types
export interface User {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// League types
export interface League {
  id: number;
  name: string;
  joinCode: string;
  maxPlayers: number;
  draftComplete: boolean;
  memberCount?: number;
}

export interface CreateLeagueData {
  name: string;
  maxPlayers: number;
  password: string;
  customJoinCode?: string;
}

export interface JoinLeagueData {
  joinCode: string;
  password: string;
}

// Team types
export interface Team {
  id: number;
  name: string;
  conference: string;
}

// Draft types
export interface DraftPick {
  id: number;
  pickNumber: number;
  round: number;
  user: {
    id: number;
    name: string;
  };
  team: Team;
}

export interface DraftPickRequest {
  teamId: number;
}

// League member with teams
export interface LeagueMember {
  id: number;
  name: string;
  email: string;
  joinedAt: string;
  teams: TeamWithPickInfo[];
}

export interface TeamWithPickInfo extends Team {
  pickNumber: number;
  round: number;
}

// Standings types
export interface Standing {
  rank: number;
  user: {
    id: number;
    name: string;
  };
  points: number;
}

// Error response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

// Game result types (for admin)
export interface GameResult {
  id: number;
  team: Team;
  weekNumber: number;
  opponent: string;
  result: 'win' | 'loss';
  wasUpset: boolean;
  points: number;
  gameDate: string;
}

export interface GameResultRequest {
  teamId: number;
  weekNumber: number;
  opponent: string;
  result: 'win' | 'loss';
  wasUpset: boolean;
  gameDate: string;
}
