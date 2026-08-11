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

export async function getOrCreatePlayer(db, name, email, teamId) {
  const cleanEmail = email.trim().toLowerCase();
  await db
    .prepare('INSERT OR IGNORE INTO players (name, email, team_id) VALUES (?, ?, ?)')
    .bind(name.trim(), cleanEmail, teamId || null)
    .run();
  // If they already existed, keep their name/team in sync with whatever they just submitted.
  if (teamId) {
    await db.prepare('UPDATE players SET team_id = ? WHERE email = ?').bind(teamId, cleanEmail).run();
  }
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.email, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.email = ?`
    )
    .bind(cleanEmail)
    .first();
  return row;
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const SPORTSDB_LEAGUE_IDS = {
  'nfl': '4391',
  'college-football': '4479' // NCAA Division 1 (FBS)
};

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
      source: 'espn',
      sport,
      home_team: home.team.displayName,
      away_team: away.team.displayName,
      kickoff_time: ev.date,
      status: comp.status.type.state, // pre | in | post
      completed: comp.status.type.completed
    };
  });
}

// TheSportsDB: a smaller, less heavily bot-protected free API (test key "123", no signup).
// Not guaranteed reliable or complete, especially for smaller college football matchups,
// but worth using as long as it keeps working from Cloudflare's network.
export async function fetchSportsDbScoreboard(sport, dateStr) {
  const leagueId = SPORTSDB_LEAGUE_IDS[sport];
  if (!leagueId) throw new Error(`No TheSportsDB league mapping for sport: ${sport}`);
  const date = dateStr
    ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10);

  const url = `${SPORTSDB_BASE}/eventsday.php?d=${date}&l=${leagueId}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`TheSportsDB fetch failed: ${res.status} ${res.statusText} ${bodyText.slice(0, 200)}`);
  }
  const data = await res.json();
  const events = data.events || [];

  return events.map(ev => {
    // strTimestamp is the closest thing to a real kickoff time; fall back to date + strTime if missing.
    const kickoff = ev.strTimestamp
      ? (ev.strTimestamp.endsWith('Z') ? ev.strTimestamp : `${ev.strTimestamp}Z`)
      : `${ev.dateEvent}T${ev.strTime || '00:00:00'}Z`;
    return {
      espn_event_id: ev.idEvent, // reused column name, holds whichever source's id
      source: 'sportsdb',
      sport,
      home_team: ev.strHomeTeam,
      away_team: ev.strAwayTeam,
      kickoff_time: kickoff,
      status: ev.strPostponed === 'yes' ? 'postponed' : (ev.intHomeScore !== null ? 'post' : 'pre'),
      completed: ev.intHomeScore !== null && ev.intAwayScore !== null
    };
  });
}

export async function fetchSportsDbResult(eventId) {
  const url = `${SPORTSDB_BASE}/lookupevent.php?id=${eventId}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`TheSportsDB event lookup failed: ${res.status}`);
  const data = await res.json();
  const ev = (data.events || [])[0];
  if (!ev) throw new Error('Event not found on TheSportsDB.');

  const completed = ev.intHomeScore !== null && ev.intAwayScore !== null && ev.strPostponed !== 'yes';
  let winner = null;
  if (completed) {
    winner = Number(ev.intHomeScore) > Number(ev.intAwayScore) ? ev.strHomeTeam : ev.strAwayTeam;
  }
  return { completed, winner_team: winner, postponed: ev.strPostponed === 'yes' };
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
