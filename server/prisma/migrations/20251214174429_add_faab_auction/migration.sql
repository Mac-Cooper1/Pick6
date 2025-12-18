-- CreateEnum
CREATE TYPE "AuctionEventStatus" AS ENUM ('SCHEDULED', 'OPEN', 'FINALIZING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AuctionBidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'WON', 'LOST', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AcquisitionType" ADD VALUE 'AUCTION';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "faabBudget" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "rosterSize" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "LeagueMember" ADD COLUMN     "faabBudgetRemaining" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "AuctionEvent" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" SERIAL NOT NULL,
    "auctionEventId" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "addTeamId" INTEGER NOT NULL,
    "dropTeamId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "AuctionBidStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuctionEvent_leagueId_key" ON "AuctionEvent"("leagueId");

-- CreateIndex
CREATE INDEX "AuctionEvent_status_idx" ON "AuctionEvent"("status");

-- CreateIndex
CREATE INDEX "AuctionEvent_closesAt_idx" ON "AuctionEvent"("closesAt");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionEventId_addTeamId_idx" ON "AuctionBid"("auctionEventId", "addTeamId");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionEventId_memberId_idx" ON "AuctionBid"("auctionEventId", "memberId");

-- CreateIndex
CREATE INDEX "AuctionBid_status_idx" ON "AuctionBid"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionBid_auctionEventId_memberId_addTeamId_status_key" ON "AuctionBid"("auctionEventId", "memberId", "addTeamId", "status");

-- AddForeignKey
ALTER TABLE "AuctionEvent" ADD CONSTRAINT "AuctionEvent_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionEventId_fkey" FOREIGN KEY ("auctionEventId") REFERENCES "AuctionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LeagueMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
