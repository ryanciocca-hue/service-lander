import { rows, one } from "../../lib/db.js";
import { requireAdmin } from "../../lib/auth.js";
import { isUuid } from "../../lib/http.js";

/**
 * GET /api/admin/conversation?id=<uuid>
 * The full transcript of one conversation, for replay in the dashboard.
 */
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  const url = new URL(req.url, "http://localhost");
  const id = url.searchParams.get("id");

  if (!isUuid(id)) {
    res.status(400).json({ error: "Invalid conversation id." });
    return;
  }

  try {
    const session = await one(
      `SELECT id, created_at, last_seen_at, outcome, completed, device,
              gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              landing_url, referrer, user_agent
         FROM sessions
        WHERE id = $1`,
      [id]
    );

    if (!session) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    const [timeline, submission] = await Promise.all([
      rows(
        `SELECT seq, type, node_id, question, option_id, option_label, created_at
           FROM events
          WHERE session_id = $1
          ORDER BY seq ASC, id ASC`,
        [id]
      ),
      one(
        `SELECT id, kind, name, phone, email, state, product, notes, notified, notify_error, created_at
           FROM submissions
          WHERE session_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [id]
      ),
    ]);

    res.status(200).json({ session, timeline, submission });
  } catch (err) {
    console.error("GET /api/admin/conversation failed:", err);
    res.status(500).json({ error: "Could not load the conversation." });
  }
}
