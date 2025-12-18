/**
 * Fix commissioner roles for existing leagues
 *
 * For each league, the first member (by join date) becomes the commissioner
 */

import prisma from '../src/lib/prisma';
import { MemberRole } from '@prisma/client';

async function main() {
  console.log('Fixing commissioner roles for existing leagues...\n');

  // Get all leagues
  const leagues = await prisma.league.findMany({
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        include: { user: true },
      },
    },
  });

  let updated = 0;

  for (const league of leagues) {
    if (league.members.length === 0) {
      console.log(`League ${league.id} (${league.name}): No members, skipping`);
      continue;
    }

    const firstMember = league.members[0];

    // Check if any member is already a commissioner
    const hasCommissioner = league.members.some(m => m.role === MemberRole.COMMISSIONER);

    if (hasCommissioner) {
      console.log(`League ${league.id} (${league.name}): Already has commissioner`);
      continue;
    }

    // Update first member to be commissioner
    await prisma.leagueMember.update({
      where: { id: firstMember.id },
      data: { role: MemberRole.COMMISSIONER },
    });

    // Also update the league's commissionerUserId
    await prisma.league.update({
      where: { id: league.id },
      data: { commissionerUserId: firstMember.userId },
    });

    console.log(`League ${league.id} (${league.name}): Set ${firstMember.user.name} as commissioner`);
    updated++;
  }

  console.log(`\nDone! Updated ${updated} leagues.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
