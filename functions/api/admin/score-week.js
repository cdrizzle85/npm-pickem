import { json, errorJson, fetchEspnGameResult, fetchSportsDbResult, applyGraceCredits } from '../../_lib.js';

// POST /api/admin/score-week
// body: { week_id }
// Pulls live results for every game in the week (from whichever source it came from),
// updates winners, applies grace credits for anyone who never submitted, and marks
// the week scored once every game is final. Manually-entered games are skipped here,
// use set-result for those.
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
    if (game.source === 'manual') {
      allFinal = false;
      continue; // no automatic source for this game, use the manual override
    }
    try {
      const result = game.source === 'sportsdb'
        ? await fetchSportsDbResult(game.espn_event_id)
        : await fetchEspnGameResult(game.sport, game.espn_event_id);

      if (result.completed) {
        await env.DB
          .prepare('UPDATE games SET status = ?, winner_team = ? WHERE id = ?')
          .bind('post', result.winner_team, game.id)
          .run();
      } else {
        allFinal = false;
      }
    } catch (err) {
      allFinal = false;
      // Leave this game as-is; admin can retry or enter the result by hand later.
    }
  }

  await applyGraceCredits(env.DB, week_id);

  if (allFinal) {
    await env.DB
      .prepare("UPDATE weeks SET status = 'scored' WHERE id = ?")
      .bind(week_id)
      .run();
  }

  return json({ ok: true, all_final: allFinal });
}
