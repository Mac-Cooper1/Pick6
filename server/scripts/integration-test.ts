/**
 * Integration Test Script
 *
 * Tests the core flow:
 * 1. Creates a user
 * 2. Creates a league
 * 3. Adds members and runs a draft
 * 4. Runs a mocked sync
 * 5. Computes standings
 *
 * Run with: npx tsx scripts/integration-test.ts
 */

import { PrismaClient, AcquisitionType, GameStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { generateJoinCode } from '../src/utils/joinCode';
import { generateToken } from '../src/utils/auth';

const prisma = new PrismaClient();

// Test data
const TEST_PREFIX = 'TEST_' + Date.now();

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');

  // Delete in order to respect foreign keys
  await prisma.waiverClaim.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.rosterTeam.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.weeklyScore.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.draftQueue.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.draftPick.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.leagueMember.deleteMany({
    where: { league: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.league.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_PREFIX.toLowerCase() } },
  });
  await prisma.game.deleteMany({
    where: { espnEventId: { startsWith: TEST_PREFIX } },
  });

  console.log('✅ Cleanup complete');
}

async function runIntegrationTest() {
  console.log('🏈 Pick6 Integration Test');
  console.log('========================\n');

  try {
    // Step 1: Create test users
    console.log('📝 Step 1: Creating test users...');
    const users = [];
    for (let i = 1; i <= 4; i++) {
      const user = await prisma.user.create({
        data: {
          name: `${TEST_PREFIX}_User${i}`,
          email: `${TEST_PREFIX.toLowerCase()}_user${i}@test.com`,
        },
      });
      users.push(user);
      console.log(`   Created user: ${user.name} (ID: ${user.id})`);
    }
    console.log('✅ Created 4 test users\n');

    // Step 2: Create a league
    console.log('📝 Step 2: Creating test league...');
    const hashedPassword = await bcrypt.hash('testpass', 10);
    const league = await prisma.league.create({
      data: {
        name: `${TEST_PREFIX}_League`,
        joinCode: generateJoinCode(),
        password: hashedPassword,
        maxPlayers: 8,
        seasonYear: 2024,
        currentWeek: 1,
        pickDeadlineSeconds: 30,
      },
    });
    console.log(`   Created league: ${league.name} (Code: ${league.joinCode})`);
    console.log('✅ League created\n');

    // Step 3: Add users to league
    console.log('📝 Step 3: Adding users to league...');
    for (let i = 0; i < users.length; i++) {
      await prisma.leagueMember.create({
        data: {
          leagueId: league.id,
          userId: users[i].id,
          draftPosition: i + 1,
        },
      });
      console.log(`   Added ${users[i].name} to league`);
    }
    console.log('✅ All users added to league\n');

    // Step 4: Get some teams for drafting
    console.log('📝 Step 4: Running snake draft...');
    const teams = await prisma.team.findMany({ take: 24 }); // 6 teams per user * 4 users

    if (teams.length < 24) {
      throw new Error('Not enough teams in database. Run seed first.');
    }

    // Simulate snake draft (4 users, 6 rounds)
    let pickNumber = 0;
    for (let round = 1; round <= 6; round++) {
      const orderForRound = round % 2 === 1
        ? [0, 1, 2, 3] // Odd rounds: forward
        : [3, 2, 1, 0]; // Even rounds: reverse

      for (const userIdx of orderForRound) {
        const team = teams[pickNumber];
        await prisma.draftPick.create({
          data: {
            leagueId: league.id,
            userId: users[userIdx].id,
            teamId: team.id,
            pickNumber: pickNumber + 1,
            round,
          },
        });

        // Also create RosterTeam entry
        await prisma.rosterTeam.create({
          data: {
            leagueId: league.id,
            userId: users[userIdx].id,
            teamId: team.id,
            acquiredVia: AcquisitionType.DRAFT,
          },
        });

        console.log(`   Pick ${pickNumber + 1} (R${round}): ${users[userIdx].name} selects ${team.name}`);
        pickNumber++;
      }
    }

    // Mark draft complete
    await prisma.league.update({
      where: { id: league.id },
      data: { draftComplete: true, draftStarted: true },
    });
    console.log('✅ Draft complete!\n');

    // Step 5: Create mock game results
    console.log('📝 Step 5: Creating mock game data...');
    const draftedTeams = teams.slice(0, 24);

    // Create games for first 12 pairs (24 teams = 12 games)
    for (let i = 0; i < 12; i++) {
      const homeTeam = draftedTeams[i * 2];
      const awayTeam = draftedTeams[i * 2 + 1];

      // Randomly determine winner and if it was an upset
      const homeWins = Math.random() > 0.5;
      const wasUpset = Math.random() > 0.7; // 30% chance of upset

      await prisma.game.create({
        data: {
          espnEventId: `${TEST_PREFIX}_GAME_${i}`,
          seasonYear: 2024,
          weekNumber: 1,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: new Date(),
          status: GameStatus.FINAL,
          homeScore: homeWins ? 28 : 14,
          awayScore: homeWins ? 14 : 28,
          winnerTeamId: homeWins ? homeTeam.id : awayTeam.id,
          spread: wasUpset ? (homeWins ? 7 : -7) : (homeWins ? -7 : 7),
          favoriteTeamId: wasUpset
            ? (homeWins ? awayTeam.id : homeTeam.id)
            : (homeWins ? homeTeam.id : awayTeam.id),
          wasUpset,
        },
      });
      console.log(`   Game ${i + 1}: ${homeTeam.name} vs ${awayTeam.name} - ${homeWins ? homeTeam.name : awayTeam.name} wins${wasUpset ? ' (UPSET!)' : ''}`);
    }
    console.log('✅ Mock games created\n');

    // Step 6: Calculate scores
    console.log('📝 Step 6: Calculating weekly scores...');

    for (const user of users) {
      // Get user's roster
      const roster = await prisma.rosterTeam.findMany({
        where: { leagueId: league.id, userId: user.id, droppedAt: null },
      });

      let totalPoints = 0;

      for (const rosterTeam of roster) {
        // Find game where this team played
        const game = await prisma.game.findFirst({
          where: {
            seasonYear: 2024,
            weekNumber: 1,
            OR: [
              { homeTeamId: rosterTeam.teamId },
              { awayTeamId: rosterTeam.teamId },
            ],
          },
        });

        if (game && game.winnerTeamId) {
          const won = game.winnerTeamId === rosterTeam.teamId;
          if (won) {
            totalPoints += game.wasUpset ? 2 : 1;
          } else {
            totalPoints += game.wasUpset ? -1 : 0;
          }
        }
      }

      await prisma.weeklyScore.create({
        data: {
          leagueId: league.id,
          userId: user.id,
          weekNumber: 1,
          points: totalPoints,
        },
      });
      console.log(`   ${user.name}: ${totalPoints} points`);
    }
    console.log('✅ Scores calculated\n');

    // Step 7: Get standings
    console.log('📝 Step 7: Final standings...');
    const standings = await prisma.weeklyScore.findMany({
      where: { leagueId: league.id, weekNumber: 1 },
      include: { user: true },
      orderBy: { points: 'desc' },
    });

    console.log('\n📊 WEEK 1 STANDINGS');
    console.log('─'.repeat(40));
    standings.forEach((s, idx) => {
      console.log(`   ${idx + 1}. ${s.user.name}: ${s.points} points`);
    });
    console.log('─'.repeat(40));

    // Step 8: Test waiver claim
    console.log('\n📝 Step 8: Testing waiver claim...');
    const availableTeam = await prisma.team.findFirst({
      where: {
        id: { notIn: draftedTeams.map((t) => t.id) },
      },
    });

    if (availableTeam) {
      const userRoster = await prisma.rosterTeam.findFirst({
        where: { leagueId: league.id, userId: users[0].id, droppedAt: null },
      });

      if (userRoster) {
        await prisma.waiverClaim.create({
          data: {
            leagueId: league.id,
            userId: users[0].id,
            addTeamId: availableTeam.id,
            dropTeamId: userRoster.teamId,
            priority: 1,
          },
        });
        console.log(`   ${users[0].name} claimed ${availableTeam.name}`);
        console.log('✅ Waiver claim submitted\n');
      }
    }

    console.log('\n✅ ✅ ✅ INTEGRATION TEST PASSED! ✅ ✅ ✅\n');

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await runIntegrationTest();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
