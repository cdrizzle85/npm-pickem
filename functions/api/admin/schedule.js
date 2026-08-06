import { json, errorJson } from '../../_lib.js';

// GET /api/admin/schedule?sport=nfl&start=2026-09-09&end=2026-09-16
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport');
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (sport !== 'nfl' && sport !== 'college-football') {
    return errorJson("sport must be 'nfl' or 'college-football'.");
  }
  if (!start || !end) return errorJson('start and end dates are required (YYYY-MM-DD).');

  const rows = await env.DB
    .prepare(
      `SELECT * FROM schedule_games
       WHERE sport = ? AND kickoff_time >= ? AND kickoff_time < ?
       ORDER BY kickoff_time ASC`
    )
    .bind(sport, `${start}T00:00:00Z`, `${end}T23:59:59Z`)
    .all();

  return json({ games: rows.results });
}

// PATCH /api/admin/schedule -> fix a kickoff time (flex scheduling, or a CFB game that was TBD)
export async function onRequestPatch({ request, env }) {
  const { id, kickoff_time } = await request.json();
  if (!id || !kickoff_time) return errorJson('id and kickoff_time are required.');

  await env.DB
    .prepare('UPDATE schedule_games SET kickoff_time = ?, time_tbd = 0 WHERE id = ?')
    .bind(kickoff_time, id)
    .run();

  return json({ ok: true });
}
