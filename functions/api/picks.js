import { json, errorJson, isLocked } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const { player_id, game_id, picked_team } = await request.json();
  if (!player_id || !game_id || !picked_team) {
    return errorJson('player_id, game_id, and picked_team are required.');
  }

  const game = await env.DB
    .prepare('SELECT * FROM games WHERE id = ?')
    .bind(game_id)
    .first();
  if (!game) return errorJson('Game not found.', 404);

  if (isLocked(game.kickoff_time)) {
    return errorJson('This game has already kicked off, picks are locked.', 409);
  }
  if (picked_team !== game.home_team && picked_team !== game.away_team) {
    return errorJson('picked_team must match one of the two teams in this game.');
  }

  await env.DB
    .prepare(
      `INSERT INTO picks (player_id, game_id, picked_team)
       VALUES (?, ?, ?)
       ON CONFLICT(player_id, game_id)
       DO UPDATE SET picked_team = excluded.picked_team, submitted_at = datetime('now'), is_auto_fill = 0`
    )
    .bind(player_id, game_id, picked_team)
    .run();

  return json({ ok: true });
}
