-- Retire the legacy manual-entry GameResult table. Manual corrections now go
-- through POST /api/admin/game-override, which writes the Game table
-- directly and rescores affected leagues.
DROP TABLE IF EXISTS "GameResult";
