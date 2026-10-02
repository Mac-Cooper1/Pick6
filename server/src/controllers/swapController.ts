import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import { getSwapState, getSwapTeams, saveSwapClaims, SwapLine } from '../services/swapService';
import { clientMessage } from '../utils/errors';

// One line of a submitted list: two integer team ids
function isSwapLine(c: unknown): c is SwapLine {
  const line = c as Partial<SwapLine> | null;
  return Number.isInteger(line?.dropTeamId) && Number.isInteger(line?.addTeamId);
}

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
 * Week-6 swap state (phase, lock time, order, your list, results)
 * GET /api/leagues/:leagueId/swap
 */
export async function getSwapStateEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const state = await getSwapState(leagueId, req.userId!);
  res.json(state);
}

/**
 * Swap page board: unowned teams by Pick 6 points this season, plus yours
 * GET /api/leagues/:leagueId/swap/teams
 */
export async function getSwapTeamsEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const teams = await getSwapTeams(leagueId, req.userId!);
  res.json(teams);
}

/**
 * Replace your swap list while lists are open (first line = first choice)
 * PUT /api/leagues/:leagueId/swap/claims
 * Body: { claims: [{ dropTeamId, addTeamId }, ...] }
 */
export async function saveSwapClaimsEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const userId = req.userId!;
  const { claims } = req.body;

  await requireMembership(leagueId, userId);

  if (!Array.isArray(claims) || !claims.every(isSwapLine)) {
    throw new AppError('claims must be a list of { dropTeamId, addTeamId }', 400);
  }

  try {
    const state = await saveSwapClaims(
      leagueId,
      userId,
      claims.map((c: SwapLine) => ({ dropTeamId: c.dropTeamId, addTeamId: c.addTeamId }))
    );
    res.json(state);
  } catch (error) {
    throw new AppError(clientMessage(error, 'Could not save your swap list'), 400);
  }
}
