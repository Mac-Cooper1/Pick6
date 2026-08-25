/**
 * Draft Room Socket.IO Handler
 *
 * Manages real-time draft room events including:
 * - User joining/leaving draft rooms
 * - Broadcasting picks
 * - Timer synchronization
 * - Auto-pick on timeout
 */

import { Server, Socket } from 'socket.io';
import { verifyToken, JWTPayload } from '../utils/auth';
import prisma from '../lib/prisma';
import {
  getDraftState,
  makePick,
  processAutoPick,
  startDraft,
  checkScheduledDraft,
} from '../services/draftService';
import { DraftStatus } from '@prisma/client';

// Extended socket interface with user data
interface DraftSocket extends Socket {
  userId?: number;
  email?: string;
  leagueId?: number;
}

// Active draft timers (leagueId -> autopick timeout + 5s broadcast interval).
// Both handles must die together: a surviving broadcast interval keeps
// emitting a stale deadline and the clients' clocks jump around.
interface PickTimer {
  timeout: NodeJS.Timeout;
  broadcastInterval: NodeJS.Timeout;
}
const draftTimers: Map<number, PickTimer> = new Map();

// Active draft check intervals (for scheduled drafts)
const draftCheckIntervals: Map<number, NodeJS.Timeout> = new Map();

/**
 * Initialize Socket.IO draft handlers
 */
export function initDraftSocket(io: Server) {
  // Middleware: Authenticate socket connections
  io.use((socket: DraftSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload: JWTPayload = verifyToken(token);
      socket.userId = payload.userId;
      socket.email = payload.email;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: DraftSocket) => {
    console.log(`[Socket] User ${socket.userId} connected`);

    // Handle joining a draft room
    socket.on('draft:join', async (data: { leagueId: number }) => {
      try {
        const { leagueId } = data;
        const userId = socket.userId!;

        // Verify user is a member of the league
        const membership = await prisma.leagueMember.findUnique({
          where: { leagueId_userId: { leagueId, userId } },
        });

        if (!membership) {
          socket.emit('draft:error', { message: 'Not a member of this league' });
          return;
        }

        // Join the room
        const roomName = `league:${leagueId}`;
        socket.join(roomName);
        socket.leagueId = leagueId;

        console.log(`[Socket] User ${userId} joined draft room ${roomName}`);

        // Check if draft should auto-start
        await checkAndStartDraft(io, leagueId);

        // Send current draft state
        const state = await getDraftState(leagueId);
        socket.emit('draft:state', state);

        // Notify others that someone joined
        socket.to(roomName).emit('draft:userJoined', {
          userId,
          timestamp: new Date().toISOString(),
        });

        // Everyone (including the joiner) gets the fresh presence roster
        await broadcastPresence(io, leagueId);

        // If draft is live, start/sync the timer
        if (state.draftStatus === 'LIVE' && state.pickDeadline) {
          startPickTimer(io, leagueId, new Date(state.pickDeadline));
        }

        // If draft is scheduled but not started, start checking
        if (state.draftStatus === 'SCHEDULED' && state.draftScheduledAt) {
          startDraftCheckInterval(io, leagueId);
        }
      } catch (error: any) {
        console.error('[Socket] Error joining draft:', error);
        socket.emit('draft:error', { message: error.message || 'Failed to join draft' });
      }
    });

    // Handle making a pick
    socket.on('draft:makePick', async (data: { leagueId: number; teamId: number }) => {
      try {
        const { leagueId, teamId } = data;
        const userId = socket.userId!;

        console.log(`[Socket] User ${userId} attempting pick: team ${teamId} in league ${leagueId}`);

        // Make the pick (this validates turn, availability, etc.)
        const result = await makePick(leagueId, userId, teamId, false);

        // Broadcast the pick to all users in the room
        const roomName = `league:${leagueId}`;
        io.to(roomName).emit('draft:pickMade', {
          pick: result.pick,
          nextOnClock: result.nextOnClock,
          isComplete: result.isComplete,
          availableCount: result.availableCount,
          timestamp: new Date().toISOString(),
        });

        // Update timer for next pick
        if (!result.isComplete && result.currentPickDeadline) {
          startPickTimer(io, leagueId, new Date(result.currentPickDeadline));
        } else if (result.isComplete) {
          clearPickTimer(leagueId);
          io.to(roomName).emit('draft:complete', {
            timestamp: new Date().toISOString(),
          });
        }

        // Send updated full state
        const state = await getDraftState(leagueId);
        io.to(roomName).emit('draft:state', state);
      } catch (error: any) {
        console.error('[Socket] Error making pick:', error);
        socket.emit('draft:error', { message: error.message || 'Failed to make pick' });
      }
    });

    // Handle updating draft queue
    socket.on('draft:queue:update', async (data: { leagueId: number; teamIds: number[] }) => {
      try {
        const { leagueId, teamIds } = data;
        const userId = socket.userId!;

        // Update the queue in database
        await prisma.$transaction(async (tx) => {
          // Delete existing queue
          await tx.draftQueue.deleteMany({
            where: { leagueId, userId },
          });

          // Create new queue entries
          if (teamIds.length > 0) {
            await tx.draftQueue.createMany({
              data: teamIds.map((teamId, index) => ({
                leagueId,
                userId,
                teamId,
                priority: index + 1,
              })),
            });
          }
        });

        // Confirm to user
        socket.emit('draft:queue:updated', { teamIds });
      } catch (error: any) {
        console.error('[Socket] Error updating queue:', error);
        socket.emit('draft:error', { message: error.message || 'Failed to update queue' });
      }
    });

    // Handle manual draft start (commissioner only)
    socket.on('draft:start', async (data: { leagueId: number }) => {
      try {
        const { leagueId } = data;
        const userId = socket.userId!;

        // Verify commissioner
        const membership = await prisma.leagueMember.findUnique({
          where: { leagueId_userId: { leagueId, userId } },
        });

        if (!membership || membership.role !== 'COMMISSIONER') {
          socket.emit('draft:error', { message: 'Only the commissioner can start the draft' });
          return;
        }

        // Start the draft
        await startDraft(leagueId);

        const roomName = `league:${leagueId}`;
        const state = await getDraftState(leagueId);

        io.to(roomName).emit('draft:started', {
          timestamp: new Date().toISOString(),
        });
        io.to(roomName).emit('draft:state', state);

        // Start the pick timer
        if (state.pickDeadline) {
          startPickTimer(io, leagueId, new Date(state.pickDeadline));
        }
      } catch (error: any) {
        console.error('[Socket] Error starting draft:', error);
        socket.emit('draft:error', { message: error.message || 'Failed to start draft' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] User ${socket.userId} disconnected`);

      if (socket.leagueId) {
        const roomName = `league:${socket.leagueId}`;
        socket.to(roomName).emit('draft:userLeft', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });
        broadcastPresence(io, socket.leagueId);
      }
    });
  });
}

/**
 * Broadcast which league members are currently connected to the room.
 * Drives the presence dots in the pre-draft lobby.
 */
async function broadcastPresence(io: Server, leagueId: number) {
  try {
    const roomName = `league:${leagueId}`;
    const sockets = await io.in(roomName).fetchSockets();
    const userIds = [
      ...new Set(
        sockets
          .map((s) => (s as unknown as DraftSocket).userId)
          .filter((id): id is number => id !== undefined)
      ),
    ];
    io.to(roomName).emit('draft:presence', { userIds });
  } catch (error) {
    console.error(`[Socket] Error broadcasting presence for league ${leagueId}:`, error);
  }
}

/**
 * Start the pick timer for a league
 */
function startPickTimer(io: Server, leagueId: number, deadline: Date) {
  // Clear any existing timer
  clearPickTimer(leagueId);

  const roomName = `league:${leagueId}`;
  const now = new Date();
  const msUntilDeadline = deadline.getTime() - now.getTime();

  // Emit timer sync to all clients
  io.to(roomName).emit('draft:timer', {
    endsAt: deadline.toISOString(),
    serverNow: now.toISOString(),
    msRemaining: Math.max(0, msUntilDeadline),
  });

  if (msUntilDeadline <= 0) {
    // Timer already expired, process autopick immediately
    handleTimerExpired(io, leagueId);
    return;
  }

  // Set timeout for autopick
  const timeout = setTimeout(() => {
    handleTimerExpired(io, leagueId);
  }, msUntilDeadline);

  // Also emit periodic timer updates (every 5 seconds)
  const broadcastInterval = setInterval(() => {
    const remaining = deadline.getTime() - Date.now();
    if (remaining <= 0) {
      clearInterval(broadcastInterval);
      return;
    }
    io.to(roomName).emit('draft:timer', {
      endsAt: deadline.toISOString(),
      serverNow: new Date().toISOString(),
      msRemaining: remaining,
    });
  }, 5000);

  draftTimers.set(leagueId, { timeout, broadcastInterval });
}

/**
 * Clear the pick timer for a league
 */
function clearPickTimer(leagueId: number) {
  const existingTimer = draftTimers.get(leagueId);
  if (existingTimer) {
    clearTimeout(existingTimer.timeout);
    clearInterval(existingTimer.broadcastInterval);
    draftTimers.delete(leagueId);
  }
}

/**
 * Handle timer expiration - trigger autopick
 */
async function handleTimerExpired(io: Server, leagueId: number) {
  console.log(`[Socket] Timer expired for league ${leagueId}, processing autopick`);

  try {
    const result = await processAutoPick(leagueId);

    const roomName = `league:${leagueId}`;

    if (result) {
      // Broadcast the autopick
      io.to(roomName).emit('draft:pickMade', {
        pick: result.pick,
        nextOnClock: result.nextOnClock,
        isComplete: result.isComplete,
        availableCount: result.availableCount,
        isAutoPick: true,
        timestamp: new Date().toISOString(),
      });

      // Send updated state
      const state = await getDraftState(leagueId);
      io.to(roomName).emit('draft:state', state);

      // Start next timer or complete
      if (!result.isComplete && state.pickDeadline) {
        startPickTimer(io, leagueId, new Date(state.pickDeadline));
      } else if (result.isComplete) {
        io.to(roomName).emit('draft:complete', {
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error: any) {
    console.error('[Socket] Error processing autopick:', error);
    const roomName = `league:${leagueId}`;
    io.to(roomName).emit('draft:error', { message: 'Autopick failed: ' + error.message });
  }
}

/**
 * Check if a scheduled draft should start
 */
async function checkAndStartDraft(io: Server, leagueId: number) {
  try {
    const shouldStart = await checkScheduledDraft(leagueId);
    if (shouldStart) {
      const roomName = `league:${leagueId}`;
      const state = await getDraftState(leagueId);

      io.to(roomName).emit('draft:started', {
        timestamp: new Date().toISOString(),
      });
      io.to(roomName).emit('draft:state', state);

      // Start the pick timer
      if (state.pickDeadline) {
        startPickTimer(io, leagueId, new Date(state.pickDeadline));
      }

      // Clear the check interval
      const interval = draftCheckIntervals.get(leagueId);
      if (interval) {
        clearInterval(interval);
        draftCheckIntervals.delete(leagueId);
      }
    }
  } catch (error) {
    console.error(`[Socket] Error checking scheduled draft for league ${leagueId}:`, error);
  }
}

/**
 * Start interval to check for scheduled draft start
 */
function startDraftCheckInterval(io: Server, leagueId: number) {
  // Don't create duplicate intervals
  if (draftCheckIntervals.has(leagueId)) {
    return;
  }

  const interval = setInterval(() => {
    checkAndStartDraft(io, leagueId);
  }, 1000); // Check every second

  draftCheckIntervals.set(leagueId, interval);
}

/**
 * Export the io instance for use elsewhere
 */
let ioInstance: Server | null = null;

export function setIOInstance(io: Server) {
  ioInstance = io;
}

export function getIOInstance(): Server | null {
  return ioInstance;
}
