-- Paid commissioner videos (Oct 10): one row per Stripe Checkout payment.
-- A paid row with no videoId is a credit; a video claims it when it starts
-- and gives it back if it fails. Additive only.
CREATE TABLE "VideoPayment" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "videoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoPayment_stripeSessionId_key" ON "VideoPayment"("stripeSessionId");

CREATE UNIQUE INDEX "VideoPayment_videoId_key" ON "VideoPayment"("videoId");

CREATE INDEX "VideoPayment_userId_leagueId_idx" ON "VideoPayment"("userId", "leagueId");

ALTER TABLE "VideoPayment" ADD CONSTRAINT "VideoPayment_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoPayment" ADD CONSTRAINT "VideoPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoPayment" ADD CONSTRAINT "VideoPayment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "LeagueVideo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
