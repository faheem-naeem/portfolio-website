import { describe, expect, it } from 'vitest';
import {
    DOCS_CSS_URL,
    DOCS_JS_URL,
    SCALAR_SCRIPT,
    SCALAR_VERSION,
} from '../src/docs';
import { harness } from './helpers';

describe('docs', () => {
    it('serves the docs page with a strict CSP and the try-it banner', async () => {
        const res = await harness().request('/');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/html');
        const csp = res.headers.get('Content-Security-Policy') ?? '';
        expect(csp).toContain(`script-src 'self' ${SCALAR_SCRIPT}`);
        expect(csp).not.toContain("'unsafe-eval'");
        // Cloudflare Web Analytics beacon is allowed.
        expect(csp).toMatch(
            /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/,
        );
        expect(csp).toMatch(
            /connect-src 'self'[^;]* https:\/\/cloudflareinsights\.com/,
        );
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        const html = await res.text();
        expect(html).toContain('Try it:');
        expect(html).toContain('href="/v1/skills?level=expert"');
        expect(html).toContain(`@scalar/api-reference@${SCALAR_VERSION}/`);
        expect(html).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
        // Scalar renders its own <main>, so our wrapper must not be a landmark
        // (axe: landmark-no-duplicate-main, landmark-main-is-top-level).
        expect(html).not.toContain('<main');
        expect(html).toContain('<div id="main" class="site-main"');
        expect(html).toContain(`<link rel="stylesheet" href="${DOCS_CSS_URL}">`);
        expect(html).toContain(`src="${DOCS_JS_URL}"`);
        // Scalar auto-mounts a default-config instance on id="api-reference".
        expect(html).not.toContain('id="api-reference"');
        // No inline scripts: every <script> has a src.
        expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull();
    });

    it('serves the Scalar boot script', async () => {
        const res = await harness().request(DOCS_JS_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('javascript');
        expect(await res.text()).toContain("url: '/openapi.json'");
    });

    it('serves the docs stylesheet with AA-contrast Scalar text colours', async () => {
        const res = await harness().request(DOCS_CSS_URL);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/css');
        const css = await res.text();
        const light = css.match(/\.light-mode\.light-mode \{([^}]*)\}/)?.[1] ?? '';
        const dark = css.match(/\.dark-mode\.dark-mode \{([^}]*)\}/)?.[1] ?? '';
        const lightBgs = ['#ffffff', '#f6f6f6', '#e7e7e7'];
        const darkBgs = ['#0f0f0f', '#1a1a1a', '#272727'];
        for (const [block, bgs] of [
            [light, lightBgs],
            [dark, darkBgs],
        ] as const) {
            for (const name of ['--scalar-color-2', '--scalar-color-3']) {
                const fg = block.match(new RegExp(`${name}: (#[0-9a-f]{6})`))?.[1];
                expect(fg, name).toBeDefined();
                for (const bg of bgs) {
                    expect(contrast(fg as string, bg)).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });

    it('serves an OpenAPI 3.1 document covering every endpoint', async () => {
        const res = await harness().request('/openapi.json');
        expect(res.status).toBe(200);
        const doc = (await res.json()) as {
            openapi: string;
            paths: Record<string, unknown>;
            components: { schemas: Record<string, unknown> };
        };
        expect(doc.openapi).toBe('3.1.0');
        expect(Object.keys(doc.paths).sort()).toEqual(
            [
                '/teapot',
                '/v1/experience',
                '/v1/experience/{index}',
                '/v1/hire-me',
                '/v1/interview-requests',
                '/v1/profile',
                '/v1/projects',
                '/v1/projects/{id}',
                '/v1/random-fact',
                '/v1/skills',
            ].sort(),
        );
        expect(doc.components.schemas).toHaveProperty('InterviewRequest');
        expect(doc.components.schemas).toHaveProperty('Error');
    });
});

/** WCAG 2 contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bl] = [1, 3, 5].map((i) => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
}
