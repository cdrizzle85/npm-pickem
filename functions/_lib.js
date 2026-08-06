// Shared helpers for Pages Functions.
// Filename starts with underscore so Cloudflare Pages does NOT treat this as a route.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export function errorJson(message, status = 400) {
  return json({ error: message }, status);
}

export async function getOrCreatePlayer(db, name, email) {
  const cleanEmail = email.trim().toLowerCase();
  await db
    .prepare('INSERT OR IGNORE INTO players (name, email) VALUES (?, ?)')
    .bind(name.trim(), cleanEmail)
    .run();
  const row = await db
    .prepare('SELECT id, name, email FROM players WHERE email = ?')
    .bind(cleanEmail)
    .first();
  return row;
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

export async function fetchEspnScoreboard(sport, dateStr) {
  // sport: 'nfl' or 'college-football'
  let url = `${ESPN_BASE}/${sport}/scoreboard`;
  const params = [];
  if (dateStr) params.push(`dates=${dateStr}`);
  if (sport === 'college-football') params.push('groups=80', 'limit=100');
  if (params.length) url += `?${params.join('&')}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`ESPN scoreboard fetch failed: ${res.status} ${res.statusText} ${bodyText.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.events || []).map(ev => {
    const comp = ev.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    return {
      espn_event_id: ev.id,
      sport,
      home_team: home.team.displayName,
      away_team: away.team.displayName,
      kickoff_time: ev.date,
      status: comp.status.type.state, // pre | in | post
      completed: comp.status.type.completed
    };
  });
}

export async function fetchEspnGameResult(sport, espnEventId) {
  const url = `${ESPN_BASE}/${sport}/summary?event=${espnEventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN summary fetch failed: ${res.status}`);
  const data = await res.json();
  const comp = data.header.competitions[0];
  const home = comp.competitors.find(c => c.homeAway === 'home');
  const away = comp.competitors.find(c => c.homeAway === 'away');
  const completed = comp.status.type.completed;
  let winner = null;
  if (completed) {
    winner = Number(home.score) > Number(away.score) ? home.team.displayName : away.team.displayName;
  }
  return {
    status: comp.status.type.state,
    completed,
    winner_team: winner
  };
}

// Generate a random Coin Flip pick for every game in a week that doesn't have one yet.
export async function generateCoinFlipPicks(db, weekId) {
  const games = await db
    .prepare('SELECT id, home_team, away_team FROM games WHERE week_id = ?')
    .bind(weekId)
    .all();

  for (const game of games.results) {
    const existing = await db
      .prepare('SELECT id FROM picks WHERE player_id = 1 AND game_id = ?')
      .bind(game.id)
      .first();
    if (existing) continue;
    const pick = Math.random() < 0.5 ? game.home_team : game.away_team;
    await db
      .prepare('INSERT INTO picks (player_id, game_id, picked_team) VALUES (1, ?, ?)')
      .bind(game.id, pick)
      .run();
  }
}

// For any game whose kickoff has passed, auto-fill missing picks from Coin Flip's pick.
export async function ensureAutoFillsForWeek(db, weekId) {
  const now = new Date().toISOString();
  const lockedGames = await db
    .prepare('SELECT id FROM games WHERE week_id = ? AND kickoff_time <= ?')
    .bind(weekId, now)
    .all();

  const players = await db
    .prepare('SELECT id FROM players WHERE is_coinflip = 0')
    .all();

  for (const game of lockedGames.results) {
    const coinFlipPick = await db
      .prepare('SELECT picked_team FROM picks WHERE player_id = 1 AND game_id = ?')
      .bind(game.id)
      .first();
    if (!coinFlipPick) continue; // shouldn't happen if publish-week ran generateCoinFlipPicks

    for (const player of players.results) {
      const existing = await db
        .prepare('SELECT id FROM picks WHERE player_id = ? AND game_id = ?')
        .bind(player.id, game.id)
        .first();
      if (existing) continue;
      await db
        .prepare('INSERT INTO picks (player_id, game_id, picked_team, is_auto_fill) VALUES (?, ?, ?, 1)')
        .bind(player.id, game.id, coinFlipPick.picked_team)
        .run();
    }
  }
}

export function isLocked(kickoffTimeIso) {
  return new Date(kickoffTimeIso).getTime() <= Date.now();
}
