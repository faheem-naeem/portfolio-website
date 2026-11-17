import { OpenAPIHono } from '@hono/zod-openapi';
import { getSite } from '@faheem/data';
import { HTTPException } from 'hono/http-exception';
import { etag } from 'hono/etag';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { docsRoutes } from './docs';
import type { AppEnv } from './env';
import { codeForStatus, errorBody } from './lib/errors';
import { cacheControl, cors, securityHeaders } from './lib/http';
import { interviewRoutes } from './routes/interview';
import { resumeRoutes } from './routes/resume';

export function createApp() {
    const app = new OpenAPIHono<AppEnv>({
        // Zod validation failures -> 400 with the shared error shape.
        defaultHook: (result, c) => {
            if (!result.success) {
                const details = result.error.issues.map((i) => ({
                    path: i.path.join('.') || '(root)',
                    message: i.message,
                }));
                return c.json(
                    errorBody(
                        'VALIDATION_ERROR',
                        'Request validation failed',
                        details,
                    ),
                    400,
                );
            }
        },
    });

    app.use('*', securityHeaders());
    app.use('*', cors());
    app.use('*', cacheControl());
    app.use('/v1/*', async (c, next) => {
        // ETag (and 304 on If-None-Match) for GETs only.
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
        return etag()(c, next);
    });

    docsRoutes(app);
    resumeRoutes(app);
    interviewRoutes(app);

    app.doc31('/openapi.json', {
        openapi: '3.1.0',
        info: {
            title: 'faheemnaeem.dev API',
            version: '1.0.0',
            description:
                'Resume data as JSON. GET endpoints are public and CORS-enabled. ' +
                'Errors always look like {"error":{"code","message"}}.',
            license: { name: 'MIT', url: 'https://opensource.org/license/mit' },
        },
        servers: [{ url: getSite('api').url, description: 'Production' }],
        tags: [
            { name: 'Resume' },
            { name: 'Projects' },
            { name: 'Fun' },
            { name: 'Interviews' },
        ],
    });

    app.notFound((c) =>
        c.json(
            errorBody(
                'NOT_FOUND',
                `No route for ${c.req.method} ${new URL(c.req.url).pathname}`,
            ),
            404,
        ),
    );

    app.onError((err, c) => {
        if (err instanceof HTTPException) {
            const status = err.status as ContentfulStatusCode;
            return c.json(
                errorBody(
                    codeForStatus(status),
                    err.message || 'Request failed',
                ),
                status,
            );
        }
        console.error(
            JSON.stringify({
                event: 'unhandled_error',
                path: new URL(c.req.url).pathname,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
        return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong'), 500);
    });

    return app;
}
