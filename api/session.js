import crypto from "node:crypto";
import { query, one } from "../lib/db.js";
import { readJson, methodGuard, text, hashIp, deviceFromUserAgent, isUuid } from "../lib/http.js";
import { detectState } from "../lib/geo.js";

/**
 * POST /api/session
 * Opens a conversation and captures Google Ads attribution from the landing
 * URL. Called once when the lander loads.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const params = body.params && typeof body.params === "object" ? body.params : {};

    // A reload sends back the id it already has. Refresh that session rather
    // than opening a second one — and hand the geolocation guess back, since
    // the browser may have lost it.
    if (isUuid(body.sessionId)) {
      const existing = await one(
        `UPDATE sessions SET last_seen_at = now() WHERE id = $1 RETURNING id`,
        [body.sessionId]
      );
      if (existing) {
        res.status(200).json({ sessionId: existing.id, detectedState: detectState(req) });
        return;
      }
      // Unknown id (old session, cleared database) — fall through and open a
      // fresh one rather than handing back an id nothing can be logged against.
    }

    const id = crypto.randomUUID();
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";

    await query(
      `INSERT INTO sessions (
         id, gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         landing_url, referrer, user_agent, device, ip_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        text(params.gclid, 255),
        text(params.utm_source, 255),
        text(params.utm_medium, 255),
        text(params.utm_campaign, 255),
        text(params.utm_term, 255),
        text(params.utm_content, 255),
        text(body.landingUrl, 2000),
        text(body.referrer, 2000),
        userAgent.slice(0, 500) || null,
        deviceFromUserAgent(userAgent),
        hashIp(req),
      ]
    );

    // A hint the chat asks the visitor to confirm — never used to fill the
    // field on its own.
    res.status(200).json({ sessionId: id, detectedState: detectState(req) });
  } catch (err) {
    console.error("POST /api/session failed:", err);
    // The chat must still work if tracking is down, so hand back a null id and
    // let the client carry on without logging.
    res.status(200).json({ sessionId: null, detectedState: detectState(req) });
  }
}
