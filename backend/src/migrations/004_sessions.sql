-- 004_sessions.sql — Human user OIDC sessions for dashboard and control operations.
-- Prompt 01.01 Wave 7 (Human AuthN/AuthZ)

CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    role          TEXT NOT NULL,
    groups        TEXT[] NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
