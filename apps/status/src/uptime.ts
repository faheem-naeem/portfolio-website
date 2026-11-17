// Pure uptime maths: no I/O, so it is easy to test with a fixed clock.

export const DAY_MS = 86_400_000;
export const UPTIME_DAYS = 90;

/** One row of the `daily_uptime` rollup table. */
export interface DailyRow {
    url: string;
    day: number;
    total: number;
    ok: number;
}

export type UptimeLevel = 'good' | 'warn' | 'bad' | 'none';

export interface DayUptime {
    /** ISO date, e.g. "2026-11-17". */
    date: string;
    /** Short label, e.g. "Nov 17". */
    label: string;
    total: number;
    ok: number;
    /** Percentage 0-100, or null when there were no checks that day. */
    uptime: number | null;
    level: UptimeLevel;
}

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

/** Days since the Unix epoch (UTC). */
export function dayIndex(ms: number): number {
    return Math.floor(ms / DAY_MS);
}

export function shortDate(ms: number): string {
    const d = new Date(ms);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function uptimeLevel(uptime: number | null): UptimeLevel {
    if (uptime === null) return 'none';
    if (uptime >= 99.9) return 'good';
    if (uptime >= 95) return 'warn';
    return 'bad';
}

/** "100%", "99.5%", "99.99%". Rounds down so 99.999 never shows as 100%. */
export function formatPercent(uptime: number | null): string {
    if (uptime === null) return 'No data';
    const floored = Math.floor(uptime * 100) / 100;
    return `${Number(floored.toFixed(2))}%`;
}

/**
 * Builds exactly `days` entries (oldest first, ending today in UTC) for one URL.
 * Days without rows become "No data".
 */
export function buildDays(
    rows: readonly DailyRow[],
    nowMs: number,
    days = UPTIME_DAYS,
): DayUptime[] {
    const byDay = new Map<number, DailyRow>();
    for (const row of rows) byDay.set(row.day, row);
    const today = dayIndex(nowMs);
    const out: DayUptime[] = [];
    for (let day = today - days + 1; day <= today; day++) {
        const row = byDay.get(day);
        const total = row?.total ?? 0;
        const ok = Math.min(row?.ok ?? 0, total);
        const uptime = total > 0 ? (ok / total) * 100 : null;
        const ms = day * DAY_MS;
        out.push({
            date: new Date(ms).toISOString().slice(0, 10),
            label: shortDate(ms),
            total,
            ok,
            uptime,
            level: uptimeLevel(uptime),
        });
    }
    return out;
}

/** Uptime over all checks in the window, or null with no checks at all. */
export function overallUptime(days: readonly DayUptime[]): number | null {
    let total = 0;
    let ok = 0;
    for (const d of days) {
        total += d.total;
        ok += d.ok;
    }
    return total > 0 ? (ok / total) * 100 : null;
}

export function dayLabel(d: DayUptime): string {
    return d.uptime === null
        ? `${d.label}: No data`
        : `${d.label}: ${formatPercent(d.uptime)} uptime`;
}
