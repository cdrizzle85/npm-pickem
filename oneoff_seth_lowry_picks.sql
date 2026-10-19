-- One-off: enter Seth Lowry's (player 75) picks for the current week (week_id 22),
-- which he recorded in Slack but never submitted in the app.
-- INSERT OR REPLACE so it is safe to re-run.
-- Also removes his grace credit for the week, since he now has real picks and
-- would otherwise be counted twice. The automatic grace logic only credits
-- players with no picks, so it will not recreate it.

INSERT OR REPLACE INTO picks (player_id, game_id, picked_team) VALUES
  (75, 135, 'Ohio State Buckeyes'),
  (75, 136, 'North Carolina Tar Heels'),
  (75, 137, 'Notre Dame Fighting Irish'),
  (75, 138, 'Houston Cougars'),
  (75, 139, 'Jacksonville Jaguars'),
  (75, 140, 'Carolina Panthers'),
  (75, 141, 'Green Bay Packers');

DELETE FROM grace_credits WHERE player_id = 75 AND week_id = 22;
