import { json, errorJson } from '../../_lib.js';

// GET /api/admin/players -> list everyone (including Coin Flip, flagged)
export async function onRequestGet({ env }) {
  const rows = await env.DB
    .prepare('SELECT id, name, email, is_coinflip FROM players ORDER BY is_coinflip ASC, name ASC')
    .all();
  return json({ players: rows.results });
}

// POST /api/admin/players -> manually add a player (e.g. for someone who won't self-register)
export async function onRequestPost({ request, env }) {
  const { name, email } = await request.json();
  if (!name || !email) return errorJson('name and email are required.');

  const cleanEmail = email.trim().toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM players WHERE email = ?').bind(cleanEmail).first();
  if (existing) return errorJson('A player with that email already exists.', 409);

  const result = await env.DB
    .prepare('INSERT INTO players (name, email) VALUES (?, ?)')
    .bind(name.trim(), cleanEmail)
    .run();

  return json({ id: result.meta.last_row_id, name: name.trim(), email: cleanEmail });
}
