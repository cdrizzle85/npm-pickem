import { json, errorJson, fetchEspnGameResult, ensureAutoFillsForWeek } from '../../_lib.js';

// POST /api/admin/score-week
// body: { week_id }
// Pulls live results from ESPN for every game in the week, updates winners,
// auto-fills any missed picks from Coin Flip, and marks the week scored
// once every game is final.
export async function onRequestPost({ request, env }) {
  const { week_id } = await request.json();
  if (!week_id) return errorJson('week_id is required.');

  const games = await env.DB
    .prepare('SELECT * FROM games WHERE week_id = ?')
    .bind(week_id)
    .all();
  if (!games.results.length) return errorJson('Week not found or has no games.', 404);

  let allFinal = true;

  for (const game of games.results) {
    if (game.status === 'post' && game.winner_team) continue; // already scored
    try {
      const result = await fetchEspnGameResult(game.sport, game.espn_event_id);
      if (result.completed) {
        await env.DB
          .prepare('UPDATE games SET status = ?, winner_team = ? WHERE id = ?')
          .bind('post', result.winner_team, game.id)
          .run();
      } else {
        allFinal = false;
        await env.DB
          .prepare('UPDATE games SET status = ? WHERE id = ?')
          .bind(result.status, game.id)
          .run();
      }
    } catch (err) {
      allFinal = false;
      // Leave this game as-is; admin can retry or enter the result by hand later.
    }
  }

  await ensureAutoFillsForWeek(env.DB, week_id);

  if (allFinal) {
    await env.DB
      .prepare("UPDATE weeks SET status = 'scored' WHERE id = ?")
      .bind(week_id)
      .run();
  }

  return json({ ok: true, all_final: allFinal });
}
