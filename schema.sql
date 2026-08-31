-- NPM Pick 'Em database schema
-- Run with: wrangler d1 execute npm-pickem-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL, -- 'NPM' | 'NPCC'
  name TEXT NOT NULL,
  UNIQUE(org, name)
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  team_id INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  espn_event_id TEXT NOT NULL, -- external id from whichever source (name kept for simplicity)
  source TEXT NOT NULL DEFAULT 'manual', -- 'espn' | 'sportsdb' | 'manual'
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
  is_auto_fill INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, game_id)
);

CREATE TABLE IF NOT EXISTS grace_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  week_id INTEGER NOT NULL REFERENCES weeks(id),
  wins_credited INTEGER NOT NULL,
  losses_credited INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, week_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_week ON games(week_id);
CREATE INDEX IF NOT EXISTS idx_picks_game ON picks(game_id);
CREATE INDEX IF NOT EXISTS idx_picks_player ON picks(player_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
