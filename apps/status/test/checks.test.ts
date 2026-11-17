import type { Project } from '@faheem/data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    checkUrl,
    cleanup,
    getTargets,
    handleScheduled,
    MAIN_SITE_URL,
    runChecks,
    shouldCleanup,
    type CheckDeps,
} from '../src/checks';
import { DAY_MS, dayIndex } from '../src/uptime';
import { createFakeD1 } from './fake-d1';

const NOW = Date.UTC(2026, 10, 17, 14, 20);

function project(id: string, healthcheckUrl?: string): Project {
    return {
        id,
        name: id,
        tagline: 't',
        description: 'd',
        tech: ['TS'],
        repoUrl: null,
        liveUrl: null,
        status: 'live',
        ...(healthcheckUrl ? { healthcheckUrl } : {}),
    };
}

/** Fake clock that advances by `step` ms on every read (for latency). */
function steppingClock(step: number) {
    let t = NOW;
    return () => {
        const v = t;
        t += step;
        return v;
    };
}

function deps(fetchImpl: CheckDeps['fetch'], step = 120): CheckDeps {
    return { fetch: fetchImpl, now: steppingClock(step), timeoutMs: 10_000 };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('getTargets', () => {
    it('includes projects with a healthcheckUrl and always the main site', () => {
        const t = getTargets([
            project('a', 'https://a.example.com'),
            project('b'),
        ]);
        expect(t.map((x) => x.url)).toEqual([
            'https://a.example.com',
            MAIN_SITE_URL,
        ]);
    });

    it('de-duplicates the main site (trailing slash ignored)', () => {
        const t = getTargets([project('site', 'https://faheemnaeem.dev/')]);
        expect(t).toHaveLength(1);
        expect(t[0]?.id).toBe('site');
    });

    it('caps targets at 20', () => {
        const many = Array.from({ length: 30 }, (_, i) =>
            project(`p${i}`, `https://p${i}.example.com`),
        );
        expect(getTargets(many)).toHaveLength(20);
    });

    it('uses real data by default', () => {
        expect(getTargets().some((t) => t.url === MAIN_SITE_URL)).toBe(true);
    });
});

describe('checkUrl', () => {
    it('records status, latency and ok for a 200', async () => {
        const fetchMock = vi.fn(
            async () => new Response('hello', { status: 200 }),
        );
        const r = await checkUrl('https://x.test', NOW, deps(fetchMock));
        expect(r).toEqual({
            url: 'https://x.test',
            checkedAt: NOW,
            statusCode: 200,
            latencyMs: 120,
            ok: true,
        });
        const init = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(init[1].signal).toBeInstanceOf(AbortSignal);
    });

    it('marks 5xx as not ok', async () => {
        const r = await checkUrl(
            'https://x.test',
            NOW,
            deps(async () => new Response(null, { status: 503 })),
        );
        expect(r).toMatchObject({ statusCode: 503, ok: false });
    });

    it('records network errors with a null status code', async () => {
        const r = await checkUrl(
            'https://x.test',
            NOW,
            deps(async () => {
                throw new TypeError('fetch failed');
            }),
        );
        expect(r).toMatchObject({ statusCode: null, ok: false });
    });

    it('aborts after 10 seconds', async () => {
        vi.useFakeTimers();
        const hanging: CheckDeps['fetch'] = (_url, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () =>
                    reject(new DOMException('aborted', 'AbortError')),
                );
            });
        const pending = checkUrl('https://slow.test', NOW, deps(hanging));
        await vi.advanceTimersByTimeAsync(9_999);
        let settled = false;
        void pending.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await pending).toMatchObject({ statusCode: null, ok: false });
    });
});

describe('runChecks (cron handler)', () => {
    const targets = [
        { id: 'a', name: 'A', url: 'https://a.test' },
        { id: 'b', name: 'B', url: 'https://b.test' },
    ];

    it('fetches all targets in parallel and stores results + daily rollup', async () => {
        const d1 = createFakeD1();
        let inFlight = 0;
        let maxInFlight = 0;
        const fetchMock: CheckDeps['fetch'] = async (input) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
            return new Response(null, {
                status: String(input).includes('b.test') ? 500 : 200,
            });
        };
        const results = await runChecks(
            d1.binding,
            NOW,
            deps(fetchMock),
            targets,
        );
        expect(maxInFlight).toBe(2);
        expect(results.map((r) => r.ok)).toEqual([true, false]);

        const rows = d1.db
            .prepare(
                'SELECT url, checked_at, status_code, ok FROM checks ORDER BY url',
            )
            .all();
        expect(rows).toEqual([
            { url: 'https://a.test', checked_at: NOW, status_code: 200, ok: 1 },
            { url: 'https://b.test', checked_at: NOW, status_code: 500, ok: 0 },
        ]);

        // A second run the same day increments the rollup.
        await runChecks(d1.binding, NOW + 600_000, deps(fetchMock), targets);
        const daily = d1.db
            .prepare(
                'SELECT url, day, total, ok FROM daily_uptime ORDER BY url',
            )
            .all();
        expect(daily).toEqual([
            { url: 'https://a.test', day: dayIndex(NOW), total: 2, ok: 2 },
            { url: 'https://b.test', day: dayIndex(NOW), total: 2, ok: 0 },
        ]);
    });

    it('still records a failure when one check throws unexpectedly', async () => {
        const d1 = createFakeD1();
        const results = await runChecks(
            d1.binding,
            NOW,
            deps(async () => {
                throw new Error('boom');
            }),
            targets,
        );
        expect(results.every((r) => !r.ok && r.statusCode === null)).toBe(true);
        expect(d1.db.prepare('SELECT COUNT(*) AS n FROM checks').get()).toEqual(
            { n: 2 },
        );
    });
});

describe('cleanup scheduling', () => {
    it('runs only on the first run at or after 03:00 UTC', () => {
        expect(shouldCleanup(Date.UTC(2026, 10, 17, 3, 0))).toBe(true);
        expect(shouldCleanup(Date.UTC(2026, 10, 17, 3, 9, 59))).toBe(true);
        expect(shouldCleanup(Date.UTC(2026, 10, 17, 3, 10))).toBe(false);
        expect(shouldCleanup(Date.UTC(2026, 10, 17, 2, 50))).toBe(false);
        expect(shouldCleanup(Date.UTC(2026, 10, 17, 15, 0))).toBe(false);
    });

    it('deletes checks and rollups older than 90 days', async () => {
        const d1 = createFakeD1();
        const ins = d1.db.prepare(
            'INSERT INTO checks (url, checked_at, status_code, latency_ms, ok) VALUES (?, ?, 200, 10, 1)',
        );
        ins.run('u', NOW - 91 * DAY_MS);
        ins.run('u', NOW - 89 * DAY_MS);
        const roll = d1.db.prepare(
            'INSERT INTO daily_uptime (url, day, total, ok) VALUES (?, ?, 1, 1)',
        );
        roll.run('u', dayIndex(NOW) - 90);
        roll.run('u', dayIndex(NOW) - 89);
        await cleanup(d1.binding, NOW);
        expect(d1.db.prepare('SELECT COUNT(*) AS n FROM checks').get()).toEqual(
            { n: 1 },
        );
        expect(d1.db.prepare('SELECT day FROM daily_uptime').all()).toEqual([
            { day: dayIndex(NOW) - 89 },
        ]);
    });

    it('handleScheduled cleans up at 03:00 UTC but not at other times', async () => {
        const d1 = createFakeD1();
        const ok = deps(async () => new Response(null, { status: 200 }));
        const at3 = await handleScheduled(
            { DB: d1.binding },
            Date.UTC(2026, 10, 17, 3, 0),
            ok,
        );
        expect(at3.cleaned).toBe(true);
        expect(at3.results.length).toBeGreaterThan(0);
        const at14 = await handleScheduled({ DB: d1.binding }, NOW, ok);
        expect(at14.cleaned).toBe(false);
        expect(d1.queries.filter((q) => q.startsWith('DELETE'))).toHaveLength(
            2,
        );
    });
});
