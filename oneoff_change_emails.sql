-- One-off: change login emails for two players. Guarded on id AND the current
-- email, so it does nothing if either has changed since it was looked up.
-- Picks, history, grace credits and comments hang off the player id and
-- are not affected.

UPDATE players SET email = 'andrewbedford33@gmail.com'
WHERE id = 114 AND email = 'andy.bedford@northpoint.org';

UPDATE players SET email = 'tfoster1218@gmail.com'
WHERE id = 120 AND email = 'tanner.foster@northpointministries.net';
