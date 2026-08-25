-- One-time migration: removes the Coin Flip mechanic entirely in favor of
-- automatic grace points (2 wins, rest of that week's games count as losses)
-- for anyone who misses a week. Since the competition hasn't started and
-- only test data exists so far, this also clears the Coin Flip account and
-- its test picks rather than preserving them.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_005_grace_credits.sql

CREATE TABLE IF NOT EXISTS grace_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  week_id INTEGER NOT NULL REFERENCES weeks(id),
  wins_credited INTEGER NOT NULL,
  losses_credited INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, week_id)
);

DELETE FROM picks WHERE player_id IN (SELECT id FROM players WHERE is_coinflip = 1);
DELETE FROM players WHERE is_coinflip = 1;
