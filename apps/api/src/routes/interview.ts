import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../env';
import { errorResponse, jsonError } from '../lib/errors';
import { isAllowedPostOrigin } from '../lib/http';
import { notifyInterviewRequest } from '../lib/notify';
import { hashIp, hitRateLimit } from '../lib/rate-limit';
import { verifyTurnstile } from '../lib/turnstile';
import {
    InterviewRequestBody,
    InterviewRequestCreated,
    type InterviewRequestInput,
} from '../schemas';
import { CONTACT_CSP, renderContactResult } from './contact';

export const INTERVIEW_PATH = '/v1/interview-requests';
export const RATE_LIMIT = { limit: 5, windowSeconds: 3600 } as const;
const MAX_BODY_BYTES = 16 * 1024;

const route = createRoute({
    method: 'post',
    path: INTERVIEW_PATH,
    tags: ['Interviews'],
    summary: 'Request an interview',
    description:
        'Browser-only: requires a Cloudflare Turnstile token and an Origin of ' +
        'https://faheemnaeem.dev or a subdomain. Limited to 5 requests per hour per IP. ' +
        'The no-JS form at /contact may also POST application/x-www-form-urlencoded ' +
        '(field cf-turnstile-response) and receives an HTML page.',
    request: {
        body: {
            required: true,
            content: { 'application/json': { schema: InterviewRequestBody } },
        },
    },
    responses: {
        201: {
            description:
                'Stored (a form-encoded POST gets an HTML thank-you page instead)',
            content: {
                'application/json': { schema: InterviewRequestCreated },
            },
        },
        400: errorResponse('Invalid body'),
        403: errorResponse('Origin not allowed or Turnstile check failed'),
        413: errorResponse('Body larger than 16 KB'),
        429: errorResponse('Too many requests (5 per hour per IP)'),
        503: errorResponse('Server not configured'),
    },
});

export function interviewRoutes(app: OpenAPIHono<AppEnv>) {
    // Runs before body validation, so blocked origins never reach Zod/D1.
    app.post(INTERVIEW_PATH, async (c, next) => {
        const origin = c.req.header('Origin');
        if (origin !== undefined && !isAllowedPostOrigin(origin)) {
            return jsonError(
                c,
                403,
                'FORBIDDEN_ORIGIN',
                'POST is only allowed from faheemnaeem.dev pages',
            );
        }
        await next();
    });
    app.post(
        INTERVIEW_PATH,
        bodyLimit({
            maxSize: MAX_BODY_BYTES,
            onError: (c) =>
                jsonError(
                    c,
                    413,
                    'PAYLOAD_TOO_LARGE',
                    'Body must be at most 16 KB',
                ),
        }),
    );

    // No-JS fallback: the /contact form posts application/x-www-form-urlencoded
    // here and gets an HTML page back. JSON requests fall through to the route.
    app.post(INTERVIEW_PATH, async (c, next) => {
        const type = (c.req.header('Content-Type') ?? '').toLowerCase();
        if (!type.startsWith('application/x-www-form-urlencoded')) {
            return next();
        }
        return handleFormSubmission(c);
    });

    app.openapi(route, async (c) => {
        const result = await processInterviewRequest(c, c.req.valid('json'));
        if (!result.ok) {
            if (result.retryAfter !== undefined) {
                c.header('Retry-After', String(result.retryAfter));
            }
            return jsonError(c, result.status, result.code, result.message);
        }
        return c.json(
            {
                data: {
                    id: result.id,
                    status: 'received' as const,
                    message: SUCCESS_MESSAGE,
                },
            },
            201,
        );
    });
}

export const SUCCESS_MESSAGE =
    'Thanks! Your request is in. Expect a reply within a few days.';

export type ProcessResult =
    | { ok: true; id: string }
    | {
          ok: false;
          status: 403 | 429 | 503;
          code: string;
          message: string;
          retryAfter?: number;
      };

/**
 * Shared pipeline for JSON and form submissions (body already validated):
 * rate limit, Turnstile, D1 insert, optional email notification.
 */
export async function processInterviewRequest(
    c: Context<AppEnv>,
    body: InterviewRequestInput,
): Promise<ProcessResult> {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';

    const rl = await hitRateLimit(
        c.env.DB,
        await hashIp(ip, c.env.IP_HASH_SALT),
        RATE_LIMIT,
    );
    c.header('RateLimit-Limit', String(rl.limit));
    c.header('RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
        return {
            ok: false,
            status: 429,
            code: 'RATE_LIMITED',
            message: `Too many interview requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.`,
            retryAfter: rl.retryAfter,
        };
    }

    const secret = c.env.TURNSTILE_SECRET;
    if (!secret) {
        console.error(JSON.stringify({ event: 'turnstile_secret_missing' }));
        return {
            ok: false,
            status: 503,
            code: 'NOT_CONFIGURED',
            message: 'Interview requests are temporarily unavailable',
        };
    }
    const check = await verifyTurnstile(
        secret,
        body.turnstileToken,
        ip === 'unknown' ? undefined : ip,
    );
    if (!check.success) {
        return {
            ok: false,
            status: 403,
            code: 'TURNSTILE_FAILED',
            message: 'Bot check failed. Please reload the page and try again.',
        };
    }

    const record = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name: body.name,
        company: body.company,
        email: body.email,
        role: body.role,
        message: body.message,
    };
    await c.env.DB.prepare(
        `INSERT INTO interview_requests (id, created_at, name, company, email, role, message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
        .bind(
            record.id,
            record.createdAt,
            record.name,
            record.company,
            record.email,
            record.role,
            record.message,
        )
        .run();

    // Optional: skipped when no SEND_EMAIL binding is configured. Failures
    // are logged inside notify and never fail the request.
    const notification = notifyInterviewRequest(c.env, record);
    try {
        c.executionCtx.waitUntil(notification);
    } catch {
        await notification; // no ExecutionContext (e.g. some tests)
    }
    return { ok: true, id: record.id };
}

/** Handles a form-encoded POST from the no-JS /contact form; returns HTML. */
async function handleFormSubmission(c: Context<AppEnv>): Promise<Response> {
    const form = await c.req.parseBody();
    const field = (name: string) => {
        const v = form[name];
        return typeof v === 'string' ? v : '';
    };
    const parsed = InterviewRequestBody.safeParse({
        name: field('name'),
        company: field('company'),
        email: field('email'),
        role: field('role'),
        message: field('message'),
        // The Turnstile widget adds this hidden field to the form.
        turnstileToken: field('cf-turnstile-response') || field('turnstileToken'),
    });
    c.header('Content-Security-Policy', CONTACT_CSP);
    c.header('Cache-Control', 'no-store');
    if (!parsed.success) {
        const problems = parsed.error.issues.map((i) =>
            describeIssue(String(i.path[0] ?? '')),
        );
        return c.html(
            renderContactResult({
                ok: false,
                message: `Please check the form: ${[...new Set(problems)].join(' ')}`,
            }),
            400,
        );
    }
    const result = await processInterviewRequest(c, parsed.data);
    if (!result.ok) {
        if (result.retryAfter !== undefined) {
            c.header('Retry-After', String(result.retryAfter));
        }
        return c.html(
            renderContactResult({ ok: false, message: result.message }),
            result.status,
        );
    }
    return c.html(renderContactResult({ ok: true, message: SUCCESS_MESSAGE }), 201);
}

function describeIssue(field: string): string {
    switch (field) {
        case 'email':
            return 'Enter a valid email address.';
        case 'message':
            return 'The message needs 10 to 2,000 characters.';
        case 'turnstileToken':
            return 'Complete the bot check (it needs JavaScript).';
        default:
            return 'Name, company and role are required (up to 100 characters each).';
    }
}
