/**
 * Auction Routes
 *
 * API endpoints for FAAB midseason auction
 */

import { Router } from 'express';
import {
  getAuctionStateEndpoint,
  createAuctionEndpoint,
  openAuctionEndpoint,
  placeBidEndpoint,
  cancelBidEndpoint,
  finalizeAuctionEndpoint,
  getAvailableTeamsEndpoint,
  getHighBidsEndpoint,
  getMyBidsEndpoint,
  getMyRosterEndpoint,
  deleteAuctionEndpoint,
} from '../controllers/auctionController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Get auction state (status, timing, budgets, bids)
router.get('/:leagueId', authenticate, asyncHandler(getAuctionStateEndpoint));

// Create auction event (commissioner only)
router.post('/:leagueId/create', authenticate, asyncHandler(createAuctionEndpoint));

// Delete auction event (commissioner only, before started)
router.delete('/:leagueId', authenticate, asyncHandler(deleteAuctionEndpoint));

// Manually open auction (admin)
router.post('/:leagueId/open', authenticate, asyncHandler(openAuctionEndpoint));

// Place a bid
router.post('/:leagueId/bid', authenticate, asyncHandler(placeBidEndpoint));

// Cancel a bid
router.post('/:leagueId/cancel-bid', authenticate, asyncHandler(cancelBidEndpoint));

// Finalize auction (process winners)
router.post('/:leagueId/finalize', authenticate, asyncHandler(finalizeAuctionEndpoint));

// Get available teams for bidding
router.get('/:leagueId/available-teams', authenticate, asyncHandler(getAvailableTeamsEndpoint));

// Get current high bids (anonymous)
router.get('/:leagueId/high-bids', authenticate, asyncHandler(getHighBidsEndpoint));

// Get user's bids
router.get('/:leagueId/my-bids', authenticate, asyncHandler(getMyBidsEndpoint));

// Get user's roster (for drop selection)
router.get('/:leagueId/my-roster', authenticate, asyncHandler(getMyRosterEndpoint));

export default router;
