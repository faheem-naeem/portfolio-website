import { createHash } from 'node:crypto';
import { allCss } from '@faheem/ui';
import { describe, expect, it } from 'vitest';
import { runChecks, type CheckDeps, type Target } from '../src/checks';
import { createApp } from '../src/index';
import { buildModel, worstState } from '../src/model';
import { PAGE_CSS } from '../src/render';
import { DAY_MS } from '../src/uptime';
import { createFakeD1 } from './fake-d1';

// Fixed clock: 2026-11-17 14:20 UTC.
const NOW = Date.UTC(2026, 10, 17, 14, 20);
const TARGETS: Target[] = [
    {
        id: 'faheemnaeem-dev',
        name: 'faheemnaeem.dev',
        url: 'https://faheemnaeem.dev',
    },
];

async function seededEnv(days = 90) {
    const d1 = createFakeD1();
    const okDeps: CheckDeps = {
        fetch: async () => new Response(null, { status: 200 }),
        now: () => NOW,
        timeoutMs: 10_000,
    };
    // A few checks per day for `days` days, plus one failure yesterday.
    for (let d = days - 1; d >= 0; d--) {
        for (const h of [1, 9, 17]) {
            const t = NOW - d * DAY_MS - 14 * 3_600_000 + h * 3_600_000;
            await runChecks(d1.binding, t, okDeps, TARGETS);
        }
    }
    await runChecks(
        d1.binding,
        NOW - DAY_MS,
        { ...okDeps, fetch: async () => new Response(null, { status: 502 }) },
        TARGETS,
    );
    return { d1, env: { DB: d1.binding } };
}

const app = createApp({ now: () => NOW, targets: () => TARGETS });

describe('GET /', () => {
    it('renders the status page server-side', async () => {
        const { env } = await seededEnv();
        const res = await app.request('/', {}, env);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain('<h2 id="faheem">Faheem</h2>');
        expect(html).toContain('<h2 id="projects">Projects</h2>');
        expect(html).toContain('<h2 id="incidents">Incident history</h2>');
        expect(html).toContain('Inbox zero');
        expect(html).not.toMatch(/<script/i);
    });

    it('derives the banner from the worst state', async () => {
        const { env } = await seededEnv();
        const html = await (await app.request('/', {}, env)).text();
        // The data includes an "outage" joke component (Inbox zero).
        expect(html).toContain('<h1 id="banner">Major Outage</h1>');
    });

    it('renders 90 labelled uptime bars and a hidden table alternative', async () => {
        const { env } = await seededEnv(30);
        const html = await (await app.request('/', {}, env)).text();
        const bars =
            html.match(
                /<span class="b [gwxn]" role="img" aria-label="[^"]+"><\/span>/g,
            ) ?? [];
        expect(bars).toHaveLength(90);
        expect(html).toContain('aria-label="Nov 17: 100% uptime"');
        expect(html).toContain('aria-label="Nov 16: 75% uptime"');
        expect(html).toContain('aria-label="Aug 20: No data"');
        expect(html).toContain(
            '<table class="visually-hidden"><caption>Daily uptime for faheemnaeem.dev',
        );
        // Consecutive no-data days collapse into one row.
        expect(html).toContain(
            '<tr><th scope="row">Aug 20 – Oct 18</th><td>No data</td>',
        );
    });

    it('shows the latest check', async () => {
        const { env } = await seededEnv(2);
        const html = await (await app.request('/', {}, env)).text();
        expect(html).toContain('HTTP 200 · ');
        expect(html).toMatch(/<span class="state st-operational">/);
    });

    it('works with an empty database', async () => {
        const d1 = createFakeD1();
        const html = await (
            await app.request('/', {}, { DB: d1.binding })
        ).text();
        expect(html).toContain('Not checked yet');
        expect(html).toContain('No data');
    });

    it('stays under 30 KB with a full 90 days of data', async () => {
        const { env } = await seededEnv();
        const html = await (await app.request('/', {}, env)).text();
        expect(new TextEncoder().encode(html).length).toBeLessThan(30 * 1024);
    });

    it('sets security headers with a CSP that hashes the inline styles', async () => {
        const { env } = await seededEnv(1);
        const res = await app.request('/', {}, env);
        const csp = res.headers.get('content-security-policy') ?? '';
        const hash = (s: string) =>
            createHash('sha256').update(s).digest('base64');
        expect(csp).toContain(`'sha256-${hash(allCss)}'`);
        expect(csp).toContain(`'sha256-${hash(PAGE_CSS)}'`);
        expect(csp).toContain("default-src 'none'");
        expect(csp).not.toContain('unsafe-inline');
        expect(res.headers.get('strict-transport-security')).toContain(
            'max-age=',
        );
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('referrer-policy')).toBe(
            'strict-origin-when-cross-origin',
        );
    });
});

describe('GET /api/status.json', () => {
    it('returns the same data for machines', async () => {
        const { env } = await seededEnv(3);
        const res = await app.request('/api/status.json', {}, env);
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
        const body = (await res.json()) as ReturnType<typeof buildModel>;
        expect(body.generatedAt).toBe('2026-11-17T14:20:00.000Z');
        expect(body.overall).toEqual({
            state: 'outage',
            label: 'Major Outage',
        });
        expect(body.faheem.components.length).toBeGreaterThan(0);
        expect(body.incidents.length).toBeGreaterThan(0);
        const p = body.projects[0]!;
        expect(p).toMatchObject({
            id: 'faheemnaeem-dev',
            state: 'operational',
        });
        expect(p.days).toHaveLength(90);
        expect(p.days[89]).toMatchObject({
            date: '2026-11-17',
            uptime: 100,
            total: 3,
        });
        expect(p.uptime90d).toBeCloseTo((9 / 10) * 100, 6);
    });
});

describe('misc', () => {
    it('returns JSON 404 for unknown paths', async () => {
        const d1 = createFakeD1();
        const res = await app.request('/nope', {}, { DB: d1.binding });
        expect(res.status).toBe(404);
    });

    it('ignores unknown states when picking the banner', () => {
        expect(worstState(['unknown', 'operational'])).toBe('operational');
        expect(worstState(['maintenance', 'degraded'])).toBe('degraded');
    });
});
