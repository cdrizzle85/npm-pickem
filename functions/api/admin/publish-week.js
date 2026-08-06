import { json, errorJson, generateCoinFlipPicks } from '../../_lib.js';

// POST /api/admin/publish-week
// body: { round_number, is_playoff, games: [{espn_event_id, sport, home_team, away_team, kickoff_time}] }
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { round_number, is_playoff, games } = body;

  if (!round_number || !Array.isArray(games) || games.length === 0) {
    return errorJson('round_number and a non-empty games array are required.');
  }

  const weekInsert = await env.DB
    .prepare('INSERT INTO weeks (round_number, is_playoff) VALUES (?, ?)')
    .bind(round_number, is_playoff ? 1 : 0)
    .run();
  const weekId = weekInsert.meta.last_row_id;

  for (const g of games) {
    await env.DB
      .prepare(
        `INSERT INTO games (week_id, espn_event_id, source, sport, home_team, away_team, kickoff_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(weekId, g.espn_event_id, g.source || 'manual', g.sport, g.home_team, g.away_team, g.kickoff_time)
      .run();
  }

  await generateCoinFlipPicks(env.DB, weekId);

  return json({ ok: true, week_id: weekId });
}
