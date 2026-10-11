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
  getSwapTeamsEndpoint,
  saveSwapClaimsEndpoint,
} from '../controllers/swapController';
import {
  confirmPaymentEndpoint,
  createVideoEndpoint,
  draftScriptEndpoint,
  listVideosEndpoint,
  sendVideoEndpoint,
  startCheckoutEndpoint,
} from '../controllers/videoController';
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

// Week-6 swap: private lists during week 5, run by the sync when week 6 starts
router.get('/:leagueId/swap', authenticate, asyncHandler(getSwapStateEndpoint));
router.get('/:leagueId/swap/teams', authenticate, asyncHandler(getSwapTeamsEndpoint));
router.put('/:leagueId/swap/claims', authenticate, asyncHandler(saveSwapClaimsEndpoint));

// Commissioner video messages (fal.ai; free for VIDEO_CREATORS, Stripe for the rest)
router.get('/:leagueId/videos', authenticate, asyncHandler(listVideosEndpoint));
router.post('/:leagueId/videos', authenticate, asyncHandler(createVideoEndpoint));
router.post('/:leagueId/videos/draft', authenticate, asyncHandler(draftScriptEndpoint));
router.post('/:leagueId/videos/checkout', authenticate, asyncHandler(startCheckoutEndpoint));
router.post('/:leagueId/videos/confirm-payment', authenticate, asyncHandler(confirmPaymentEndpoint));
router.post('/:leagueId/videos/:videoId/send', authenticate, asyncHandler(sendVideoEndpoint));

export default router;
