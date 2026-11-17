import type { Hono } from 'hono';
import { getSite } from '@faheem/data';
import { escapeHtml, layout } from '@faheem/ui';
import type { AppEnv } from './env';

/** Pinned Scalar API Reference build (jsDelivr), verified with SRI. */
export const SCALAR_VERSION = '1.76.4';
export const SCALAR_SCRIPT = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`;
export const SCALAR_SRI =
    'sha384-hwB9WroDTpZaI38gr+u9CXA6ksz5gUYgD2GxXazKl/agT1L2GWUiRFWGJYNiFu4Q';

/**
 * CSP for the docs page: scripts only from this origin (docs.js) and the one
 * pinned Scalar file. Scalar injects <style> tags, so inline styles are allowed.
 */
export const DOCS_CSP = [
    "default-src 'none'",
    `script-src 'self' ${SCALAR_SCRIPT}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join('; ');

const TRY_IT = '/v1/skills?level=expert';

/**
 * Boots Scalar. Served as an external file so the page needs no inline script.
 * Do not mount on id="api-reference": Scalar auto-mounts a default-config
 * instance on that id, which would ignore these options.
 */
export const DOCS_JS = `// Boots the Scalar API reference for api.faheemnaeem.dev.
window.Scalar.createApiReference('#scalar-docs', {
    url: '/openapi.json',
    withDefaultFonts: false,
    hideDarkModeToggle: true,
    hideClientButton: true,
    telemetry: false,
    showDeveloperTools: 'never',
    agent: { disabled: true },
    mcp: { disabled: true },
});
`;

/** Short FNV-1a hash of the boot script, used to cache-bust /docs.js. */
function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
export const DOCS_JS_URL = `/docs.js?v=${fnv1a(DOCS_JS)}`;

const PAGE_CSS = `
.api-intro { max-width: 70ch; }
.try-it { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
  padding: .75rem 1rem; border: 2px solid var(--color-accent, currentColor);
  border-radius: 6px; margin: 1rem 0; }
.try-it code { overflow-wrap: anywhere; }
#scalar-docs { margin-top: 1.5rem; min-height: 60vh; }
`;

export function renderDocsPage(): string {
    const site = getSite('api');
    const body = `
<section class="api-intro" aria-labelledby="api-title">
<h1 id="api-title">${escapeHtml(site.title)}</h1>
<p>${escapeHtml(site.pitch)} Read-only JSON under <code>/v1</code>, CORS-enabled for GET. Spec: <a href="/openapi.json">/openapi.json</a> (OpenAPI 3.1).</p>
<p class="try-it"><strong>Try it:</strong> <a href="${TRY_IT}"><code>GET ${escapeHtml(TRY_IT)}</code></a></p>
<noscript><p>The interactive reference needs JavaScript. The raw spec is at <a href="/openapi.json">/openapi.json</a>.</p></noscript>
</section>
<div id="scalar-docs" aria-label="Interactive API reference"></div>
<script src="${SCALAR_SCRIPT}" integrity="${SCALAR_SRI}" crossorigin="anonymous" defer></script>
<script src="${DOCS_JS_URL}" defer></script>`;
    return layout({
        title: 'API',
        current: 'api',
        description: site.pitch,
        head: `<style>${PAGE_CSS}</style>`,
        body,
    });
}

export function docsRoutes(app: Hono<AppEnv>) {
    app.get('/', (c) => {
        c.header('Content-Security-Policy', DOCS_CSP);
        c.header('Cache-Control', 'public, max-age=300');
        return c.html(renderDocsPage());
    });
    app.get('/docs.js', (c) => {
        c.header('Content-Type', 'text/javascript; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=86400');
        return c.body(DOCS_JS);
    });
}
