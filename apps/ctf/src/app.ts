import { getResume } from '@faheem/data';
import { allCss } from '@faheem/ui';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { CTF_CSS, CTF_JS } from './assets';
import type { AppEnv } from './env';
import { verifyFlag } from './lib/crypto';
import { validateName } from './lib/name';
import { hashIp, hitRateLimit } from './lib/rate-limit';
import {
    renderHome,
    renderNotFound,
    renderSuccess,
    type HallEntry,
} from './render';

export const RATE_LIMIT = { limit: 10, windowSeconds: 3600 };
export const FLAG_MAX = 200;

/** Cloudflare Web Analytics: the auto-injected beacon script and its report endpoint. */
export const CF_ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
export const CF_ANALYTICS_CONNECT = 'https://cloudflareinsights.com';

export const HTML_CSP = [
    "default-src 'none'",
    `script-src 'self' ${CF_ANALYTICS_SCRIPT}`,
    "style-src 'self'",
    "img-src 'self'",
    `connect-src 'self' ${CF_ANALYTICS_CONNECT}`,
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
].join('; ');

const PLAIN_CSP = "default-src 'none'; frame-ancestors 'none'";

const ASSET_CACHE = 'public, max-age=3600';

export interface AppOptions {
    /** Clock, injectable so tests use a fixed time. */
    now?: () => number;
}

interface Submission {
    flag: unknown;
    name: unknown;
}

type Ctx = Context<AppEnv>;

function wantsJson(c: Ctx): boolean {
    return (c.req.header('Content-Type') ?? '').includes('application/json');
}

async function readSubmission(c: Ctx): Promise<Submission | null> {
    const type = c.req.header('Content-Type') ?? '';
    try {
        if (type.includes('application/json')) {
            const body = (await c.req.json()) as unknown;
            if (!body || typeof body !== 'object') return null;
            const { flag, name } = body as Record<string, unknown>;
            return { flag, name };
        }
        if (
            type.includes('application/x-www-form-urlencoded') ||
            type.includes('multipart/form-data')
        ) {
            const body = await c.req.parseBody();
            return { flag: body.flag, name: body.name };
        }
    } catch {
        return null;
    }
    return null;
}

async function loadHall(db: D1Database): Promise<HallEntry[]> {
    const { results } = await db
        .prepare(
            `SELECT display_name, created_at FROM hall_of_fame
             WHERE approved = 1 ORDER BY created_at ASC LIMIT 100`,
        )
        .all<HallEntry>();
    return results ?? [];
}

export function createApp(options: AppOptions = {}) {
    const now = options.now ?? (() => Date.now());
    const app = new Hono<AppEnv>();

    // Security headers on every response.
    app.use('*', async (c, next) => {
        await next();
        const h = c.res.headers;
        const isHtml = (h.get('Content-Type') ?? '').startsWith('text/html');
        h.set('Content-Security-Policy', isHtml ? HTML_CSP : PLAIN_CSP);
        h.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains',
        );
        h.set('X-Content-Type-Options', 'nosniff');
        h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        h.set('X-Frame-Options', 'DENY');
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        if (!h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
    });

    app.get('/assets/ui.css', (c) => {
        c.header('Content-Type', 'text/css; charset=utf-8');
        c.header('Cache-Control', ASSET_CACHE);
        return c.body(allCss);
    });
    app.get('/assets/ctf.css', (c) => {
        c.header('Content-Type', 'text/css; charset=utf-8');
        c.header('Cache-Control', ASSET_CACHE);
        return c.body(CTF_CSS);
    });
    app.get('/assets/ctf.js', (c) => {
        c.header('Content-Type', 'text/javascript; charset=utf-8');
        c.header('Cache-Control', ASSET_CACHE);
        return c.body(CTF_JS);
    });
    app.get('/robots.txt', (c) => c.text('User-agent: *\nAllow: /\n'));

    app.get('/', async (c) => {
        c.header('Cache-Control', 'public, max-age=60');
        return c.html(renderHome(await loadHall(c.env.DB)));
    });

    app.post(
        '/submit',
        bodyLimit({
            maxSize: 4 * 1024,
            onError: (c) =>
                c.json(
                    {
                        ok: false,
                        error: {
                            code: 'PAYLOAD_TOO_LARGE',
                            message: 'Request body is too large.',
                        },
                    },
                    413,
                ),
        }),
        async (c) => {
            const json = wantsJson(c);
            const sub = await readSubmission(c);

            // Input errors: answered before the rate limit so they reveal
            // nothing about the flag and do not cost an attempt.
            const fail = async (
                status: 400 | 415 | 429 | 503,
                code: string,
                message: string,
                form?: { flag?: string; name?: string },
            ) => {
                if (json)
                    return c.json(
                        { ok: false, error: { code, message } },
                        status,
                    );
                return c.html(
                    renderHome(await loadHall(c.env.DB), {
                        error: message,
                        ...form,
                    }),
                    status,
                );
            };

            if (!sub) {
                return fail(
                    415,
                    'UNSUPPORTED_MEDIA_TYPE',
                    'Send JSON or a form with a "flag" field.',
                );
            }
            const flag = typeof sub.flag === 'string' ? sub.flag.trim() : '';
            const rawName = typeof sub.name === 'string' ? sub.name : '';
            if (!flag || flag.length > FLAG_MAX) {
                return fail(400, 'VALIDATION_ERROR', 'Please enter a flag.', {
                    name: rawName,
                });
            }
            const name = validateName(sub.name);
            if (!name.ok) {
                return fail(400, 'INVALID_NAME', name.message, { flag });
            }
            if (!c.env.FLAG_HASH) {
                return fail(
                    503,
                    'NOT_CONFIGURED',
                    'The hunt is not open yet. Please try again later.',
                );
            }

            const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
            const key = await hashIp(ip, c.env.IP_HASH_SALT ?? '');
            const limit = await hitRateLimit(c.env.DB, key, {
                ...RATE_LIMIT,
                now: now(),
            });
            if (!limit.allowed) {
                c.header('Retry-After', String(limit.retryAfter));
                return fail(
                    429,
                    'RATE_LIMITED',
                    `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
                );
            }

            if (!(await verifyFlag(flag, c.env.FLAG_HASH))) {
                return fail(
                    400,
                    'WRONG_FLAG',
                    `That is not the flag. ${limit.remaining} attempts left this hour.`,
                    {
                        flag,
                        name: name.name ?? '',
                    },
                );
            }

            await c.env.DB.prepare(
                'INSERT INTO hall_of_fame (id, display_name, created_at, approved) VALUES (?1, ?2, ?3, 0)',
            )
                .bind(
                    crypto.randomUUID(),
                    name.name,
                    new Date(now()).toISOString(),
                )
                .run();

            const contactUrl = c.env.CONTACT_URL || getResume().links.linkedin;
            if (json) {
                return c.json({
                    ok: true,
                    message: "Correct! You'd fit right in. Let's talk.",
                    contact: contactUrl,
                    hallOfFame: name.name ? 'pending_review' : 'anonymous',
                });
            }
            return c.html(renderSuccess({ name: name.name, contactUrl }));
        },
    );

    app.notFound((c) => c.html(renderNotFound(), 404));

    app.onError((err, c) => {
        console.error(
            JSON.stringify({
                event: 'unhandled_error',
                path: new URL(c.req.url).pathname,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
        return c.text('Something went wrong', 500);
    });

    return app;
}
