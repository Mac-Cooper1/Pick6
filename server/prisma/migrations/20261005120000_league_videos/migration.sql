-- AI video messages (Oct 5 prototype): a commissioner's talking video made on
-- fal.ai from their photo, a setting, a voice and a script, then sent to the
-- league. Only the finished video's URL is stored; never the photo. Additive.
CREATE TYPE "LeagueVideoStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

CREATE TABLE "LeagueVideo" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "setting" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "status" "LeagueVideoStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "videoUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeagueVideo_leagueId_createdAt_idx" ON "LeagueVideo"("leagueId", "createdAt");

ALTER TABLE "LeagueVideo" ADD CONSTRAINT "LeagueVideo_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeagueVideo" ADD CONSTRAINT "LeagueVideo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
