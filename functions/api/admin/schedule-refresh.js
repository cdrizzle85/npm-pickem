import { json, errorJson } from '../../_lib.js';

const SPORTS = new Set(['nfl', 'college-football']);
const MAX_GAMES = 600;
const BATCH_SIZE = 100;

// POST /api/admin/schedule-refresh -> { games: [{ sport, source_event_id, kickoff_time, time_tbd, label }] }
// The admin page fetches current times from ESPN in the browser (the site's servers
// can't reach ESPN) and sends them here. Updates existing schedule_games rows only,
// matched on sport + ESPN event id. Never inserts, and never replaces a confirmed
// time with a TBD one, so an "Edit time" fix survives a refresh. Does not touch games
// already published into a week, use Sync kickoff times from schedule for those.
export async function onRequestPost({ request, env }) {
  const { games } = await request.json();
  if (!Array.isArray(games) || !games.length) return errorJson('games array is required.');
  if (games.length > MAX_GAMES) return errorJson('Too many games in one refresh, narrow the date range.');

  const valid = games.filter(g =>
    g &&
    SPORTS.has(g.sport) &&
    g.source_event_id &&
    typeof g.kickoff_time === 'string' &&
    !Number.isNaN(new Date(g.kickoff_time).getTime())
  );
  if (!valid.length) return errorJson('No valid games in the request.');

  const stmt = env.DB.prepare(
    `UPDATE schedule_games
     SET kickoff_time = ?, time_tbd = ?
     WHERE sport = ? AND source_event_id = ?
       AND (kickoff_time != ? OR time_tbd != ?)
       AND NOT (? = 1 AND time_tbd = 0)`
  );

  const changed = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const chunk = valid.slice(i, i + BATCH_SIZE);
    const results = await env.DB.batch(
      chunk.map(g => {
        const tbd = g.time_tbd ? 1 : 0;
        return stmt.bind(g.kickoff_time, tbd, g.sport, String(g.source_event_id), g.kickoff_time, tbd, tbd);
      })
    );
    results.forEach((r, j) => {
      if (r.meta && r.meta.changes > 0) {
        const g = chunk[j];
        changed.push({
          sport: g.sport,
          source_event_id: String(g.source_event_id),
          kickoff_time: g.kickoff_time,
          time_tbd: g.time_tbd ? 1 : 0,
          label: String(g.label || '')
        });
      }
    });
  }

  return json({ checked: valid.length, changed });
}
