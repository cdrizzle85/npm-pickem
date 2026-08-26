-- One-time migration: adds an org column ('NPM' | 'NPCC') to teams, since
-- several team names (KidMin, Student Min, AME, Intersect, Pastor's Office)
-- exist in both organizations and need to stay distinct. Rebuilds the table
-- because SQLite can't just swap a UNIQUE(name) constraint for UNIQUE(org, name)
-- in place. D1 enforces foreign keys, so player.team_id assignments are
-- backed up and temporarily cleared before the rebuild, then restored
-- (team ids are preserved, so the restore maps back correctly).
-- Run with: npx wrangler d1 execute npm-pickem-db --remote --file=migration_006_org_teams.sql

CREATE TABLE _team_backup AS
SELECT id, team_id FROM players WHERE team_id IS NOT NULL;

UPDATE players SET team_id = NULL;

CREATE TABLE teams_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org, name)
);

INSERT INTO teams_new (id, org, name)
SELECT id, 'NPM', name FROM teams;

DROP TABLE teams;
ALTER TABLE teams_new RENAME TO teams;

INSERT OR IGNORE INTO teams (org, name) VALUES
  ('NPCC', 'KidMin'),
  ('NPCC', 'Student Min'),
  ('NPCC', 'Connections'),
  ('NPCC', 'AME'),
  ('NPCC', 'Care'),
  ('NPCC', 'Operations'),
  ('NPCC', 'Digital Content'),
  ('NPCC', 'Intersect'),
  ('NPCC', 'SPD'),
  ('NPCC', 'Pastor''s Office');

UPDATE players
SET team_id = (SELECT team_id FROM _team_backup WHERE _team_backup.id = players.id)
WHERE players.id IN (SELECT id FROM _team_backup);

DROP TABLE _team_backup;
