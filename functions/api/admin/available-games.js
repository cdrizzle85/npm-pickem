import { json, errorJson, fetchSportsDbScoreboard } from '../../_lib.js';

// GET /api/admin/available-games?sport=nfl&date=20261108
// sport: 'nfl' or 'college-football'. date is optional, format YYYYMMDD.
// Tries TheSportsDB (ESPN's hidden API is blocked from Cloudflare's network).
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport');
  const date = url.searchParams.get('date');

  if (sport !== 'nfl' && sport !== 'college-football') {
    return errorJson("sport must be 'nfl' or 'college-football'.");
  }

  try {
    const games = await fetchSportsDbScoreboard(sport, date);
    return json({ games, source: 'sportsdb' });
  } catch (err) {
    return errorJson(`Could not pull games automatically: ${err.message}. Use manual entry below instead.`, 502);
  }
}
