import { describe, expect, it } from 'vitest';
import {
    buildDays,
    DAY_MS,
    dayIndex,
    dayLabel,
    formatPercent,
    overallUptime,
    uptimeLevel,
} from '../src/uptime';

// Fixed clock: 2026-11-17 14:20 UTC.
const NOW = Date.UTC(2026, 10, 17, 14, 20);
const TODAY = dayIndex(NOW);
const URL = 'https://faheemnaeem.dev';

describe('buildDays', () => {
    it('returns 90 days, oldest first, ending today (UTC)', () => {
        const days = buildDays([], NOW);
        expect(days).toHaveLength(90);
        expect(days[89]?.date).toBe('2026-11-17');
        expect(days[89]?.label).toBe('Nov 17');
        expect(days[0]?.date).toBe('2026-08-20');
    });

    it('marks days without checks as No data', () => {
        const days = buildDays([], NOW);
        expect(days.every((d) => d.uptime === null && d.level === 'none')).toBe(
            true,
        );
        expect(dayLabel(days[89]!)).toBe('Nov 17: No data');
        expect(overallUptime(days)).toBeNull();
    });

    it('computes per-day and overall uptime', () => {
        const days = buildDays(
            [
                { url: URL, day: TODAY, total: 144, ok: 144 },
                { url: URL, day: TODAY - 1, total: 144, ok: 143 },
                { url: URL, day: TODAY - 2, total: 100, ok: 50 },
                { url: URL, day: TODAY - 500, total: 10, ok: 0 }, // outside window
            ],
            NOW,
        );
        expect(days[89]).toMatchObject({ uptime: 100, level: 'good' });
        expect(dayLabel(days[89]!)).toBe('Nov 17: 100% uptime');
        expect(days[88]?.level).toBe('warn');
        expect(dayLabel(days[88]!)).toBe('Nov 16: 99.3% uptime');
        expect(days[87]).toMatchObject({ uptime: 50, level: 'bad' });
        expect(overallUptime(days)).toBeCloseTo((337 / 388) * 100, 6);
    });

    it('treats day boundaries in UTC', () => {
        const justBeforeMidnight = TODAY * DAY_MS - 1;
        expect(dayIndex(justBeforeMidnight)).toBe(TODAY - 1);
    });
});

describe('formatting', () => {
    it('rounds down so near-perfect is not shown as 100%', () => {
        expect(formatPercent(100)).toBe('100%');
        expect(formatPercent(99.999)).toBe('99.99%');
        expect(formatPercent(99.5)).toBe('99.5%');
        expect(formatPercent(null)).toBe('No data');
    });

    it('maps uptime to levels', () => {
        expect(uptimeLevel(99.9)).toBe('good');
        expect(uptimeLevel(99.89)).toBe('warn');
        expect(uptimeLevel(95)).toBe('warn');
        expect(uptimeLevel(94.99)).toBe('bad');
        expect(uptimeLevel(null)).toBe('none');
    });
});
