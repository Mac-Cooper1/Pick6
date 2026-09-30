-- Standings tiebreaker (Sep 30): ESPN FPI strength-of-schedule rank per team
-- per season (1 = hardest schedule in FBS), refreshed by the scheduled sync.
-- On equal points, the lower combined rank of a member's five ranks higher.
CREATE TABLE "TeamSos" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "sosRank" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamSos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamSos_seasonYear_teamId_key" ON "TeamSos"("seasonYear", "teamId");

ALTER TABLE "TeamSos" ADD CONSTRAINT "TeamSos_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
