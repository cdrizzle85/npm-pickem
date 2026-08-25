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

// ---- Passwords ----
// PBKDF2 with a deliberately modest iteration count: Cloudflare's free Workers
// tier has tight per-request CPU-time limits, and a heavier hash risks timing
// out a login request. Still real hashing, never plaintext, just not the
// heaviest setting possible on this platform.
const PBKDF2_ITERATIONS = 20000;

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function pbkdf2(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const hash = await pbkdf2(password, fromHex(saltHex));
  return toHex(hash) === hashHex;
}

// Creates a new player with a password. Returns null if the email is already taken.
export async function createPlayer(db, { name, email, teamId, password }) {
  const cleanEmail = email.trim().toLowerCase();
  const existing = await db.prepare('SELECT id FROM players WHERE email = ?').bind(cleanEmail).first();
  if (existing) return null;

  const passwordHash = await hashPassword(password);
  const result = await db
    .prepare('INSERT INTO players (name, email, team_id, password_hash) VALUES (?, ?, ?, ?)')
    .bind(name.trim(), cleanEmail, teamId || null, passwordHash)
    .run();

  return await db
    .prepare(
      `SELECT p.id, p.name, p.email, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.id = ?`
    )
    .bind(result.meta.last_row_id)
    .first();
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

// For any week whose deadline (kickoff of its first game) has passed, credit
// a fixed grace score (2 wins, rest counted as losses) to anyone who never
// submitted picks at all. This is an unconditional credit, not tied to actual
// game outcomes, so it's tracked separately from real picks rather than
// simulated as fake picks.
export async function applyGraceCredits(db, weekId) {
  const now = new Date().toISOString();
  const deadlineRow = await db
    .prepare('SELECT MIN(kickoff_time) AS deadline FROM games WHERE week_id = ?')
    .bind(weekId)
    .first();
  if (!deadlineRow || !deadlineRow.deadline || deadlineRow.deadline > now) return; // not locked yet

  const gameCountRow = await db.prepare('SELECT COUNT(*) AS c FROM games WHERE week_id = ?').bind(weekId).first();
  const totalGames = gameCountRow ? gameCountRow.c : 0;
  if (!totalGames) return;

  const players = await db.prepare('SELECT id FROM players').all();

  for (const player of players.results) {
    const hasPicks = await db
      .prepare(
        `SELECT p.id FROM picks p JOIN games g ON g.id = p.game_id
         WHERE p.player_id = ? AND g.week_id = ? LIMIT 1`
      )
      .bind(player.id, weekId)
      .first();
    if (hasPicks) continue; // they submitted, no grace needed

    const existing = await db
      .prepare('SELECT id FROM grace_credits WHERE player_id = ? AND week_id = ?')
      .bind(player.id, weekId)
      .first();
    if (existing) continue; // already credited

    const winsCredited = Math.min(2, totalGames);
    const lossesCredited = Math.max(totalGames - winsCredited, 0);

    await db
      .prepare(
        `INSERT INTO grace_credits (player_id, week_id, wins_credited, losses_credited)
         VALUES (?, ?, ?, ?)`
      )
      .bind(player.id, weekId, winsCredited, lossesCredited)
      .run();
  }
}

export async function getWeekDeadline(db, weekId) {
  const row = await db
    .prepare('SELECT MIN(kickoff_time) AS deadline FROM games WHERE week_id = ?')
    .bind(weekId)
    .first();
  return row ? row.deadline : null;
}

export function isLocked(kickoffTimeIso) {
  return new Date(kickoffTimeIso).getTime() <= Date.now();
}
