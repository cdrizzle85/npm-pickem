import { json, errorJson } from '../../../_lib.js';

// PATCH /api/admin/teams/:id -> rename a team and/or move it to the other org
export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  const { name, org } = await request.json();

  const team = await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first();
  if (!team) return errorJson('Team not found.', 404);

  const newName = name && name.trim() ? name.trim() : team.name;
  const newOrg = org || team.org;
  if (newOrg !== 'NPM' && newOrg !== 'NPCC') return errorJson("org must be 'NPM' or 'NPCC'.");

  const clash = await env.DB
    .prepare('SELECT id FROM teams WHERE org = ? AND name = ? AND id != ?')
    .bind(newOrg, newName, id)
    .first();
  if (clash) return errorJson(`${newOrg} already has a team named that.`, 409);

  await env.DB.prepare('UPDATE teams SET name = ?, org = ? WHERE id = ?').bind(newName, newOrg, id).run();
  return json({ id, org: newOrg, name: newName });
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
