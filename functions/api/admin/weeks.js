import { json } from '../../_lib.js';

// GET /api/admin/weeks -> every week, for the admin form to suggest the
// next round number and to check for accidental duplicates before publishing.
export async function onRequestGet({ env }) {
  const rows = await env.DB
    .prepare('SELECT id, round_number, is_playoff, status FROM weeks ORDER BY round_number ASC, is_playoff ASC')
    .all();
  return json({ weeks: rows.results });
}
