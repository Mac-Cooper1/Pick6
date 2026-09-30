/**
 * Scoring-week attribution
 *
 * ESPN's Week 1 spans two weekends (the late-August openers plus Labor Day
 * weekend), so a dozen teams play twice inside one ESPN week. The league
 * counts every game a team plays; the only question is which week's column
 * a game lands in. The rule (Mac's call after week 1, Sep 11):
 *
 *   - A team's first game in an ESPN week counts in that week.
 *   - Each extra game rolls forward to the next week when the team is OFF
 *     that week (Florida State: Aug 29 = week 1, Sep 7 = week 2).
 *   - If the team also plays the next week (UNLV: Aug 30, Sep 6, Sep 12),
 *     the extra game stays put and both games count in the same week.
 *
 * Season totals are identical either way; only the column differs. Every
 * reader of "team X's game(s) in week N" goes through this module: scoring,
 * the Week by Week drill-down, My Team season points and bye-week roll-ins.
 * Cancelled games never count and never block a roll-forward.
 */

import prisma from '../lib/prisma';
import { GameStatus, Prisma } from '@prisma/client';

export type ScoredGame = Prisma.GameGetPayload<{
  include: { homeTeam: true; awayTeam: true };
}>;

/** teamId → scoring week → that team's games in that week (kickoff order) */
export type ScoringWeekMap = Map<number, Map<number, ScoredGame[]>>;

/**
 * The one scoring formula: win 1, underdog (3.5+) win 2, loss 0, favorite
 * (3.5+) loss -1. `wasUpset` is set by finalizeGames from the stored spread.
 * Anything that isn't a decided FINAL is 0.
 */
export function pointsForTeam(
  game: Pick<ScoredGame, 'status' | 'winnerTeamId' | 'wasUpset'>,
  teamId: number
): number {
  if (game.status !== GameStatus.FINAL || !game.winnerTeamId) return 0;
  const won = game.winnerTeamId === teamId;
  return won ? (game.wasUpset ? 2 : 1) : game.wasUpset ? -1 : 0;
}

/**
 * Pure attribution for ONE team's games: gameId → scoring week.
 * `lastWeek` caps the roll-forward (nothing rolls past the season).
 */
export function assignScoringWeeks<
  G extends { id: number; weekNumber: number; startTime: Date; status: GameStatus }
>(games: G[], lastWeek: number): Map<number, number> {
  const live = games
    .filter((g) => g.status !== GameStatus.CANCELLED)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id - b.id);

  const byEspnWeek = new Map<number, G[]>();
  for (const game of live) {
    const list = byEspnWeek.get(game.weekNumber) ?? [];
    list.push(game);
    byEspnWeek.set(game.weekNumber, list);
  }

  const weeksWithGames = new Set(byEspnWeek.keys());
  const rolledInto = new Set<number>();
  const result = new Map<number, number>();

  for (const week of [...byEspnWeek.keys()].sort((a, b) => a - b)) {
    const list = byEspnWeek.get(week)!;
    list.forEach((game, index) => {
      if (index === 0) {
        result.set(game.id, week);
        return;
      }
      const next = week + 1;
      const nextIsOpen =
        next <= lastWeek && !weeksWithGames.has(next) && !rolledInto.has(next);
      if (nextIsOpen) {
        rolledInto.add(next);
        result.set(game.id, next);
      } else {
        result.set(game.id, week);
      }
    });
  }

  return result;
}

/** Final week of the season calendar (15 for 2026); falls back to 15. */
export async function getLastWeek(seasonYear: number): Promise<number> {
  const agg = await prisma.seasonWeek.aggregate({
    where: { seasonYear },
    _max: { weekNumber: true },
  });
  return agg._max.weekNumber ?? 15;
}

/**
 * Load every game for the given teams and attribute each to a scoring week.
 * One query for all teams; the per-team attribution is the pure function
 * above.
 */
export async function loadScoringWeekMap(
  seasonYear: number,
  teamIds: number[]
): Promise<ScoringWeekMap> {
  const map: ScoringWeekMap = new Map();
  const ids = [...new Set(teamIds)];
  if (ids.length === 0) return map;

  const [games, lastWeek] = await Promise.all([
    prisma.game.findMany({
      where: {
        seasonYear,
        OR: [{ homeTeamId: { in: ids } }, { awayTeamId: { in: ids } }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: 'asc' },
    }),
    getLastWeek(seasonYear),
  ]);

  for (const teamId of ids) {
    const teamGames = games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);
    const weeks = assignScoringWeeks(teamGames, lastWeek);
    const byWeek = new Map<number, ScoredGame[]>();
    for (const game of teamGames) {
      const week = weeks.get(game.id);
      if (week === undefined) continue; // cancelled
      const list = byWeek.get(week) ?? [];
      list.push(game);
      byWeek.set(week, list);
    }
    map.set(teamId, byWeek);
  }

  return map;
}

/** A team's games that count in `week` (empty = bye), kickoff order. */
export function gamesForTeamWeek(
  map: ScoringWeekMap,
  teamId: number,
  week: number
): ScoredGame[] {
  return map.get(teamId)?.get(week) ?? [];
}

/**
 * A team's season so far, owner or not: Pick 6 points from every game
 * (the same pointsForTeam formula) and its decided W-L.
 */
export function seasonRecord(
  map: ScoringWeekMap,
  teamId: number
): { points: number; wins: number; losses: number } {
  let points = 0;
  let wins = 0;
  let losses = 0;
  for (const games of map.get(teamId)?.values() ?? []) {
    for (const game of games) {
      points += pointsForTeam(game, teamId);
      if (game.status === GameStatus.FINAL && game.winnerTeamId) {
        if (game.winnerTeamId === teamId) wins++;
        else losses++;
      }
    }
  }
  return { points, wins, losses };
}
