-- WS4 auth: real accounts. Users get bcrypt password hashes; leagues drop
-- their separate password — joining is by league code only.
-- Existing rows get an empty hash, which can never match a bcrypt compare,
-- so pre-existing dev users simply can't log in until recreated/reset.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
ALTER TABLE "League" DROP COLUMN IF EXISTS "password";
