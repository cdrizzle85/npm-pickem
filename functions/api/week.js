import { json, errorJson, ensureAutoFillsForWeek, isLocked } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get('player_id');

  const week = await env.DB
    .prepare("SELECT * FROM weeks WHERE status = 'open' ORDER BY round_number DESC LIMIT 1")
    .first();

  if (!week) return errorJson('No open week right now.', 404);

  await ensureAutoFillsForWeek(env.DB, week.id);

  const games = await env.DB
    .prepare('SELECT * FROM games WHERE week_id = ? ORDER BY kickoff_time ASC')
    .bind(week.id)
    .all();

  let myPicks = {};
  if (playerId) {
    const rows = await env.DB
      .prepare(
        `SELECT p.game_id, p.picked_team FROM picks p
         JOIN games g ON g.id = p.game_id
         WHERE p.player_id = ? AND g.week_id = ?`
      )
      .bind(playerId, week.id)
      .all();
    for (const row of rows.results) myPicks[row.game_id] = row.picked_team;
  }

  const gamesOut = games.results.map(g => ({
    id: g.id,
    sport: g.sport,
    home_team: g.home_team,
    away_team: g.away_team,
    kickoff_time: g.kickoff_time,
    locked: isLocked(g.kickoff_time),
    my_pick: myPicks[g.id] || null
  }));

  return json({
    week_id: week.id,
    round_number: week.round_number,
    is_playoff: !!week.is_playoff,
    games: gamesOut
  });
}
