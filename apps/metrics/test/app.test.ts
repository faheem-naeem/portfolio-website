import { createHash } from 'node:crypto';
import { allCss } from '@faheem/ui';
import { describe, expect, it } from 'vitest';
import { createApp, REFRESH_COOLDOWN_MS } from '../src/index';
import { refresh } from '../src/refresh';
import { PAGE_CSS } from '../src/render';
import { KEY_CURRENT, KEY_LASTGOOD } from '../src/snapshot';
import {
    createFakeKV,
    fakeFetch,
    gqlResponse,
    json,
    NOW,
    wakaStats,
    wakaSummaries,
} from './fakes';

const okFetch = fakeFetch((url) => {
    if (url.endsWith('/graphql')) return json(gqlResponse());
    if (url.endsWith('/stats/last_7_days')) return json(wakaStats);
    if (url.includes('/summaries?')) return json(wakaSummaries);
    return undefined;
}).fn;

async function seeded(
    env: Record<string, string> = { GITHUB_TOKEN: 't', WAKATIME_API_KEY: 'k' },
) {
    const kv = createFakeKV();
    const full = { METRICS: kv.binding, ...env };
    await refresh(full, { fetch: okFetch, now: () => NOW });
    return { kv, env: full };
}

const { app } = createApp({ now: () => NOW + 60_000, fetch: okFetch });

describe('GET /', () => {
    it('renders charts server-side with no scripts', async () => {
        const { env } = await seeded();
        const res = await app.request('/', {}, env);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<h1>Metrics</h1>');
        expect(html).toContain('class="heat"');
        expect(html).toContain('<caption>Contributions per month</caption>');
        expect(html).toContain('class="donut"');
        expect(html).toContain('TypeScript');
        expect(html).toContain('70%');
        expect(html).toContain('class="hours"');
        expect(html).toContain(
            'Last updated <time datetime="2026-11-17T14:20:00.000Z">Nov 17, 2026, 14:20 UTC</time>',
        );
        expect(html).toContain('Currently learning');
        expect(html).not.toContain('SAMPLE');
        expect(html).toContain('Add &lt;metrics&gt; page');
        expect(html).not.toContain('Stale');
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toMatch(/ style="/);
    });

    it('sets security headers with hashed styles', async () => {
        const { env } = await seeded();
        const res = await app.request('/', {}, env);
        const csp = res.headers.get('content-security-policy') ?? '';
        for (const css of [allCss, PAGE_CSS])
            expect(csp).toContain(
                `'sha256-${createHash('sha256').update(css).digest('base64')}'`,
            );
        expect(csp).not.toContain('unsafe-inline');
        expect(res.headers.get('strict-transport-security')).toContain(
            'max-age=',
        );
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('referrer-policy')).toBe(
            'strict-origin-when-cross-origin',
        );
    });

    it('hides WakaTime when unset and asks for a token without one', async () => {
        const kv = createFakeKV();
        const restFetch = fakeFetch((url) => {
            if (url.endsWith('/users/faheem-naeem'))
                return json({
                    login: 'faheem-naeem',
                    followers: 1,
                    public_repos: 0,
                });
            if (url.includes('/repos?')) return json([]);
            return undefined;
        }).fn;
        const env = { METRICS: kv.binding };
        await refresh(env, {
            fetch: restFetch,
            now: () => NOW,
            login: 'faheem-naeem',
        });
        const html = await (await app.request('/', {}, env)).text();
        expect(html).toContain(
            'Connect a token to show the contribution calendar',
        );
        expect(html).not.toContain('id="waka"');
    });

    it('shows a stale label when serving the last good snapshot', async () => {
        const { kv, env } = await seeded();
        kv.store.delete(KEY_CURRENT);
        const html = await (await app.request('/', {}, env)).text();
        expect(html).toContain('<span class="badge">Stale</span>');
    });

    it('labels a section stale after an API failure', async () => {
        const { env } = await seeded();
        await refresh(env, {
            fetch: fakeFetch(() => json({}, 500)).fn,
            now: () => NOW + 1000,
        });
        const html = await (await app.request('/', {}, env)).text();
        expect(html).toMatch(
            /<h2 id="gh">GitHub<span class="badge">Stale<\/span>/,
        );
        expect(html).toContain('class="heat"');
    });

    it('labels old data stale', async () => {
        const { env } = await seeded();
        const { app: late } = createApp({ now: () => NOW + 2 * 86_400_000 });
        const html = await (await late.request('/', {}, env)).text();
        expect(html).toContain('Stale');
    });

    it('renders an empty state before the first cron run', async () => {
        const kv = createFakeKV();
        const html = await (
            await app.request('/', {}, { METRICS: kv.binding })
        ).text();
        expect(html).toContain('No data yet');
    });
});

describe('GET /api/metrics.json', () => {
    it('returns the snapshot', async () => {
        const { env } = await seeded();
        const res = await app.request('/api/metrics.json', {}, env);
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
        const body = (await res.json()) as {
            stale: boolean;
            github: { data: { login: string } };
        };
        expect(body.stale).toBe(false);
        expect(body.github.data.login).toBe('faheem-naeem');
    });

    it('returns 503 with no data', async () => {
        const res = await app.request(
            '/api/metrics.json',
            {},
            { METRICS: createFakeKV().binding },
        );
        expect(res.status).toBe(503);
    });

    it('flags lastgood as stale', async () => {
        const { kv, env } = await seeded();
        kv.store.delete(KEY_CURRENT);
        const body = (await (
            await app.request('/api/metrics.json', {}, env)
        ).json()) as { stale: boolean };
        expect(body.stale).toBe(true);
        expect(kv.store.has(KEY_LASTGOOD)).toBe(true);
    });
});

describe('POST /api/refresh', () => {
    it('does not exist without REFRESH_TOKEN', async () => {
        const res = await app.request(
            '/api/refresh',
            { method: 'POST' },
            { METRICS: createFakeKV().binding },
        );
        expect(res.status).toBe(404);
    });

    it('rejects a missing or wrong token', async () => {
        const env = {
            METRICS: createFakeKV().binding,
            REFRESH_TOKEN: 'secret',
        };
        expect(
            (await app.request('/api/refresh', { method: 'POST' }, env)).status,
        ).toBe(401);
        const wrong = await app.request(
            '/api/refresh',
            { method: 'POST', headers: { 'X-Refresh-Token': 'nope' } },
            env,
        );
        expect(wrong.status).toBe(401);
    });

    it('refreshes with the right token, then enforces a cooldown', async () => {
        const kv = createFakeKV();
        const env = {
            METRICS: kv.binding,
            REFRESH_TOKEN: 'secret',
            GITHUB_TOKEN: 't',
        };
        const init = {
            method: 'POST',
            headers: { 'X-Refresh-Token': 'secret' },
        };
        const res = await app.request('/api/refresh', init, env);
        expect(res.status).toBe(200);
        expect(kv.store.has(KEY_CURRENT)).toBe(true);
        const again = await app.request('/api/refresh', init, env);
        expect(again.status).toBe(429);
        expect(REFRESH_COOLDOWN_MS).toBeGreaterThan(0);
    });

    it('does not answer GET', async () => {
        const env = {
            METRICS: createFakeKV().binding,
            REFRESH_TOKEN: 'secret',
        };
        expect((await app.request('/api/refresh', {}, env)).status).toBe(404);
    });
});
