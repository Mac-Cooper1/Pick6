/**
 * Test Script for FAAB Auction System
 *
 * Creates a test scenario with:
 * - 1 league with 3 users
 * - Pre-populated rosters
 * - An auction event
 * - Conflicting bids to test finalization
 *
 * Run with: npx tsx scripts/test-auction.ts
 */

import prisma from '../src/lib/prisma';
import {
  createAuctionEvent,
  openAuction,
  placeBid,
  finalizeAuction,
  getAuctionState,
} from '../src/services/auctionService';
import { AcquisitionType, MemberRole } from '@prisma/client';

async function main() {
  console.log('🎯 Starting FAAB Auction Test...\n');

  // Clean up any existing test data
  console.log('Cleaning up existing test data...');
  await prisma.auctionBid.deleteMany({});
  await prisma.auctionEvent.deleteMany({});

  // Find or create test users
  console.log('Setting up test users...');
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'auctiontest1@example.com' },
      update: {},
      create: { name: 'Auction User 1', email: 'auctiontest1@example.com' },
    }),
    prisma.user.upsert({
      where: { email: 'auctiontest2@example.com' },
      update: {},
      create: { name: 'Auction User 2', email: 'auctiontest2@example.com' },
    }),
    prisma.user.upsert({
      where: { email: 'auctiontest3@example.com' },
      update: {},
      create: { name: 'Auction User 3', email: 'auctiontest3@example.com' },
    }),
  ]);
  console.log(`  Created/found ${users.length} users`);

  // Find or create test league
  console.log('Setting up test league...');
  let league = await prisma.league.findFirst({
    where: { name: 'Auction Test League' },
  });

  if (!league) {
    league = await prisma.league.create({
      data: {
        name: 'Auction Test League',
        joinCode: 'AUCTION' + Date.now().toString().slice(-6),
        password: '$2b$10$test',
        maxPlayers: 6,
        rosterSize: 6,
        faabBudget: 100,
        seasonYear: 2024,
        currentWeek: 7,
        draftComplete: true,
        commissionerUserId: users[0].id,
      },
    });
  }
  console.log(`  League: ${league.name} (ID: ${league.id})`);

  // Create league members with FAAB budgets
  console.log('Setting up league members...');
  for (let i = 0; i < users.length; i++) {
    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: users[i].id } },
      update: { faabBudgetRemaining: 100 },
      create: {
        leagueId: league.id,
        userId: users[i].id,
        role: i === 0 ? MemberRole.COMMISSIONER : MemberRole.MEMBER,
        faabBudgetRemaining: 100,
      },
    });
  }

  // Get some teams for testing
  const teams = await prisma.team.findMany({ take: 20 });
  if (teams.length < 20) {
    console.error('Not enough teams in database. Please seed teams first.');
    process.exit(1);
  }

  // Set up rosters (6 teams each)
  console.log('Setting up rosters...');
  for (let i = 0; i < users.length; i++) {
    // Clear existing roster teams for this user in this league
    await prisma.rosterTeam.deleteMany({
      where: { leagueId: league.id, userId: users[i].id },
    });

    // Add 6 teams to each roster
    for (let j = 0; j < 6; j++) {
      const teamIndex = i * 6 + j;
      await prisma.rosterTeam.create({
        data: {
          leagueId: league.id,
          userId: users[i].id,
          teamId: teams[teamIndex].id,
          acquiredVia: AcquisitionType.DRAFT,
        },
      });
    }
  }
  console.log(`  Created rosters for ${users.length} users (6 teams each)`);

  // Available teams for auction (teams 18, 19)
  const availableTeam1 = teams[18];
  const availableTeam2 = teams[19];
  console.log(`  Available teams for auction: ${availableTeam1.name}, ${availableTeam2.name}`);

  // Create auction event
  console.log('\nCreating auction event...');
  const opensAt = new Date();
  opensAt.setMinutes(opensAt.getMinutes() - 5); // Opened 5 minutes ago
  const closesAt = new Date();
  closesAt.setHours(closesAt.getHours() + 1); // Closes in 1 hour

  await createAuctionEvent(league.id, users[0].id, 7, opensAt, closesAt);
  console.log('  Auction created');

  // Open the auction
  console.log('Opening auction...');
  await openAuction(league.id);
  console.log('  Auction is now OPEN');

  // Place conflicting bids
  console.log('\nPlacing bids...');

  // User 1 bids $25 on available team 1
  const user1Roster = await prisma.rosterTeam.findFirst({
    where: { leagueId: league.id, userId: users[0].id, droppedAt: null },
  });
  await placeBid(league.id, users[0].id, availableTeam1.id, user1Roster!.teamId, 25);
  console.log(`  User 1 bids $25 on ${availableTeam1.name}`);

  // User 2 bids $30 on the same team (should win)
  const user2Roster = await prisma.rosterTeam.findFirst({
    where: { leagueId: league.id, userId: users[1].id, droppedAt: null },
  });
  await placeBid(league.id, users[1].id, availableTeam1.id, user2Roster!.teamId, 30);
  console.log(`  User 2 bids $30 on ${availableTeam1.name}`);

  // User 3 bids $20 on the same team (should lose)
  const user3Roster = await prisma.rosterTeam.findFirst({
    where: { leagueId: league.id, userId: users[2].id, droppedAt: null },
  });
  await placeBid(league.id, users[2].id, availableTeam1.id, user3Roster!.teamId, 20);
  console.log(`  User 3 bids $20 on ${availableTeam1.name}`);

  // User 1 also bids on available team 2
  const user1Roster2 = await prisma.rosterTeam.findFirst({
    where: {
      leagueId: league.id,
      userId: users[0].id,
      droppedAt: null,
      teamId: { not: user1Roster!.teamId },
    },
  });
  await placeBid(league.id, users[0].id, availableTeam2.id, user1Roster2!.teamId, 15);
  console.log(`  User 1 bids $15 on ${availableTeam2.name}`);

  // Check auction state
  console.log('\nChecking auction state...');
  const state = await getAuctionState(league.id, users[0].id);
  console.log(`  Status: ${state?.status}`);
  console.log(`  User 1 budget: $${state?.myBudgetRemaining}`);
  console.log(`  User 1 bids: ${state?.myBids?.length}`);
  console.log(`  High bids on teams: ${state?.teamHighBids?.length}`);

  // Force close and finalize
  console.log('\nFinalizing auction (simulating close time)...');

  // Update auction to be past close time
  await prisma.auctionEvent.updateMany({
    where: { leagueId: league.id },
    data: { closesAt: new Date(Date.now() - 1000) }, // 1 second ago
  });

  const results = await finalizeAuction(league.id);
  console.log(`  ${results.message}`);
  console.log(`  Winners:`);
  for (const result of results.results) {
    console.log(`    - ${result.winnerName} won ${result.teamName} for $${result.amount}`);
  }

  // Verify budgets
  console.log('\nVerifying final budgets...');
  const members = await prisma.leagueMember.findMany({
    where: { leagueId: league.id },
    include: { user: true },
    orderBy: { userId: 'asc' },
  });
  for (const member of members) {
    console.log(`  ${member.user.name}: $${member.faabBudgetRemaining} remaining`);
  }

  // Verify rosters
  console.log('\nVerifying final rosters...');
  for (const user of users) {
    const roster = await prisma.rosterTeam.findMany({
      where: { leagueId: league.id, userId: user.id, droppedAt: null },
      include: { team: true },
    });
    console.log(`  ${user.name} (${roster.length} teams):`);
    for (const rt of roster) {
      console.log(`    - ${rt.team.name} (${rt.acquiredVia})`);
    }
  }

  console.log('\n✅ Auction test completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
