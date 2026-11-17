import type { MiddlewareHandler } from 'hono';

/** Origins allowed to POST: the apex site and any direct subdomain. */
const POST_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?faheemnaeem\.dev$/;

export function isAllowedPostOrigin(origin: string | undefined | null) {
    return !!origin && POST_ORIGIN.test(origin);
}

const CORS_MAX_AGE = '86400';

/**
 * CORS: GET/HEAD from any origin; POST only from faheemnaeem.dev and its
 * subdomains. Preflight requests are answered here.
 */
export function cors(): MiddlewareHandler {
    return async (c, next) => {
        const origin = c.req.header('Origin');
        const method = c.req.method;
        if (method === 'OPTIONS') {
            const requested = (
                c.req.header('Access-Control-Request-Method') ?? ''
            ).toUpperCase();
            const headers = new Headers({ Vary: 'Origin' });
            if (requested === 'GET' || requested === 'HEAD') {
                headers.set('Access-Control-Allow-Origin', '*');
                headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
            } else if (requested === 'POST' && isAllowedPostOrigin(origin)) {
                headers.set('Access-Control-Allow-Origin', origin as string);
                headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST');
                headers.set('Access-Control-Allow-Headers', 'Content-Type');
            }
            headers.set('Access-Control-Max-Age', CORS_MAX_AGE);
            return new Response(null, { status: 204, headers });
        }
        await next();
        if (method === 'POST') {
            if (isAllowedPostOrigin(origin)) {
                c.res.headers.set(
                    'Access-Control-Allow-Origin',
                    origin as string,
                );
            }
            c.res.headers.append('Vary', 'Origin');
        } else {
            c.res.headers.set('Access-Control-Allow-Origin', '*');
            c.res.headers.set('Access-Control-Expose-Headers', 'ETag');
        }
    };
}

/** Cloudflare Web Analytics: the auto-injected beacon script and its report endpoint. */
export const CF_ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
export const CF_ANALYTICS_CONNECT = 'https://cloudflareinsights.com';

/** CSP for JSON and plain responses: nothing may load or run. */
export const API_CSP =
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Security headers on every response; HTML routes override the CSP. */
export function securityHeaders(): MiddlewareHandler {
    return async (c, next) => {
        await next();
        const h = c.res.headers;
        if (!h.has('Content-Security-Policy')) {
            h.set('Content-Security-Policy', API_CSP);
        }
        h.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains',
        );
        h.set('X-Content-Type-Options', 'nosniff');
        h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        h.set('X-Frame-Options', 'DENY');
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
    };
}

/** Default Cache-Control for successful GETs (routes may set their own). */
export const DEFAULT_GET_CACHE = 'public, max-age=300, s-maxage=3600';

export function cacheControl(): MiddlewareHandler {
    return async (c, next) => {
        await next();
        const isGet = c.req.method === 'GET' || c.req.method === 'HEAD';
        if (!c.res.headers.has('Cache-Control')) {
            c.res.headers.set(
                'Cache-Control',
                isGet && c.res.status === 200 ? DEFAULT_GET_CACHE : 'no-store',
            );
        }
    };
}
