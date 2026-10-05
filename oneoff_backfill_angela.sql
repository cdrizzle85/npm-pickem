-- One-off: Angela Hurley (player 128) joined after weeks 1 and 2 had already
-- locked, so she never got the normal automatic grace credit for them (that
-- only triggers for players who already exist when a week's deadline passes).
-- Backfilling both at 2 wins / 5 losses, matching the standard grace rule
-- for a 7-game week. INSERT OR IGNORE so this is safe to re-run.
-- Week 4 is intentionally not touched here, it's still in progress and the
-- normal automatic system will handle it correctly once it locks.

INSERT OR IGNORE INTO grace_credits (player_id, week_id, wins_credited, losses_credited) VALUES
  (128, 14, 2, 5),
  (128, 16, 2, 5);
