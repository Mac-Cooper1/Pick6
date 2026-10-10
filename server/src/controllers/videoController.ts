import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import {
  confirmPayment,
  createVideo,
  draftVideoScript,
  listVideos,
  sendVideo,
  startCheckout,
} from '../services/videoService';

function leagueIdOf(req: AuthRequest): number {
  const leagueId = parseInt(req.params.leagueId);
  if (isNaN(leagueId)) throw new AppError('Invalid league ID', 400);
  return leagueId;
}

/**
 * Commissioner video messages: the league's sent videos, your own drafts,
 * and the options for making one
 * GET /api/leagues/:leagueId/videos
 */
export async function listVideosEndpoint(req: AuthRequest, res: Response) {
  res.json(await listVideos(leagueIdOf(req), req.userId!));
}

/**
 * Have Claude draft the script from the league's season
 * POST /api/leagues/:leagueId/videos/draft
 * Body: { notes?: string, setting?: string }
 */
export async function draftScriptEndpoint(req: AuthRequest, res: Response) {
  res.json(await draftVideoScript(leagueIdOf(req), req.userId!, req.body));
}

/**
 * Open Stripe Checkout for one video. { checkoutUrl } to send the browser
 * to, or { hasCredit: true } when one is already paid for (or free).
 * POST /api/leagues/:leagueId/videos/checkout
 */
export async function startCheckoutEndpoint(req: AuthRequest, res: Response) {
  res.json(await startCheckout(leagueIdOf(req), req.userId!));
}

/**
 * Back from Stripe: did that checkout session get paid?
 * POST /api/leagues/:leagueId/videos/confirm-payment
 * Body: { sessionId: string }
 */
export async function confirmPaymentEndpoint(req: AuthRequest, res: Response) {
  res.json(await confirmPayment(leagueIdOf(req), req.userId!, req.body?.sessionId));
}

/**
 * Start a video (the league's commissioner: free for VIDEO_CREATORS, a paid
 * credit for everyone else). Returns PROCESSING; it's ready in about ten
 * minutes.
 * POST /api/leagues/:leagueId/videos
 * Body: { photo: data URL, setting, voice, script, consent: true }
 */
export async function createVideoEndpoint(req: AuthRequest, res: Response) {
  res.status(201).json(await createVideo(leagueIdOf(req), req.userId!, req.body));
}

/**
 * Email a ready video to every other member (once)
 * POST /api/leagues/:leagueId/videos/:videoId/send
 */
export async function sendVideoEndpoint(req: AuthRequest, res: Response) {
  const videoId = parseInt(req.params.videoId);
  if (isNaN(videoId)) throw new AppError('Invalid video ID', 400);
  res.json(await sendVideo(leagueIdOf(req), videoId, req.userId!));
}
