/**
 * Team Card Service
 *
 * Tap a team on My Team or Week by Week and a card opens with that team's
 * season: the tapped game (preview, live or final), a game log with each
 * game's Pick 6 points, the rest of the schedule, ESPN headlines and the
 * FPI strength-of-schedule rank.
 *
 * Live games also get ESPN's scoreboard on top (applyLiveGames): the score
 * and clock with where the ball is and who has it, all from one snapshot.
 *
 * Two sources, split on purpose:
 *  - Scoring truth comes from Game rows: the stored line (never the live
 *    Odds API), the upset flag, and Pick 6 points through the one
 *    pointsForTeam formula, attributed to scoring weeks by
 *    scoringWeekService (FSU's rolled-forward game sits in week 2).
 *  - Display data comes from ESPN's team schedule and news feed (one cached
 *    request each): kickoff/TV, live scores, games past the synced weeks,
 *    opponents' ranks and records, headlines.
 * If ESPN fails the card falls back to the synced Game rows; it never errors.
 */

import prisma from '../lib/prisma';
import { ConferenceSlot, GameStatus } from '@prisma/client';
import cacheService, { CACHE_TTL } from './cacheService';
import { SLOT_LABELS } from './draftService';
import {
  EspnHeadline,
  EspnLiveGame,
  EspnScheduleGame,
  EspnTeamSchedule,
  espnGameUrl,
  espnLogoUrl,
  fetchLiveGames,
  fetchMatchupPredictor,
  fetchTeamNews,
  fetchTeamSchedule,
  ParsedGame,
} from './espnClient';
import { gameRowStatus } from './matchupService';
import { errorMessage } from '../utils/errors';
import { getCurrentWeek } from './seasonService';
import {
  getLastWeek,
  loadScoringWeekMap,
  pointsForTeam,
  ScoredGame,
  ScoringWeekMap,
  seasonRecord,
} from './scoringWeekService';

export interface TeamCardGame {
  espnEventId: string;
  week: number; // the Pick 6 week it counts in
  playedWeek: number; // ESPN week; differs when a double-game rolled forward
  startTime: Date;
  timeTbd: boolean;
  status: ParsedGame['status'];
  statusDetail: string | null;
  isHome: boolean;
  neutralSite: boolean;
  teamRank: number | null; // AP/CFP rank going into the game
  opponent: {
    name: string;
    abbreviation: string | null;
    logo: string | null;
    rank: number | null;
    record: string | null;
  };
  teamScore: number | null;
  opponentScore: number | null;
  result: 'W' | 'L' | null;
  teamSpread: number | null; // stored line, team-relative (+ = underdog)
  wasUpset: boolean;
  points: number | null; // null until the Game row is FINAL
  counted: boolean; // false = outside the owner's roster window (the swap)
  venue: string | null;
  broadcast: string | null;
  espnUrl: string | null;
  live: TeamCardLive | null; // only while the game is in progress
}

// Where the ball is, from this team's side of the field
export interface TeamCardLive {
  possession: 'team' | 'opponent' | null; // null: kickoff, timeout, break
  ballOn: number | null; // yards from this team's own goal line (0-100)
  downDistance: string | null; // ESPN's text, e.g. "3rd & 6 at NE 15"
  redZone: boolean;
}

export interface TeamCard {
  seasonYear: number;
  currentWeek: number;
  lastWeek: number;
  team: {
    teamId: number;
    name: string;
    abbreviation: string | null;
    conference: string;
    slot: ConferenceSlot;
    slotLabel: string;
    logo: string | null;
    color: string | null; // ESPN hex, no '#'
    record: string | null;
    standing: string | null;
    apRank: number | null;
    sosRank: number | null; // ESPN FPI strength of schedule, 1 = hardest
    sosOutOf: number | null;
    espnUrl: string | null;
  };
  // The roster row the card was opened from (null = nobody in this league)
  owner: { userId: number; userName: string; fromWeek: number; toWeek: number | null } | null;
  pick6: {
    points: number; // every game this season, whoever owned the team
    wins: number;
    losses: number;
    ownerPoints: number | null; // only the games inside the owner's window
  };
  games: TeamCardGame[]; // the whole season, kickoff order
  previewEventId: string | null;
  predictor: { teamWinPct: number; opponentWinPct: number } | null;
  news: EspnHeadline[];
}

interface OwnerWindow {
  fromWeek: number;
  toWeek: number | null;
}

/** Stored line, upset flag and Pick 6 points: Game rows only */
function scoringFields(game: ScoredGame | undefined, teamId: number) {
  if (!game) return { teamSpread: null, wasUpset: false, points: null };
  const isHome = game.homeTeamId === teamId;
  return {
    teamSpread: game.spread !== null ? (isHome ? game.spread : -game.spread) : null,
    wasUpset: game.wasUpset,
    points: game.status === GameStatus.FINAL ? pointsForTeam(game, teamId) : null,
  };
}

/**
 * One list for the team's season: every ESPN schedule game with the
 * scoring truth from its Game row where one is synced, plus any synced game
 * ESPN's list lacks (ESPN down: the card runs on Game rows alone).
 */
export function mergeTeamGames(
  teamId: number,
  scoringWeeks: ScoringWeekMap,
  espnGames: EspnScheduleGame[],
  window: OwnerWindow | null
): TeamCardGame[] {
  const rows = new Map<string, { game: ScoredGame; week: number }>();
  for (const [week, games] of scoringWeeks.get(teamId) ?? []) {
    for (const game of games) rows.set(game.espnEventId, { game, week });
  }
  const counted = (week: number) =>
    window === null ||
    (week >= window.fromWeek && (window.toWeek === null || week <= window.toWeek));

  const merged: TeamCardGame[] = espnGames.map((espn) => {
    const row = rows.get(espn.espnEventId);
    const week = row?.week ?? espn.weekNumber;
    // A FINAL row is the truth (a commissioner override included), so its
    // score and result match the points; until then ESPN is fresher (live
    // scores, finals the sync hasn't picked up yet)
    const settled = row?.game.status === GameStatus.FINAL ? row.game : undefined;
    const settledHome = settled?.homeTeamId === teamId;
    const won = settled
      ? settled.winnerTeamId ? settled.winnerTeamId === teamId : null
      : espn.teamWon;
    return {
      espnEventId: espn.espnEventId,
      week,
      playedWeek: row?.game.weekNumber ?? espn.weekNumber,
      startTime: espn.startTime,
      timeTbd: espn.timeTbd,
      status: settled ? 'final' : espn.status,
      statusDetail: settled && espn.status !== 'final' ? null : espn.statusDetail,
      isHome: espn.isHome,
      neutralSite: espn.neutralSite,
      teamRank: espn.teamRank,
      opponent: {
        name: espn.opponent.name,
        abbreviation: espn.opponent.abbreviation,
        logo: espnLogoUrl(espn.opponent.espnId),
        rank: espn.opponent.rank,
        record: espn.opponent.record,
      },
      teamScore: settled ? (settledHome ? settled.homeScore : settled.awayScore) : espn.teamScore,
      opponentScore: settled ? (settledHome ? settled.awayScore : settled.homeScore) : espn.opponentScore,
      result: won === null ? null : won ? 'W' : 'L',
      ...scoringFields(row?.game, teamId),
      counted: counted(week),
      venue: espn.venue ?? row?.game.venue ?? null,
      broadcast: espn.broadcast,
      espnUrl: espnGameUrl(espn.espnEventId),
      live: null,
    };
  });

  const fromEspn = new Set(espnGames.map((g) => g.espnEventId));
  for (const [eventId, { game, week }] of rows) {
    if (fromEspn.has(eventId)) continue;
    const isHome = game.homeTeamId === teamId;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    const scored = game.status === GameStatus.FINAL || game.status === GameStatus.IN_PROGRESS;
    merged.push({
      espnEventId: eventId,
      week,
      playedWeek: game.weekNumber,
      startTime: game.startTime,
      timeTbd: false,
      status: gameRowStatus(game.status),
      statusDetail: null,
      isHome,
      neutralSite: false,
      teamRank: null,
      opponent: {
        name: opponent.name,
        abbreviation: opponent.abbreviation,
        logo: espnLogoUrl(opponent.espnTeamId),
        rank: null,
        record: null,
      },
      teamScore: scored ? (isHome ? game.homeScore : game.awayScore) : null,
      opponentScore: scored ? (isHome ? game.awayScore : game.homeScore) : null,
      result:
        game.status === GameStatus.FINAL && game.winnerTeamId
          ? game.winnerTeamId === teamId
            ? 'W'
            : 'L'
          : null,
      ...scoringFields(game, teamId),
      counted: counted(week),
      venue: game.venue,
      broadcast: null,
      espnUrl: espnGameUrl(eventId),
      live: null,
    });
  }

  return merged.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Put ESPN's scoreboard on top of the team's live games: its score and clock
 * (so they come from the same moment as the ball, not the team schedule's
 * separately cached copy) and the ball, turned to this team's side: ESPN
 * counts yards from the home goal line, the card from this team's own, so
 * the team always attacks toward 100.
 */
export function applyLiveGames(
  games: TeamCardGame[],
  liveGames: EspnLiveGame[],
  teamEspnId: string
): TeamCardGame[] {
  const byEvent = new Map(liveGames.map((g) => [g.espnEventId, g]));
  return games.map((game) => {
    const live = game.status === 'in_progress' ? byEvent.get(game.espnEventId) : undefined;
    if (!live) return game;
    const isHome = live.homeEspnId === teamEspnId;
    return {
      ...game,
      statusDetail: live.statusDetail ?? game.statusDetail,
      teamScore: (isHome ? live.homeScore : live.awayScore) ?? game.teamScore,
      opponentScore: (isHome ? live.awayScore : live.homeScore) ?? game.opponentScore,
      live: {
        possession:
          live.possessionEspnId === null ? null : live.possessionEspnId === teamEspnId ? 'team' : 'opponent',
        ballOn: live.yardLine === null ? null : isHome ? live.yardLine : 100 - live.yardLine,
        downDistance: live.downDistance,
        redZone: live.redZone,
      },
    };
  });
}

/**
 * The game the card opens on: the tapped one, else the team's live game,
 * else its next game, else its last one
 */
export function pickPreviewGame(games: TeamCardGame[], eventId?: string): TeamCardGame | null {
  const tapped = eventId ? games.find((g) => g.espnEventId === eventId) : undefined;
  return (
    tapped ??
    games.find((g) => g.status === 'in_progress') ??
    games.find((g) => g.status === 'scheduled' || g.status === 'postponed') ??
    games[games.length - 1] ??
    null
  );
}

/**
 * How long a team's ESPN schedule stays cached. It only changes when a game
 * kicks off or ends: every minute around a live game (or a kickoff that has
 * passed without ESPN flipping to live), otherwise until the next kickoff,
 * capped at 15 minutes.
 */
export function scheduleTtl(schedule: EspnTeamSchedule, now: Date = new Date()): number {
  const live = CACHE_TTL.ESPN_SCOREBOARD;
  let nextKickoff = Infinity;
  for (const game of schedule.games) {
    if (game.status === 'in_progress') return live;
    if (game.status !== 'scheduled') continue;
    const untilKickoff = game.startTime.getTime() - now.getTime();
    if (untilKickoff <= 0) {
      if (untilKickoff > -12 * 3600 * 1000) return live; // delayed start
      continue; // a stale row from weeks ago
    }
    nextKickoff = Math.min(nextKickoff, untilKickoff);
  }
  return Math.round(Math.max(live, Math.min(CACHE_TTL.TEAM_SCHEDULE, nextKickoff / 1000)));
}

// Every ESPN call the card makes goes through cachedEspn. Entries are per
// team (or per game), never per player, so ESPN traffic tracks how many
// teams are being looked at, not how many people are looking, and
// concurrent requests for the same key share one call. ESPN publishes no
// rate limits; if it ever errors or throttles, the card gets the last good
// copy and ESPN is left alone for a minute instead of being retried per tap.
const ESPN_BACKOFF_SECONDS = 60;
const lastGood = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

function cachedEspn<T>(
  key: string,
  ttl: number | ((value: T) => number),
  load: () => Promise<T>
): Promise<T | null> {
  const hit = cacheService.get<{ value: T | null }>(key);
  if (hit) return Promise.resolve(hit.value);
  const pending = inFlight.get(key) as Promise<T | null> | undefined;
  if (pending) return pending;

  const request = load()
    .then((value): T | null => {
      cacheService.set(key, { value }, typeof ttl === 'function' ? ttl(value) : ttl);
      lastGood.set(key, value);
      return value;
    })
    .catch((error: unknown): T | null => {
      const fallback = lastGood.has(key) ? (lastGood.get(key) as T) : null;
      console.error(
        `[TeamCard] ${key} failed (${errorMessage(error)}); ${fallback === null ? 'no copy to serve' : 'serving the last good copy'}, next try in ${ESPN_BACKOFF_SECONDS}s`
      );
      cacheService.set(key, { value: fallback }, ESPN_BACKOFF_SECONDS);
      return fallback;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

const predictorFor = (eventId: string) =>
  cachedEspn(`espn:predictor:${eventId}`, CACHE_TTL.MATCHUP_PREDICTOR, () =>
    fetchMatchupPredictor(eventId)
  );

/**
 * The card for one team in a league. `userId` picks the roster row it was
 * opened from (a member's team); without it, the team's current owner.
 * Returns null for an unknown team.
 */
export async function getTeamCard(
  leagueId: number,
  teamId: number,
  { eventId, userId }: { eventId?: string; userId?: number } = {}
): Promise<TeamCard | null> {
  const [league, team] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId } }),
    prisma.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!league) throw new Error('League not found');
  if (!team) return null;

  const seasonYear = league.seasonYear;
  const espnId = team.espnTeamId;

  const [currentWeek, lastWeek, scoringWeeks, sos, sosOutOf, ownerRows, schedule, news, tappedPct] =
    await Promise.all([
      getCurrentWeek(seasonYear),
      getLastWeek(seasonYear),
      loadScoringWeekMap(seasonYear, [teamId]),
      prisma.teamSos.findUnique({ where: { seasonYear_teamId: { seasonYear, teamId } } }),
      prisma.teamSos.count({ where: { seasonYear } }),
      prisma.rosterSlot.findMany({
        where: { leagueId, teamId, ...(userId !== undefined ? { userId } : {}) },
        include: { user: { select: { name: true } } },
      }),
      espnId
        ? cachedEspn(`espn:teamSchedule:${espnId}:${seasonYear}`, scheduleTtl, () =>
            fetchTeamSchedule(espnId, seasonYear)
          )
        : null,
      espnId
        ? cachedEspn(`espn:teamNews:${espnId}`, CACHE_TTL.TEAM_NEWS, () => fetchTeamNews(espnId))
        : null,
      // The tapped game's predictor alongside the rest instead of after it,
      // when its Game row confirms it's this team's game and not started
      // (the predictor only exists before kickoff)
      espnId && eventId && espnGameUrl(eventId)
        ? prisma.game
            .findUnique({
              where: { espnEventId: eventId },
              select: { status: true, homeTeamId: true, awayTeamId: true },
            })
            .then((row) =>
              row?.status === GameStatus.SCHEDULED &&
              (row.homeTeamId === teamId || row.awayTeamId === teamId)
                ? predictorFor(eventId)
                : null
            )
        : null,
    ]);

  // Active row first, then the latest (a team dropped in the swap)
  const ownerRow =
    ownerRows.sort(
      (a, b) => Number(a.toWeek !== null) - Number(b.toWeek !== null) || b.fromWeek - a.fromWeek
    )[0] ?? null;

  let games = mergeTeamGames(teamId, scoringWeeks, schedule?.games ?? [], ownerRow);

  // A live game gets ESPN's week scoreboard on top. One cached copy per week
  // serves every game in it, so ESPN sees one call a minute at most, however
  // many cards are open (getting cut off by ESPN would end the card's data)
  const liveWeeks = [...new Set(games.filter((g) => g.status === 'in_progress').map((g) => g.playedWeek))];
  if (espnId && liveWeeks.length > 0) {
    const scoreboards = await Promise.all(
      liveWeeks.map((week) =>
        cachedEspn(`espn:liveGames:${seasonYear}:${week}`, CACHE_TTL.LIVE_GAMES, () =>
          fetchLiveGames(seasonYear, week)
        )
      )
    );
    games = applyLiveGames(games, scoreboards.flatMap((live) => live ?? []), espnId);
  }

  const preview = pickPreviewGame(games, eventId);

  // ESPN's Matchup Predictor only exists before kickoff. Usually it's the
  // tapped game, fetched above; with no tap, or a tapped game the sync
  // hasn't stored yet, it's fetched now.
  let predictor: TeamCard['predictor'] = null;
  if (espnId && preview?.status === 'scheduled' && preview.espnUrl) {
    const pct =
      preview.espnEventId === eventId && tappedPct
        ? tappedPct
        : await predictorFor(preview.espnEventId);
    const teamPct = pct?.[espnId];
    const opponentPct = pct ? Object.entries(pct).find(([id]) => id !== espnId)?.[1] : undefined;
    if (teamPct !== undefined && opponentPct !== undefined) {
      predictor = { teamWinPct: teamPct, opponentWinPct: opponentPct };
    }
  }

  const record = seasonRecord(scoringWeeks, teamId);
  // Current rank rides on the team's next (or live) game; the last one after the season
  const rankGame =
    schedule?.games.find((g) => g.status !== 'final') ?? schedule?.games[schedule.games.length - 1];

  return {
    seasonYear,
    currentWeek,
    lastWeek,
    team: {
      teamId: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      conference: team.conference,
      slot: team.slot,
      slotLabel: SLOT_LABELS[team.slot],
      logo: espnLogoUrl(espnId),
      color: schedule?.color ?? null,
      record:
        schedule?.record ??
        (record.wins + record.losses > 0 ? `${record.wins}-${record.losses}` : null),
      standing: schedule?.standing ?? null,
      apRank: rankGame?.teamRank ?? null,
      sosRank: sos?.sosRank ?? null,
      sosOutOf: sosOutOf || null,
      espnUrl: schedule?.clubhouseUrl ?? null,
    },
    owner: ownerRow
      ? {
          userId: ownerRow.userId,
          userName: ownerRow.user.name,
          fromWeek: ownerRow.fromWeek,
          toWeek: ownerRow.toWeek,
        }
      : null,
    pick6: {
      points: record.points,
      wins: record.wins,
      losses: record.losses,
      ownerPoints: ownerRow
        ? games.reduce((total, g) => total + (g.counted && g.points !== null ? g.points : 0), 0)
        : null,
    },
    games,
    previewEventId: preview?.espnEventId ?? null,
    predictor,
    news: news ?? [],
  };
}
