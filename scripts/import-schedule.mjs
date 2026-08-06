// Run this locally with: node scripts/import-schedule.mjs
// It fetches the real 2026 season schedules for NFL and FBS college football
// directly from ESPN (works fine from a normal home/office connection, unlike
// from Cloudflare's network) and writes schedule_seed.sql, which you then load
// into your database the same way we loaded schema.sql earlier:
//   npx wrangler d1 execute npm-pickem-db --remote --file=schedule_seed.sql

import { writeFileSync } from 'fs';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

// Adjust these ranges any time the season dates change or you want to pull further ahead.
const RANGES = [
  { sport: 'nfl', path: 'nfl', extraParams: '', start: '20260909', end: '20270112' },
  { sport: 'college-football', path: 'college-football', extraParams: '&groups=80', start: '20260820', end: '20261213' }
];

function esc(str) {
  return String(str).replace(/'/g, "''");
}

async function fetchRange({ sport, path, extraParams, start, end }) {
  const url = `${ESPN_BASE}/${path}/scoreboard?limit=1000&dates=${start}-${end}${extraParams}`;
  console.log(`Fetching ${sport}: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${sport} fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const events = data.events || [];
  console.log(`  -> got ${events.length} events`);

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

async function main() {
  let allGames = [];
  for (const range of RANGES) {
    try {
      const games = await fetchRange(range);
      allGames = allGames.concat(games);
    } catch (err) {
      console.error(`Skipping ${range.sport}: ${err.message}`);
    }
  }

  if (!allGames.length) {
    console.error('No games fetched at all, nothing written. Check your internet connection and try again.');
    process.exit(1);
  }

  const lines = allGames.map(g => `INSERT OR IGNORE INTO schedule_games (source_event_id, sport, home_team, away_team, kickoff_time, time_tbd, week_label) VALUES ('${esc(g.source_event_id)}', '${esc(g.sport)}', '${esc(g.home_team)}', '${esc(g.away_team)}', '${esc(g.kickoff_time)}', ${g.time_tbd}, ${g.week_label ? `'${esc(g.week_label)}'` : 'NULL'});`);

  writeFileSync('schedule_seed.sql', lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length} games to schedule_seed.sql`);
  console.log('Next: npx wrangler d1 execute npm-pickem-db --remote --file=schedule_seed.sql');
}

main();
