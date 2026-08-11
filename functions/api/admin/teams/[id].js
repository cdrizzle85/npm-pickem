import { json, errorJson } from '../../../_lib.js';

// PATCH /api/admin/teams/:id -> rename a team
export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  const { name } = await request.json();
  if (!name || !name.trim()) return errorJson('name is required.');

  const team = await env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(id).first();
  if (!team) return errorJson('Team not found.', 404);

  const clash = await env.DB.prepare('SELECT id FROM teams WHERE name = ? AND id != ?').bind(name.trim(), id).first();
  if (clash) return errorJson('Another team already has that name.', 409);

  await env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name.trim(), id).run();
  return json({ id, name: name.trim() });
}

// DELETE /api/admin/teams/:id -> remove a team, unassigns its members rather than deleting them
export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  const team = await env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(id).first();
  if (!team) return errorJson('Team not found.', 404);

  await env.DB.prepare('UPDATE players SET team_id = NULL WHERE team_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
