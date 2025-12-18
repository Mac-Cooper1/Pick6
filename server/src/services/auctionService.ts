/**
 * FAAB Auction Service
 *
 * Handles midseason FAAB auction functionality:
 * - Create/manage auction events
 * - Place/cancel bids
 * - Finalize auction and update rosters
 * - Kickoff lock validation
 */

import prisma from '../lib/prisma';
import {
  AuctionEventStatus,
  AuctionBidStatus,
  AcquisitionType,
} from '@prisma/client';
import { getTeamNextKickoff } from './espnClient';

/**
 * Get auction state for a league
 */
export async function getAuctionState(leagueId: number, userId: number) {
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
    include: {
      bids: {
        include: {
          member: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!auction) {
    return null;
  }

  // Get member info for the user
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  // Get all bids grouped by team
  const bidsByTeam = new Map<number, { highBid: number; bidCount: number }>();
  for (const bid of auction.bids) {
    if (bid.status === AuctionBidStatus.ACTIVE) {
      const existing = bidsByTeam.get(bid.addTeamId);
      if (!existing || bid.amount > existing.highBid) {
        bidsByTeam.set(bid.addTeamId, {
          highBid: bid.amount,
          bidCount: (existing?.bidCount || 0) + 1,
        });
      } else {
        bidsByTeam.set(bid.addTeamId, {
          ...existing,
          bidCount: existing.bidCount + 1,
        });
      }
    }
  }

  // Get my bids
  const myBids = auction.bids
    .filter((b) => b.memberId === member?.id)
    .map((b) => ({
      id: b.id,
      addTeamId: b.addTeamId,
      dropTeamId: b.dropTeamId,
      amount: b.amount,
      status: b.status,
      createdAt: b.createdAt,
    }));

  // Build team high bids (anonymous - don't reveal bidder)
  const teamHighBids: Array<{ teamId: number; highBid: number; bidCount: number }> = [];
  for (const [teamId, data] of bidsByTeam) {
    teamHighBids.push({ teamId, ...data });
  }

  return {
    id: auction.id,
    leagueId: auction.leagueId,
    weekNumber: auction.weekNumber,
    opensAt: auction.opensAt,
    closesAt: auction.closesAt,
    status: auction.status,
    myBudgetRemaining: member?.faabBudgetRemaining || 0,
    myBids,
    teamHighBids,
  };
}

/**
 * Create auction event (commissioner only)
 */
export async function createAuctionEvent(
  leagueId: number,
  userId: number,
  weekNumber: number,
  opensAt: Date,
  closesAt: Date
) {
  // Verify commissioner
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member || member.role !== 'COMMISSIONER') {
    throw new Error('Only the commissioner can create an auction');
  }

  // Check for existing auction
  const existing = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (existing) {
    throw new Error('An auction already exists for this league');
  }

  // Validate dates
  if (opensAt >= closesAt) {
    throw new Error('Open time must be before close time');
  }

  if (new Date() > closesAt) {
    throw new Error('Close time must be in the future');
  }

  // Get league FAAB budget
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { faabBudget: true },
  });

  // Initialize all members' FAAB budgets
  await prisma.leagueMember.updateMany({
    where: { leagueId },
    data: { faabBudgetRemaining: league?.faabBudget || 100 },
  });

  // Create the auction
  const auction = await prisma.auctionEvent.create({
    data: {
      leagueId,
      weekNumber,
      opensAt,
      closesAt,
      status: AuctionEventStatus.SCHEDULED,
    },
  });

  return auction;
}

/**
 * Open auction for bidding
 * Can be called manually or by scheduler when opensAt is reached
 */
export async function openAuction(leagueId: number) {
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) {
    throw new Error('No auction found for this league');
  }

  if (auction.status !== AuctionEventStatus.SCHEDULED) {
    throw new Error('Auction is not in SCHEDULED status');
  }

  return prisma.auctionEvent.update({
    where: { id: auction.id },
    data: { status: AuctionEventStatus.OPEN },
  });
}

/**
 * Check and auto-open/close auction based on time
 */
export async function checkAuctionTiming(leagueId: number): Promise<'opened' | 'closed' | null> {
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) return null;

  const now = new Date();

  // Auto-open if scheduled and past opensAt
  if (auction.status === AuctionEventStatus.SCHEDULED && now >= auction.opensAt) {
    await prisma.auctionEvent.update({
      where: { id: auction.id },
      data: { status: AuctionEventStatus.OPEN },
    });
    return 'opened';
  }

  // Auto-close if open and past closesAt
  if (auction.status === AuctionEventStatus.OPEN && now >= auction.closesAt) {
    await prisma.auctionEvent.update({
      where: { id: auction.id },
      data: { status: AuctionEventStatus.FINALIZING },
    });
    return 'closed';
  }

  return null;
}

/**
 * Place a bid on a team
 */
export async function placeBid(
  leagueId: number,
  userId: number,
  addTeamId: number,
  dropTeamId: number,
  amount: number
) {
  // Get auction
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) {
    throw new Error('No auction found for this league');
  }

  // Check timing - auto open/close if needed
  await checkAuctionTiming(leagueId);

  // Re-fetch auction status
  const updatedAuction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (updatedAuction?.status !== AuctionEventStatus.OPEN) {
    throw new Error('Auction is not open for bidding');
  }

  // Get member
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member) {
    throw new Error('User is not a member of this league');
  }

  // Validate bid amount
  if (amount < 0) {
    throw new Error('Bid amount must be positive');
  }

  if (amount > member.faabBudgetRemaining) {
    throw new Error(`Insufficient budget. You have $${member.faabBudgetRemaining} remaining`);
  }

  // Check if team is already rostered
  const rosteredTeam = await prisma.rosterTeam.findFirst({
    where: { leagueId, teamId: addTeamId, droppedAt: null },
  });

  if (rosteredTeam) {
    throw new Error('This team is already on a roster');
  }

  // Verify drop team is on user's roster
  const dropTeamOnRoster = await prisma.rosterTeam.findFirst({
    where: { leagueId, userId, teamId: dropTeamId, droppedAt: null },
  });

  if (!dropTeamOnRoster) {
    throw new Error('Drop team is not on your roster');
  }

  // Check kickoff lock - team's game must start AFTER auction closes
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { seasonYear: true, currentWeek: true },
  });

  if (league) {
    const kickoffTime = await getTeamNextKickoff(addTeamId, league.seasonYear, league.currentWeek);
    if (kickoffTime && kickoffTime <= auction.closesAt) {
      throw new Error('Cannot bid on team - game starts before auction closes');
    }
  }

  // Check for existing ACTIVE bid on same team by this user
  const existingBid = await prisma.auctionBid.findFirst({
    where: {
      auctionEventId: auction.id,
      memberId: member.id,
      addTeamId,
      status: AuctionBidStatus.ACTIVE,
    },
  });

  if (existingBid) {
    // Update existing bid
    const updatedBid = await prisma.auctionBid.update({
      where: { id: existingBid.id },
      data: {
        dropTeamId,
        amount,
      },
    });
    return updatedBid;
  }

  // Create new bid
  const bid = await prisma.auctionBid.create({
    data: {
      auctionEventId: auction.id,
      leagueId,
      memberId: member.id,
      addTeamId,
      dropTeamId,
      amount,
      status: AuctionBidStatus.ACTIVE,
    },
  });

  return bid;
}

/**
 * Cancel a bid
 */
export async function cancelBid(leagueId: number, userId: number, bidId: number) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member) {
    throw new Error('User is not a member of this league');
  }

  const bid = await prisma.auctionBid.findUnique({
    where: { id: bidId },
  });

  if (!bid) {
    throw new Error('Bid not found');
  }

  if (bid.memberId !== member.id) {
    throw new Error('Not authorized to cancel this bid');
  }

  if (bid.status !== AuctionBidStatus.ACTIVE) {
    throw new Error('Can only cancel active bids');
  }

  // Check if auction is still open
  const auction = await prisma.auctionEvent.findUnique({
    where: { id: bid.auctionEventId },
  });

  if (auction?.status !== AuctionEventStatus.OPEN) {
    throw new Error('Auction is no longer open');
  }

  return prisma.auctionBid.update({
    where: { id: bidId },
    data: { status: AuctionBidStatus.CANCELLED },
  });
}

/**
 * Finalize the auction - process all winning bids
 * IDEMPOTENT: Safe to run multiple times
 */
export async function finalizeAuction(leagueId: number) {
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
    include: {
      bids: {
        where: { status: AuctionBidStatus.ACTIVE },
        orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!auction) {
    throw new Error('No auction found for this league');
  }

  // Allow finalization if OPEN and past close time, or already FINALIZING
  if (auction.status === AuctionEventStatus.COMPLETE) {
    return { message: 'Auction already finalized', results: [] };
  }

  if (auction.status === AuctionEventStatus.OPEN) {
    if (new Date() < auction.closesAt) {
      throw new Error('Auction has not closed yet');
    }
    // Mark as finalizing
    await prisma.auctionEvent.update({
      where: { id: auction.id },
      data: { status: AuctionEventStatus.FINALIZING },
    });
  }

  if (auction.status === AuctionEventStatus.SCHEDULED) {
    throw new Error('Auction has not started yet');
  }

  const results: Array<{
    teamId: number;
    teamName: string;
    winnerId: number;
    winnerName: string;
    amount: number;
    droppedTeamId: number;
  }> = [];

  // Group bids by addTeamId
  const bidsByTeam = new Map<number, typeof auction.bids>();
  for (const bid of auction.bids) {
    const existing = bidsByTeam.get(bid.addTeamId) || [];
    existing.push(bid);
    bidsByTeam.set(bid.addTeamId, existing);
  }

  // Process each team's bids
  for (const [teamId, bids] of bidsByTeam) {
    // Bids are already sorted by amount desc, then createdAt asc
    // Winner is the first one (highest bid, earliest if tie)
    const winningBid = bids[0];

    // Get team and member info
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    const member = await prisma.leagueMember.findUnique({
      where: { id: winningBid.memberId },
      include: { user: true },
    });

    if (!team || !member) continue;

    // Use transaction to process the win
    await prisma.$transaction(async (tx) => {
      // Mark winning bid
      await tx.auctionBid.update({
        where: { id: winningBid.id },
        data: { status: AuctionBidStatus.WON },
      });

      // Mark losing bids
      for (const bid of bids.slice(1)) {
        await tx.auctionBid.update({
          where: { id: bid.id },
          data: { status: AuctionBidStatus.LOST },
        });
      }

      // Deduct FAAB from winner
      await tx.leagueMember.update({
        where: { id: member.id },
        data: { faabBudgetRemaining: { decrement: winningBid.amount } },
      });

      // Drop the team from winner's roster
      await tx.rosterTeam.updateMany({
        where: {
          leagueId,
          userId: member.userId,
          teamId: winningBid.dropTeamId,
          droppedAt: null,
        },
        data: { droppedAt: new Date() },
      });

      // Add the won team to winner's roster
      await tx.rosterTeam.create({
        data: {
          leagueId,
          userId: member.userId,
          teamId: teamId,
          acquiredVia: AcquisitionType.AUCTION,
        },
      });
    });

    results.push({
      teamId,
      teamName: team.name,
      winnerId: member.userId,
      winnerName: member.user.name,
      amount: winningBid.amount,
      droppedTeamId: winningBid.dropTeamId,
    });
  }

  // Mark auction as complete
  await prisma.auctionEvent.update({
    where: { id: auction.id },
    data: { status: AuctionEventStatus.COMPLETE },
  });

  return { message: 'Auction finalized', results };
}

/**
 * Get available teams for auction (not on any roster + not locked by kickoff)
 */
export async function getAuctionAvailableTeams(leagueId: number) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { seasonYear: true, currentWeek: true },
  });

  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  // Get rostered team IDs
  const rosteredTeams = await prisma.rosterTeam.findMany({
    where: { leagueId, droppedAt: null },
    select: { teamId: true },
  });

  const rosteredIds = new Set(rosteredTeams.map((rt) => rt.teamId));

  // Get all teams
  const allTeams = await prisma.team.findMany({
    orderBy: [{ conference: 'asc' }, { name: 'asc' }],
  });

  // Filter and check kickoff locks
  const availableTeams = [];
  for (const team of allTeams) {
    if (rosteredIds.has(team.id)) continue;

    let isLocked = false;
    let kickoffTime: Date | null = null;

    if (league && auction) {
      kickoffTime = await getTeamNextKickoff(team.id, league.seasonYear, league.currentWeek);
      // Team is locked if kickoff is before auction closes or game already started
      if (kickoffTime && kickoffTime <= auction.closesAt) {
        isLocked = true;
      }
    }

    availableTeams.push({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      conference: team.conference,
      isLocked,
      kickoffTime,
    });
  }

  return availableTeams;
}

/**
 * Get high bids for all teams (anonymous)
 */
export async function getHighBids(leagueId: number) {
  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) {
    return [];
  }

  const bids = await prisma.auctionBid.findMany({
    where: {
      auctionEventId: auction.id,
      status: AuctionBidStatus.ACTIVE,
    },
    orderBy: { amount: 'desc' },
  });

  // Group by team and get highest
  const highBidsByTeam = new Map<number, number>();
  const bidCountByTeam = new Map<number, number>();

  for (const bid of bids) {
    const current = highBidsByTeam.get(bid.addTeamId);
    if (current === undefined || bid.amount > current) {
      highBidsByTeam.set(bid.addTeamId, bid.amount);
    }
    bidCountByTeam.set(bid.addTeamId, (bidCountByTeam.get(bid.addTeamId) || 0) + 1);
  }

  const result: Array<{ teamId: number; highBid: number; bidCount: number }> = [];
  for (const [teamId, highBid] of highBidsByTeam) {
    result.push({
      teamId,
      highBid,
      bidCount: bidCountByTeam.get(teamId) || 1,
    });
  }

  return result;
}

/**
 * Get user's bids
 */
export async function getUserBids(leagueId: number, userId: number) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member) {
    throw new Error('User is not a member of this league');
  }

  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) {
    return [];
  }

  const bids = await prisma.auctionBid.findMany({
    where: {
      auctionEventId: auction.id,
      memberId: member.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  return bids;
}

/**
 * Delete auction event (commissioner only, only if not started)
 */
export async function deleteAuctionEvent(leagueId: number, userId: number) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });

  if (!member || member.role !== 'COMMISSIONER') {
    throw new Error('Only the commissioner can delete an auction');
  }

  const auction = await prisma.auctionEvent.findUnique({
    where: { leagueId },
  });

  if (!auction) {
    throw new Error('No auction found');
  }

  if (auction.status !== AuctionEventStatus.SCHEDULED) {
    throw new Error('Can only delete auctions that have not started');
  }

  await prisma.auctionEvent.delete({
    where: { id: auction.id },
  });

  return { message: 'Auction deleted' };
}
