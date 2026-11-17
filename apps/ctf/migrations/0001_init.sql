-- Migration number: 0001  Initial schema for ctf.faheemnaeem.dev

-- One row per correct flag submission. Only an optional display name is
-- stored (no email, no IP). Nothing is shown until approved = 1.
CREATE TABLE IF NOT EXISTS hall_of_fame (
    id            TEXT PRIMARY KEY,           -- UUID v4
    display_name  TEXT,                       -- optional, max 24 chars
    created_at    TEXT NOT NULL,              -- ISO 8601 UTC
    approved      INTEGER NOT NULL DEFAULT 0  -- 0 = pending moderation
);
CREATE INDEX IF NOT EXISTS idx_hall_of_fame_approved
    ON hall_of_fame (approved, created_at);

-- Fixed-window rate limiter for POST /submit. `key` is
-- SHA-256(IP_HASH_SALT + ":" + ip); raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS rate_limits (
    key           TEXT NOT NULL,
    window_start  INTEGER NOT NULL,           -- window start, ms since epoch
    count         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
