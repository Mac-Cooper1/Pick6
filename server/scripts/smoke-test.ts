/**
 * Pick 6 smoke test — drives the slot-aware snake draft and the scoring
 * pipeline end-to-end against the local database using the real services.
 *
 * Run:  npx tsx scripts/smoke-test.ts
 *
 * Leaves the "Smoke League" (join code SMOKE1, users smoke1/smoke2@test.local)
 * in place so you can inspect it in the UI. Re-running cleans and re-creates it.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { ConferenceSlot, GameStatus, MemberRole } from '@prisma/client';
import prisma from '../src/lib/prisma';
import {
  startDraft,
  getDraftState,
  makePick,
  DRAFT_SLOTS,
} from '../src/services/draftService';
import { finalizeGames, calculateLeagueScores } from '../src/services/syncService';
import { assignScoringWeeks, loadScoringWeekMap } from '../src/services/scoringWeekService';
import { matchGameToOdds, teamNamesAgree } from '../src/services/teamMatcher';
import { EspnScheduleGame, ParsedGame, parseLiveGames, parseScoreboardGames } from '../src/services/espnClient';
import { applyLiveGames, getTeamCard, mergeTeamGames, pickPreviewGame, scheduleTtl } from '../src/services/teamCardService';
import { ParsedOdds } from '../src/services/oddsClient';
import { getUserRoster, getAllRosters } from '../src/services/rosterService';
import {
  getSwapSchedule,
  getSwapState,
  getSwapTeams,
  saveSwapClaims,
  runSwap,
  runDueSwaps,
  SWAP_MAX_CLAIMS,
} from '../src/services/swapService';
import { getStandings } from '../src/services/standingsService';
import { captureEmails, renderEmail } from '../src/services/emailService';
import { findUserByEmail, requestPasswordReset, resetPassword } from '../src/services/authService';
import { createVideo, failInterruptedVideos, listVideos, processVideo, sendVideo, VIDEOS_PER_DAY } from '../src/services/videoService';
import { RunModel } from '../src/services/falClient';
import { generatePasswordResetToken, generateToken, verifyToken } from '../src/utils/auth';

// The smoke league lives in its own season so its synthetic games can never
// collide with real Game rows synced into the local DB (a real still-
// scheduled week-1 row for the same team would make a synthetic final the
// team's "second game" and roll it forward). The 2026 calendar is copied
// under this year so week derivation works without touching ESPN.
const SMOKE_SEASON = 2099;
const CALENDAR_SOURCE_SEASON = 2026;

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectThrow(
  fn: () => Promise<unknown>,
  label: string,
  msgIncludes?: string
) {
  try {
    await fn();
    failed++;
    console.log(`  ❌ ${label} — expected an error, none thrown`);
  } catch (e: any) {
    if (!msgIncludes || String(e.message).includes(msgIncludes)) {
      passed++;
      console.log(`  ✅ ${label}`);
    } else {
      failed++;
      console.log(`  ❌ ${label} — wrong error: ${e.message}`);
    }
  }
}

async function main() {
  console.log('\n🏈 Pick 6 smoke test\n');

  // Every email lands here instead of going out, even with a Resend key set
  const outbox = captureEmails();

  // ---------- Cleanup from prior runs ----------
  const oldLeague = await prisma.league.findUnique({ where: { joinCode: 'SMOKE1' } });
  if (oldLeague) await prisma.league.delete({ where: { id: oldLeague.id } });
  await prisma.game.deleteMany({ where: { espnEventId: { startsWith: 'smoke-' } } });
  await prisma.user.deleteMany({
    where: { email: { in: ['smoke1@test.local', 'smoke2@test.local', 'smoke3@test.local'] } },
  });
  await prisma.seasonWeek.deleteMany({ where: { seasonYear: SMOKE_SEASON } });
  await prisma.teamSos.deleteMany({ where: { seasonYear: SMOKE_SEASON } });

  // Private calendar for the smoke season (same dates as the real one)
  const calendar = await prisma.seasonWeek.findMany({
    where: { seasonYear: CALENDAR_SOURCE_SEASON },
    orderBy: { weekNumber: 'asc' },
  });
  if (calendar.length === 0) {
    throw new Error(`No ${CALENDAR_SOURCE_SEASON} SeasonWeek rows — run the seed / a sync first`);
  }
  await prisma.seasonWeek.createMany({
    data: calendar.map((w) => ({
      seasonYear: SMOKE_SEASON,
      weekNumber: w.weekNumber,
      label: w.label,
      startDate: w.startDate,
      endDate: w.endDate,
    })),
  });

  // ---------- Setup: 2 users + league ----------
  console.log('— Setup');
  const smokeHash = await bcrypt.hash('smoke123', 4);
  const alice = await prisma.user.create({
    data: { name: 'Smoke Alice', email: 'smoke1@test.local', passwordHash: smokeHash },
  });
  const bob = await prisma.user.create({
    data: { name: 'Smoke Bob', email: 'smoke2@test.local', passwordHash: smokeHash },
  });
  const league = await prisma.league.create({
    data: {
      name: 'Smoke League',
      joinCode: 'SMOKE1',
      maxPlayers: 8,
      seasonYear: SMOKE_SEASON,
      commissionerUserId: alice.id,
    },
  });
  await prisma.leagueMember.create({
    data: { leagueId: league.id, userId: alice.id, role: MemberRole.COMMISSIONER },
  });
  await prisma.leagueMember.create({
    data: { leagueId: league.id, userId: bob.id },
  });
  assert(true, 'users + league created');

  const teamCount = await prisma.team.count({ where: { slot: { not: ConferenceSlot.NONE } } });
  assert(teamCount >= 130, `draft pool has ${teamCount} slotted teams`);

  // ---------- Draft ----------
  console.log('— Draft');
  await expectThrow(
    () => makePick(league.id, alice.id, 1),
    'pick before start rejected',
    'Draft has not started'
  );

  await startDraft(league.id);
  let state = await getDraftState(league.id);
  assert(state.draftStatus === 'LIVE', 'draft is LIVE after start');
  assert(state.totalPicks === 10, `totalPicks is 10 (got ${state.totalPicks})`);
  assert(state.rounds === 5, 'rounds is 5');
  assert(
    state.members.every((m) => m.draftPosition !== null),
    'draft positions assigned'
  );

  for (let pickNo = 1; pickNo <= 10; pickNo++) {
    state = await getDraftState(league.id);
    const onClock = state.onTheClockUserId!;
    const other = onClock === alice.id ? bob.id : alice.id;
    const me = state.members.find((m) => m.userId === onClock)!;
    const openSlots = DRAFT_SLOTS.filter((s) => !me.filledSlots.includes(s));
    const draftedIds = state.picks.map((p) => p.teamId);

    const team = await prisma.team.findFirst({
      where: { slot: openSlots[0], id: { notIn: draftedIds } },
      orderBy: { name: 'asc' },
    });

    if (pickNo === 1) {
      await expectThrow(
        () => makePick(league.id, other, team!.id),
        'wrong-turn pick rejected',
        'Not your turn'
      );
      const uconn = await prisma.team.findUnique({ where: { name: 'UConn' } });
      if (uconn) {
        await expectThrow(
          () => makePick(league.id, onClock, uconn.id),
          'unslotted (NONE) team rejected',
          'not in the draft pool'
        );
      }
    }

    if (pickNo === 2) {
      await expectThrow(
        () => makePick(league.id, onClock, state.picks[0].teamId),
        'already-taken team rejected',
        'already drafted'
      );
    }

    if (pickNo === 3 && me.filledSlots.length > 0) {
      const filledSlot = me.filledSlots[0];
      const dupSlotTeam = await prisma.team.findFirst({
        where: { slot: filledSlot, id: { notIn: draftedIds } },
      });
      await expectThrow(
        () => makePick(league.id, onClock, dupSlotTeam!.id),
        'second pick in a filled slot rejected',
        'already filled'
      );
    }

    await makePick(league.id, onClock, team!.id);
  }

  state = await getDraftState(league.id);
  assert(state.draftComplete, 'draft complete after 10 picks');
  assert(state.draftStatus === 'COMPLETE', 'status is COMPLETE');

  const pickCount = await prisma.draftPick.count({ where: { leagueId: league.id } });
  assert(pickCount === 10, `10 DraftPick rows (got ${pickCount})`);

  const aliceRoster = await getUserRoster(league.id, alice.id);
  const bobRoster = await getUserRoster(league.id, bob.id);
  assert(aliceRoster.length === 5 && bobRoster.length === 5, 'both rosters have 5 teams');
  assert(
    new Set(aliceRoster.map((r) => r.slot)).size === 5 &&
      new Set(bobRoster.map((r) => r.slot)).size === 5,
    'each roster covers all 5 slots exactly once'
  );

  const allRosters = await getAllRosters(league.id);
  assert(allRosters.length === 2 && allRosters[0].roster.length === 5, 'getAllRosters returns both members with 5 slots');

  // ---------- DB-level constraint checks (partial unique indexes) ----------
  console.log('— DB constraints');
  const carol = await prisma.user.create({
    data: { name: 'Smoke Carol', email: 'smoke3@test.local', passwordHash: smokeHash },
  });
  await prisma.leagueMember.create({ data: { leagueId: league.id, userId: carol.id } });

  // Carol has no SEC yet, but Alice's SEC team is actively owned → team index must reject
  await expectThrow(
    () =>
      prisma.rosterSlot.create({
        data: {
          leagueId: league.id,
          userId: carol.id,
          slot: ConferenceSlot.SEC,
          teamId: aliceRoster.find((r) => r.slot === 'SEC')!.teamId,
          fromWeek: 1,
        },
      }),
    'partial index: one active owner per team enforced'
  );

  // Bob already has an active SEC row → user+slot index must reject even a free team
  const freeSecTeam = await prisma.team.findFirst({
    where: {
      slot: ConferenceSlot.SEC,
      id: { notIn: [...aliceRoster, ...bobRoster].map((r) => r.teamId) },
    },
  });
  await expectThrow(
    () =>
      prisma.rosterSlot.create({
        data: {
          leagueId: league.id,
          userId: bob.id,
          slot: ConferenceSlot.SEC,
          teamId: freeSecTeam!.id,
          fromWeek: 1,
        },
      }),
    'partial index: one active team per user per slot enforced'
  );

  // ---------- Scoring: synthetic week 1 (every rule + the ±3.5 boundary) ----------
  console.log('— Scoring');
  const mkGame = (i: number, data: Record<string, unknown>) =>
    prisma.game.create({
      data: {
        espnEventId: `smoke-g${i}`,
        seasonYear: SMOKE_SEASON,
        weekNumber: 1,
        homeTeamId: aliceRoster[i - 1].teamId,
        awayTeamId: bobRoster[i - 1].teamId,
        startTime: new Date('2026-09-05T16:00:00Z'),
        ...data,
      } as any,
    });

  // g1: Alice's team favored by 7, wins → regular win (+1) / regular loss (0)
  await mkGame(1, {
    spread: -7, favoriteTeamId: aliceRoster[0].teamId,
    status: GameStatus.FINAL, homeScore: 35, awayScore: 10, winnerTeamId: aliceRoster[0].teamId,
  });
  // g2: Alice's team +7 underdog, wins → upset (+2) / favorite loss (−1)
  await mkGame(2, {
    spread: 7, favoriteTeamId: bobRoster[1].teamId,
    status: GameStatus.FINAL, homeScore: 21, awayScore: 17, winnerTeamId: aliceRoster[1].teamId,
  });
  // g3: Alice's team +2 underdog (below 3.5), wins → regular win (+1) / loss (0)
  await mkGame(3, {
    spread: 2, favoriteTeamId: bobRoster[2].teamId,
    status: GameStatus.FINAL, homeScore: 28, awayScore: 27, winnerTeamId: aliceRoster[2].teamId,
  });
  // g4: Alice's team −3.5 favorite (exact boundary), loses → −1 / Bob upset win (+2)
  await mkGame(4, {
    spread: -3.5, favoriteTeamId: aliceRoster[3].teamId,
    status: GameStatus.FINAL, homeScore: 13, awayScore: 20, winnerTeamId: bobRoster[3].teamId,
  });
  // g5: postponed, no winner → 0 / 0
  await mkGame(5, {
    spread: -10, favoriteTeamId: aliceRoster[4].teamId,
    status: GameStatus.POSTPONED,
  });

  await finalizeGames(SMOKE_SEASON, 1);

  const flags = await prisma.game.findMany({
    where: { espnEventId: { in: ['smoke-g1', 'smoke-g2', 'smoke-g3', 'smoke-g4'] } },
    orderBy: { espnEventId: 'asc' },
    select: { espnEventId: true, wasUpset: true },
  });
  const flagMap = new Map(flags.map((f) => [f.espnEventId, f.wasUpset]));
  assert(flagMap.get('smoke-g1') === false, 'g1: 7-pt favorite win is NOT an upset');
  assert(flagMap.get('smoke-g2') === true, 'g2: +7 underdog win IS an upset');
  assert(flagMap.get('smoke-g3') === false, 'g3: +2 underdog win below threshold is NOT an upset');
  assert(flagMap.get('smoke-g4') === true, 'g4: −3.5 favorite loss (exact boundary) IS an upset');

  const { scores } = await calculateLeagueScores(league.id, 1);
  const alicePts = scores.find((s) => s.userId === alice.id)?.points;
  const bobPts = scores.find((s) => s.userId === bob.id)?.points;
  assert(alicePts === 3, `Alice week 1 = 3 (1+2+1−1+0) — got ${alicePts}`);
  assert(bobPts === 1, `Bob week 1 = 1 (0−1+0+2+0) — got ${bobPts}`);

  // ---------- Effective-week roster: simulated swap (closes wk 5, opens wk 6) ----------
  console.log('— Swap safety (effective weeks)');
  const aliceG6 = await prisma.rosterSlot.findFirst({
    where: { leagueId: league.id, userId: alice.id, slot: ConferenceSlot.G6, toWeek: null },
  });
  const newG6Team = await prisma.team.findFirst({
    where: {
      slot: ConferenceSlot.G6,
      id: { notIn: [...aliceRoster, ...bobRoster].map((r) => r.teamId) },
    },
  });

  // Close the old row through week 5, open the new one from week 6
  await prisma.rosterSlot.update({
    where: { id: aliceG6!.id },
    data: { toWeek: 5 },
  });
  await prisma.rosterSlot.create({
    data: {
      leagueId: league.id,
      userId: alice.id,
      slot: ConferenceSlot.G6,
      teamId: newG6Team!.id,
      fromWeek: 6,
    },
  });

  // Week 1 rescore must still use the OLD roster (unchanged total)
  const week1After = await calculateLeagueScores(league.id, 1);
  const alicePtsAfterSwap = week1After.scores.find((s) => s.userId === alice.id)?.points;
  assert(
    alicePtsAfterSwap === 3,
    `week 1 rescore after swap unchanged at 3 — got ${alicePtsAfterSwap}`
  );

  // Week 6: the NEW team wins → counts for Alice
  await prisma.game.create({
    data: {
      espnEventId: 'smoke-g6',
      seasonYear: SMOKE_SEASON,
      weekNumber: 6,
      homeTeamId: newG6Team!.id,
      awayTeamId: bobRoster[4].teamId,
      startTime: new Date('2026-10-10T16:00:00Z'),
      spread: -1,
      favoriteTeamId: newG6Team!.id,
      status: GameStatus.FINAL,
      homeScore: 30,
      awayScore: 20,
      winnerTeamId: newG6Team!.id,
    },
  });
  await finalizeGames(SMOKE_SEASON, 6);
  const week6 = await calculateLeagueScores(league.id, 6);
  const aliceW6 = week6.scores.find((s) => s.userId === alice.id)?.points;
  assert(aliceW6 === 1, `week 6 scores the swapped-in team (+1) — got ${aliceW6}`);

  // ---------- Week-6 swap: private lists in week 5, one run at week 6 ----------
  console.log('— Week 6 swap');

  // Explicit clock values keep this section date-independent
  const { opensAt, locksAt } = await getSwapSchedule(SMOKE_SEASON);
  const HOUR = 3600 * 1000;
  const beforeLists = new Date(opensAt.getTime() - HOUR);
  const listsOpen = new Date(locksAt.getTime() - HOUR);
  const afterLock = new Date(locksAt.getTime() + HOUR);

  // Carol joined after the draft; give her five unowned teams so she's in
  // the run too. Points through week 5: Carol 0, Bob 1, Alice 3.
  for (const slot of DRAFT_SLOTS) {
    const team = await prisma.team.findFirst({
      where: { slot, rosterSlots: { none: { leagueId: league.id, toWeek: null } } },
      orderBy: { name: 'asc' },
    });
    await prisma.rosterSlot.create({
      data: { leagueId: league.id, userId: carol.id, slot, teamId: team!.id, fromWeek: 1 },
    });
  }
  const carolRoster = await getUserRoster(league.id, carol.id);
  const teamIn = (roster: typeof aliceRoster, slot: ConferenceSlot) =>
    roster.find((r) => r.slot === slot)!.teamId;
  const carolSEC = teamIn(carolRoster, ConferenceSlot.SEC);
  const bobSEC = teamIn(bobRoster, ConferenceSlot.SEC);
  const bobB1G = teamIn(bobRoster, ConferenceSlot.BIG_TEN);
  const bobG6 = teamIn(bobRoster, ConferenceSlot.G6); // lost smoke-g6 in week 6 above
  const aliceSEC = teamIn(aliceRoster, ConferenceSlot.SEC);
  const aliceB1G = teamIn(aliceRoster, ConferenceSlot.BIG_TEN);
  const aliceACC = teamIn(aliceRoster, ConferenceSlot.ACC_ND);

  const freeTeams = (slot: ConferenceSlot, take: number) =>
    prisma.team.findMany({
      where: { slot, rosterSlots: { none: { leagueId: league.id, toWeek: null } } },
      orderBy: { name: 'asc' },
      take,
    });
  const [secA, secB] = await freeTeams(ConferenceSlot.SEC, 2);
  const [b1gA] = await freeTeams(ConferenceSlot.BIG_TEN, 1);
  const [accKickedOff] = await freeTeams(ConferenceSlot.ACC_ND, 1);
  const [g6Free] = await freeTeams(ConferenceSlot.G6, 1);

  let swapState = await getSwapState(league.id, carol.id, beforeLists);
  assert(swapState.phase === 'upcoming', 'before week 5: lists not open yet');
  await expectThrow(
    () => saveSwapClaims(league.id, carol.id, [{ dropTeamId: carolSEC, addTeamId: secA.id }], beforeLists),
    'saving a list before week 5 rejected',
    'open when week 5'
  );

  swapState = await getSwapState(league.id, carol.id, listsOpen);
  assert(swapState.phase === 'open', 'week 5: lists open');
  assert(
    swapState.order.map((o) => o.userId).join() === [carol.id, bob.id, alice.id].join(),
    'projected order is worst record first (Carol 0, Bob 1, Alice 3)'
  );

  // ---- SOS tiebreaker: tie Carol with Bob at 1 point through week 5 ----
  await prisma.weeklyScore.create({
    data: { leagueId: league.id, userId: carol.id, weekNumber: 2, points: 1 },
  });
  const setSos = async (teamIds: number[], sosRank: number) => {
    for (const teamId of teamIds) {
      await prisma.teamSos.upsert({
        where: { seasonYear_teamId: { seasonYear: SMOKE_SEASON, teamId } },
        update: { sosRank },
        create: { seasonYear: SMOKE_SEASON, teamId, sosRank },
      });
    }
  };
  const bobFive = bobRoster.map((r) => r.teamId);
  const carolFive = carolRoster.map((r) => r.teamId);
  const orderIds = async () =>
    (await getSwapState(league.id, carol.id, listsOpen)).order.map((o) => o.userId).join();

  // Carol's schedules tougher (5 x 20 = 100 vs Bob's 5 x 60 = 300): she wins
  // the tie, ranks above Bob, so Bob swaps first
  await setSos(bobFive, 60);
  await setSos(carolFive, 20);
  assert(
    (await orderIds()) === [bob.id, carol.id, alice.id].join(),
    'tie on points: lower combined SOS (tougher schedules) ranks higher, so the other player swaps first'
  );

  // Flip the schedules: now Bob's are tougher and Carol swaps first
  await setSos(bobFive, 20);
  await setSos(carolFive, 60);
  swapState = await getSwapState(league.id, carol.id, listsOpen);
  assert(
    swapState.order.map((o) => o.userId).join() === [carol.id, bob.id, alice.id].join() &&
      swapState.order[0].sosTotal === 300 &&
      swapState.order[1].sosTotal === 100,
    'flipped schedules flip the tie (Carol 300 swaps before Bob 100)'
  );

  const leaderboard = await getStandings(league.id);
  assert(
    leaderboard.map((s) => s.member.userId).join() === [alice.id, bob.id, carol.id].join(),
    'the leaderboard uses the same tiebreaker (Bob above Carol on equal points)'
  );

  // A team with no rank on file counts as one past the lowest rank (60 + 1)
  await prisma.teamSos.delete({
    where: { seasonYear_teamId: { seasonYear: SMOKE_SEASON, teamId: bobFive[0] } },
  });
  const bobRow = (await getStandings(league.id)).find((s) => s.member.userId === bob.id);
  assert(bobRow?.sosTotal === 4 * 20 + 61, `unranked team counts as last + 1 (got ${bobRow?.sosTotal})`);
  await setSos([bobFive[0]], 20);

  await expectThrow(
    () => saveSwapClaims(league.id, bob.id, [{ dropTeamId: bobSEC, addTeamId: b1gA.id }], listsOpen),
    'cross-slot line rejected',
    'stay in one slot'
  );
  await expectThrow(
    () => saveSwapClaims(league.id, bob.id, [{ dropTeamId: carolSEC, addTeamId: secA.id }], listsOpen),
    "dropping someone else's team rejected",
    'on your roster'
  );
  await expectThrow(
    () => saveSwapClaims(league.id, bob.id, [{ dropTeamId: bobSEC, addTeamId: aliceSEC }], listsOpen),
    'adding a rostered team rejected',
    'already on a roster'
  );
  await expectThrow(
    () =>
      saveSwapClaims(
        league.id,
        bob.id,
        [{ dropTeamId: bobSEC, addTeamId: secA.id }, { dropTeamId: bobSEC, addTeamId: secA.id }],
        listsOpen
      ),
    'same team listed twice rejected',
    'twice'
  );
  await expectThrow(
    () =>
      saveSwapClaims(
        league.id,
        bob.id,
        Array.from({ length: SWAP_MAX_CLAIMS + 1 }, () => ({ dropTeamId: bobSEC, addTeamId: secA.id })),
        listsOpen
      ),
    `list longer than ${SWAP_MAX_CLAIMS} rejected`,
    'up to'
  );

  // A member who already swapped (retired turn-based window) can't set a list
  await prisma.leagueMember.update({
    where: { leagueId_userId: { leagueId: league.id, userId: alice.id } },
    data: { swapUsed: true },
  });
  await expectThrow(
    () => saveSwapClaims(league.id, alice.id, [], listsOpen),
    'member who already swapped cannot set a list',
    'already used'
  );
  await prisma.leagueMember.update({
    where: { leagueId_userId: { leagueId: league.id, userId: alice.id } },
    data: { swapUsed: false },
  });

  await saveSwapClaims(league.id, carol.id, [{ dropTeamId: carolSEC, addTeamId: secB.id }], listsOpen);
  swapState = await saveSwapClaims(
    league.id,
    carol.id,
    [{ dropTeamId: carolSEC, addTeamId: secA.id }],
    listsOpen
  );
  assert(
    swapState.myClaims.length === 1 && swapState.myClaims[0].addTeamId === secA.id,
    'saving again replaces the whole list'
  );
  swapState = await saveSwapClaims(
    league.id,
    bob.id,
    [
      { dropTeamId: bobSEC, addTeamId: secA.id }, // Carol takes it first → missed
      { dropTeamId: bobG6, addTeamId: g6Free.id }, // Bob's G6 already played week 6 → missed
      { dropTeamId: bobSEC, addTeamId: secB.id }, // goes through
      { dropTeamId: bobB1G, addTeamId: b1gA.id }, // unused: Bob already swapped
    ],
    listsOpen
  );
  assert(
    swapState.myClaims.map((c) => c.priority).join() === '1,2,3,4' &&
      swapState.myClaims[2].addTeamId === secB.id,
    'list saved in priority order'
  );
  const carolView = await getSwapState(league.id, carol.id, listsOpen);
  assert(
    carolView.myClaims.length === 1 &&
      carolView.myClaims[0].dropTeamId === carolSEC &&
      carolView.order.every((o) => o.listSize === null),
    "lists are private: Carol sees only her own line, and nobody's list size"
  );

  // The API refuses rostered teams, so no saved line can name a team that
  // is dropped in the run. Plant one anyway (Alice #1 wants Bob's SEC team,
  // which Bob drops at #2) to prove the run never hands a dropped team to
  // someone later in the order.
  await prisma.swapClaim.createMany({
    data: [
      { dropTeamId: aliceSEC, addTeamId: bobSEC }, // dropped by Bob → missed
      { dropTeamId: aliceACC, addTeamId: accKickedOff.id }, // kicked off in week 6 → missed
      { dropTeamId: aliceB1G, addTeamId: b1gA.id }, // goes through
    ].map((line, i) => ({ leagueId: league.id, userId: alice.id, priority: i + 1, ...line })),
  });

  // A late run: accKickedOff's week-6 game is already final
  const fcsTeam = await prisma.team.findFirst({ where: { slot: ConferenceSlot.NONE } });
  await prisma.game.create({
    data: {
      espnEventId: 'smoke-g9',
      seasonYear: SMOKE_SEASON,
      weekNumber: 6,
      homeTeamId: accKickedOff.id,
      awayTeamId: fcsTeam!.id,
      startTime: new Date(locksAt.getTime() + HOUR / 2),
      status: GameStatus.FINAL,
      homeScore: 31,
      awayScore: 3,
      winnerTeamId: accKickedOff.id,
    },
  });

  // The swap page's board: unowned teams by Pick 6 points, plus your five
  const board = await getSwapTeams(league.id, bob.id);
  const kickedOffRow = board.available.find((t) => t.teamId === accKickedOff.id);
  assert(
    board.available[0].teamId === accKickedOff.id &&
      kickedOffRow?.points === 1 &&
      kickedOffRow.wins === 1 &&
      kickedOffRow.losses === 0,
    `board: available teams sorted by Pick 6 points (${accKickedOff.name} 1-0, +1 on top)`
  );
  assert(
    board.available.every((t, i) => i === 0 || board.available[i - 1].points >= t.points) &&
      !board.available.some((t) => [...bobFive, ...carolFive].includes(t.teamId)),
    'board: only unowned teams, never increasing points'
  );
  const bobG6Row = board.mine.find((t) => t.teamId === bobG6);
  assert(
    board.mine.map((t) => t.slot).join() === DRAFT_SLOTS.join() &&
      bobG6Row?.points === 0 &&
      bobG6Row.wins === 0 &&
      bobG6Row.losses === 1,
    "board: your five in slot order with their season (Bob's G6 0-1, 0 pts)"
  );

  assert(
    (await runDueSwaps(SMOKE_SEASON, listsOpen)).length === 0,
    'nothing runs while lists are open'
  );
  await expectThrow(
    () => saveSwapClaims(league.id, carol.id, [], afterLock),
    'lists lock when week 6 starts',
    'locked'
  );

  const run = (await runDueSwaps(SMOKE_SEASON, afterLock)).find((r) => r.leagueId === league.id);
  assert(run?.swaps === 3, `run made 3 swaps, one per member (got ${run?.swaps})`);

  const bobResult = await getSwapState(league.id, bob.id, afterLock);
  assert(bobResult.phase === 'complete', 'phase is complete after the run');
  assert(
    bobResult.order.map((o) => o.userId).join() === [carol.id, bob.id, alice.id].join(),
    'run order: Carol, Bob, Alice'
  );
  // Their rosters changed in the run, so live SOS would now read 301 / 141
  const [carolEntry, bobEntry, aliceEntry] = bobResult.order;
  assert(
    carolEntry.points === 1 &&
      carolEntry.sosTotal === 300 &&
      bobEntry.points === 1 &&
      bobEntry.sosTotal === 100,
    `recap keeps the numbers that set the order (tied at 1: SOS 300 vs 100; got ${carolEntry.sosTotal} vs ${bobEntry.sosTotal})`
  );
  assert(
    carolEntry.swap?.choice === 1 &&
      bobEntry.swap?.choice === 3 &&
      aliceEntry.swap?.choice === 3 &&
      carolEntry.listSize === 1 &&
      bobEntry.listSize === 4 &&
      aliceEntry.listSize === 3,
    'recap shows which choice each player got and how long each list was'
  );
  assert(
    bobResult.myClaims.map((c) => c.status).join() === 'MISSED,MISSED,SWAPPED,UNUSED',
    `Bob: #1 missed, #2 missed, #3 swapped, #4 unused (got ${bobResult.myClaims.map((c) => c.status).join()})`
  );
  assert(
    !!bobResult.myClaims[0].note?.includes('Smoke Carol took'),
    `a taken team's note names who took it (got "${bobResult.myClaims[0].note}")`
  );
  assert(
    !!bobResult.myClaims[1].note?.includes('already played in week 6'),
    `a drop team that already played stays put (got "${bobResult.myClaims[1].note}")`
  );

  const aliceResult = await getSwapState(league.id, alice.id, afterLock);
  assert(
    aliceResult.myClaims.map((c) => c.status).join() === 'MISSED,MISSED,SWAPPED',
    `Alice: #1 missed, #2 missed, #3 swapped (got ${aliceResult.myClaims.map((c) => c.status).join()})`
  );
  assert(
    !!aliceResult.myClaims[0].note?.includes('dropped in the swap'),
    `a team dropped earlier in the run can't be picked up later (got "${aliceResult.myClaims[0].note}")`
  );
  assert(
    !!aliceResult.myClaims[1].note?.includes('already played in week 6'),
    'a team that already kicked off in week 6 cannot be added'
  );
  assert(
    aliceResult.order[0].swap?.addTeamName === secA.name &&
      aliceResult.myClaims.every((c) => c.dropTeamId !== carolSEC),
    "after the run everyone sees each member's swap, but not their lists"
  );

  const carolRows = await prisma.rosterSlot.findMany({
    where: { leagueId: league.id, userId: carol.id, slot: ConferenceSlot.SEC },
    orderBy: { fromWeek: 'asc' },
  });
  assert(
    carolRows.length === 2 &&
      carolRows[0].teamId === carolSEC &&
      carolRows[0].toWeek === 5 &&
      carolRows[1].teamId === secA.id &&
      carolRows[1].fromWeek === 6 &&
      carolRows[1].toWeek === null,
    'old team kept through week 5, new team from week 6'
  );
  assert(
    (await prisma.rosterSlot.count({
      where: { leagueId: league.id, teamId: { in: [carolSEC, bobSEC] }, toWeek: null },
    })) === 0,
    'dropped teams stay unowned'
  );
  assert(
    (await prisma.leagueMember.count({ where: { leagueId: league.id, swapUsed: true } })) === 3,
    'all three members used their swap'
  );

  const week1AfterRun = await calculateLeagueScores(league.id, 1);
  assert(
    week1AfterRun.scores.find((s) => s.userId === alice.id)?.points === 3 &&
      week1AfterRun.scores.find((s) => s.userId === bob.id)?.points === 1,
    'week 1 unchanged after the run (history is untouchable)'
  );

  // Week 6: Bob's new SEC team beats Carol's dropped one
  await prisma.game.create({
    data: {
      espnEventId: 'smoke-g10',
      seasonYear: SMOKE_SEASON,
      weekNumber: 6,
      homeTeamId: secB.id,
      awayTeamId: carolSEC,
      startTime: new Date(locksAt.getTime() + 5 * 24 * HOUR),
      status: GameStatus.FINAL,
      homeScore: 24,
      awayScore: 17,
      winnerTeamId: secB.id,
    },
  });
  await finalizeGames(SMOKE_SEASON, 6);
  const week6AfterRun = await calculateLeagueScores(league.id, 6);
  assert(
    week6AfterRun.scores.find((s) => s.userId === bob.id)?.points === 1 &&
      week6AfterRun.scores.find((s) => s.userId === carol.id)?.points === 0,
    'week 6 scores the new team (Bob +1), not the dropped one (Carol 0)'
  );

  assert((await runSwap(league.id, afterLock)) === null, 'a second run is a no-op');

  // ---------- Double-game weeks (ESPN's two-weekend Week 1) ----------
  console.log('— Double-game attribution');
  const mk = (id: number, weekNumber: number, startTime: string, status = GameStatus.FINAL) => ({
    id,
    weekNumber,
    startTime: new Date(startTime),
    status,
  });
  // FSU shape: two games in week 1, off in week 2 → second game counts as week 2
  const fsuLike = assignScoringWeeks(
    [mk(1, 1, '2026-08-29T23:00:00Z'), mk(2, 1, '2026-09-07T23:30:00Z'), mk(3, 3, '2026-09-19T19:30:00Z')],
    15
  );
  assert(
    fsuLike.get(1) === 1 && fsuLike.get(2) === 2 && fsuLike.get(3) === 3,
    'two games in week 1 + bye in week 2 → second game counts as week 2'
  );
  // UNLV shape: two games in week 1 AND a week-2 game → both stay in week 1
  const unlvLike = assignScoringWeeks(
    [mk(1, 1, '2026-08-30T02:00:00Z'), mk(2, 1, '2026-09-06T02:00:00Z'), mk(3, 2, '2026-09-12T19:45:00Z')],
    15
  );
  assert(
    unlvLike.get(1) === 1 && unlvLike.get(2) === 1 && unlvLike.get(3) === 2,
    'two games in week 1 + a week-2 game → both count in week 1'
  );
  const cancelled = assignScoringWeeks(
    [mk(1, 1, '2026-08-29T23:00:00Z'), mk(2, 1, '2026-09-05T23:00:00Z'), mk(3, 2, '2026-09-12T19:45:00Z', GameStatus.CANCELLED)],
    15
  );
  assert(cancelled.get(2) === 2 && !cancelled.has(3), 'a cancelled week-2 game is a bye, not a game');
  const lastWeek = assignScoringWeeks([mk(1, 15, '2026-12-05T17:00:00Z'), mk(2, 15, '2026-12-12T20:00:00Z')], 15);
  assert(lastWeek.get(2) === 15, 'nothing rolls past the final week');

  // End to end: Alice's SEC team (g1, already +1 in week 1) plays a second
  // week-1 game and wins. No week-2 game yet → it lands in week 2.
  const aliceSec = aliceRoster.find((r) => r.slot === 'SEC')!;
  const filler = await prisma.team.findFirst({
    where: {
      id: { notIn: [...aliceRoster, ...bobRoster].map((r) => r.teamId) },
      slot: ConferenceSlot.NONE,
    },
  });
  await prisma.game.create({
    data: {
      espnEventId: 'smoke-g7',
      seasonYear: SMOKE_SEASON,
      weekNumber: 1,
      homeTeamId: aliceSec.teamId,
      awayTeamId: filler!.id,
      startTime: new Date('2026-09-07T23:30:00Z'),
      status: GameStatus.FINAL,
      homeScore: 27,
      awayScore: 24,
      winnerTeamId: aliceSec.teamId,
      neutralSite: true, // the team card's Game-row fallback must carry it
    },
  });
  const w1Rolled = await calculateLeagueScores(league.id, 1);
  const w2Rolled = await calculateLeagueScores(league.id, 2);
  assert(
    w1Rolled.scores.find((x) => x.userId === alice.id)?.points === 3,
    'Alice week 1 still 3: the Labor Day game rolled forward'
  );
  assert(
    w2Rolled.scores.find((x) => x.userId === alice.id)?.points === 1,
    'Alice week 2 = 1: the rolled game counts there'
  );
  // Now the team also has a week-2 game → both week-1 games count in week 1
  await prisma.game.create({
    data: {
      espnEventId: 'smoke-g8',
      seasonYear: SMOKE_SEASON,
      weekNumber: 2,
      homeTeamId: aliceSec.teamId,
      awayTeamId: filler!.id,
      startTime: new Date('2026-09-12T20:00:00Z'),
      status: GameStatus.SCHEDULED,
    },
  });
  const w1Both = await calculateLeagueScores(league.id, 1);
  const w2Both = await calculateLeagueScores(league.id, 2);
  assert(
    w1Both.scores.find((x) => x.userId === alice.id)?.points === 4,
    'Alice week 1 = 4 once a week-2 game exists (both games count in week 1)'
  );
  assert(
    w2Both.scores.find((x) => x.userId === alice.id)?.points === 0,
    'Alice week 2 back to 0 (her week-2 game is not final)'
  );

  // ---------- ESPN scoreboard: neutral sites ----------
  // Red River (Oct 10, 2026) as ESPN lists it: OU "home", TEX "away", in Dallas
  const sbTeam = (id: string, name: string, abbreviation: string) => ({
    id, location: name, name, abbreviation, displayName: name, shortDisplayName: name,
  });
  const sbEvent = (id: string, neutralSite: boolean | undefined) => ({
    id,
    date: '2026-10-10T16:00Z',
    name: '',
    shortName: '',
    status: { type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre' as const, completed: false, description: '' } },
    competitions: [{
      id,
      date: '2026-10-10T16:00Z',
      ...(neutralSite === undefined ? {} : { neutralSite }),
      competitors: [
        { id: '201', homeAway: 'home' as const, team: sbTeam('201', 'Oklahoma', 'OU') },
        { id: '251', homeAway: 'away' as const, team: sbTeam('251', 'Texas', 'TEX') },
      ],
      status: { type: { state: 'pre' as const, completed: false } },
    }],
  });
  const [redRiver, campusGame] = parseScoreboardGames(
    { events: [sbEvent('rr', true), sbEvent('campus', undefined)] },
    2026,
    6
  );
  assert(
    redRiver.neutralSite === true && campusGame.neutralSite === false,
    'scoreboard: ESPN neutralSite is read (Red River), and a missing flag means a campus game'
  );

  // ---------- Odds matcher (the Hawai'i vs UNLV cross-match) ----------
  console.log('— Odds matcher');
  const espnGame = (home: string, away: string, startTime: string): ParsedGame => ({
    espnEventId: 'x',
    seasonYear: SMOKE_SEASON,
    weekNumber: 1,
    homeTeam: { espnId: '1', name: home, abbreviation: '', displayName: home },
    awayTeam: { espnId: '2', name: away, abbreviation: '', displayName: away },
    startTime: new Date(startTime),
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    venue: null,
    neutralSite: false,
    broadcast: null,
    isCompleted: false,
    winnerId: null,
  });
  const oddsEvent = (homeTeam: string, awayTeam: string, spread: number, commence: string): ParsedOdds => ({
    oddsEventId: 'o',
    homeTeam,
    awayTeam,
    commenceTime: new Date(commence),
    spread,
    favoriteTeam: spread < 0 ? 'home' : spread > 0 ? 'away' : null,
    bookmaker: 'DraftKings',
    timestamp: new Date(),
  });
  const kick = '2026-09-06T02:00:00Z';
  const sameSlot = [
    oddsEvent('San Diego State Aztecs', 'Portland State Vikings', -38.5, kick),
    oddsEvent('Hawaii Rainbow Warriors', 'UNLV Rebels', 2.5, kick),
  ];
  const hawaii = matchGameToOdds(espnGame("Hawai'i Rainbow Warriors", 'UNLV Rebels', kick), sameSlot);
  assert(hawaii?.spread === 2.5, `same-kickoff un-aliased teams no longer cross-match (got ${hawaii?.spread})`);
  assert(
    matchGameToOdds(espnGame('Tarleton State Texans', 'Utah Tech Trailblazers', kick), sameSlot) === null,
    'no name agreement → no line (never someone else\'s line)'
  );
  const swapped = matchGameToOdds(
    espnGame('Georgia Bulldogs', 'Clemson Tigers', kick),
    [oddsEvent('Clemson Tigers', 'Georgia Bulldogs', 7, kick)]
  );
  assert(swapped?.spread === -7 && swapped.favoriteTeam === 'home', 'book lists home/away reversed → spread flipped to ESPN home');
  assert(teamNamesAgree('San José State Spartans', 'San Jose State Spartans'), 'diacritics fold (San José ↔ San Jose)');
  assert(teamNamesAgree('Southern Miss Golden Eagles', 'Southern Mississippi Golden Eagles'), 'same first word + mascot agree');
  assert(!teamNamesAgree('Texas Longhorns', 'Texas State Bobcats'), 'Texas ≠ Texas State');
  assert(!teamNamesAgree('Miami Hurricanes', 'Miami (OH) RedHawks'), 'Miami ≠ Miami (OH)');
  // ESPN vs Odds API names with no shared first word (week 3–4 lines went missing)
  const appState = matchGameToOdds(
    espnGame('NC State Wolfpack', 'App State Mountaineers', kick),
    [oddsEvent('NC State Wolfpack', 'Appalachian State Mountaineers', -14, kick)]
  );
  assert(appState?.spread === -14, `App State ↔ Appalachian State gets its line (got ${appState?.spread})`);
  for (const [espn, odds] of [
    ['Massachusetts Minutemen', 'UMass Minutemen'],
    ['Long Island University Sharks', 'LIU Sharks'],
    ['The Citadel Bulldogs', 'Citadel Bulldogs'],
    ['SE Louisiana Lions', 'Southeastern Louisiana Lions'],
    ['UAlbany Great Danes', 'Albany'],
    ['Arkansas-Pine Bluff Golden Lions', 'Arkansas Pine Bluff Golden Lions'], // hyphenated alias key
  ]) {
    assert(teamNamesAgree(espn, odds), `${espn} ↔ ${odds}`);
  }
  assert(!teamNamesAgree('App State Mountaineers', 'West Virginia Mountaineers'), 'App State ≠ West Virginia (shared mascot)');

  // ---------- Team card (tap a team on My Team / Week by Week) ----------
  console.log('— Team card');
  const espnSched = (
    espnEventId: string,
    weekNumber: number,
    startTime: string,
    extra: Partial<EspnScheduleGame> = {}
  ): EspnScheduleGame => ({
    espnEventId,
    weekNumber,
    startTime: new Date(startTime),
    timeTbd: false,
    status: 'scheduled',
    statusDetail: null,
    isHome: true,
    neutralSite: false,
    teamScore: null,
    teamWon: null,
    teamRank: null,
    opponent: { espnId: '0', name: 'Opponent', abbreviation: null, rank: null, record: null },
    opponentScore: null,
    venue: null,
    broadcast: null,
    ...extra,
  });
  // Alice's SEC team: smoke-g1 (wk 1, -7, won 35-10), smoke-g7 (wk 1, no
  // line, won), smoke-g8 (wk 2, scheduled). ESPN's list here disagrees on g1
  // (as after a commissioner override), lacks g7, calls g8 final before the
  // sync has, and adds an unsynced week-9 game.
  const merged = mergeTeamGames(
    aliceSec.teamId,
    await loadScoringWeekMap(SMOKE_SEASON, [aliceSec.teamId]),
    [
      espnSched('smoke-g1', 1, '2026-09-05T16:00:00Z', { status: 'final', teamWon: false, teamScore: 10, opponentScore: 35 }),
      espnSched('smoke-g8', 2, '2026-09-12T20:00:00Z', { status: 'final', teamWon: true, teamScore: 14, opponentScore: 7 }),
      espnSched('401999999', 9, '2026-10-31T19:30:00Z'),
    ],
    { fromWeek: 2, toWeek: null }
  );
  const cardGame = new Map(merged.map((g) => [g.espnEventId, g]));
  const [cg1, cg7, cg8, cgFuture] = ['smoke-g1', 'smoke-g7', 'smoke-g8', '401999999'].map((id) => cardGame.get(id)!);
  assert(
    merged.map((g) => g.espnEventId).join() === 'smoke-g1,smoke-g7,smoke-g8,401999999',
    'card: ESPN schedule plus the Game rows it lacks, kickoff order'
  );
  assert(cg1.teamSpread === -7 && cg1.points === 1, 'card: stored line and points come from the Game row');
  assert(
    cg1.result === 'W' && cg1.teamScore === 35 && cg1.opponentScore === 10,
    'card: a final Game row beats ESPN on score and result (matches the points)'
  );
  assert(cg7.points === 1 && cg7.week === 1, 'card: a synced game missing from ESPN still shows, scored');
  assert(cg7.neutralSite && !cg1.neutralSite, "card: a Game row's neutral site carries over (\"vs\", never \"at\")");
  assert(cg8.result === 'W' && cg8.points === null, 'card: ESPN final before the sync → no points yet');
  assert(
    cgFuture.week === 9 && cgFuture.points === null && cgFuture.espnUrl?.endsWith('/gameId/401999999') === true,
    'card: an unsynced future game rides on ESPN alone'
  );
  assert(!cg1.counted && !cg7.counted && cg8.counted && cgFuture.counted, 'card: games outside the owner window are flagged');
  assert(pickPreviewGame(merged, 'smoke-g7') === cg7, 'card opens on the tapped game');
  assert(pickPreviewGame(merged) === cgFuture, 'no tap → the next scheduled game');
  assert(
    pickPreviewGame([...merged, { ...cgFuture, espnEventId: 'live', status: 'in_progress' }])?.espnEventId === 'live',
    'no tap → a live game beats the next one'
  );

  // How long a team's ESPN schedule stays cached (Sat noon UTC)
  const ttlNow = new Date('2026-10-03T12:00:00Z');
  const ttlOf = (...games: EspnScheduleGame[]) =>
    scheduleTtl({ color: null, record: null, standing: null, clubhouseUrl: null, games }, ttlNow);
  assert(ttlOf(espnSched('a', 5, '2026-10-03T19:30:00Z')) === 900, 'schedule cache: 15 min when kickoff is hours away');
  assert(ttlOf(espnSched('a', 5, '2026-10-03T12:05:00Z')) === 300, 'schedule cache: expires at the next kickoff');
  assert(ttlOf(espnSched('a', 5, '2026-10-03T11:00:00Z', { status: 'in_progress' })) === 60, 'schedule cache: 60s during a live game');
  assert(ttlOf(espnSched('a', 5, '2026-10-03T11:45:00Z')) === 60, 'schedule cache: 60s past a kickoff ESPN hasn\'t flipped to live');
  assert(ttlOf(espnSched('a', 1, '2026-09-05T16:00:00Z', { status: 'final' })) === 900, 'schedule cache: 15 min once the season is done');

  // End to end on the smoke season: ESPN has nothing for 2099, so the card
  // runs on Game rows alone (the same path as an ESPN outage)
  const secCard = await getTeamCard(league.id, aliceSec.teamId, { userId: alice.id });
  assert(
    secCard?.owner?.userId === alice.id && secCard.pick6.points === 2 && secCard.pick6.ownerPoints === 2,
    `card: Alice owns it, 2 Pick 6 points (got ${secCard?.pick6.points}/${secCard?.pick6.ownerPoints})`
  );
  assert(
    secCard?.games.length === 3 && secCard.previewEventId === 'smoke-g8',
    'card without ESPN runs on Game rows and opens on the next game'
  );
  const tappedCard = await getTeamCard(league.id, aliceSec.teamId, { eventId: 'smoke-g1', userId: alice.id });
  assert(tappedCard?.previewEventId === 'smoke-g1', 'card opens on the tapped event');
  const awayCard = await getTeamCard(league.id, bobRoster[1].teamId);
  const awayG2 = awayCard?.games.find((g) => g.espnEventId === 'smoke-g2');
  assert(
    awayG2?.teamSpread === -7 && awayG2.wasUpset && awayG2.points === -1,
    'card from the away side: line flips to -7, favorite lost → -1'
  );
  assert((await getTeamCard(league.id, 999999)) === null, 'unknown team → null (404)');

  // Live view: ESPN's week scoreboard on top of a live game. Shapes copied
  // from a real live scoreboard (Oct 4, NFL: the same feed format as college)
  const liveScoreboard = {
    events: [
      {
        id: 'live-1', // home team 2 has the ball at the visitors' 8
        status: { type: { state: 'in', shortDetail: '15:00 - 2nd' } },
        competitions: [{
          competitors: [
            { homeAway: 'home', score: '0', team: { id: '2' } },
            { homeAway: 'away', score: '7', team: { id: '17' } },
          ],
          situation: { down: 1, yardLine: 92, distance: 8, downDistanceText: '1st & Goal at NE 8', isRedZone: true, possession: '2' },
        }],
      },
      {
        id: 'live-2', // a kickoff: no possession, yet ESPN says red zone
        status: { type: { state: 'in', shortDetail: '2:08 - 1st' } },
        competitions: [{
          competitors: [
            { homeAway: 'home', score: '3', team: { id: '21' } },
            { homeAway: 'away', score: '3', team: { id: '14' } },
          ],
          situation: { down: -1, yardLine: 65, distance: 0, isRedZone: true },
        }],
      },
      {
        id: 'done-1',
        status: { type: { state: 'post', shortDetail: 'Final' } },
        competitions: [{ competitors: [{ homeAway: 'home', score: '21', team: { id: '5' } }, { homeAway: 'away', score: '9', team: { id: '6' } }] }],
      },
    ],
  };
  const liveGames = parseLiveGames(liveScoreboard);
  const kickoff = liveGames.find((g) => g.espnEventId === 'live-2');
  assert(
    liveGames.length === 2 &&
      liveGames[0].homeScore === 0 &&
      liveGames[0].awayScore === 7 &&
      kickoff?.possessionEspnId === null &&
      kickoff.redZone === false,
    'live: only games in progress; a kickoff has no possession and no red zone'
  );
  const asLive = (espnEventId: string) => ({ ...merged[0], espnEventId, status: 'in_progress' as const, live: null });
  const [homeView, liveNotOnBoard, finalGame] = applyLiveGames(
    [asLive('live-1'), asLive('live-9'), { ...merged[0], espnEventId: 'done-1' }],
    liveGames,
    '2'
  );
  assert(
    homeView.teamScore === 0 &&
      homeView.opponentScore === 7 &&
      homeView.statusDetail === '15:00 - 2nd' &&
      homeView.live?.possession === 'team' &&
      homeView.live.ballOn === 92 &&
      homeView.live.redZone &&
      homeView.live.downDistance === '1st & Goal at NE 8',
    'live: the home team on offense attacks toward 100 (ball 92 yards out, 8 to go)'
  );
  const [awayView] = applyLiveGames([asLive('live-1')], liveGames, '17');
  assert(
    awayView.teamScore === 7 && awayView.live?.possession === 'opponent' && awayView.live.ballOn === 8,
    "live: the visitors' card flips it (opponent ball, 8 yards from their own goal)"
  );
  const [kickView] = applyLiveGames([asLive('live-2')], liveGames, '14');
  assert(
    kickView.live?.possession === null && kickView.live.ballOn === 35 && !kickView.live.redZone,
    'live: a kickoff shows the ball with nobody in possession'
  );
  assert(
    liveNotOnBoard.live === null && finalGame.live === null && finalGame.status === merged[0].status,
    'live: games not live (or missing from the scoreboard) are left alone'
  );

  // ---------- Commissioner video messages (fal stubbed: free, offline) ----------
  console.log('— Video messages');
  const savedFal = { key: process.env.FAL_KEY, creators: process.env.VIDEO_CREATORS };
  process.env.FAL_KEY = 'smoke-test-key';
  process.env.VIDEO_CREATORS = 'someone-else@test.local';
  const photo = 'data:image/jpeg;base64,' + Buffer.from('not really a jpeg').toString('base64');
  const newVideo = (extra: Record<string, unknown> = {}) => ({
    photo, setting: 'press', voice: 'Brian', script: 'Week six is here. Set your swap lists, cowards.', consent: true, ...extra,
  });
  assert(!(await listVideos(league.id, alice.id)).canCreate, 'video: a commissioner not on VIDEO_CREATORS cannot make one');
  process.env.VIDEO_CREATORS = ' Smoke1@Test.Local , other@test.local';
  assert(
    (await listVideos(league.id, alice.id)).canCreate && !(await listVideos(league.id, bob.id)).canCreate,
    'video: an allowlisted commissioner can (any case), a member cannot'
  );
  await expectThrow(() => createVideo(league.id, bob.id, newVideo(), { start: false }), 'video: a member cannot start one', 'invite-only');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo({ consent: false }), { start: false }), 'video: own-face consent required', 'photo is of you');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo({ photo: 'https://example.com/me.jpg' }), { start: false }), 'video: photo must be an uploaded image', 'Add a photo');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo({ setting: 'moon' }), { start: false }), 'video: unknown setting rejected', 'Pick a setting');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo({ voice: 'Morgan Freeman' }), { start: false }), 'video: unknown voice rejected', 'Pick a voice');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo({ script: 'x'.repeat(601) }), { start: false }), 'video: script capped at 600 characters', 'under 600');

  // A stub fal: records each call, answers like the real models
  const falCalls: { modelId: string; input: Record<string, unknown>; keepForever?: boolean }[] = [];
  const stubFal = (failOn?: string, noUrl = false): RunModel => async (modelId, input, options) => {
    falCalls.push({ modelId, input, keepForever: options?.keepForever });
    if (failOn && modelId.includes(failOn)) throw new Error('fal 422: no face found');
    if (modelId.includes('nano-banana')) return { images: [{ url: 'https://fal.media/scene.jpg' }] };
    if (modelId.includes('elevenlabs')) return { audio: { url: 'https://fal.media/voice.mp3' } };
    return noUrl ? { video: {} } : { video: { url: 'https://fal.media/final.mp4' }, duration: 12.5 };
  };
  const readyVideo = await createVideo(league.id, alice.id, newVideo(), { start: false });
  assert(readyVideo.status === 'PROCESSING' && readyVideo.mine, 'video: starts PROCESSING');
  await processVideo(readyVideo.id, { photo, setting: 'press', voice: 'Brian', script: readyVideo.script }, stubFal());
  const readyRow = await prisma.leagueVideo.findUnique({ where: { id: readyVideo.id } });
  assert(
    readyRow?.status === 'READY' && readyRow.videoUrl === 'https://fal.media/final.mp4' && readyRow.durationSec === 12.5,
    'video: three fal jobs end READY with the video URL and length'
  );
  const [sceneCall, voiceCall, videoCall] = falCalls;
  assert(
    falCalls.length === 3 &&
      (sceneCall.input.image_urls as string[])[0] === photo &&
      voiceCall.input.voice === 'Brian' && voiceCall.input.text === readyVideo.script &&
      videoCall.input.image_url === 'https://fal.media/scene.jpg' && videoCall.input.audio_url === 'https://fal.media/voice.mp3' &&
      videoCall.keepForever === true && !sceneCall.keepForever && !voiceCall.keepForever,
    'video: photo → setting → voice → animation, and only the finished video is kept for good'
  );
  falCalls.length = 0;
  const asIs = await createVideo(league.id, alice.id, newVideo({ setting: 'asis' }), { start: false });
  await processVideo(asIs.id, { photo, setting: 'asis', voice: 'Bill', script: asIs.script }, stubFal());
  assert(falCalls.length === 2 && falCalls[1].input.image_url === photo, '"My photo as is" skips the setting job');
  const failedVideo = await createVideo(league.id, alice.id, newVideo(), { start: false });
  await processVideo(failedVideo.id, { photo, setting: 'press', voice: 'Brian', script: failedVideo.script }, stubFal('kling'));
  const noUrl = await createVideo(league.id, alice.id, newVideo(), { start: false });
  await processVideo(noUrl.id, { photo, setting: 'press', voice: 'Brian', script: noUrl.script }, stubFal(undefined, true));
  const [failedRow, noUrlRow] = await Promise.all([
    prisma.leagueVideo.findUnique({ where: { id: failedVideo.id } }),
    prisma.leagueVideo.findUnique({ where: { id: noUrl.id } }),
  ]);
  assert(
    failedRow?.status === 'FAILED' && !!failedRow.error?.includes('front-facing photo') &&
      noUrlRow?.status === 'FAILED' && noUrlRow.videoUrl === null,
    'video: a fal error or a result without a URL ends FAILED with a plain reason'
  );

  const bobVideosBefore = await listVideos(league.id, bob.id);
  const aliceList = await listVideos(league.id, alice.id);
  assert(bobVideosBefore.videos.length === 0 && aliceList.videos.length === 4, "video: unsent videos are only their maker's");
  await expectThrow(() => sendVideo(league.id, readyVideo.id, bob.id), 'video: a member cannot send', 'Only the commissioner');
  await expectThrow(() => sendVideo(league.id, failedVideo.id, alice.id), 'video: a failed video cannot be sent', 'not ready');
  outbox.length = 0;
  const sent = await sendVideo(league.id, readyVideo.id, alice.id);
  assert(
    sent.sentTo === 2 &&
      outbox.map((e) => e.to).sort().join() === 'smoke2@test.local,smoke3@test.local' &&
      outbox[0].text.includes(`/league/${league.id}?video=${readyVideo.id}`) &&
      outbox[0].text.includes('AI-generated'),
    'video: one tap emails every other member a link, labeled AI-generated'
  );
  await expectThrow(() => sendVideo(league.id, readyVideo.id, alice.id), 'video: sends once', 'Already sent');
  const bobVideosAfter = await listVideos(league.id, bob.id);
  assert(
    bobVideosAfter.videos.length === 1 && bobVideosAfter.videos[0].videoUrl === 'https://fal.media/final.mp4' && !bobVideosAfter.videos[0].mine,
    'video: once sent, every member sees it'
  );

  const interrupted = await createVideo(league.id, alice.id, newVideo(), { start: false });
  await failInterruptedVideos();
  const interruptedRow = await prisma.leagueVideo.findUnique({ where: { id: interrupted.id } });
  assert(interruptedRow?.status === 'FAILED' && !!interruptedRow.error?.includes('Interrupted'), 'video: a restart fails videos left mid-way');
  assert(VIDEOS_PER_DAY === 5, 'video: 5 a day per maker');
  await expectThrow(() => createVideo(league.id, alice.id, newVideo(), { start: false }), 'video: the 6th in a day is refused', 'Try again tomorrow');
  process.env.FAL_KEY = savedFal.key;
  process.env.VIDEO_CREATORS = savedFal.creators;
  if (savedFal.key === undefined) delete process.env.FAL_KEY;
  if (savedFal.creators === undefined) delete process.env.VIDEO_CREATORS;

  // ---------- Password reset by email ----------
  console.log('— Password reset');
  const escaped = renderEmail({
    preheader: 'p',
    heading: 'h',
    paragraphs: ['<script>x</script> & "q"'],
    button: { label: 'b', url: 'https://pick6cfb.com/?a=1&b=2' },
    footer: 'f',
  });
  assert(
    escaped.html.includes('&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;') &&
      !escaped.html.includes('<script>x'),
    'reset: names are HTML-escaped in the email'
  );

  assert(
    (await findUserByEmail(' SMOKE1@Test.Local '))?.id === alice.id &&
      (await findUserByEmail('smoke_@test.local')) === null &&
      (await findUserByEmail('%@test.local')) === null,
    'email lookup: any case, but % and _ are not wildcards'
  );

  outbox.length = 0;
  const t0 = Date.now();
  await requestPasswordReset('nobody@test.local', t0);
  await requestPasswordReset('%@test.local', t0);
  assert(outbox.length === 0, 'reset: an unknown email (or a wildcard) sends nothing');
  await requestPasswordReset('  SMOKE2@Test.Local ', t0);
  assert(
    outbox.length === 1 && outbox[0].to === 'smoke2@test.local',
    'reset: email matched case-insensitively, sent to the account'
  );
  await requestPasswordReset('smoke2@test.local', t0 + 10_000);
  assert(outbox.length === 1, 'reset: a second request within a minute sends nothing');
  const resetToken = outbox[0].text.match(/\/reset-password#token=(\S+)/)?.[1] ?? '';
  assert(resetToken.length > 0, 'reset: the email carries a /reset-password#token= link');

  await expectThrow(
    () => resetPassword(generateToken(bob.id, bob.email), 'newpass123'),
    'reset: a login token is not a reset token',
    'reset link'
  );
  let resetTokenLogsIn = true;
  try {
    verifyToken(resetToken);
  } catch {
    resetTokenLogsIn = false;
  }
  assert(!resetTokenLogsIn, 'reset: a reset token is not a login token');
  await expectThrow(() => resetPassword(resetToken, 'short'), 'reset: under 8 characters rejected', 'at least 8');

  const resetUser = await resetPassword(resetToken, 'newpass123');
  const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
  assert(
    resetUser.id === bob.id && (await bcrypt.compare('newpass123', bobAfter!.passwordHash)),
    'reset: the new password is set'
  );
  await expectThrow(() => resetPassword(resetToken, 'another123'), 'reset: a link works only once', 'reset link');
  await expectThrow(
    () => resetPassword(generatePasswordResetToken(bob.id, bobAfter!.passwordHash, -1), 'another123'),
    'reset: an expired link is rejected',
    'reset link'
  );
  // Back to smoke123 so the smoke accounts still sign in
  await prisma.user.update({ where: { id: bob.id }, data: { passwordHash: smokeHash } });

  // ---------- Summary ----------
  console.log(`\n${failed === 0 ? '🎉' : '💥'} ${passed} passed, ${failed} failed`);
  console.log('   Smoke League left in place (code SMOKE1; smoke1@test.local / smoke2@test.local, password smoke123)\n');
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error('💥 Smoke test crashed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
