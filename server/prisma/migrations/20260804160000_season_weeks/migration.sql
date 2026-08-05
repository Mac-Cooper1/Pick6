-- D6: ESPN-derived week calendar. Current week is computed from the clock
-- against SeasonWeek rows; the manually-advanced League.currentWeek dies.
CREATE TABLE "SeasonWeek" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeasonWeek_seasonYear_weekNumber_key" ON "SeasonWeek"("seasonYear", "weekNumber");
CREATE INDEX "SeasonWeek_seasonYear_startDate_idx" ON "SeasonWeek"("seasonYear", "startDate");

ALTER TABLE "League" DROP COLUMN IF EXISTS "currentWeek";
