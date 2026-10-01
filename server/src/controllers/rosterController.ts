import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';
import {
  getUserRoster,
  getAllRosters,
  getAvailableTeams,
} from '../services/rosterService';
import { getRosterMatchups, getAllRosterMatchups } from '../services/matchupService';
import { getTeamCard } from '../services/teamCardService';

/**
 * Assert the requesting user is a member of the league.
 */
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
 * Get current user's roster
 * GET /api/rosters/:leagueId/my
 */
export async function getMyRoster(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const roster = await getUserRoster(leagueId, req.userId!);
  res.json(roster);
}

/**
 * Get a specific user's roster
 * GET /api/rosters/:leagueId/user/:userId
 */
export async function getUserRosterEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const targetUserId = parseInt(req.params.userId);

  await requireMembership(leagueId, req.userId!);

  if (isNaN(targetUserId)) {
    throw new AppError('Invalid user ID', 400);
  }

  const roster = await getUserRoster(leagueId, targetUserId);
  res.json(roster);
}

/**
 * Get all rosters in a league
 * GET /api/rosters/:leagueId
 */
export async function getAllRostersEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const rosters = await getAllRosters(leagueId);
  res.json(rosters);
}

/**
 * Get available (unrostered) draft-pool teams
 * GET /api/rosters/:leagueId/available
 */
export async function getAvailableTeamsEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  await requireMembership(leagueId, req.userId!);

  const teams = await getAvailableTeams(leagueId);
  res.json(teams);
}

/**
 * Get matchups with odds for current user's roster
 * GET /api/rosters/:leagueId/matchups
 */
export async function getMyMatchups(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const weekNumber = req.query.week ? parseInt(req.query.week as string) : undefined;

  await requireMembership(leagueId, req.userId!);

  // Optional ?userId= views a league-mate's team (My Team tab's viewer
  // dropdown). Any member may view any member; the target must be one.
  let targetUserId = req.userId!;
  if (req.query.userId) {
    targetUserId = parseInt(req.query.userId as string);
    if (isNaN(targetUserId)) {
      throw new AppError('Invalid user ID', 400);
    }
    if (targetUserId !== req.userId) {
      const targetMember = await prisma.leagueMember.findUnique({
        where: { leagueId_userId: { leagueId, userId: targetUserId } },
      });
      if (!targetMember) {
        throw new AppError('That user is not a member of this league', 404);
      }
    }
  }

  const matchups = await getRosterMatchups(leagueId, targetUserId, weekNumber);
  res.json(matchups);
}

/**
 * Get matchups with odds for all rosters in a league
 * GET /api/rosters/:leagueId/matchups/all
 */
export async function getAllMatchups(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const weekNumber = req.query.week ? parseInt(req.query.week as string) : undefined;

  await requireMembership(leagueId, req.userId!);

  const allMatchups = await getAllRosterMatchups(leagueId, weekNumber);
  res.json(allMatchups);
}

/**
 * Team card (tap a team on My Team or Week by Week): the tapped game, game
 * log with Pick 6 points, schedule, ESPN headlines, SOS rank
 * GET /api/rosters/:leagueId/teams/:teamId?event=<espnEventId>&userId=<owner>
 */
export async function getTeamCardEndpoint(req: AuthRequest, res: Response) {
  const leagueId = parseInt(req.params.leagueId);
  const teamId = parseInt(req.params.teamId);

  await requireMembership(leagueId, req.userId!);

  if (isNaN(teamId)) {
    throw new AppError('Invalid team ID', 400);
  }
  const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
  if (userId !== undefined && isNaN(userId)) {
    throw new AppError('Invalid user ID', 400);
  }
  const eventId = typeof req.query.event === 'string' ? req.query.event : undefined;

  const card = await getTeamCard(leagueId, teamId, { eventId, userId });
  if (!card) {
    throw new AppError('Team not found', 404);
  }
  res.json(card);
}
