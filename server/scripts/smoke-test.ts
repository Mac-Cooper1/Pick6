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
import { getUserRoster, getAllRosters } from '../src/services/rosterService';
import {
  openSwapWindow,
  closeSwapWindow,
  performSwap,
  passSwap,
  getSwapState,
} from '../src/services/swapService';

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

  // ---------- Cleanup from prior runs ----------
  const oldLeague = await prisma.league.findUnique({ where: { joinCode: 'SMOKE1' } });
  if (oldLeague) await prisma.league.delete({ where: { id: oldLeague.id } });
  await prisma.game.deleteMany({ where: { espnEventId: { startsWith: 'smoke-' } } });
  await prisma.user.deleteMany({
    where: { email: { in: ['smoke1@test.local', 'smoke2@test.local', 'smoke3@test.local'] } },
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
      seasonYear: 2026,
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
        seasonYear: 2026,
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

  await finalizeGames(2026, 1);

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

  // ---------- Effective-week roster: simulated week-5 swap ----------
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
      seasonYear: 2026,
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
  await finalizeGames(2026, 6);
  const week6 = await calculateLeagueScores(league.id, 6);
  const aliceW6 = week6.scores.find((s) => s.userId === alice.id)?.points;
  assert(aliceW6 === 1, `week 6 scores the swapped-in team (+1) — got ${aliceW6}`);

  // ---------- WS8: swap window (turns, pass, free phase, close) ----------
  console.log('— Swap window (WS8)');

  // Points through week 5: Carol 0 (no roster), Bob 1, Alice 3 → that order
  let swap = await openSwapWindow(league.id);
  assert(swap.status === 'OPEN', 'window opens');
  assert(swap.order.length === 3, `order includes all 3 members (got ${swap.order.length})`);
  assert(
    swap.order[0].userId === carol.id && swap.order[1].userId === bob.id && swap.order[2].userId === alice.id,
    'order is worst record first (Carol, Bob, Alice)'
  );
  assert(swap.onTheClockUserId === carol.id, 'Carol (worst) is on the clock');

  await expectThrow(
    () => performSwap(league.id, bob.id, bobRoster[0].teamId, 999999),
    'swapping out of turn rejected',
    'Not your turn'
  );

  swap = await passSwap(league.id, carol.id);
  assert(swap.onTheClockUserId === bob.id, "after Carol passes, Bob is on the clock");

  // Wrong-slot swap rejected
  const freeG6 = await prisma.team.findFirst({
    where: {
      slot: ConferenceSlot.G6,
      rosterSlots: { none: { leagueId: league.id, toWeek: null } },
    },
  });
  await expectThrow(
    () => performSwap(league.id, bob.id, bobRoster[0].teamId, freeG6!.id),
    'cross-slot swap rejected',
    'must stay in the'
  );

  // Bob's real swap: SEC for a free SEC team
  const freeSec = await prisma.team.findFirst({
    where: {
      slot: ConferenceSlot.SEC,
      rosterSlots: { none: { leagueId: league.id, toWeek: null } },
    },
  });
  const bobSwap = await performSwap(league.id, bob.id, bobRoster[0].teamId, freeSec!.id);
  assert(bobSwap.effectiveFromWeek === 6, `swap effective from week 6 (got ${bobSwap.effectiveFromWeek})`);

  const bobOldRow = await prisma.rosterSlot.findFirst({
    where: { leagueId: league.id, userId: bob.id, teamId: bobRoster[0].teamId },
  });
  assert(bobOldRow?.toWeek === 5, 'old team closed at week 5');

  const bobWeek1After = await calculateLeagueScores(league.id, 1);
  assert(
    bobWeek1After.scores.find((s) => s.userId === bob.id)?.points === 1,
    'Bob week 1 unchanged after his swap (old team still counts)'
  );

  swap = await getSwapState(league.id);
  assert(swap.onTheClockUserId === alice.id, "after Bob swaps, Alice is on the clock");

  await expectThrow(
    () => performSwap(league.id, bob.id, freeSec!.id, bobRoster[0].teamId),
    'second swap by same member rejected',
    'already used'
  );

  swap = await passSwap(league.id, alice.id);
  assert(swap.freePhase && swap.onTheClockUserId === null, 'all turns done → free phase');

  // Free phase: Alice (passed, but never swapped) can still swap
  const freeB1G = await prisma.team.findFirst({
    where: {
      slot: ConferenceSlot.BIG_TEN,
      rosterSlots: { none: { leagueId: league.id, toWeek: null } },
    },
  });
  const aliceB1G = aliceRoster.find((r) => r.slot === 'BIG_TEN')!;
  const aliceSwap = await performSwap(league.id, alice.id, aliceB1G.teamId, freeB1G!.id);
  assert(aliceSwap.effectiveFromWeek === 6, 'free-phase swap works after passing');

  swap = await closeSwapWindow(league.id);
  assert(swap.status === 'CLOSED', 'commissioner closes the window');
  await expectThrow(
    () => performSwap(league.id, carol.id, 1, 2),
    'swap after close rejected',
    'not open'
  );

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
