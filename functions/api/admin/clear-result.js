import { json, errorJson } from '../../_lib.js';

// POST /api/admin/clear-result -> { game_id }
// Resets a game back to no result, undoes a wrong manual entry (or a bad
// automatic pull) so it can be scored correctly. Standings simply stop
// counting this game for anyone until it's set again.
export async function onRequestPost({ request, env }) {
  const { game_id } = await request.json();
  if (!game_id) return errorJson('game_id is required.');

  const game = await env.DB.prepare('SELECT id FROM games WHERE id = ?').bind(game_id).first();
  if (!game) return errorJson('Game not found.', 404);

  await env.DB
    .prepare("UPDATE games SET winner_team = NULL, status = 'scheduled' WHERE id = ?")
    .bind(game_id)
    .run();

  return json({ ok: true });
}
