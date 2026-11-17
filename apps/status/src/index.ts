import { getIncidents, getStatus } from '@faheem/data';
import { allCss } from '@faheem/ui';
import { Hono } from 'hono';
import {
    getTargets,
    handleScheduled,
    loadHistory,
    type Env,
    type Target,
} from './checks';
import { buildModel, type StatusModel } from './model';
import { PAGE_CSS, renderPage } from './render';

export interface AppOptions {
    /** Clock, injectable so tests use a fixed time. */
    now?: () => number;
    targets?: () => Target[];
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

// Both <style> blocks are static, so hash them once per isolate.
let cspPromise: Promise<string> | undefined;
export function contentSecurityPolicy(): Promise<string> {
    cspPromise ??= Promise.all([
        sha256Base64(allCss),
        sha256Base64(PAGE_CSS),
    ]).then(([a, b]) =>
        [
            "default-src 'none'",
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

export function createApp(options: AppOptions = {}) {
    const now = options.now ?? (() => Date.now());
    const targets = options.targets ?? (() => getTargets());
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

    async function model(env: Env): Promise<StatusModel> {
        const nowMs = now();
        const list = targets();
        const { latest, daily } = await loadHistory(env.DB, list, nowMs);
        return buildModel({
            status: getStatus(),
            incidents: getIncidents(),
            targets: list,
            latest,
            daily,
            nowMs,
        });
    }

    app.get('/', async (c) => {
        const html = renderPage(await model(c.env));
        c.header('Cache-Control', 'public, max-age=60');
        return c.html(html);
    });

    app.get('/api/status.json', async (c) => {
        const m = await model(c.env);
        c.header('Cache-Control', 'public, max-age=60');
        c.header('Access-Control-Allow-Origin', '*');
        return c.json(m);
    });

    app.notFound((c) => c.json({ error: 'Not found' }, 404));
    app.onError((err, c) => {
        console.error('status error', err);
        return c.json({ error: 'Internal error' }, 500);
    });

    return app;
}

const app = createApp();

export default {
    fetch: app.fetch,
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(
            handleScheduled(env, controller.scheduledTime).then(
                ({ results, cleaned }) => {
                    const failed = results.filter((r) => !r.ok).length;
                    console.log(
                        `checked ${results.length} url(s), ${failed} failing${cleaned ? ', cleanup done' : ''}`,
                    );
                },
            ),
        );
    },
} satisfies ExportedHandler<Env>;
