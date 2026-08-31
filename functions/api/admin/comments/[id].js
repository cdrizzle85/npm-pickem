import { json, errorJson } from '../../../_lib.js';

// DELETE /api/admin/comments/:id
export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  const comment = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
  if (!comment) return errorJson('Comment not found.', 404);

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
