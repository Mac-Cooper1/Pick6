/**
 * Socket.IO Client Service
 *
 * Manages real-time draft room connections
 */

import { io, Socket } from 'socket.io-client';

// Socket URL - in dev use relative path for proxy, in prod use API URL
const SOCKET_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  : '';

// Draft state types
export interface DraftPick {
  pickNumber: number;
  round: number;
  userId: number;
  userName: string;
  teamId: number;
  teamName: string;
  wasAutoPick: boolean;
}

export interface DraftMember {
  userId: number;
  name: string;
  draftPosition: number | null;
}

export interface DraftState {
  leagueId: number;
  draftStarted: boolean;
  draftComplete: boolean;
  draftStatus: 'NOT_STARTED' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETE';
  draftScheduledAt: string | null;
  draftType: 'SNAKE' | 'LINEAR';
  currentPickNumber: number;
  totalPicks: number;
  currentRound: number;
  onTheClockUserId: number | null;
  pickDeadline: string | null;
  pickDeadlineSeconds: number;
  members: DraftMember[];
  picks: DraftPick[];
}

export interface TimerUpdate {
  endsAt: string;
  serverNow: string;
  msRemaining: number;
}

export interface PickMadeEvent {
  pick: DraftPick;
  nextOnClock: { userId: number; userName: string } | null;
  isComplete: boolean;
  availableCount: number;
  isAutoPick?: boolean;
  timestamp: string;
}

export interface DraftError {
  message: string;
}

// Socket event handlers
export interface DraftSocketHandlers {
  onState?: (state: DraftState) => void;
  onPickMade?: (event: PickMadeEvent) => void;
  onTimer?: (timer: TimerUpdate) => void;
  onStarted?: (data: { timestamp: string }) => void;
  onComplete?: (data: { timestamp: string }) => void;
  onUserJoined?: (data: { userId: number; timestamp: string }) => void;
  onUserLeft?: (data: { userId: number; timestamp: string }) => void;
  onQueueUpdated?: (data: { teamIds: number[] }) => void;
  onError?: (error: DraftError) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

let socket: Socket | null = null;

/**
 * Connect to the draft room
 */
export function connectToDraft(
  leagueId: number,
  token: string,
  handlers: DraftSocketHandlers
): Socket {
  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }

  // Create new socket connection
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  // Connection handlers
  socket.on('connect', () => {
    console.log('[Socket] Connected to server');
    handlers.onConnect?.();

    // Join the draft room
    socket?.emit('draft:join', { leagueId });
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    handlers.onDisconnect?.();
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    handlers.onError?.({ message: error.message });
  });

  // Draft event handlers
  socket.on('draft:state', (state: DraftState) => {
    handlers.onState?.(state);
  });

  socket.on('draft:pickMade', (event: PickMadeEvent) => {
    handlers.onPickMade?.(event);
  });

  socket.on('draft:timer', (timer: TimerUpdate) => {
    handlers.onTimer?.(timer);
  });

  socket.on('draft:started', (data: { timestamp: string }) => {
    handlers.onStarted?.(data);
  });

  socket.on('draft:complete', (data: { timestamp: string }) => {
    handlers.onComplete?.(data);
  });

  socket.on('draft:userJoined', (data: { userId: number; timestamp: string }) => {
    handlers.onUserJoined?.(data);
  });

  socket.on('draft:userLeft', (data: { userId: number; timestamp: string }) => {
    handlers.onUserLeft?.(data);
  });

  socket.on('draft:queue:updated', (data: { teamIds: number[] }) => {
    handlers.onQueueUpdated?.(data);
  });

  socket.on('draft:error', (error: DraftError) => {
    handlers.onError?.(error);
  });

  return socket;
}

/**
 * Send a pick to the server
 */
export function makePick(leagueId: number, teamId: number) {
  if (!socket) {
    console.error('[Socket] Not connected');
    return;
  }
  socket.emit('draft:makePick', { leagueId, teamId });
}

/**
 * Update draft queue
 */
export function updateQueue(leagueId: number, teamIds: number[]) {
  if (!socket) {
    console.error('[Socket] Not connected');
    return;
  }
  socket.emit('draft:queue:update', { leagueId, teamIds });
}

/**
 * Start draft (commissioner only)
 */
export function startDraft(leagueId: number) {
  if (!socket) {
    console.error('[Socket] Not connected');
    return;
  }
  socket.emit('draft:start', { leagueId });
}

/**
 * Disconnect from draft room
 */
export function disconnectFromDraft() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get socket connection status
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}
