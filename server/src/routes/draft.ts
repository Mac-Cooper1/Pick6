import { Router } from 'express';
import {
  getDraftPicks,
  getAvailableTeams,
  startDraftEndpoint,
  getDraftStateEndpoint,
  getQueueEndpoint,
  setQueueEndpoint,
  addToQueueEndpoint,
  removeFromQueueEndpoint,
} from '../controllers/draftController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Draft data
router.get('/:leagueId/picks', authenticate, asyncHandler(getDraftPicks));
router.get('/:leagueId/available', authenticate, asyncHandler(getAvailableTeams));
router.get('/:leagueId/state', authenticate, asyncHandler(getDraftStateEndpoint));

// Draft control (commissioner; live picks go through the socket)
router.post('/:leagueId/start', authenticate, asyncHandler(startDraftEndpoint));

// Draft queue
router.get('/:leagueId/queue', authenticate, asyncHandler(getQueueEndpoint));
router.put('/:leagueId/queue', authenticate, asyncHandler(setQueueEndpoint));
router.post('/:leagueId/queue/:teamId', authenticate, asyncHandler(addToQueueEndpoint));
router.delete('/:leagueId/queue/:teamId', authenticate, asyncHandler(removeFromQueueEndpoint));

export default router;
