-- One-off: manually enter Susan Phelps' (player 122) week 2 picks, which
-- she made but never actually submitted (screenshot confirms her choices).
-- INSERT OR REPLACE so this is safe to re-run and overwrites any partial
-- row that might already exist rather than erroring.
-- Also removes her week 2 grace credit, since she now has real picks for
-- that week and shouldn't be counted as having missed it.

INSERT OR REPLACE INTO picks (player_id, game_id, picked_team) VALUES
  (122, 93, 'Oklahoma Sooners'),
  (122, 94, 'Mississippi State Bulldogs'),
  (122, 95, 'Syracuse Orange'),
  (122, 96, 'Ohio State Buckeyes'),
  (122, 97, 'Pittsburgh Steelers'),
  (122, 98, 'Minnesota Vikings'),
  (122, 99, 'Dallas Cowboys');

DELETE FROM grace_credits WHERE player_id = 122 AND week_id = 16;
