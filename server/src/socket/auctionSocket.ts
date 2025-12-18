/**
 * Auction Socket.IO Handler
 *
 * Manages real-time auction room events including:
 * - User joining/leaving auction rooms
 * - Broadcasting bid updates
 * - Auction status changes (open, close, finalize)
 */

import { Server, Socket } from 'socket.io';
import { verifyToken, JWTPayload } from '../utils/auth';
import prisma from '../lib/prisma';
import {
  getAuctionState,
  placeBid,
  cancelBid,
  getHighBids,
  checkAuctionTiming,
} from '../services/auctionService';

// Extended socket interface with user data
interface AuctionSocket extends Socket {
  userId?: number;
  email?: string;
  leagueId?: number;
}

// Store IO instance for broadcasting from other places
let auctionIO: Server | null = null;

/**
 * Initialize Socket.IO auction handlers
 */
export function initAuctionSocket(io: Server) {
  auctionIO = io;

  // Create auction namespace
  const auctionNamespace = io.of('/auction');

  // Middleware: Authenticate socket connections
  auctionNamespace.use((socket: AuctionSocket, next) => {
    const token =
      socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

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

  auctionNamespace.on('connection', (socket: AuctionSocket) => {
    console.log(`[Auction Socket] User ${socket.userId} connected`);

    // Handle joining an auction room
    socket.on('auction:join', async (data: { leagueId: number }) => {
      try {
        const { leagueId } = data;
        const userId = socket.userId!;

        // Verify user is a member of the league
        const membership = await prisma.leagueMember.findUnique({
          where: { leagueId_userId: { leagueId, userId } },
        });

        if (!membership) {
          socket.emit('auction:error', { message: 'Not a member of this league' });
          return;
        }

        // Join the room
        const roomName = `auction:${leagueId}`;
        socket.join(roomName);
        socket.leagueId = leagueId;

        console.log(`[Auction Socket] User ${userId} joined auction room ${roomName}`);

        // Check timing and auto-open/close
        const timingChange = await checkAuctionTiming(leagueId);
        if (timingChange) {
          auctionNamespace.to(roomName).emit('auction:statusChanged', { status: timingChange });
        }

        // Send current auction state
        const state = await getAuctionState(leagueId, userId);
        socket.emit('auction:state', state);

        // Notify others that someone joined
        socket.to(roomName).emit('auction:userJoined', {
          userId,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error('[Auction Socket] Error joining auction:', error);
        socket.emit('auction:error', { message: error.message || 'Failed to join auction' });
      }
    });

    // Handle placing a bid
    socket.on(
      'auction:placeBid',
      async (data: { leagueId: number; addTeamId: number; dropTeamId: number; amount: number }) => {
        try {
          const { leagueId, addTeamId, dropTeamId, amount } = data;
          const userId = socket.userId!;

          console.log(
            `[Auction Socket] User ${userId} placing bid: $${amount} on team ${addTeamId}`
          );

          // Place the bid
          const bid = await placeBid(leagueId, userId, addTeamId, dropTeamId, amount);

          // Get updated high bids
          const highBids = await getHighBids(leagueId);

          // Broadcast bid update to all users in room (anonymous - don't reveal bidder)
          const roomName = `auction:${leagueId}`;
          auctionNamespace.to(roomName).emit('auction:bidUpdate', {
            teamId: addTeamId,
            highBid: amount,
            timestamp: new Date().toISOString(),
          });

          // Send confirmation to bidder
          socket.emit('auction:bidPlaced', {
            bid,
            message: 'Bid placed successfully',
          });

          // Send updated high bids to all
          auctionNamespace.to(roomName).emit('auction:highBids', highBids);
        } catch (error: any) {
          console.error('[Auction Socket] Error placing bid:', error);
          socket.emit('auction:error', { message: error.message || 'Failed to place bid' });
        }
      }
    );

    // Handle canceling a bid
    socket.on('auction:cancelBid', async (data: { leagueId: number; bidId: number }) => {
      try {
        const { leagueId, bidId } = data;
        const userId = socket.userId!;

        await cancelBid(leagueId, userId, bidId);

        // Get updated high bids
        const highBids = await getHighBids(leagueId);

        // Broadcast updated high bids
        const roomName = `auction:${leagueId}`;
        auctionNamespace.to(roomName).emit('auction:highBids', highBids);

        // Confirm to user
        socket.emit('auction:bidCancelled', { bidId });
      } catch (error: any) {
        console.error('[Auction Socket] Error canceling bid:', error);
        socket.emit('auction:error', { message: error.message || 'Failed to cancel bid' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Auction Socket] User ${socket.userId} disconnected`);

      if (socket.leagueId) {
        const roomName = `auction:${socket.leagueId}`;
        socket.to(roomName).emit('auction:userLeft', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  return auctionNamespace;
}

/**
 * Broadcast auction status change to all users in a league
 */
export async function broadcastAuctionStatus(
  leagueId: number,
  status: 'opened' | 'closed' | 'finalized'
) {
  if (!auctionIO) return;

  const roomName = `auction:${leagueId}`;
  auctionIO.of('/auction').to(roomName).emit('auction:statusChanged', {
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast auction finalization results
 */
export async function broadcastAuctionResults(
  leagueId: number,
  results: Array<{
    teamId: number;
    teamName: string;
    winnerId: number;
    winnerName: string;
    amount: number;
  }>
) {
  if (!auctionIO) return;

  const roomName = `auction:${leagueId}`;
  auctionIO.of('/auction').to(roomName).emit('auction:finalized', {
    results,
    timestamp: new Date().toISOString(),
  });
}

export function getAuctionIO(): Server | null {
  return auctionIO;
}
