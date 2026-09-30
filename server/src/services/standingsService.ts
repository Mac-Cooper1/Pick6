/**
 * Standings order: the one definition. The Leaderboard, Week by Week, the
 * dashboard rank and the week-6 swap (read bottom to top) all use it.
 *
 *  1. Most points.
 *  2. Tiebreaker (Mac, Sep 30): the lower combined ESPN strength-of-schedule
 *     rank of the member's current five ranks higher, since their points
 *     came against tougher schedules. Each slot adds its team's rank
 *     (TeamSos, 1 = hardest in FBS); an empty slot or a team with no rank on
 *     file counts as one past the lowest rank on file.
 *  3. Earlier join, only if points and combined SOS are both equal.
 */

import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { DRAFT_SLOTS } from './draftService';

export interface StandingRow {
  member: Prisma.LeagueMemberGetPayload<{ include: { user: true } }>;
  points: number;
  sosTotal: number;
}

export function compareStandings(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points ||
    a.sosTotal - b.sosTotal ||
    a.member.joinedAt.getTime() - b.member.joinedAt.getTime()
  );
}

/**
 * Every member, best first. `throughWeek` counts points from weeks 1..N
 * only (the swap orders on standings through week 5).
 */
export async function getStandings(
  leagueId: number,
  { throughWeek, db = prisma }: { throughWeek?: number; db?: Prisma.TransactionClient } = {}
): Promise<StandingRow[]> {
  const league = await db.league.findUnique({
    where: { id: leagueId },
    select: { seasonYear: true },
  });
  if (!league) throw new Error('League not found');

  const members = await db.leagueMember.findMany({
    where: { leagueId },
    include: { user: true },
  });
  const scores = await db.weeklyScore.groupBy({
    by: ['userId'],
    where: {
      leagueId,
      ...(throughWeek !== undefined ? { weekNumber: { lte: throughWeek } } : {}),
    },
    _sum: { points: true },
  });
  const rosterRows = await db.rosterSlot.findMany({
    where: { leagueId, toWeek: null },
    select: { userId: true, slot: true, teamId: true },
  });
  const sosRows = await db.teamSos.findMany({
    where: { seasonYear: league.seasonYear },
    select: { teamId: true, sosRank: true },
  });

  const pointsByUser = new Map(scores.map((s) => [s.userId, s._sum.points ?? 0]));
  const rankByTeam = new Map(sosRows.map((r) => [r.teamId, r.sosRank]));
  const unranked = Math.max(0, ...sosRows.map((r) => r.sosRank)) + 1;

  const sosTotalFor = (userId: number) =>
    DRAFT_SLOTS.reduce((total, slot) => {
      const row = rosterRows.find((r) => r.userId === userId && r.slot === slot);
      return total + ((row && rankByTeam.get(row.teamId)) ?? unranked);
    }, 0);

  return members
    .map((member) => ({
      member,
      points: pointsByUser.get(member.userId) ?? 0,
      sosTotal: sosTotalFor(member.userId),
    }))
    .sort(compareStandings);
}
