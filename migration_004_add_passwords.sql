-- One-time migration: wipes existing (test) player accounts and their picks,
-- keeps Coin Flip, and adds password support.
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_004_add_passwords.sql

DELETE FROM picks WHERE player_id != 1;
DELETE FROM players WHERE is_coinflip = 0;
ALTER TABLE players ADD COLUMN password_hash TEXT;
