import { json, errorJson, createPlayer } from '../_lib.js';

// POST /api/players -> register a brand new player. Fails if the email already exists,
// use /api/login instead for returning players.
export async function onRequestPost({ request, env }) {
  const { name, email, team_id, password } = await request.json();
  if (!name || !email || !password) return errorJson('Name, email, and password are required.');
  if (password.length < 6) return errorJson('Password must be at least 6 characters.');

  const player = await createPlayer(env.DB, { name, email, teamId: team_id, password });
  if (!player) return errorJson('An account with that email already exists, try logging in instead.', 409);

  return json(player);
}
