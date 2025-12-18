import { Router } from 'express';
import {
  getMyRoster,
  getUserRosterEndpoint,
  getAllRostersEndpoint,
  getAvailableTeamsEndpoint,
  getWaiverPriorityEndpoint,
  submitWaiverClaimEndpoint,
  cancelWaiverClaimEndpoint,
  getMyWaiverClaims,
  processWaiversEndpoint,
  addFreeAgentEndpoint,
  getMyMatchups,
  getAllMatchups,
} from '../controllers/rosterController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Roster endpoints
router.get('/:leagueId', authenticate, asyncHandler(getAllRostersEndpoint));
router.get('/:leagueId/my', authenticate, asyncHandler(getMyRoster));
router.get('/:leagueId/user/:userId', authenticate, asyncHandler(getUserRosterEndpoint));
router.get('/:leagueId/available', authenticate, asyncHandler(getAvailableTeamsEndpoint));

// Matchup endpoints (with odds)
router.get('/:leagueId/matchups', authenticate, asyncHandler(getMyMatchups));
router.get('/:leagueId/matchups/all', authenticate, asyncHandler(getAllMatchups));

// Waiver endpoints
router.get('/:leagueId/waiver-priority', authenticate, asyncHandler(getWaiverPriorityEndpoint));
router.get('/:leagueId/waivers/my', authenticate, asyncHandler(getMyWaiverClaims));
router.post('/:leagueId/waivers', authenticate, asyncHandler(submitWaiverClaimEndpoint));
router.delete('/:leagueId/waivers/:claimId', authenticate, asyncHandler(cancelWaiverClaimEndpoint));
router.post('/:leagueId/waivers/process', authenticate, asyncHandler(processWaiversEndpoint));

// Free agent pickup
router.post('/:leagueId/free-agent', authenticate, asyncHandler(addFreeAgentEndpoint));

export default router;
