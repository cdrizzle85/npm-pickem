import { json, errorJson } from '../../../_lib.js';

// PATCH /api/admin/players/:id -> update name, email, and/or team
export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (id === 1) return errorJson("Can't edit the Coin Flip entry.", 400);

  const { name, email, team_id } = await request.json();
  const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
  if (!player) return errorJson('Player not found.', 404);

  const newName = name ? name.trim() : player.name;
  const newEmail = email ? email.trim().toLowerCase() : player.email;
  const newTeamId = team_id !== undefined ? (team_id || null) : player.team_id;

  if (newEmail !== player.email) {
    const clash = await env.DB.prepare('SELECT id FROM players WHERE email = ? AND id != ?').bind(newEmail, id).first();
    if (clash) return errorJson('Another player already uses that email.', 409);
  }

  await env.DB
    .prepare('UPDATE players SET name = ?, email = ?, team_id = ? WHERE id = ?')
    .bind(newName, newEmail, newTeamId, id)
    .run();

  return json({ id, name: newName, email: newEmail, team_id: newTeamId });
}

// DELETE /api/admin/players/:id -> remove a player and their picks
export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  if (id === 1) return errorJson("Can't delete the Coin Flip entry.", 400);

  const player = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(id).first();
  if (!player) return errorJson('Player not found.', 404);

  await env.DB.prepare('DELETE FROM picks WHERE player_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id).run();

  return json({ ok: true });
}
