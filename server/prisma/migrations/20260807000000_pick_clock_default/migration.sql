-- QA round 1: a 5-round slot draft moves faster than a full fantasy draft,
-- but 60s still felt rushed in the first real one — default pick clock to 90s.
-- (Existing leagues keep their configured value; commissioners can adjust.)
ALTER TABLE "League" ALTER COLUMN "pickDeadlineSeconds" SET DEFAULT 90;
