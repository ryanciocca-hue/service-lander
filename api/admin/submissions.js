import { rows } from "../../lib/db.js";
import { requireAdmin } from "../../lib/auth.js";
import { parseFilters } from "../../lib/filters.js";

const RANGE_SQL = {
  today: "date_trunc('day', now())",
  "7d": "now() - interval '7 days'",
  "30d": "now() - interval '30 days'",
  "90d": "now() - interval '90 days'",
  all: null,
};

/**
 * GET /api/admin/submissions?range=30d
 * Every parts callback and service request captured in the chat.
 */
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const filters = parseFilters(req);
    const rangeSql = RANGE_SQL[filters.range];

    const list = await rows(
      `SELECT sub.id, sub.session_id, sub.kind, sub.name, sub.phone, sub.email,
              sub.state, sub.product, sub.notes, sub.notified, sub.notify_error, sub.created_at,
              s.utm_campaign, s.utm_source, s.utm_term, s.gclid, s.device
         FROM submissions sub
         LEFT JOIN sessions s ON s.id = sub.session_id
        ${rangeSql ? `WHERE sub.created_at >= ${rangeSql}` : ""}
        ORDER BY sub.created_at DESC
        LIMIT 1000`
    );

    res.status(200).json({ submissions: list });
  } catch (err) {
    console.error("GET /api/admin/submissions failed:", err);
    res.status(500).json({ error: "Could not load submissions." });
  }
}
