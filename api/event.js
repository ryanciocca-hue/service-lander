import { query } from "../lib/db.js";
import { readJson, methodGuard, isUuid, text } from "../lib/http.js";

const ALLOWED_TYPES = new Set([
  "session_start",
  "node_shown",
  "option_selected",
  "cta_click",
  "form_shown",
  "form_submitted",
  "restart",
]);

const MAX_EVENTS_PER_REQUEST = 40;

/**
 * POST /api/event
 * Records a batch of conversation steps. Batched and fire-and-forget from the
 * browser, so it always answers 200 — a tracking failure must never break the
 * visitor's experience.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const sessionId = body.sessionId;
    if (!isUuid(sessionId)) {
      res.status(200).json({ ok: false });
      return;
    }

    const incoming = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
    const valid = incoming.filter((event) => ALLOWED_TYPES.has(event?.type));

    if (valid.length > 0) {
      const values = [];
      const placeholders = [];

      valid.forEach((event, index) => {
        const base = index * 7;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
        );
        values.push(
          sessionId,
          Number.isInteger(event.seq) ? event.seq : index,
          event.type,
          text(event.nodeId, 100),
          text(event.question, 500),
          text(event.optionId, 100),
          text(event.optionLabel, 250)
        );
      });

      await query(
        `INSERT INTO events (session_id, seq, type, node_id, question, option_id, option_label)
         VALUES ${placeholders.join(",")}`,
        values
      );
    }

    // The last outcome wins, so a submitted form supersedes the form being shown.
    const outcome = text(body.outcome, 60);
    if (outcome) {
      await query(
        `UPDATE sessions
            SET outcome = $2,
                completed = $3,
                last_seen_at = now()
          WHERE id = $1`,
        [sessionId, outcome, body.completed === true]
      );
    } else {
      await query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [sessionId]);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("POST /api/event failed:", err);
    res.status(200).json({ ok: false });
  }
}
