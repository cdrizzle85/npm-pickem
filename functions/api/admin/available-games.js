import { json, errorJson, fetchEspnScoreboard } from '../../_lib.js';

// GET /api/admin/available-games?sport=nfl&date=20261108
// sport: 'nfl' or 'college-football'. date is optional, format YYYYMMDD.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport');
  const date = url.searchParams.get('date');

  if (sport !== 'nfl' && sport !== 'college-football') {
    return errorJson("sport must be 'nfl' or 'college-football'.");
  }

  try {
    const games = await fetchEspnScoreboard(sport, date);
    return json({ games });
  } catch (err) {
    return errorJson(`Could not reach ESPN: ${err.message}`, 502);
  }
}
