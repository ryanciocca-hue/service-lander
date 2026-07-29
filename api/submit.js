import crypto from "node:crypto";
import { query, one } from "../lib/db.js";
import { sendSubmissionNotification } from "../lib/email.js";
import {
  readJson,
  methodGuard,
  isUuid,
  text,
  multiline,
  isEmail,
  isPhone,
} from "../lib/http.js";

const KINDS = new Set(["parts_callback", "service_request"]);

/**
 * POST /api/submit
 * Saves a parts-callback or service request, then emails the team. The lead is
 * committed to the database before the email is attempted, so a mail outage
 * can never lose a submission.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!KINDS.has(kind)) {
    res.status(400).json({ error: "Unknown request type." });
    return;
  }

  const name = text(body.name, 100);
  const phone = text(body.phone, 32);
  const email = text(body.email, 254);
  // Both request types collect state now — it routes the lead to the right team.
  const state = text(body.state, 100);
  // Which machine family, from the parts product question. Absent on the
  // service path, so it is never required.
  const product = text(body.product, 100);
  const notes = multiline(body.notes, 2000);

  const errors = {};
  if (!name) errors.name = "Please enter your name.";
  if (!phone || !isPhone(phone)) errors.phone = "Please enter a valid phone number.";
  if (!email || !isEmail(email)) errors.email = "Please enter a valid email address.";
  if (!state) errors.state = "Please select your state.";
  if (!notes) {
    errors.notes =
      kind === "service_request"
        ? "Please describe your service request."
        : "Please tell us which parts you need.";
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: "Please check the highlighted fields.", fields: errors });
    return;
  }

  const submission = {
    id: crypto.randomUUID(),
    sessionId: isUuid(body.sessionId) ? body.sessionId : null,
    kind,
    name,
    phone,
    email,
    state,
    notes,
    product,
  };

  try {
    await query(
      `INSERT INTO submissions (id, session_id, kind, name, phone, email, state, notes, product)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        submission.id,
        submission.sessionId,
        submission.kind,
        submission.name,
        submission.phone,
        submission.email,
        submission.state,
        submission.notes,
        submission.product,
      ]
    );
  } catch (err) {
    console.error("POST /api/submit failed to save:", err);
    res.status(500).json({ error: "Something went wrong saving your request. Please try again." });
    return;
  }

  // Mark the conversation as converted and pick up its campaign data for the
  // notification email.
  let context = {};
  if (submission.sessionId) {
    try {
      context =
        (await one(
          `UPDATE sessions
              SET outcome = $2, completed = true, last_seen_at = now()
            WHERE id = $1
        RETURNING utm_campaign, utm_source, utm_term, gclid, device`,
          [submission.sessionId, `${kind}_submitted`]
        )) ?? {};
    } catch (err) {
      console.error("Failed to update session after submit:", err);
    }
  }

  const notification = await sendSubmissionNotification(submission, context);
  if (!notification.sent) {
    console.error("Notification email not sent:", notification.error);
  }

  try {
    await query(`UPDATE submissions SET notified = $2, notify_error = $3 WHERE id = $1`, [
      submission.id,
      notification.sent,
      notification.error ? notification.error.slice(0, 500) : null,
    ]);
  } catch (err) {
    console.error("Failed to record notification status:", err);
  }

  res.status(200).json({ ok: true });
}
