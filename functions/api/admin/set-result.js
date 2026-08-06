import { json, errorJson, ensureAutoFillsForWeek } from '../../_lib.js';

// POST /api/admin/set-result
// body: { game_id, winner_team }
// Manual override in case the ESPN pull is unavailable or wrong.
export async function onRequestPost({ request, env }) {
  const { game_id, winner_team } = await request.json();
  if (!game_id || !winner_team) return errorJson('game_id and winner_team are required.');

  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(game_id).first();
  if (!game) return errorJson('Game not found.', 404);
  if (winner_team !== game.home_team && winner_team !== game.away_team) {
    return errorJson('winner_team must match one of the two teams in this game.');
  }

  await env.DB
    .prepare("UPDATE games SET status = 'post', winner_team = ? WHERE id = ?")
    .bind(winner_team, game_id)
    .run();

  await ensureAutoFillsForWeek(env.DB, game.week_id);

  return json({ ok: true });
}
