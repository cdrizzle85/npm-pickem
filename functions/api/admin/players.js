import { json, errorJson, createPlayer, hashPassword } from '../../_lib.js';

// GET /api/admin/players -> list everyone (including Coin Flip, flagged), with their team
export async function onRequestGet({ env }) {
  const rows = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.email, p.is_coinflip, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       ORDER BY p.is_coinflip ASC, p.name ASC`
    )
    .all();
  return json({ players: rows.results });
}

// POST /api/admin/players -> manually add a player (e.g. for someone who won't self-register)
export async function onRequestPost({ request, env }) {
  const { name, email, team_id, password } = await request.json();
  if (!name || !email || !password) return errorJson('name, email, and password are required.');

  const player = await createPlayer(env.DB, { name, email, teamId: team_id, password });
  if (!player) return errorJson('A player with that email already exists.', 409);

  return json(player);
}
