// resume.faheemnaeem.dev: a curl-able terminal resume with a browser terminal.
import { getResume } from '@faheem/data';
import { allCss } from '@faheem/ui';
import { Hono, type Context } from 'hono';
import { stripAnsi } from './ansi';
import { TERMINAL_CSS, TERMINAL_JS } from './client';
import { isTerminalClient, wantsNoColor } from './detect';
import { renderPage } from './page';
import { renderText, type Section } from './render';

const CACHE_SECONDS = 3600;
const CACHE_CONTROL = `public, max-age=${CACHE_SECONDS}`;

/** Cloudflare Web Analytics: the auto-injected beacon script and its report endpoint. */
export const CF_ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
export const CF_ANALYTICS_CONNECT = 'https://cloudflareinsights.com';

const SECURITY_HEADERS: Record<string, string> = {
    'Content-Security-Policy': `default-src 'none'; script-src 'self' ${CF_ANALYTICS_SCRIPT}; style-src 'self'; img-src 'self' data:; connect-src 'self' ${CF_ANALYTICS_CONNECT}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const app = new Hono();

app.use('*', async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        c.res.headers.set(name, value);
    }
});

/** The Workers edge cache, or null in tests / non-Workers runtimes. */
function edgeCache(): Cache | null {
    const g = globalThis as { caches?: { default?: Cache } };
    return g.caches?.default ?? null;
}

function waitUntil(c: Context, promise: Promise<unknown>): void {
    try {
        c.executionCtx.waitUntil(promise);
    } catch {
        // No execution context (tests): let it run unawaited.
        promise.catch(() => undefined);
    }
}

/**
 * Serves from the edge cache for 1 hour. The key includes the variant (text,
 * plain text, html) because the same URL renders differently per client.
 */
async function cached(
    c: Context,
    variant: string,
    build: () => Response,
): Promise<Response> {
    const cache = edgeCache();
    const url = new URL(c.req.url);
    const key = new Request(`${url.origin}${url.pathname}?variant=${variant}`);
    if (cache) {
        const hit = await cache.match(key);
        if (hit) return new Response(hit.body, hit);
    }
    const res = build();
    res.headers.set('Cache-Control', CACHE_CONTROL);
    res.headers.append('Vary', 'User-Agent, Accept');
    if (cache) waitUntil(c, cache.put(key, res.clone()));
    return res;
}

function resumeRoute(section?: Section) {
    return (c: Context) => {
        if (isTerminalClient(c.req.raw)) {
            const plain = wantsNoColor(c.req.raw);
            return cached(c, plain ? 'plain' : 'ansi', () => {
                const text = renderText(section);
                return new Response(plain ? stripAnsi(text) : text, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            });
        }
        return cached(
            c,
            'html',
            () =>
                new Response(renderPage(section), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                }),
        );
    };
}

app.get('/', resumeRoute());
app.get('/whoami', resumeRoute('whoami'));
app.get('/skills', resumeRoute('skills'));
app.get('/experience', resumeRoute('experience'));
app.get('/projects', resumeRoute('projects'));
app.get('/contact', resumeRoute('contact'));

/** Raw resume data. A "<...>" placeholder email (if ever set) is dropped. */
app.get('/resume.json', (c) =>
    cached(c, 'json', () => {
        const { links, ...rest } = getResume();
        const { email, ...publicLinks } = links;
        const body = {
            ...rest,
            links: /^<.*>$/.test(email) ? publicLinks : links,
        };
        return new Response(JSON.stringify(body, null, 2), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }),
);

// No PDF is published; it is available on request (see `help` / contact).
app.get('/resume.pdf', (c) => c.redirect(getResume().links.website, 302));

app.get('/terminal.js', (c) =>
    cached(
        c,
        'asset',
        () =>
            new Response(TERMINAL_JS, {
                headers: {
                    'Content-Type': 'text/javascript; charset=utf-8',
                },
            }),
    ),
);

app.get('/styles.css', (c) =>
    cached(
        c,
        'asset',
        () =>
            new Response(`${allCss}\n${TERMINAL_CSS}`, {
                headers: { 'Content-Type': 'text/css; charset=utf-8' },
            }),
    ),
);

app.notFound((c) => {
    if (isTerminalClient(c.req.raw)) {
        return c.text('Not found. Try: curl resume.faheemnaeem.dev\n', 404);
    }
    return c.html(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title><link rel="stylesheet" href="/styles.css"></head><body><main id="main" class="site-main"><h1>404</h1><p>Nothing here. <a href="/">Back to the resume</a>.</p></main></body></html>',
        404,
    );
});

export default app;
