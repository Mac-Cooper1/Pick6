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

// Conference slots — the five draftable slots plus NONE for unslotted teams
export type ConferenceSlot = 'SEC' | 'BIG_TEN' | 'ACC_ND' | 'BIG_12' | 'G6' | 'NONE';

export const DRAFT_SLOTS: ConferenceSlot[] = ['SEC', 'BIG_TEN', 'ACC_ND', 'BIG_12', 'G6'];

export const SLOT_LABELS: Record<ConferenceSlot, string> = {
  SEC: 'SEC',
  BIG_TEN: 'Big Ten',
  ACC_ND: 'ACC + ND',
  BIG_12: 'Big 12',
  G6: 'Group of 6',
  NONE: 'Unslotted',
};

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
  customJoinCode?: string;
}

export interface JoinLeagueData {
  joinCode: string;
}

// Team types
export interface Team {
  id: number;
  name: string;
  conference: string;
  slot: ConferenceSlot;
  abbreviation?: string | null;
}

// Draft recap pick (REST /draft/:leagueId/picks)
export interface DraftPick {
  id: number;
  pickNumber: number;
  round: number;
  wasAutoPick: boolean;
  user: {
    id: number;
    name: string;
  };
  team: Team;
}

// Roster entry (REST /rosters/:leagueId/*)
export interface RosterEntry {
  slot: ConferenceSlot;
  slotLabel: string;
  teamId: number;
  teamName: string;
  conference: string;
  abbreviation: string | null;
  fromWeek: number;
}

export interface MemberRoster {
  userId: number;
  userName: string;
  swapUsed: boolean;
  roster: RosterEntry[];
}

// League member with teams (REST /leagues/:leagueId/members)
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
