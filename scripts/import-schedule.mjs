// Run this locally with: node scripts/import-schedule.mjs
// It fetches the real 2026 season schedules for NFL and FBS college football
// directly from ESPN (works fine from a normal home/office connection, unlike
// from Cloudflare's network) and writes schedule_seed.sql, which you then load
// into your database the same way we loaded schema.sql earlier:
//   npx wrangler d1 execute npm-pickem-db --remote --file=schedule_seed.sql
//
// As of mid-September 2026, ESPN deprecated date-RANGE queries
// (dates=START-END) on this endpoint, they now return 400 Bad Request.
// Single months (dates=YYYYMM) still work, so this pulls one month at a
// time and combines the results, same end result, just more requests.

import { writeFileSync } from 'fs';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

// Adjust these ranges any time the season dates change or you want to pull further ahead.
const RANGES = [
  { sport: 'nfl', path: 'nfl', extraParams: '', start: '20260806', end: '20260908' }, // preseason
  { sport: 'nfl', path: 'nfl', extraParams: '', start: '20260909', end: '20270112' }, // regular season
  { sport: 'college-football', path: 'college-football', extraParams: '&groups=80', start: '20260820', end: '20261213' }
];

function esc(str) {
  return String(str).replace(/'/g, "''");
}

// e.g. ('20260806', '20260908') -> ['202608', '202609']
function monthsBetween(startStr, endStr) {
  const start = new Date(`${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}`);
  const end = new Date(`${endStr.slice(0, 4)}-${endStr.slice(4, 6)}-${endStr.slice(6, 8)}`);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMonth({ sport, path, extraParams }, yyyymm) {
  // limit=1000 looks like it should mean "no cap," but ESPN actually silently
  // falls back to a tiny ~25-event default page whenever the requested limit
  // exceeds its real ceiling, with nothing in the response signaling that
  // happened. 500 is the real ceiling and a month of college football never
  // gets close to it (confirmed: a full September was 323 events at limit=500).
  const url = `${ESPN_BASE}/${path}/scoreboard?limit=500&dates=${yyyymm}${extraParams}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${sport} ${yyyymm} fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const events = data.events || [];

  return events.map(ev => {
    const comp = ev.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    const weekLabel = ev.week ? `Week ${ev.week.number}` : null;
    const tbd = comp.status?.isTBDFlex ? 1 : 0;
    return {
      source_event_id: ev.id,
      sport,
      home_team: home.team.displayName,
      away_team: away.team.displayName,
      kickoff_time: ev.date,
      time_tbd: tbd,
      week_label: weekLabel
    };
  });
}

async function fetchRange(range) {
  const months = monthsBetween(range.start, range.end);
  console.log(`Fetching ${range.sport}: ${months.join(', ')}`);
  let games = [];
  for (const yyyymm of months) {
    try {
      const monthGames = await fetchMonth(range, yyyymm);
      const warn = monthGames.length >= 500 ? '  \u26a0 hit the 500-event ceiling, this month may be truncated, worth double-checking' : '';
      console.log(`  ${yyyymm} -> got ${monthGames.length} events${warn}`);
      games = games.concat(monthGames);
      await sleep(300); // be polite, this endpoint is unofficial and rate-sensitive
    } catch (err) {
      console.error(`  ${yyyymm} -> ${err.message}`);
    }
  }
  return games;
}

async function main() {
  let allGames = [];
  for (const range of RANGES) {
    const games = await fetchRange(range);
    allGames = allGames.concat(games);
  }

  if (!allGames.length) {
    console.error('No games fetched at all, nothing written. Check your internet connection and try again.');
    process.exit(1);
  }

  const lines = allGames.map(g => `INSERT INTO schedule_games (source_event_id, sport, home_team, away_team, kickoff_time, time_tbd, week_label) VALUES ('${esc(g.source_event_id)}', '${esc(g.sport)}', '${esc(g.home_team)}', '${esc(g.away_team)}', '${esc(g.kickoff_time)}', ${g.time_tbd}, ${g.week_label ? `'${esc(g.week_label)}'` : 'NULL'})
ON CONFLICT(sport, source_event_id) DO UPDATE SET
  home_team = excluded.home_team,
  away_team = excluded.away_team,
  kickoff_time = excluded.kickoff_time,
  time_tbd = excluded.time_tbd,
  week_label = excluded.week_label;`);

  writeFileSync('schedule_seed.sql', lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length} games to schedule_seed.sql (new games inserted, existing ones refreshed with the latest kickoff time)`);
  console.log('Next: npx wrangler d1 execute npm-pickem-db --remote --file=schedule_seed.sql');
}

main();
