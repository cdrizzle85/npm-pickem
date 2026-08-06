-- One-time migration: adds a table to hold the pre-loaded season schedule
-- (real matchups/dates, imported once from ESPN via scripts/import-schedule.mjs)
-- separate from the `games` table, which holds only games actually published
-- into a pick'em week.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_002_schedule_table.sql

CREATE TABLE IF NOT EXISTS schedule_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id TEXT NOT NULL,
  sport TEXT NOT NULL, -- 'nfl' | 'college-football'
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TEXT NOT NULL, -- ISO 8601, admin-editable if it changes or was TBD
  time_tbd INTEGER NOT NULL DEFAULT 0,
  week_label TEXT, -- e.g. "Week 3", for display/filtering only
  UNIQUE(sport, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_sport_kickoff ON schedule_games(sport, kickoff_time);
