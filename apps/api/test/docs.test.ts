import { describe, expect, it } from 'vitest';
import { DOCS_JS_URL, SCALAR_SCRIPT, SCALAR_VERSION } from '../src/docs';
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
        expect(html).toContain('<main id="main"');
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
