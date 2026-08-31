import { json, errorJson } from '../_lib.js';

const MAX_COMMENT_LENGTH = 2000;
const MAX_COMMENTS_RETURNED = 300;

// GET /api/comments -> the whole season's feed, newest first
export async function onRequestGet({ env }) {
  const rows = await env.DB
    .prepare(
      `SELECT c.id, c.body, c.created_at, p.id AS player_id, p.name, p.team_id, t.name AS team_name, t.org AS team_org
       FROM comments c
       JOIN players p ON p.id = c.player_id
       LEFT JOIN teams t ON t.id = p.team_id
       ORDER BY c.created_at DESC
       LIMIT ${MAX_COMMENTS_RETURNED}`
    )
    .all();

  return json({ comments: rows.results });
}

// POST /api/comments -> { player_id, body }
export async function onRequestPost({ request, env }) {
  const { player_id, body } = await request.json();
  if (!player_id || !body || !body.trim()) return errorJson('player_id and body are required.');

  const trimmed = body.trim().slice(0, MAX_COMMENT_LENGTH);

  const player = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(player_id).first();
  if (!player) return errorJson('Player not found.', 404);

  const result = await env.DB
    .prepare('INSERT INTO comments (player_id, body) VALUES (?, ?)')
    .bind(player_id, trimmed)
    .run();

  const created = await env.DB
    .prepare(
      `SELECT c.id, c.body, c.created_at, p.id AS player_id, p.name, p.team_id, t.name AS team_name, t.org AS team_org
       FROM comments c
       JOIN players p ON p.id = c.player_id
       LEFT JOIN teams t ON t.id = p.team_id
       WHERE c.id = ?`
    )
    .bind(result.meta.last_row_id)
    .first();

  return json(created);
}
