-- Raw health-check results, one row per URL per cron run (every 10 minutes).
-- Rows older than 90 days are deleted by the daily cleanup.
CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    checked_at INTEGER NOT NULL, -- Unix epoch milliseconds (UTC)
    status_code INTEGER,         -- NULL when the request failed (timeout, DNS, TLS)
    latency_ms INTEGER NOT NULL,
    ok INTEGER NOT NULL CHECK (ok IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_checks_url_checked_at ON checks (url, checked_at);

-- Per-day rollup written alongside every check, so the page reads at most
-- 90 rows per URL instead of scanning ~13,000 raw checks (D1 free plan
-- allows 5 million rows read per day).
CREATE TABLE IF NOT EXISTS daily_uptime (
    url TEXT NOT NULL,
    day INTEGER NOT NULL, -- days since Unix epoch (UTC)
    total INTEGER NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (url, day)
);
