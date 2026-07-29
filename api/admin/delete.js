import { query, one } from "../../lib/db.js";
import { requireAdmin } from "../../lib/auth.js";
import { readJson, methodGuard, isUuid } from "../../lib/http.js";

const MAX_PER_REQUEST = 500;

/**
 * POST /api/admin/delete  { kind: "conversations" | "submissions", ids: [...] }
 *
 * Deleting a conversation removes it and its event history. It deliberately
 * does NOT remove a lead that came from it — a submitted request is worth more
 * than the transcript, and losing one as a side effect of tidying up
 * conversations would be a nasty surprise. Orphaned leads stay in the
 * Submissions tab and can be deleted there.
 */
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const kind = body.kind;

    if (kind !== "conversations" && kind !== "submissions") {
      res.status(400).json({ error: "Unknown record type." });
      return;
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid).slice(0, MAX_PER_REQUEST) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "Nothing selected." });
      return;
    }

    if (kind === "submissions") {
      const result = await query(`DELETE FROM submissions WHERE id = ANY($1::uuid[])`, [ids]);
      res.status(200).json({ deleted: result.rowCount, keptLeads: 0 });
      return;
    }

    // Count the leads about to be detached, so the dashboard can say what
    // happened rather than leaving them to be discovered later.
    const kept = await one(
      `SELECT count(*)::int AS n FROM submissions WHERE session_id = ANY($1::uuid[])`,
      [ids]
    );

    const result = await query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [ids]);
    res.status(200).json({ deleted: result.rowCount, keptLeads: kept?.n ?? 0 });
  } catch (err) {
    console.error("POST /api/admin/delete failed:", err);
    res.status(500).json({ error: "Could not delete those records." });
  }
}
