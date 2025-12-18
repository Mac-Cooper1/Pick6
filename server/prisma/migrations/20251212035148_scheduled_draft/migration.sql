-- CreateEnum
CREATE TYPE "DraftType" AS ENUM ('SNAKE', 'LINEAR');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('NOT_STARTED', 'SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('COMMISSIONER', 'MEMBER');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "awayMoneyline" INTEGER,
ADD COLUMN     "homeMoneyline" INTEGER;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "commissionerUserId" INTEGER,
ADD COLUMN     "draftScheduledAt" TIMESTAMP(3),
ADD COLUMN     "draftStatus" "DraftStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "draftType" "DraftType" NOT NULL DEFAULT 'SNAKE',
ALTER COLUMN "pickDeadlineSeconds" SET DEFAULT 60;

-- AlterTable
ALTER TABLE "LeagueMember" ADD COLUMN     "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "waiverPriority" INTEGER;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "espnDisplayName" TEXT,
ADD COLUMN     "oddsApiName" TEXT;

-- CreateIndex
CREATE INDEX "Team_espnTeamId_idx" ON "Team"("espnTeamId");

-- CreateIndex
CREATE INDEX "Team_oddsApiName_idx" ON "Team"("oddsApiName");
