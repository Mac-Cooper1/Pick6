-- Pick 6 2026 simplification: drop auction/waiver/free-agency, add conference
-- slots and effective-week rosters (RosterSlot), prep for week-5 swap.

-- ============ Drop cut features ============
DROP TABLE IF EXISTS "AuctionBid";
DROP TABLE IF EXISTS "AuctionEvent";
DROP TABLE IF EXISTS "WaiverClaim";
DROP TABLE IF EXISTS "RosterTeam";
DROP TYPE IF EXISTS "AuctionBidStatus";
DROP TYPE IF EXISTS "AuctionEventStatus";
DROP TYPE IF EXISTS "WaiverStatus";
DROP TYPE IF EXISTS "AcquisitionType";

-- ============ League simplification ============
ALTER TABLE "League" DROP COLUMN IF EXISTS "draftType";
ALTER TABLE "League" DROP COLUMN IF EXISTS "faabBudget";
ALTER TABLE "League" DROP COLUMN IF EXISTS "rosterSize";
ALTER TABLE "League" ALTER COLUMN "seasonYear" SET DEFAULT 2026;
DROP TYPE IF EXISTS "DraftType";

-- ============ LeagueMember: drop waiver/FAAB, add swap tracking ============
ALTER TABLE "LeagueMember" DROP COLUMN IF EXISTS "waiverPriority";
ALTER TABLE "LeagueMember" DROP COLUMN IF EXISTS "faabBudgetRemaining";
ALTER TABLE "LeagueMember" ADD COLUMN "swapUsed" BOOLEAN NOT NULL DEFAULT false;

-- ============ Conference slots ============
CREATE TYPE "ConferenceSlot" AS ENUM ('SEC', 'BIG_TEN', 'ACC_ND', 'BIG_12', 'G6', 'NONE');
ALTER TABLE "Team" ADD COLUMN "slot" "ConferenceSlot" NOT NULL DEFAULT 'NONE';

-- ============ RosterSlot (effective-week roster ownership) ============
CREATE TABLE "RosterSlot" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "slot" "ConferenceSlot" NOT NULL,
    "teamId" INTEGER NOT NULL,
    "fromWeek" INTEGER NOT NULL DEFAULT 1,
    "toWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RosterSlot_leagueId_userId_idx" ON "RosterSlot"("leagueId", "userId");
CREATE INDEX "RosterSlot_leagueId_teamId_idx" ON "RosterSlot"("leagueId", "teamId");

-- Partial unique indexes (not expressible in Prisma schema — do not drop):
-- one active owner per team per league, one active team per user per slot.
CREATE UNIQUE INDEX "RosterSlot_active_team_key" ON "RosterSlot"("leagueId", "teamId") WHERE "toWeek" IS NULL;
CREATE UNIQUE INDEX "RosterSlot_active_user_slot_key" ON "RosterSlot"("leagueId", "userId", "slot") WHERE "toWeek" IS NULL;

ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
