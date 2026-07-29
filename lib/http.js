import crypto from "node:crypto";

/**
 * Vercel parses JSON bodies for us most of the time, but requests sent with
 * navigator.sendBeacon arrive as text/plain, so handle both shapes.
 */
export async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/** Rejects anything but the given method with a 405. */
export function methodGuard(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

export function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Trims, collapses whitespace and caps length. Returns null for empty input. */
export function text(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

/** Like text(), but preserves line breaks for free-form notes. */
export function multiline(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

export function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/** Requires at least 7 digits, which covers US and international formats. */
export function isPhone(value) {
  return typeof value === "string" && (value.match(/\d/g) || []).length >= 7 && value.length <= 32;
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "";
}

/**
 * We only ever store a hash, so conversations can be de-duplicated and abuse
 * spotted without retaining a visitor's raw IP address.
 */
export function hashIp(req) {
  const ip = clientIp(req);
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? "pt-service-lander";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function deviceFromUserAgent(ua) {
  if (typeof ua !== "string" || ua.length === 0) return "unknown";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}
