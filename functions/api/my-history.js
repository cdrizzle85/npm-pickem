import { json, errorJson } from '../_lib.js';

// GET /api/my-history?player_id=X
// Every week the player has been part of, with their pick for each game,
// the actual winner (once known), and whether that pick was right. Weeks
// they missed entirely show their grace credit instead. Purely read-only,
// doesn't touch scoring, submission, or standings in any way.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get('player_id');
  if (!playerId) return errorJson('player_id is required.');

  const weeks = await env.DB
    .prepare('SELECT id, round_number, is_playoff, status FROM weeks ORDER BY round_number DESC')
    .all();
  if (!weeks.results.length) return json({ weeks: [] });

  const [gamesRows, picksRows, graceRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM games ORDER BY kickoff_time ASC').all(),
    env.DB.prepare(
      `SELECT game_id, picked_team FROM picks WHERE player_id = ?`
    ).bind(playerId).all(),
    env.DB.prepare(
      `SELECT week_id, wins_credited, losses_credited FROM grace_credits WHERE player_id = ?`
    ).bind(playerId).all()
  ]);

  const picksByGame = new Map(picksRows.results.map(p => [p.game_id, p.picked_team]));
  const graceByWeek = new Map(graceRows.results.map(g => [g.week_id, g]));
  const gamesByWeek = new Map();
  for (const g of gamesRows.results) {
    if (!gamesByWeek.has(g.week_id)) gamesByWeek.set(g.week_id, []);
    gamesByWeek.get(g.week_id).push(g);
  }

  const weeksOut = weeks.results.map(w => {
    const grace = graceByWeek.get(w.id);
    const weekGames = (gamesByWeek.get(w.id) || []).map(g => {
      const myPick = picksByGame.get(g.id) || null;
      let result = 'pending';
      if (g.winner_team && myPick) result = myPick === g.winner_team ? 'win' : 'loss';
      else if (g.winner_team && !myPick) result = 'no_pick';
      return {
        game_id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        kickoff_time: g.kickoff_time,
        winner_team: g.winner_team,
        my_pick: myPick,
        result
      };
    });

    return {
      week_id: w.id,
      round_number: w.round_number,
      is_playoff: !!w.is_playoff,
      graced: !!grace,
      grace_wins: grace ? grace.wins_credited : null,
      grace_losses: grace ? grace.losses_credited : null,
      games: weekGames
    };
  });

  return json({ weeks: weeksOut });
}
