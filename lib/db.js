import pg from "pg";

const { Pool } = pg;

/**
 * Serverless functions get frozen and thawed, so we keep a single module-level
 * pool (max 1 connection) that survives warm invocations. Use a pooled
 * connection string (pgbouncer) from your Postgres provider.
 */
let pool = null;
let schemaReady = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.PGSSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("Postgres pool error:", err);
  });

  return pool;
}

// Kept in sync with schema.sql. Every statement is idempotent, so running it on
// each cold start is safe and means there is no separate migration step.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome        TEXT,
  completed      BOOLEAN NOT NULL DEFAULT false,
  gclid          TEXT,
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  utm_term       TEXT,
  utm_content    TEXT,
  landing_url    TEXT,
  referrer       TEXT,
  user_agent     TEXT,
  device         TEXT,
  ip_hash        TEXT
);
CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_outcome_idx    ON sessions (outcome);
CREATE INDEX IF NOT EXISTS sessions_campaign_idx   ON sessions (utm_campaign);

CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  type         TEXT NOT NULL,
  node_id      TEXT,
  question     TEXT,
  option_id    TEXT,
  option_label TEXT,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_session_idx    ON events (session_id, seq);
CREATE INDEX IF NOT EXISTS events_type_node_idx  ON events (type, node_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id           UUID PRIMARY KEY,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT NOT NULL,
  state        TEXT,
  notes        TEXT,
  notified     BOOLEAN NOT NULL DEFAULT false,
  notify_error TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_kind_idx       ON submissions (kind);
`;

async function ensureSchema(p) {
  if (!schemaReady) {
    schemaReady = p.query(SCHEMA).catch((err) => {
      // Let the next request retry rather than caching the failure forever.
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export async function query(text, params = []) {
  const p = getPool();
  await ensureSchema(p);
  return p.query(text, params);
}

/** Convenience wrapper returning just the rows. */
export async function rows(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/** Convenience wrapper returning the first row, or null. */
export async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] ?? null;
}
