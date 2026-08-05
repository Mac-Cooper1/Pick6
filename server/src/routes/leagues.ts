import { Router } from 'express';
import {
  createLeague,
  joinLeague,
  getLeague,
  getLeagueMembers,
  getMyLeagues,
  updateLeagueSettings,
} from '../controllers/leagueController';
import {
  getSwapStateEndpoint,
  performSwapEndpoint,
  passSwapEndpoint,
  openSwapEndpoint,
  closeSwapEndpoint,
} from '../controllers/swapController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// My leagues dashboard
router.get('/my', authenticate, asyncHandler(getMyLeagues));

// League CRUD
router.post('/create', authenticate, asyncHandler(createLeague));
router.post('/join', authenticate, asyncHandler(joinLeague));
router.get('/:leagueId', authenticate, asyncHandler(getLeague));
router.get('/:leagueId/members', authenticate, asyncHandler(getLeagueMembers));
router.patch('/:leagueId/settings', authenticate, asyncHandler(updateLeagueSettings));

// Week-5 swap window (WS8)
router.get('/:leagueId/swap', authenticate, asyncHandler(getSwapStateEndpoint));
router.post('/:leagueId/swap', authenticate, asyncHandler(performSwapEndpoint));
router.post('/:leagueId/swap/pass', authenticate, asyncHandler(passSwapEndpoint));
router.post('/:leagueId/swap/open', authenticate, asyncHandler(openSwapEndpoint));
router.post('/:leagueId/swap/close', authenticate, asyncHandler(closeSwapEndpoint));

export default router;
