-- NPM Pick 'Em database schema
-- Run with: wrangler d1 execute npm-pickem-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  is_coinflip INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the Coin Flip entry as player id 1
INSERT OR IGNORE INTO players (id, name, email, is_coinflip)
VALUES (1, 'Coin Flip', 'coinflip@internal.local', 1);

CREATE TABLE IF NOT EXISTS weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_number INTEGER NOT NULL,
  is_playoff INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open | scored
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES weeks(id),
  espn_event_id TEXT NOT NULL,
  sport TEXT NOT NULL, -- 'nfl' | 'college-football'
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TEXT NOT NULL, -- ISO 8601
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | final
  winner_team TEXT, -- set once final
  UNIQUE(week_id, espn_event_id)
);

CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  picked_team TEXT NOT NULL,
  is_auto_fill INTEGER NOT NULL DEFAULT 0, -- 1 if copied from Coin Flip after missed deadline
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_games_week ON games(week_id);
CREATE INDEX IF NOT EXISTS idx_picks_game ON picks(game_id);
CREATE INDEX IF NOT EXISTS idx_picks_player ON picks(player_id);
