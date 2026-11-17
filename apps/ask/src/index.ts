// ask.faheemnaeem.dev: visitors ask about Faheem's experience; Cloudflare
// Workers AI answers from @faheem/data only. Runs at $0 on the Free plan.
import { allCss } from '@faheem/ui';
import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { CHAT_JS } from './client';
import type { Env } from './env';
import {
    MAX_BODY_BYTES,
    normalizeQuestion,
    redactForLog,
    validateRequest,
} from './guard';
import {
    dailyCap,
    logQuestion,
    takeDailySlot,
    takeIpSlot,
    utcDay,
} from './limits';
import { PAGE_CSS, renderPage } from './page';
import { buildMessages, contactLink } from './prompt';
import {
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    createSession,
    devBypassAllowed,
    hashIp,
    sha256Hex,
    verifySession,
    verifyTurnstile,
} from './security';

export type { Env } from './env';

export const MAX_TOKENS = 220;
export const TEMPERATURE = 0.2;

export interface AppOptions {
    /** Clock, injectable so tests use a fixed time. */
    now?: () => number;
    /** fetch used for Turnstile siteverify (mocked in tests). */
    fetch?: typeof fetch;
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    `script-src 'self' ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "connect-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

const COMMON_HEADERS: Record<string, string> = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function busyMessage(): string {
    return `I've answered a lot of questions today — reach Faheem directly: ${contactLink()}`;
}

export function aiErrorMessage(): string {
    return `I can't answer right now — reach Faheem directly: ${contactLink()}`;
}

/** A one-message SSE stream in the same shape as Workers AI output. */
type AppContext = Context<{ Bindings: Env }>;

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
};

// Responses go through `c.body` so headers set on the context (the session
// cookie) are kept.
function sseMessage(c: AppContext, text: string, reason: string): Response {
    const body = `data: ${JSON.stringify({ response: text })}\n\ndata: [DONE]\n\n`;
    return c.body(body, 200, { ...SSE_HEADERS, 'X-Ask-Fallback': reason });
}

function jsonError(
    c: AppContext,
    status: 400 | 403 | 413 | 415 | 429 | 503,
    error: string,
    message: string,
) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error, message }, status);
}

export function createApp(options: AppOptions = {}) {
    const now = options.now ?? (() => Date.now());
    const fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    const app = new Hono<{ Bindings: Env }>();

    app.use('*', async (c, next) => {
        await next();
        for (const [k, v] of Object.entries(COMMON_HEADERS))
            c.res.headers.set(k, v);
        if (c.res.headers.get('content-type')?.startsWith('text/html'))
            c.res.headers.set(
                'Content-Security-Policy',
                CONTENT_SECURITY_POLICY,
            );
    });

    app.get('/', (c) => {
        c.header('Cache-Control', 'public, max-age=300');
        return c.html(renderPage(c.env.TURNSTILE_SITE_KEY));
    });

    app.get('/chat.js', (c) => {
        c.header('Content-Type', 'text/javascript; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=3600');
        return c.body(CHAT_JS);
    });

    app.get('/styles.css', (c) => {
        c.header('Content-Type', 'text/css; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=3600');
        return c.body(`${allCss}\n${PAGE_CSS}`);
    });

    app.post('/api/ask', async (c) => {
        const nowMs = now();
        const env = c.env;

        // 1. Cheap checks first: size, content type, shape, guardrails.
        if (
            !(c.req.header('content-type') ?? '').startsWith('application/json')
        )
            return jsonError(
                c,
                415,
                'invalid_body',
                'Send JSON with Content-Type: application/json.',
            );
        const raw = await c.req.text();
        if (raw.length > MAX_BODY_BYTES)
            return jsonError(c, 413, 'too_large', 'Request is too large.');
        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return jsonError(c, 400, 'invalid_body', 'Invalid JSON.');
        }
        const input = validateRequest(body);
        if (!input.ok) return jsonError(c, 400, input.error, input.message);

        // 2. Turnstile on the first message; a signed cookie covers the rest.
        const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
        if (!env.TURNSTILE_SECRET && !devBypassAllowed(env)) {
            console.error('TURNSTILE_SECRET is not set');
            return jsonError(
                c,
                503,
                'misconfigured',
                `The chat is unavailable right now — reach Faheem directly: ${contactLink()}`,
            );
        }
        const hasSession = await verifySession(
            env,
            getCookie(c, SESSION_COOKIE),
            nowMs,
        );
        let issueSession = false;
        if (!hasSession) {
            if (devBypassAllowed(env)) {
                console.warn(
                    'DEV BYPASS: TURNSTILE_SECRET unset and ENVIRONMENT=development; skipping Turnstile verification',
                );
            } else if (!input.turnstileToken) {
                return jsonError(
                    c,
                    403,
                    'turnstile_required',
                    'Please complete the spam check, then ask again.',
                );
            } else if (
                !(await verifyTurnstile(
                    env,
                    input.turnstileToken,
                    c.req.header('CF-Connecting-IP'),
                    fetchImpl,
                ))
            ) {
                return jsonError(
                    c,
                    403,
                    'turnstile_failed',
                    'The spam check failed. Please try it again.',
                );
            }
            issueSession = true;
        }

        // 3. Per-IP limit (hashed IP, never stored raw) and duplicate spam.
        const ipHash = await hashIp(env, ip, utcDay(nowMs));
        const qHash = await sha256Hex(normalizeQuestion(input.question));
        const ipCheck = await takeIpSlot(env.DB, ipHash, qHash, nowMs);
        if (ipCheck === 'rate_limited')
            return jsonError(
                c,
                429,
                'rate_limited',
                `You've asked a lot this hour. Try again later or reach Faheem directly: ${contactLink()}`,
            );
        if (ipCheck === 'duplicate')
            return jsonError(
                c,
                429,
                'duplicate',
                'You just asked that. Try rephrasing or asking something else.',
            );

        if (issueSession) {
            setCookie(c, SESSION_COOKIE, await createSession(env, nowMs), {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                path: '/api/',
                maxAge: SESSION_TTL_SECONDS,
            });
        }

        const turns = input.history.filter((m) => m.role === 'user').length;
        const logged = redactForLog(input.question);

        // 4. Global daily cap (keeps far below the free Neurons allowance).
        if (!(await takeDailySlot(env.DB, dailyCap(env.DAILY_CAP), nowMs))) {
            await logQuestion(env.DB, logged, turns, 'daily_cap', nowMs);
            return sseMessage(c, busyMessage(), 'daily_cap');
        }

        // 5. Workers AI, streamed straight through as Server-Sent Events.
        let stream: unknown;
        try {
            stream = await env.AI.run(env.AI_MODEL, {
                messages: buildMessages(input.question, input.history),
                max_tokens: MAX_TOKENS,
                temperature: TEMPERATURE,
                stream: true,
            });
        } catch (err) {
            // E.g. the free 10,000 Neurons/day are used up: never an error page.
            console.error('Workers AI failed', err);
            await logQuestion(env.DB, logged, turns, 'ai_error', nowMs);
            return sseMessage(c, aiErrorMessage(), 'ai_error');
        }
        await logQuestion(env.DB, logged, turns, 'answered', nowMs);
        if (!(stream instanceof ReadableStream))
            return sseMessage(c, aiErrorMessage(), 'ai_error');
        return c.body(stream, 200, SSE_HEADERS);
    });

    app.notFound((c) => c.json({ error: 'not_found' }, 404));
    app.onError((err, c) => {
        console.error('ask error', err);
        return c.json(
            {
                error: 'internal',
                message: `Something went wrong — reach Faheem directly: ${contactLink()}`,
            },
            500,
        );
    });

    return app;
}

const app = createApp();

export default {
    fetch: app.fetch,
} satisfies ExportedHandler<Env>;
