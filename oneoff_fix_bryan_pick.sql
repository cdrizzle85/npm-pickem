-- One-off: correct Bryan Apinis's Week 5 pick for Georgia Southern at
-- Coastal Carolina (game 124) to Georgia Southern Eagles, who won.
-- Guarded: only changes the row if it still shows the old pick and the
-- player id really is Bryan Apinis, otherwise it changes nothing.

UPDATE picks
SET picked_team = 'Georgia Southern Eagles'
WHERE player_id = 106
  AND game_id = 124
  AND picked_team = 'Coastal Carolina Chanticleers'
  AND EXISTS (SELECT 1 FROM players WHERE id = 106 AND name = 'Bryan Apinis');
