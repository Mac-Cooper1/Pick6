import { Router } from 'express';
import {
  getAllTeams,
  getDraftPicks,
  draftTeam,
  getAvailableTeams,
  startDraftEndpoint,
  getDraftStateEndpoint,
  triggerAutopick,
  getQueueEndpoint,
  setQueueEndpoint,
  addToQueueEndpoint,
  removeFromQueueEndpoint,
} from '../controllers/draftController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Team endpoints
router.get('/teams', authenticate, asyncHandler(getAllTeams));

// Legacy draft endpoints (kept for backwards compatibility)
router.get('/:leagueId/picks', authenticate, asyncHandler(getDraftPicks));
router.post('/:leagueId/pick', authenticate, asyncHandler(draftTeam));
router.get('/:leagueId/available', authenticate, asyncHandler(getAvailableTeams));

// Enhanced draft endpoints
router.post('/:leagueId/start', authenticate, asyncHandler(startDraftEndpoint));
router.get('/:leagueId/state', authenticate, asyncHandler(getDraftStateEndpoint));
router.post('/:leagueId/autopick', authenticate, asyncHandler(triggerAutopick));

// Draft queue endpoints
router.get('/:leagueId/queue', authenticate, asyncHandler(getQueueEndpoint));
router.put('/:leagueId/queue', authenticate, asyncHandler(setQueueEndpoint));
router.post('/:leagueId/queue/:teamId', authenticate, asyncHandler(addToQueueEndpoint));
router.delete('/:leagueId/queue/:teamId', authenticate, asyncHandler(removeFromQueueEndpoint));

export default router;
