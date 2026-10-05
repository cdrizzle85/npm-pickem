-- One-off: three Week 5 college games were published with a placeholder
-- kickoff of 04:00Z (midnight Eastern) instead of the real noon Eastern
-- (16:00Z). That put the week's deadline in the past and locked everyone out.
-- Picks are tied to game ids, not times, so existing picks are unaffected.

UPDATE games SET kickoff_time = '2026-10-03T16:00Z' WHERE id IN (121, 123, 124);

-- Grace credits created while the deadline was wrongly in the past. Any
-- player who truly misses the week gets a fresh one automatically once the
-- real deadline passes.
DELETE FROM grace_credits WHERE week_id = 20;

-- Keep the schedule browser consistent for these same games.
UPDATE schedule_games
SET kickoff_time = '2026-10-03T16:00Z', time_tbd = 0
WHERE sport = 'college-football'
  AND source_event_id IN (SELECT espn_event_id FROM games WHERE id IN (121, 123, 124));
