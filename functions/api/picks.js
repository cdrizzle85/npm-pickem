import { json, errorJson, getWeekDeadline } from '../_lib.js';

// POST /api/picks -> submit (or resubmit) every pick for a week at once.
// body: { player_id, week_id, picks: [{ game_id, picked_team }, ...] }
// Requires a pick for every game in the week; partial submissions are rejected.
export async function onRequestPost({ request, env }) {
  const { player_id, week_id, picks } = await request.json();
  if (!player_id || !week_id || !Array.isArray(picks)) {
    return errorJson('player_id, week_id, and a picks array are required.');
  }

  const deadline = await getWeekDeadline(env.DB, week_id);
  if (!deadline) return errorJson('Week not found or has no games.', 404);
  if (new Date(deadline).getTime() <= Date.now()) {
    return errorJson('Picks are locked, the first game of the week has already kicked off.', 409);
  }

  const games = await env.DB.prepare('SELECT * FROM games WHERE week_id = ?').bind(week_id).all();
  if (!games.results.length) return errorJson('Week not found or has no games.', 404);

  const gameById = new Map(games.results.map(g => [g.id, g]));
  const submittedIds = new Set(picks.map(p => p.game_id));

  for (const g of games.results) {
    if (!submittedIds.has(g.id)) {
      return errorJson(`Missing a pick for ${g.away_team} at ${g.home_team}.`);
    }
  }
  for (const p of picks) {
    const game = gameById.get(p.game_id);
    if (!game) return errorJson('One of these games is not part of this week.');
    if (p.picked_team !== game.home_team && p.picked_team !== game.away_team) {
      return errorJson(`Invalid pick for ${game.away_team} at ${game.home_team}.`);
    }
  }

  for (const p of picks) {
    await env.DB
      .prepare(
        `INSERT INTO picks (player_id, game_id, picked_team)
         VALUES (?, ?, ?)
         ON CONFLICT(player_id, game_id)
         DO UPDATE SET picked_team = excluded.picked_team, submitted_at = datetime('now'), is_auto_fill = 0`
      )
      .bind(player_id, p.game_id, p.picked_team)
      .run();
  }

  return json({ ok: true, submitted_at: new Date().toISOString() });
}
