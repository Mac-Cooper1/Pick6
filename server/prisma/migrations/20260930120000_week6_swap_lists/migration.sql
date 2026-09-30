-- Week-6 swap (Sep 30): the turn-based week-5 window is replaced by private
-- priority lists (SwapClaim) set during week 5 and run once, worst record
-- first, at the start of week 6. Additive only: the old swapStatus /
-- swapTurnDeadline / swapSkipped columns stay (unused) so a rollback to the
-- previous deploy still works mid-season.
CREATE TYPE "SwapClaimStatus" AS ENUM ('PENDING', 'SWAPPED', 'MISSED', 'UNUSED');

ALTER TABLE "League" ADD COLUMN "swapRanAt" TIMESTAMP(3);

CREATE TABLE "SwapClaim" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "dropTeamId" INTEGER NOT NULL,
    "addTeamId" INTEGER NOT NULL,
    "status" "SwapClaimStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SwapClaim_leagueId_userId_priority_key" ON "SwapClaim"("leagueId", "userId", "priority");

ALTER TABLE "SwapClaim" ADD CONSTRAINT "SwapClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwapClaim" ADD CONSTRAINT "SwapClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwapClaim" ADD CONSTRAINT "SwapClaim_dropTeamId_fkey" FOREIGN KEY ("dropTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SwapClaim" ADD CONSTRAINT "SwapClaim_addTeamId_fkey" FOREIGN KEY ("addTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
