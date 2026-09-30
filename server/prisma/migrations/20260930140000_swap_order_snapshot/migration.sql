-- Week-6 swap recap (Sep 30): the points and combined SOS rank that set each
-- member's position, saved when the swap runs. SOS ranks change daily, so
-- the recap can't recompute them later.
ALTER TABLE "LeagueMember" ADD COLUMN "swapPoints" INTEGER,
ADD COLUMN "swapSos" INTEGER;
