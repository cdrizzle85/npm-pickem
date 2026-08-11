import { json, errorJson } from '../../_lib.js';

// GET /api/admin/teams -> list all teams
export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare('SELECT id, name FROM teams ORDER BY name ASC').all();
  return json({ teams: rows.results });
}

// POST /api/admin/teams -> add a team
export async function onRequestPost({ request, env }) {
  const { name } = await request.json();
  if (!name || !name.trim()) return errorJson('name is required.');

  const existing = await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind(name.trim()).first();
  if (existing) return errorJson('A team with that name already exists.', 409);

  const result = await env.DB.prepare('INSERT INTO teams (name) VALUES (?)').bind(name.trim()).run();
  return json({ id: result.meta.last_row_id, name: name.trim() });
}
