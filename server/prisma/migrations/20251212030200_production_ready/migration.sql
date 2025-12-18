-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINAL', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('DRAFT', 'WAIVER', 'FREE_AGENT');

-- CreateEnum
CREATE TYPE "WaiverStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'CANCELLED');

-- AlterTable
ALTER TABLE "DraftPick" ADD COLUMN     "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "wasAutoPick" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "currentPickDeadline" TIMESTAMP(3),
ADD COLUMN     "currentPickNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentWeek" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "draftStartTime" TIMESTAMP(3),
ADD COLUMN     "draftStarted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickDeadlineSeconds" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "seasonYear" INTEGER NOT NULL DEFAULT 2024;

-- AlterTable
ALTER TABLE "LeagueMember" ADD COLUMN     "draftPosition" INTEGER;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "abbreviation" TEXT,
ADD COLUMN     "espnTeamId" TEXT;

-- CreateTable
CREATE TABLE "DraftQueue" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "espnEventId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "winnerTeamId" INTEGER,
    "spread" DOUBLE PRECISION,
    "favoriteTeamId" INTEGER,
    "bookmaker" TEXT,
    "oddsTimestamp" TIMESTAMP(3),
    "wasUpset" BOOLEAN NOT NULL DEFAULT false,
    "venue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterTeam" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "acquiredVia" "AcquisitionType" NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "droppedAt" TIMESTAMP(3),

    CONSTRAINT "RosterTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "addTeamId" INTEGER NOT NULL,
    "dropTeamId" INTEGER NOT NULL,
    "status" "WaiverStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftQueue_leagueId_userId_priority_idx" ON "DraftQueue"("leagueId", "userId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueue_leagueId_userId_teamId_key" ON "DraftQueue"("leagueId", "userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_espnEventId_key" ON "Game"("espnEventId");

-- CreateIndex
CREATE INDEX "Game_seasonYear_weekNumber_idx" ON "Game"("seasonYear", "weekNumber");

-- CreateIndex
CREATE INDEX "Game_startTime_idx" ON "Game"("startTime");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "RosterTeam_leagueId_userId_idx" ON "RosterTeam"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "RosterTeam_leagueId_teamId_idx" ON "RosterTeam"("leagueId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterTeam_leagueId_teamId_droppedAt_key" ON "RosterTeam"("leagueId", "teamId", "droppedAt");

-- CreateIndex
CREATE INDEX "WaiverClaim_leagueId_status_idx" ON "WaiverClaim"("leagueId", "status");

-- CreateIndex
CREATE INDEX "WaiverClaim_leagueId_userId_idx" ON "WaiverClaim"("leagueId", "userId");

-- AddForeignKey
ALTER TABLE "DraftQueue" ADD CONSTRAINT "DraftQueue_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueue" ADD CONSTRAINT "DraftQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterTeam" ADD CONSTRAINT "RosterTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterTeam" ADD CONSTRAINT "RosterTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterTeam" ADD CONSTRAINT "RosterTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
