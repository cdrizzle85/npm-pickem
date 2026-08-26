import { json, errorJson } from '../_lib.js';

// GET /api/teams?org=NPM -> teams for one org (for the registration dropdown)
// GET /api/teams (no org) -> every team, with org included
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const org = url.searchParams.get('org');

  if (org) {
    const rows = await env.DB.prepare('SELECT id, org, name FROM teams WHERE org = ? ORDER BY name ASC').bind(org).all();
    return json({ teams: rows.results });
  }

  const rows = await env.DB.prepare('SELECT id, org, name FROM teams ORDER BY org ASC, name ASC').all();
  return json({ teams: rows.results });
}
