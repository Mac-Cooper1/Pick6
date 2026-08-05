import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { MemberRole } from '@prisma/client';
import {
  getSwapState,
  performSwap,
  passSwap,
  openSwapWindow,
  closeSwapWindow,
} from '../services/swapService';

async function requireMembership(leagueId: number, userId: number) {
  if (isNaN(leagueId)) {
    throw new AppError('Invalid league ID', 400);
  }
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!member) {
    throw new AppError('Not a member of this league', 403);
  }
  return member;
}

/**
 * Swap window state (status, order, on-the-clock, deadline)
 * GET /api/leagues/:leagueId/swap
 */
export async function getSwapStateEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const state = await getSwapState(leagueId);
  res.json(state);
}

/**
 * Use your one swap
 * POST /api/leagues/:leagueId/swap
 * Body: { dropTeamId, addTeamId }
 */
export async function performSwapEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = req.userId!;
  const { dropTeamId, addTeamId } = req.body;

  await requireMembership(leagueId, userId);

  if (!dropTeamId || !addTeamId) {
    throw new AppError('dropTeamId and addTeamId are required', 400);
  }

  try {
    const result = await performSwap(leagueId, userId, dropTeamId, addTeamId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    throw new AppError(error.message || 'Swap failed', 400);
  }
}

/**
 * Pass on your turn (you can still swap in the free-for-all phase)
 * POST /api/leagues/:leagueId/swap/pass
 */
export async function passSwapEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = req.userId!;
  await requireMembership(leagueId, userId);

  try {
    const state = await passSwap(leagueId, userId);
    res.json(state);
  } catch (error: any) {
    throw new AppError(error.message || 'Pass failed', 400);
  }
}

/**
 * Commissioner: open the window manually (it also auto-opens after week 5)
 * POST /api/leagues/:leagueId/swap/open
 */
export async function openSwapEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const member = await requireMembership(leagueId, req.userId!);

  if (member.role !== MemberRole.COMMISSIONER) {
    throw new AppError('Only the commissioner can open the swap window', 403);
  }

  try {
    const state = await openSwapWindow(leagueId);
    res.json(state);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to open swap window', 400);
  }
}

/**
 * Commissioner: close the window
 * POST /api/leagues/:leagueId/swap/close
 */
export async function closeSwapEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const member = await requireMembership(leagueId, req.userId!);

  if (member.role !== MemberRole.COMMISSIONER) {
    throw new AppError('Only the commissioner can close the swap window', 403);
  }

  const state = await closeSwapWindow(leagueId);
  res.json(state);
}
