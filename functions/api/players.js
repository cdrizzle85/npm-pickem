import { json, errorJson } from '../_lib.js';

// GET /api/players?email=... -> look up an existing player by email (used to check
// whether an email already has an account before showing the "new account" fields).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return errorJson('email query param is required.');

  const player = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.email, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.email = ?`
    )
    .bind(email.trim().toLowerCase())
    .first();

  if (!player) return errorJson('Player not found.', 404);
  return json(player);
}

// POST /api/players -> create a brand new account. No password, email alone is the identity.
export async function onRequestPost({ request, env }) {
  const { name, email, team_id } = await request.json();
  if (!name || !email) return errorJson('Name and email are required.');

  const cleanEmail = email.trim().toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM players WHERE email = ?').bind(cleanEmail).first();
  if (existing) return errorJson('An account with that email already exists.', 409);

  const result = await env.DB
    .prepare('INSERT INTO players (name, email, team_id) VALUES (?, ?, ?)')
    .bind(name.trim(), cleanEmail, team_id || null)
    .run();

  const player = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.email, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.id = ?`
    )
    .bind(result.meta.last_row_id)
    .first();

  return json(player);
}
