// Health checks (cron) and D1 access for the `checks` / `daily_uptime` tables.
import { getProjects, type Project } from '@faheem/data';
import { DAY_MS, dayIndex, UPTIME_DAYS, type DailyRow } from './uptime';

export const MAIN_SITE_URL = 'https://faheemnaeem.dev';
/** Free plan: 50 subrequests per invocation. Stay well below it. */
export const MAX_TARGETS = 20;
export const CHECK_TIMEOUT_MS = 10_000;
export const USER_AGENT =
    'faheemnaeem-status/1.0 (+https://status.faheemnaeem.dev)';

export interface Env {
    DB: D1Database;
}

export interface Target {
    id: string;
    name: string;
    url: string;
}

export interface CheckResult {
    url: string;
    checkedAt: number;
    /** HTTP status, or null when the request failed before a response. */
    statusCode: number | null;
    latencyMs: number;
    ok: boolean;
}

export interface CheckDeps {
    fetch: typeof fetch;
    /** Monotonic-enough clock for latency (Date.now in production). */
    now: () => number;
    timeoutMs: number;
}

const defaultDeps = (): CheckDeps => ({
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    timeoutMs: CHECK_TIMEOUT_MS,
});

function normaliseUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

/** Projects with a healthcheckUrl, plus the main site; de-duplicated, max 20. */
export function getTargets(
    projects: readonly Project[] = getProjects(),
): Target[] {
    const targets: Target[] = [];
    const seen = new Set<string>();
    const add = (t: Target) => {
        const key = normaliseUrl(t.url);
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(t);
    };
    for (const p of projects) {
        if (p.healthcheckUrl)
            add({ id: p.id, name: p.name, url: p.healthcheckUrl });
    }
    add({ id: 'main-site', name: 'faheemnaeem.dev', url: MAIN_SITE_URL });
    return targets.slice(0, MAX_TARGETS);
}

/** Fetches one URL with a timeout. Never throws. */
export async function checkUrl(
    url: string,
    checkedAt: number,
    deps: CheckDeps,
): Promise<CheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    const start = deps.now();
    try {
        const res = await deps.fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'user-agent': USER_AGENT },
        });
        const latencyMs = Math.max(0, Math.round(deps.now() - start));
        // We only need the status; do not download the body.
        await res.body?.cancel().catch(() => undefined);
        return {
            url,
            checkedAt,
            statusCode: res.status,
            latencyMs,
            ok: res.ok,
        };
    } catch {
        const latencyMs = Math.max(0, Math.round(deps.now() - start));
        return { url, checkedAt, statusCode: null, latencyMs, ok: false };
    } finally {
        clearTimeout(timer);
    }
}

/** Checks every target in parallel and stores the results in D1. */
export async function runChecks(
    db: D1Database,
    scheduledTime: number,
    deps: CheckDeps = defaultDeps(),
    targets: readonly Target[] = getTargets(),
): Promise<CheckResult[]> {
    const list = targets.slice(0, MAX_TARGETS);
    const settled = await Promise.allSettled(
        list.map((t) => checkUrl(t.url, scheduledTime, deps)),
    );
    const results = settled.map(
        (s, i): CheckResult =>
            s.status === 'fulfilled'
                ? s.value
                : {
                      url: list[i]?.url ?? '',
                      checkedAt: scheduledTime,
                      statusCode: null,
                      latencyMs: 0,
                      ok: false,
                  },
    );
    if (results.length === 0) return results;
    const day = dayIndex(scheduledTime);
    const statements = results.flatMap((r) => [
        db
            .prepare(
                'INSERT INTO checks (url, checked_at, status_code, latency_ms, ok) VALUES (?1, ?2, ?3, ?4, ?5)',
            )
            .bind(r.url, r.checkedAt, r.statusCode, r.latencyMs, r.ok ? 1 : 0),
        db
            .prepare(
                'INSERT INTO daily_uptime (url, day, total, ok) VALUES (?1, ?2, 1, ?3) ' +
                    'ON CONFLICT (url, day) DO UPDATE SET total = total + 1, ok = ok + excluded.ok',
            )
            .bind(r.url, day, r.ok ? 1 : 0),
    ]);
    await db.batch(statements);
    return results;
}

/** True for the first 10-minute run at or after 03:00 UTC. */
export function shouldCleanup(scheduledTime: number): boolean {
    const d = new Date(scheduledTime);
    return d.getUTCHours() === 3 && d.getUTCMinutes() < 10;
}

/** Deletes data older than the 90-day window. */
export async function cleanup(db: D1Database, nowMs: number): Promise<void> {
    const cutoffMs = nowMs - UPTIME_DAYS * DAY_MS;
    const cutoffDay = dayIndex(nowMs) - UPTIME_DAYS + 1;
    await db.batch([
        db.prepare('DELETE FROM checks WHERE checked_at < ?1').bind(cutoffMs),
        db.prepare('DELETE FROM daily_uptime WHERE day < ?1').bind(cutoffDay),
    ]);
}

export async function handleScheduled(
    env: Env,
    scheduledTime: number,
    deps: CheckDeps = defaultDeps(),
): Promise<{ results: CheckResult[]; cleaned: boolean }> {
    const results = await runChecks(env.DB, scheduledTime, deps);
    const cleaned = shouldCleanup(scheduledTime);
    if (cleaned) await cleanup(env.DB, scheduledTime);
    return { results, cleaned };
}

// ---- Reads for the page ----

export interface LatestCheck {
    checkedAt: number;
    statusCode: number | null;
    latencyMs: number;
    ok: boolean;
}

interface CheckRow {
    checked_at: number;
    status_code: number | null;
    latency_ms: number;
    ok: number;
}

/** Latest check and daily rollups for every target (index-backed reads). */
export async function loadHistory(
    db: D1Database,
    targets: readonly Target[],
    nowMs: number,
): Promise<{ latest: Map<string, LatestCheck>; daily: DailyRow[] }> {
    const fromDay = dayIndex(nowMs) - UPTIME_DAYS + 1;
    const latestStmts = targets.map((t) =>
        db
            .prepare(
                'SELECT checked_at, status_code, latency_ms, ok FROM checks WHERE url = ?1 ORDER BY checked_at DESC LIMIT 1',
            )
            .bind(t.url),
    );
    const dailyStmt = db
        .prepare(
            'SELECT url, day, total, ok FROM daily_uptime WHERE day >= ?1 ORDER BY url, day',
        )
        .bind(fromDay);
    const results = await db.batch<unknown>([...latestStmts, dailyStmt]);
    const latest = new Map<string, LatestCheck>();
    targets.forEach((t, i) => {
        const row = results[i]?.results[0] as CheckRow | undefined;
        if (row)
            latest.set(t.url, {
                checkedAt: row.checked_at,
                statusCode: row.status_code,
                latencyMs: row.latency_ms,
                ok: row.ok === 1,
            });
    });
    const daily = (results[targets.length]?.results ?? []) as DailyRow[];
    return { latest, daily };
}
