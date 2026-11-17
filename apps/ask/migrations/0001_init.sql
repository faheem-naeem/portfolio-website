-- ask.faheemnaeem.dev: counters and question log. No raw IPs are ever stored.

-- Per-IP hourly counter. ip_hash = SHA-256(day + secret salt + IP), so it
-- rotates every UTC day and cannot be reversed by hashing the IPv4 space.
CREATE TABLE IF NOT EXISTS ip_usage (
    ip_hash TEXT NOT NULL,
    hour INTEGER NOT NULL,          -- floor(epoch ms / 3,600,000)
    count INTEGER NOT NULL DEFAULT 0,
    last_q TEXT,                    -- SHA-256 of the last normalised question
    PRIMARY KEY (ip_hash, hour)
);

-- Global questions per UTC day (DAILY_CAP).
CREATE TABLE IF NOT EXISTS daily_usage (
    day TEXT PRIMARY KEY,           -- YYYY-MM-DD (UTC)
    count INTEGER NOT NULL
);

-- What visitors ask (no IP, emails/phone numbers redacted).
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asked_at TEXT NOT NULL,
    day TEXT NOT NULL,
    question TEXT NOT NULL,
    history_turns INTEGER NOT NULL,
    outcome TEXT NOT NULL           -- answered | daily_cap | ai_error
);
CREATE INDEX IF NOT EXISTS questions_day ON questions (day);
