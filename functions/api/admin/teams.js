import { json, errorJson } from '../../_lib.js';

// GET /api/admin/teams -> list all teams, grouped by org
export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare('SELECT id, org, name FROM teams ORDER BY org ASC, name ASC').all();
  return json({ teams: rows.results });
}

// POST /api/admin/teams -> add a team to one org
export async function onRequestPost({ request, env }) {
  const { org, name } = await request.json();
  if (!org || (org !== 'NPM' && org !== 'NPCC')) return errorJson("org must be 'NPM' or 'NPCC'.");
  if (!name || !name.trim()) return errorJson('name is required.');

  const existing = await env.DB.prepare('SELECT id FROM teams WHERE org = ? AND name = ?').bind(org, name.trim()).first();
  if (existing) return errorJson(`${org} already has a team named that.`, 409);

  const result = await env.DB.prepare('INSERT INTO teams (org, name) VALUES (?, ?)').bind(org, name.trim()).run();
  return json({ id: result.meta.last_row_id, org, name: name.trim() });
}
