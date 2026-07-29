-- ---------------------------------------------------------------------------
-- Schema for the service.powertechniquena.com conversational lander.
--
-- This file is applied automatically on the first API request after a cold
-- start (see lib/db.js), so you normally never need to run it by hand. It is
-- kept here as the readable source of truth.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id             UUID PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Where the visitor ended up. NULL until they reach a terminal step.
  outcome        TEXT,
  completed      BOOLEAN NOT NULL DEFAULT false,

  -- Google Ads / campaign attribution, captured from the landing URL.
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

CREATE INDEX IF NOT EXISTS sessions_created_at_idx  ON sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_outcome_idx     ON sessions (outcome);
CREATE INDEX IF NOT EXISTS sessions_campaign_idx    ON sessions (utm_campaign);

-- Every step of every conversation, in order.
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

CREATE INDEX IF NOT EXISTS events_session_idx     ON events (session_id, seq);
CREATE INDEX IF NOT EXISTS events_type_node_idx   ON events (type, node_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx  ON events (created_at DESC);

-- Contact details captured at the end of a parts-callback or service path.
CREATE TABLE IF NOT EXISTS submissions (
  id           UUID PRIMARY KEY,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT NOT NULL,
  state        TEXT,
  notes        TEXT,
  product      TEXT,
  notified     BOOLEAN NOT NULL DEFAULT false,
  notify_error TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_kind_idx       ON submissions (kind);
