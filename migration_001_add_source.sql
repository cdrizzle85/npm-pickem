-- One-time migration for the database that's already live.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_001_add_source.sql
ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT 'espn';
