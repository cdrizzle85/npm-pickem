-- One-off: merge duplicate PJ Bucci accounts.
-- Player 102 (pj.bucci@northpointministries.net, week 1 picks) merges into
-- player 127 (pj.bucci@npm.net, the account she wants to keep).
-- UPDATE OR IGNORE means if she somehow already has a pick for the same
-- game on both accounts, that one row is left alone rather than erroring,
-- and the final DELETE will then fail (since players is referenced by
-- foreign keys), which tells us to come back and look at it by hand rather
-- than silently losing data.

UPDATE OR IGNORE picks SET player_id = 127 WHERE player_id = 102;
UPDATE OR IGNORE grace_credits SET player_id = 127 WHERE player_id = 102;
UPDATE comments SET player_id = 127 WHERE player_id = 102;
DELETE FROM players WHERE id = 102;
