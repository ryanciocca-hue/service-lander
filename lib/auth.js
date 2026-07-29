import crypto from "node:crypto";

const COOKIE_NAME = "pt_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET is not set (or is too short)");
  }
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function hmac(data) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Compares the submitted password to ADMIN_PASSWORD in constant time. */
export function checkPassword(submitted) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");
  if (typeof submitted !== "string" || submitted.length === 0) return false;
  // Hash both sides first so the comparison is constant time regardless of
  // the submitted length.
  const a = crypto.createHash("sha256").update(submitted).digest("hex");
  const b = crypto.createHash("sha256").update(expected).digest("hex");
  return safeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function issueSession(res) {
  const payload = b64url(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS })
  );
  const token = `${payload}.${hmac(payload)}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
  );
}

export function clearSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export function isAuthenticated(req) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return false;

    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    if (!safeEqual(signature, hmac(payload))) return false;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.exp === "number" && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/**
 * Guard for every /api/admin/* handler. Returns false and writes a 401 when
 * the caller is not signed in.
 */
export function requireAdmin(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: "Not signed in" });
  return false;
}
