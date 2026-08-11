-- One-time migration: adds teams and links players to them.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_003_teams.sql

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

ALTER TABLE players ADD COLUMN team_id INTEGER REFERENCES teams(id);
