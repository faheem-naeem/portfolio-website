// D1-backed counters (KV's free plan only allows 1,000 writes/day).
// The Workers Rate Limiting binding was not used: its period can only be 10
// or 60 seconds, so it cannot express "15 per hour".

export const PER_IP_PER_HOUR = 15;
export const DEFAULT_DAILY_CAP = 150;
const HOUR_MS = 3_600_000;

export function utcDay(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
}

export function hourBucket(nowMs: number): number {
    return Math.floor(nowMs / HOUR_MS);
}

export function dailyCap(raw: string | undefined): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

export type IpCheck = 'ok' | 'rate_limited' | 'duplicate';

/** Counts one question for this (hashed) IP, unless over the limit or a repeat. */
export async function takeIpSlot(
    db: D1Database,
    ipHash: string,
    questionHash: string,
    nowMs: number,
): Promise<IpCheck> {
    const hour = hourBucket(nowMs);
    const row = await db
        .prepare(
            'SELECT count, last_q FROM ip_usage WHERE ip_hash = ? AND hour = ?',
        )
        .bind(ipHash, hour)
        .first<{ count: number; last_q: string | null }>();
    if (row && row.count >= PER_IP_PER_HOUR) return 'rate_limited';
    if (row && row.last_q === questionHash) return 'duplicate';
    await db
        .prepare(
            `INSERT INTO ip_usage (ip_hash, hour, count, last_q) VALUES (?, ?, 1, ?)
             ON CONFLICT (ip_hash, hour) DO UPDATE SET count = count + 1, last_q = excluded.last_q`,
        )
        .bind(ipHash, hour, questionHash)
        .run();
    return 'ok';
}

/**
 * Atomically counts one question for today unless the cap is reached.
 * Returns false when the daily cap has been hit.
 */
export async function takeDailySlot(
    db: D1Database,
    cap: number,
    nowMs: number,
): Promise<boolean> {
    if (cap <= 0) return false;
    const day = utcDay(nowMs);
    const row = await db
        .prepare(
            `INSERT INTO daily_usage (day, count) VALUES (?, 1)
             ON CONFLICT (day) DO UPDATE SET count = count + 1 WHERE count < ?
             RETURNING count`,
        )
        .bind(day, cap)
        .first<{ count: number }>();
    if (!row) return false;
    if (row.count === 1) {
        // First question of a new UTC day: drop stale per-IP rows.
        await db
            .prepare('DELETE FROM ip_usage WHERE hour < ?')
            .bind(hourBucket(nowMs) - 24)
            .run();
    }
    return true;
}

export type Outcome = 'answered' | 'daily_cap' | 'ai_error';

/** Logs a question (already redacted). No IP or other visitor data. */
export async function logQuestion(
    db: D1Database,
    question: string,
    historyTurns: number,
    outcome: Outcome,
    nowMs: number,
): Promise<void> {
    await db
        .prepare(
            'INSERT INTO questions (asked_at, day, question, history_turns, outcome) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
            new Date(nowMs).toISOString(),
            utcDay(nowMs),
            question,
            historyTurns,
            outcome,
        )
        .run();
}
