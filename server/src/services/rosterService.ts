/**
 * Roster Service
 *
 * Slot-based rosters: each member holds one team per conference slot,
 * tracked in RosterSlot rows with effective-week windows (toWeek IS NULL =
 * currently on roster). The week-5 swap (WS8) closes/opens rows here.
 */

import prisma from '../lib/prisma';
import { ConferenceSlot } from '@prisma/client';
import { DRAFT_SLOTS, SLOT_LABELS } from './draftService';

const SLOT_ORDER = new Map<ConferenceSlot, number>(
  DRAFT_SLOTS.map((slot, i) => [slot, i])
);

function slotSortValue(slot: ConferenceSlot): number {
  return SLOT_ORDER.get(slot) ?? DRAFT_SLOTS.length;
}

export interface RosterEntry {
  slot: ConferenceSlot;
  slotLabel: string;
  teamId: number;
  teamName: string;
  conference: string;
  abbreviation: string | null;
  fromWeek: number;
}

/**
 * Get a user's current roster in a league, ordered by slot
 */
export async function getUserRoster(
  leagueId: number,
  userId: number
): Promise<RosterEntry[]> {
  const rosterSlots = await prisma.rosterSlot.findMany({
    where: { leagueId, userId, toWeek: null },
    include: { team: true },
  });

  return rosterSlots
    .sort((a, b) => slotSortValue(a.slot) - slotSortValue(b.slot))
    .map((rs) => ({
      slot: rs.slot,
      slotLabel: SLOT_LABELS[rs.slot],
      teamId: rs.teamId,
      teamName: rs.team.name,
      conference: rs.team.conference,
      abbreviation: rs.team.abbreviation,
      fromWeek: rs.fromWeek,
    }));
}

/**
 * Get all current rosters in a league (single query, grouped by member)
 */
export async function getAllRosters(leagueId: number) {
  const [members, rosterSlots] = await Promise.all([
    prisma.leagueMember.findMany({
      where: { leagueId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.rosterSlot.findMany({
      where: { leagueId, toWeek: null },
      include: { team: true },
    }),
  ]);

  return members.map((m) => ({
    userId: m.userId,
    userName: m.user.name,
    swapUsed: m.swapUsed,
    roster: rosterSlots
      .filter((rs) => rs.userId === m.userId)
      .sort((a, b) => slotSortValue(a.slot) - slotSortValue(b.slot))
      .map((rs) => ({
        slot: rs.slot,
        slotLabel: SLOT_LABELS[rs.slot],
        teamId: rs.teamId,
        teamName: rs.team.name,
        conference: rs.team.conference,
        abbreviation: rs.team.abbreviation,
        fromWeek: rs.fromWeek,
      })),
  }));
}

/**
 * Get teams in the draft pool not currently on any roster in the league
 * (used by the week-5 swap to list swap targets)
 */
export async function getAvailableTeams(leagueId: number) {
  const rosteredTeams = await prisma.rosterSlot.findMany({
    where: { leagueId, toWeek: null },
    select: { teamId: true },
  });

  return prisma.team.findMany({
    where: {
      id: { notIn: rosteredTeams.map((rt) => rt.teamId) },
      slot: { not: ConferenceSlot.NONE },
    },
    orderBy: [{ slot: 'asc' }, { name: 'asc' }],
  });
}
