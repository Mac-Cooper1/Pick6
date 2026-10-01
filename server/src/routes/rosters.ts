import { Router } from 'express';
import {
  getMyRoster,
  getUserRosterEndpoint,
  getAllRostersEndpoint,
  getAvailableTeamsEndpoint,
  getMyMatchups,
  getAllMatchups,
  getTeamCardEndpoint,
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

// Team card: one team's season, schedule and headlines
router.get('/:leagueId/teams/:teamId', authenticate, asyncHandler(getTeamCardEndpoint));

export default router;
