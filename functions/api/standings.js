import { json, errorJson } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const weekId = url.searchParams.get('week_id');
  const teams = url.searchParams.get('teams');

  if (teams) return teamStandings(env.DB);
  if (weekId) return weeklyRecap(env.DB, weekId);
  return seasonStandings(env.DB);
}

async function seasonStandings(db) {
  const rows = await db
    .prepare(
      `SELECT
         pl.id AS player_id,
         pl.name,
         pl.team_id,
         t.name AS team_name,
         t.org AS team_org,
         COALESCE(SUM(CASE WHEN p.picked_team = g.winner_team THEN 1 ELSE 0 END), 0) AS pick_wins,
         COALESCE(SUM(CASE WHEN g.winner_team IS NOT NULL AND p.picked_team != g.winner_team THEN 1 ELSE 0 END), 0) AS pick_losses,
         COALESCE(gc.grace_wins, 0) AS grace_wins,
         COALESCE(gc.grace_losses, 0) AS grace_losses
       FROM players pl
       LEFT JOIN teams t ON t.id = pl.team_id
       LEFT JOIN picks p ON p.player_id = pl.id
       LEFT JOIN games g ON g.id = p.game_id AND g.winner_team IS NOT NULL
       LEFT JOIN (
         SELECT player_id, SUM(wins_credited) AS grace_wins, SUM(losses_credited) AS grace_losses
         FROM grace_credits GROUP BY player_id
       ) gc ON gc.player_id = pl.id
       GROUP BY pl.id
       ORDER BY (CAST((pick_wins + grace_wins) AS REAL) / NULLIF(pick_wins + pick_losses + grace_wins + grace_losses, 0)) DESC,
                (pick_wins + grace_wins) DESC`
    )
    .all();

  const standings = rows.results.map(r => {
    const wins = (r.pick_wins || 0) + (r.grace_wins || 0);
    const losses = (r.pick_losses || 0) + (r.grace_losses || 0);
    const total = wins + losses;
    return {
      player_id: r.player_id,
      name: r.name,
      team_id: r.team_id,
      team_name: r.team_name,
      team_org: r.team_org,
      wins,
      losses,
      win_pct: total > 0 ? Number((wins / total).toFixed(3)) : 0
    };
  });

  return json({ standings });
}

async function teamStandings(db) {
  const rows = await db
    .prepare(
      `SELECT
         t.id AS team_id,
         t.name AS team_name,
         t.org AS team_org,
         COUNT(DISTINCT pl.id) AS member_count,
         COALESCE(SUM(CASE WHEN p.picked_team = g.winner_team THEN 1 ELSE 0 END), 0) AS pick_wins,
         COALESCE(SUM(CASE WHEN g.winner_team IS NOT NULL AND p.picked_team != g.winner_team THEN 1 ELSE 0 END), 0) AS pick_losses,
         COALESCE(SUM(gc.wins_credited), 0) AS grace_wins,
         COALESCE(SUM(gc.losses_credited), 0) AS grace_losses
       FROM teams t
       JOIN players pl ON pl.team_id = t.id
       LEFT JOIN picks p ON p.player_id = pl.id
       LEFT JOIN games g ON g.id = p.game_id AND g.winner_team IS NOT NULL
       LEFT JOIN grace_credits gc ON gc.player_id = pl.id
       GROUP BY t.id
       ORDER BY (pick_wins + grace_wins) DESC`
    )
    .all();

  const standings = rows.results.map(r => ({
    team_id: r.team_id,
    team_name: r.team_name,
    team_org: r.team_org,
    member_count: r.member_count,
    wins: (r.pick_wins || 0) + (r.grace_wins || 0),
    losses: (r.pick_losses || 0) + (r.grace_losses || 0)
  }));

  return json({ team_standings: standings });
}

async function weeklyRecap(db, weekId) {
  const games = await db
    .prepare('SELECT * FROM games WHERE week_id = ?')
    .bind(weekId)
    .all();
  if (!games.results.length) return errorJson('Week not found or has no games.', 404);

  const perGame = [];
  let totalWinsAcrossPlayers = 0;
  let playerCount = 0;

  for (const game of games.results) {
    const picks = await db
      .prepare('SELECT picked_team FROM picks WHERE game_id = ?')
      .bind(game.id)
      .all();
    const total = picks.results.length;
    const homeCount = picks.results.filter(p => p.picked_team === game.home_team).length;
    const awayCount = total - homeCount;

    perGame.push({
      game_id: game.id,
      home_team: game.home_team,
      away_team: game.away_team,
      home_pct: total ? Math.round((homeCount / total) * 100) : 0,
      away_pct: total ? Math.round((awayCount / total) * 100) : 0,
      winner_team: game.winner_team
    });
  }

  // Average wins per player for this week (real scored picks plus anyone graced this week)
  const winsPerPlayer = await db
    .prepare(
      `SELECT p.player_id, SUM(CASE WHEN p.picked_team = g.winner_team THEN 1 ELSE 0 END) AS wins
       FROM picks p
       JOIN games g ON g.id = p.game_id
       WHERE g.week_id = ? AND g.winner_team IS NOT NULL
       GROUP BY p.player_id`
    )
    .bind(weekId)
    .all();

  const graceThisWeek = await db
    .prepare('SELECT player_id, wins_credited FROM grace_credits WHERE week_id = ?')
    .bind(weekId)
    .all();

  const winsByPlayer = new Map(winsPerPlayer.results.map(r => [r.player_id, r.wins]));
  for (const g of graceThisWeek.results) {
    winsByPlayer.set(g.player_id, (winsByPlayer.get(g.player_id) || 0) + g.wins_credited);
  }

  playerCount = winsByPlayer.size;
  totalWinsAcrossPlayers = [...winsByPlayer.values()].reduce((sum, w) => sum + w, 0);
  const avgWins = playerCount ? Number((totalWinsAcrossPlayers / playerCount).toFixed(2)) : 0;

  return json({ week_id: Number(weekId), games: perGame, average_wins: avgWins, player_count: playerCount });
}
