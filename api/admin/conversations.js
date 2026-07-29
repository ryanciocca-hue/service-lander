import { rows, one } from "../../lib/db.js";
import { requireAdmin } from "../../lib/auth.js";
import { parseFilters, sessionWhere } from "../../lib/filters.js";

const PAGE_SIZE = 50;

/**
 * GET /api/admin/conversations?range=30d&campaign=&q=&page=1
 * One row per conversation, with the path the visitor took summarised inline.
 */
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const filters = parseFilters(req);
    const where = sessionWhere(filters, "s");
    const values = [...where.values];
    let index = where.nextIndex;

    let searchClause = "";
    if (filters.search) {
      searchClause = `${where.sql ? "AND" : "WHERE"} (
        s.utm_campaign ILIKE $${index} OR
        s.utm_term ILIKE $${index} OR
        s.outcome ILIKE $${index} OR
        EXISTS (
          SELECT 1 FROM events e
           WHERE e.session_id = s.id AND e.option_label ILIKE $${index}
        )
      )`;
      values.push(`%${filters.search}%`);
      index += 1;
    }

    const offset = (filters.page - 1) * PAGE_SIZE;

    const list = await rows(
      `SELECT
         s.id,
         s.created_at,
         s.outcome,
         s.completed,
         s.device,
         s.utm_campaign,
         s.utm_source,
         s.utm_term,
         s.gclid,
         COALESCE(picks.choices, '{}') AS choices,
         COALESCE(picks.steps, 0)     AS steps,
         sub.id                        AS submission_id,
         sub.name                      AS submission_name
       FROM sessions s
       LEFT JOIN LATERAL (
         SELECT array_agg(e.option_label ORDER BY e.seq) AS choices,
                count(*)                                 AS steps
           FROM events e
          WHERE e.session_id = s.id AND e.type = 'option_selected'
       ) picks ON true
       LEFT JOIN LATERAL (
         SELECT id, name FROM submissions
          WHERE session_id = s.id
          ORDER BY created_at DESC
          LIMIT 1
       ) sub ON true
       ${where.sql}
       ${searchClause}
       ORDER BY s.created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      values
    );

    const totals = await one(
      `SELECT count(*)::int AS total FROM sessions s ${where.sql} ${searchClause}`,
      values
    );

    res.status(200).json({
      conversations: list,
      total: totals?.total ?? 0,
      page: filters.page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    console.error("GET /api/admin/conversations failed:", err);
    res.status(500).json({ error: "Could not load conversations." });
  }
}
