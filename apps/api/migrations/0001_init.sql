-- Migration number: 0001  Initial schema for api.faheemnaeem.dev

-- Interview requests submitted via POST /v1/interview-requests.
CREATE TABLE IF NOT EXISTS interview_requests (
    id          TEXT PRIMARY KEY,           -- UUID v4
    created_at  TEXT NOT NULL,              -- ISO 8601 UTC
    name        TEXT NOT NULL,
    company     TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL,
    message     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interview_requests_created_at
    ON interview_requests (created_at);

-- Fixed-window rate limiter. `key` is SHA-256(IP_HASH_SALT + ":" + ip);
-- raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS rate_limits (
    key           TEXT NOT NULL,
    window_start  INTEGER NOT NULL,         -- window start, ms since epoch
    count         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
