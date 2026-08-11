import { json, errorJson, verifyPassword } from '../_lib.js';

// POST /api/login -> { email, password }
export async function onRequestPost({ request, env }) {
  const { email, password } = await request.json();
  if (!email || !password) return errorJson('Email and password are required.');

  const player = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.email, p.password_hash, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.email = ?`
    )
    .bind(email.trim().toLowerCase())
    .first();

  // Same generic message either way, so a wrong guess can't confirm which part was wrong.
  const invalid = () => errorJson('Incorrect email or password.', 401);

  if (!player || !player.password_hash) return invalid();
  const ok = await verifyPassword(password, player.password_hash);
  if (!ok) return invalid();

  delete player.password_hash;
  return json(player);
}
