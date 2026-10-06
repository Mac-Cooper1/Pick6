import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { createVideo, listVideos, sendVideo } from '../services/videoService';

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
 * Start a video (commissioner, prototype allowlist). Returns PROCESSING;
 * it's ready in a few minutes.
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
