import { allCss } from '@faheem/ui';
import { Hono } from 'hono';
import { refresh, type RefreshDeps } from './refresh';
import { PAGE_CSS, renderPage } from './render';
import { readSnapshot, type Env } from './snapshot';
import type { FetchFn } from './sources';

/** Minimum gap between manual refreshes (protects the KV write budget). */
export const REFRESH_COOLDOWN_MS = 5 * 60_000;

export interface AppOptions {
    now?: () => number;
    fetch?: FetchFn;
}

async function sha256Base64(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
    );
    let bin = '';
    for (const byte of new Uint8Array(digest)) bin += String.fromCharCode(byte);
    return btoa(bin);
}

/** Cloudflare Web Analytics: the auto-injected beacon script and its report endpoint. */
export const CF_ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
export const CF_ANALYTICS_CONNECT = 'https://cloudflareinsights.com';

let cspPromise: Promise<string> | undefined;
export function contentSecurityPolicy(): Promise<string> {
    cspPromise ??= Promise.all([
        sha256Base64(allCss),
        sha256Base64(PAGE_CSS),
    ]).then(([a, b]) =>
        [
            "default-src 'none'",
            `script-src ${CF_ANALYTICS_SCRIPT}`,
            `connect-src 'self' ${CF_ANALYTICS_CONNECT}`,
            `style-src 'sha256-${a}' 'sha256-${b}'`,
            "img-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        ].join('; '),
    );
    return cspPromise;
}

const COMMON_HEADERS: Record<string, string> = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Constant-time string comparison (both sides hashed to equal length first). */
async function safeEqual(a: string, b: string): Promise<boolean> {
    const [ha, hb] = await Promise.all(
        [a, b].map(
            async (s) =>
                new Uint8Array(
                    await crypto.subtle.digest(
                        'SHA-256',
                        new TextEncoder().encode(s),
                    ),
                ),
        ),
    );
    let diff = 0;
    for (let i = 0; i < 32; i++) diff |= (ha?.[i] ?? 0) ^ (hb?.[i] ?? 0);
    return diff === 0;
}

export function createApp(options: AppOptions = {}) {
    const now = options.now ?? (() => Date.now());
    const deps = (): RefreshDeps => ({
        fetch: options.fetch ?? ((i, init) => fetch(i, init)),
        now,
    });
    const app = new Hono<{ Bindings: Env }>();

    app.use('*', async (c, next) => {
        await next();
        for (const [k, v] of Object.entries(COMMON_HEADERS))
            c.res.headers.set(k, v);
        if (c.res.headers.get('content-type')?.startsWith('text/html'))
            c.res.headers.set(
                'Content-Security-Policy',
                await contentSecurityPolicy(),
            );
    });

    app.get('/', async (c) => {
        const { snapshot, fromLastGood } = await readSnapshot(c.env.METRICS);
        c.header('Cache-Control', 'public, max-age=300');
        return c.html(renderPage({ snapshot, fromLastGood, nowMs: now() }));
    });

    app.get('/api/metrics.json', async (c) => {
        const { snapshot, fromLastGood } = await readSnapshot(c.env.METRICS);
        c.header('Cache-Control', 'public, max-age=300');
        c.header('Access-Control-Allow-Origin', '*');
        if (!snapshot) return c.json({ error: 'No data yet' }, 503);
        return c.json({
            ...snapshot,
            stale:
                fromLastGood ||
                [snapshot.github, snapshot.wakatime].some((s) => s?.stale),
        });
    });

    // Manual refresh: only exists when REFRESH_TOKEN is set, and requires it
    // in the X-Refresh-Token header.
    app.post('/api/refresh', async (c) => {
        const secret = c.env.REFRESH_TOKEN?.trim();
        if (!secret) return c.json({ error: 'Not found' }, 404);
        const given = c.req.header('X-Refresh-Token') ?? '';
        if (!given || !(await safeEqual(given, secret)))
            return c.json({ error: 'Unauthorized' }, 401);
        const { snapshot } = await readSnapshot(c.env.METRICS);
        if (
            snapshot &&
            now() - Date.parse(snapshot.generatedAt) < REFRESH_COOLDOWN_MS
        )
            return c.json(
                { error: 'Refreshed recently, try again later' },
                429,
            );
        const result = await refresh(c.env, deps());
        return c.json({
            generatedAt: result.snapshot.generatedAt,
            errors: result.snapshot.errors,
            subrequests: result.subrequests,
        });
    });

    app.notFound((c) => c.json({ error: 'Not found' }, 404));
    app.onError((err, c) => {
        console.error('metrics error', err);
        return c.json({ error: 'Internal error' }, 500);
    });

    return { app, deps };
}

const { app, deps } = createApp();

export default {
    fetch: app.fetch,
    async scheduled(_controller, env, ctx) {
        ctx.waitUntil(
            refresh(env, deps()).then(({ snapshot, subrequests }) => {
                console.log(
                    `metrics refreshed: ${subrequests} subrequest(s), errors: ${snapshot.errors.join('; ') || 'none'}`,
                );
            }),
        );
    },
} satisfies ExportedHandler<Env>;
