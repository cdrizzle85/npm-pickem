-- One-time migration: adds a comments table for the Smack Talk board.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_007_comments.sql

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
