import { query, connectionVarName } from "../lib/db.js";
import { CONFIG } from "../public/flow.js";

/**
 * GET /api/health
 *
 * A pre-launch checklist you can hit in a browser. It reports whether each
 * piece of configuration is present and whether the database actually answers.
 *
 * Deliberately safe to expose: it returns booleans, counts, table names and
 * Postgres error *codes* only — never a secret, a connection string, a
 * hostname, or a raw driver message.
 */
export default async function handler(req, res) {
  const checks = {};

  // ---- Database ----------------------------------------------------------
  const variable = connectionVarName();
  const database = { variable, connected: false, tables: [], error: null };

  if (!variable) {
    database.error = "no_connection_string";
  } else {
    try {
      const result = await query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('sessions','events','submissions')
          ORDER BY table_name`
      );
      database.connected = true;
      database.tables = result.rows.map((row) => row.table_name);
    } catch (err) {
      // Codes like 28P01 (bad password) or ENOTFOUND are diagnostic without
      // revealing where the database lives.
      database.error = err?.code ?? "connection_failed";
    }
  }
  checks.database = database;

  // ---- Admin login -------------------------------------------------------
  const secret = process.env.SESSION_SECRET ?? "";
  checks.admin = {
    passwordSet: Boolean(process.env.ADMIN_PASSWORD),
    sessionSecretSet: Boolean(secret),
    sessionSecretLongEnough: secret.length >= 16,
  };

  // ---- Email notifications ----------------------------------------------
  const recipients = (process.env.NOTIFY_EMAILS ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  checks.email = {
    apiKeySet: Boolean(process.env.RESEND_API_KEY),
    fromSet: Boolean(process.env.FROM_EMAIL),
    recipientCount: recipients.length,
    partsOverride: Boolean(process.env.NOTIFY_EMAILS_PARTS),
    serviceOverride: Boolean(process.env.NOTIFY_EMAILS_SERVICE),
  };

  // ---- Content still holding a placeholder -------------------------------
  checks.content = {
    phonePlaceholderStillSet: CONFIG.phoneDisplay.includes("555-0100"),
  };

  const blocking = [
    database.connected,
    checks.admin.passwordSet,
    checks.admin.sessionSecretLongEnough,
  ];

  const warnings = [];
  if (!checks.email.apiKeySet || !checks.email.fromSet || checks.email.recipientCount === 0) {
    warnings.push("Email notifications are not configured — submissions still save.");
  }
  if (checks.content.phonePlaceholderStillSet) {
    warnings.push("The parts phone number in public/flow.js is still the placeholder.");
  }
  if (database.connected && database.tables.length < 3) {
    warnings.push("Tables are created on the first real request; this may be normal on a fresh database.");
  }

  const ready = blocking.every(Boolean);

  res.status(ready ? 200 : 503).json({
    ready,
    checks,
    warnings,
    checkedAt: new Date().toISOString(),
  });
}
