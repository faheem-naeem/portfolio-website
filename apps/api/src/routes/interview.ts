import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../env';
import { errorResponse, jsonError } from '../lib/errors';
import { isAllowedPostOrigin } from '../lib/http';
import { notifyInterviewRequest } from '../lib/notify';
import { hashIp, hitRateLimit } from '../lib/rate-limit';
import { verifyTurnstile } from '../lib/turnstile';
import { InterviewRequestBody, InterviewRequestCreated } from '../schemas';

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
        'https://faheemnaeem.dev or a subdomain. Limited to 5 requests per hour per IP.',
    request: {
        body: {
            required: true,
            content: { 'application/json': { schema: InterviewRequestBody } },
        },
    },
    responses: {
        201: {
            description:
                'Stored; a notification email is sent in the background',
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

    app.openapi(route, async (c) => {
        const body = c.req.valid('json');
        const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';

        const rl = await hitRateLimit(
            c.env.DB,
            await hashIp(ip, c.env.IP_HASH_SALT),
            RATE_LIMIT,
        );
        c.header('RateLimit-Limit', String(rl.limit));
        c.header('RateLimit-Remaining', String(rl.remaining));
        if (!rl.allowed) {
            c.header('Retry-After', String(rl.retryAfter));
            return jsonError(
                c,
                429,
                'RATE_LIMITED',
                `Too many interview requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.`,
            );
        }

        const secret = c.env.TURNSTILE_SECRET;
        if (!secret) {
            console.error(
                JSON.stringify({ event: 'turnstile_secret_missing' }),
            );
            return jsonError(
                c,
                503,
                'NOT_CONFIGURED',
                'Interview requests are temporarily unavailable',
            );
        }
        const check = await verifyTurnstile(
            secret,
            body.turnstileToken,
            ip === 'unknown' ? undefined : ip,
        );
        if (!check.success) {
            return jsonError(
                c,
                403,
                'TURNSTILE_FAILED',
                'Bot check failed. Please reload the page and try again.',
            );
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

        // Email failures are logged inside notify and never fail the request.
        const notification = notifyInterviewRequest(c.env, record);
        try {
            c.executionCtx.waitUntil(notification);
        } catch {
            await notification; // no ExecutionContext (e.g. some tests)
        }

        return c.json(
            {
                data: {
                    id: record.id,
                    status: 'received' as const,
                    message:
                        'Thanks! Your request is in. Expect a reply within a few days.',
                },
            },
            201,
        );
    });
}
