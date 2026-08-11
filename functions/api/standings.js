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
         pl.is_coinflip,
         pl.team_id,
         t.name AS team_name,
         SUM(CASE WHEN p.picked_team = g.winner_team THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN g.winner_team IS NOT NULL AND p.picked_team != g.winner_team THEN 1 ELSE 0 END) AS losses
       FROM players pl
       LEFT JOIN teams t ON t.id = pl.team_id
       LEFT JOIN picks p ON p.player_id = pl.id
       LEFT JOIN games g ON g.id = p.game_id AND g.winner_team IS NOT NULL
       GROUP BY pl.id
       ORDER BY (CAST(wins AS REAL) / NULLIF(wins + losses, 0)) DESC, wins DESC`
    )
    .all();

  const standings = rows.results.map(r => {
    const wins = r.wins || 0;
    const losses = r.losses || 0;
    const total = wins + losses;
    return {
      player_id: r.player_id,
      name: r.name,
      is_coinflip: !!r.is_coinflip,
      team_id: r.team_id,
      team_name: r.team_name,
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
         COUNT(DISTINCT pl.id) AS member_count,
         SUM(CASE WHEN p.picked_team = g.winner_team THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN g.winner_team IS NOT NULL AND p.picked_team != g.winner_team THEN 1 ELSE 0 END) AS losses
       FROM teams t
       JOIN players pl ON pl.team_id = t.id AND pl.is_coinflip = 0
       LEFT JOIN picks p ON p.player_id = pl.id
       LEFT JOIN games g ON g.id = p.game_id AND g.winner_team IS NOT NULL
       GROUP BY t.id
       ORDER BY wins DESC`
    )
    .all();

  const standings = rows.results.map(r => ({
    team_id: r.team_id,
    team_name: r.team_name,
    member_count: r.member_count,
    wins: r.wins || 0,
    losses: r.losses || 0
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

  // Average wins per player for this week (only counts players with at least one scored pick this week)
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

  playerCount = winsPerPlayer.results.length;
  totalWinsAcrossPlayers = winsPerPlayer.results.reduce((sum, r) => sum + r.wins, 0);
  const avgWins = playerCount ? Number((totalWinsAcrossPlayers / playerCount).toFixed(2)) : 0;

  return json({ week_id: Number(weekId), games: perGame, average_wins: avgWins, player_count: playerCount });
}
