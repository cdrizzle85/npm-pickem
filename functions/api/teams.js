import { json } from '../_lib.js';

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare('SELECT id, name FROM teams ORDER BY name ASC').all();
  return json({ teams: rows.results });
}
