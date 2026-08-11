import { json, errorJson, getOrCreatePlayer } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { name, email, team_id } = body;
  if (!name || !email) return errorJson('Name and email are required.');
  const player = await getOrCreatePlayer(env.DB, name, email, team_id);
  return json(player);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return errorJson('email query param is required.');
  const player = await env.DB
    .prepare('SELECT id, name, email FROM players WHERE email = ?')
    .bind(email.trim().toLowerCase())
    .first();
  if (!player) return errorJson('Player not found.', 404);
  return json(player);
}
