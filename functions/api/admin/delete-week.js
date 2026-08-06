import { json, errorJson } from '../../_lib.js';

// POST /api/admin/delete-week
// body: { week_id }
// Deletes the week, its games, and every pick tied to those games. No undo.
export async function onRequestPost({ request, env }) {
  const { week_id } = await request.json();
  if (!week_id) return errorJson('week_id is required.');

  const week = await env.DB.prepare('SELECT id FROM weeks WHERE id = ?').bind(week_id).first();
  if (!week) return errorJson('Week not found.', 404);

  await env.DB
    .prepare('DELETE FROM picks WHERE game_id IN (SELECT id FROM games WHERE week_id = ?)')
    .bind(week_id)
    .run();
  await env.DB.prepare('DELETE FROM games WHERE week_id = ?').bind(week_id).run();
  await env.DB.prepare('DELETE FROM weeks WHERE id = ?').bind(week_id).run();

  return json({ ok: true });
}
