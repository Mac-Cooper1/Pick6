-- Neutral-site games (Oct 4): Week by Week, League and My Team say "at" only
-- for a true road game and "vs" for home and neutral-site games, like the
-- team card. The sync sets this from ESPN's scoreboard
-- (competitions[0].neutralSite) from now on. The UPDATE backfills the 16
-- neutral-site games on ESPN's 2026 regular-season schedule as of Oct 4
-- (Dublin, Lambeau, Red River, Georgia-Florida, the conference title games,
-- Army-Navy...); rows not synced yet are a no-op and get the flag when the
-- sync creates them. Additive only.
ALTER TABLE "Game" ADD COLUMN "neutralSite" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Game" SET "neutralSite" = true WHERE "espnEventId" IN (
  '401856766',
  '401856636',
  '401858438',
  '401856661',
  '401856802',
  '401856812',
  '401856717',
  '401859185',
  '401856734',
  '401866456',
  '401869533',
  '401858318',
  '401869536',
  '401869545',
  '401869534',
  '401862844'
);
