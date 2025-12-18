/**
 * Auction Controller
 *
 * HTTP endpoint handlers for FAAB auction functionality
 */

import { Request, Response } from 'express';
import {
  getAuctionState,
  createAuctionEvent,
  openAuction,
  placeBid,
  cancelBid,
  finalizeAuction,
  getAuctionAvailableTeams,
  getHighBids,
  getUserBids,
  deleteAuctionEvent,
  checkAuctionTiming,
} from '../services/auctionService';
import { getUserRoster } from '../services/rosterService';

/**
 * GET /api/auction/:leagueId
 * Get auction state including status, timing, my budget, my bids, and high bids
 */
export async function getAuctionStateEndpoint(req: Request, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const userId = (req as any).userId;

    // Check timing and auto-open/close if needed
    await checkAuctionTiming(leagueId);

    const state = await getAuctionState(leagueId, userId);

    if (!state) {
      return res.json({ hasAuction: false });
    }

    res.json({ hasAuction: true, ...state });
  } catch (error: any) {
    console.error('[Auction Controller] getAuctionState error:', error);
    res.status(500).json({ error: error.message || 'Failed to get auction state' });
  }
}

/**
 * POST /api/auction/:leagueId/create
 * Create a new auction event (commissioner only)
 */
export async function createAuctionEndpoint(req: Request, res: Response) {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const userId = (req as any).userId;
    const { weekNumber, opensAt, closesAt } = req.body;

    console.log('[Auction Controller] createAuction:', { leagueId, userId, weekNumber, opensAt, closesAt });

    if (!weekNumber || !opensAt || !closesAt) {
      return res.status(400).json({ error: 'weekNumber, opensAt, and closesAt are required' });
    }

    const auction = await createAuctionEvent(
      leagueId,
      userId,
      weekNumber,
      new Date(opensAt),
      new Date(closesAt)
    );

    console.log('[Auction Controller] createAuction success:', auction);
    res.status(201).json(auction);
  } catch (error: any) {
    console.error('[Auction Controller] createAuction error:', error);
    res.status(500).json({ error: error.message || 'Failed to create auction' });
  }
}

/**
 * POST /api/auction/:leagueId/open
 * Manually open the auction (admin)
 */
export async function openAuctionEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);

  const auction = await openAuction(leagueId);
  res.json(auction);
}

/**
 * POST /api/auction/:leagueId/bid
 * Place a bid on a team
 */
export async function placeBidEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = (req as any).userId;
  const { addTeamId, dropTeamId, amount } = req.body;

  if (addTeamId === undefined || dropTeamId === undefined || amount === undefined) {
    return res.status(400).json({ error: 'addTeamId, dropTeamId, and amount are required' });
  }

  const bid = await placeBid(leagueId, userId, addTeamId, dropTeamId, amount);
  res.status(201).json(bid);
}

/**
 * POST /api/auction/:leagueId/cancel-bid
 * Cancel a bid
 */
export async function cancelBidEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = (req as any).userId;
  const { bidId } = req.body;

  if (!bidId) {
    return res.status(400).json({ error: 'bidId is required' });
  }

  const bid = await cancelBid(leagueId, userId, bidId);
  res.json(bid);
}

/**
 * POST /api/auction/:leagueId/finalize
 * Finalize the auction and process winning bids
 */
export async function finalizeAuctionEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);

  const result = await finalizeAuction(leagueId);
  res.json(result);
}

/**
 * GET /api/auction/:leagueId/available-teams
 * Get available teams for auction with kickoff lock status
 */
export async function getAvailableTeamsEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);

  const teams = await getAuctionAvailableTeams(leagueId);
  res.json(teams);
}

/**
 * GET /api/auction/:leagueId/high-bids
 * Get current high bids for all teams (anonymous)
 */
export async function getHighBidsEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);

  const bids = await getHighBids(leagueId);
  res.json(bids);
}

/**
 * GET /api/auction/:leagueId/my-bids
 * Get user's bids
 */
export async function getMyBidsEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = (req as any).userId;

  const bids = await getUserBids(leagueId, userId);
  res.json(bids);
}

/**
 * GET /api/auction/:leagueId/my-roster
 * Get user's current roster for drop selection
 */
export async function getMyRosterEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = (req as any).userId;

  const roster = await getUserRoster(leagueId, userId);
  res.json(roster);
}

/**
 * DELETE /api/auction/:leagueId
 * Delete auction event (commissioner only, before it starts)
 */
export async function deleteAuctionEndpoint(req: Request, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = (req as any).userId;

  const result = await deleteAuctionEvent(leagueId, userId);
  res.json(result);
}
