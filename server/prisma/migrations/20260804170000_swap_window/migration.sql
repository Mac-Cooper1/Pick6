-- WS8: the week-5 swap window. Auto-opens after week 5 completes; members
-- swap in worst-record-first turns on a 24h clock, then free-for-all until
-- the commissioner closes it.
CREATE TYPE "SwapStatus" AS ENUM ('NOT_OPEN', 'OPEN', 'CLOSED');
ALTER TABLE "League" ADD COLUMN "swapStatus" "SwapStatus" NOT NULL DEFAULT 'NOT_OPEN';
ALTER TABLE "League" ADD COLUMN "swapTurnDeadline" TIMESTAMP(3);
ALTER TABLE "LeagueMember" ADD COLUMN "swapOrder" INTEGER;
ALTER TABLE "LeagueMember" ADD COLUMN "swapSkipped" BOOLEAN NOT NULL DEFAULT false;
