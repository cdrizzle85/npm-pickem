import { json, errorJson } from '../../_lib.js';

// POST /api/admin/sync-week-times -> { week_id }
// Published games are a snapshot of the schedule at publish time, so when ESPN
// later announces real kickoff times (or an admin fixes one with Edit time),
// this copies them into the week. Only touches kickoff_time on games that came
// from the schedule browser, never picks. Games whose schedule time is still
// TBD are left alone and reported back. Refuses once the week has locked.
export async function onRequestPost({ request, env }) {
  const { week_id } = await request.json();
  if (!week_id) return errorJson('week_id is required.');

  const gamesRes = await env.DB.prepare('SELECT * FROM games WHERE week_id = ?').bind(week_id).all();
  const games = gamesRes.results;
  if (!games.length) return errorJson('Week not found or has no games.', 404);

  const earliest = times => Math.min(...times.map(t => new Date(t).getTime()));
  if (earliest(games.map(g => g.kickoff_time)) <= Date.now()) {
    return errorJson('This week has already locked, so times can no longer be synced from here.', 409);
  }

  const scheduled = games.filter(g => g.source === 'schedule');
  if (!scheduled.length) return json({ updated: [], still_tbd: [], not_found: [], unchanged: 0 });

  const ids = scheduled.map(g => g.espn_event_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB
    .prepare(`SELECT sport, source_event_id, kickoff_time, time_tbd FROM schedule_games WHERE source_event_id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const byKey = new Map(rows.results.map(r => [`${r.sport}:${r.source_event_id}`, r]));

  const updates = [];
  const stillTbd = [];
  const notFound = [];
  let unchanged = 0;

  for (const g of scheduled) {
    const label = `${g.away_team} at ${g.home_team}`;
    const row = byKey.get(`${g.sport}:${g.espn_event_id}`);
    if (!row) { notFound.push(label); continue; }
    if (row.time_tbd) { stillTbd.push(label); continue; }
    if (row.kickoff_time === g.kickoff_time) { unchanged++; continue; }
    updates.push({ id: g.id, label, from: g.kickoff_time, to: row.kickoff_time });
  }

  // Never let a sync lock the week: check the resulting deadline before writing.
  const newTimes = games.map(g => {
    const u = updates.find(x => x.id === g.id);
    return u ? u.to : g.kickoff_time;
  });
  if (earliest(newTimes) <= Date.now()) {
    return errorJson('Syncing would put the first kickoff in the past and lock the week, so nothing was changed. Check the times in the schedule browser first.', 409);
  }

  if (updates.length) {
    const stmt = env.DB.prepare('UPDATE games SET kickoff_time = ? WHERE id = ?');
    await env.DB.batch(updates.map(u => stmt.bind(u.to, u.id)));
  }

  return json({ updated: updates, still_tbd: stillTbd, not_found: notFound, unchanged });
}
