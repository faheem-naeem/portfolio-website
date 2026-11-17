import { getResume } from '@faheem/data';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { stripAnsi, visibleWidth } from '../src/ansi';
import { TERMINAL_JS } from '../src/client';
import { renderHelp, renderText, SECTIONS } from '../src/render';

const CURL = { 'User-Agent': 'curl/8.7.1' };
const BROWSER = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};
const ROUTES = ['/', '/skills', '/experience', '/projects', '/contact'];
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/;

describe('terminal clients', () => {
    it('curl gets text/plain with ANSI codes', async () => {
        const res = await app.request('/', { headers: CURL });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
        const body = await res.text();
        expect(body).toMatch(ANSI);
        expect(body).toContain('▇');
        expect(body).toContain('EXPERIENCE');
    });

    it.each([
        'Wget/1.21.4',
        'HTTPie/3.2.2',
        'Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.19045; en-US) PowerShell/7.4.1',
    ])('detects %s', async (ua) => {
        const res = await app.request('/', { headers: { 'User-Agent': ua } });
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
    });

    it('Accept: text/plain gets text', async () => {
        const res = await app.request('/', {
            headers: { 'User-Agent': 'something', Accept: 'text/plain' },
        });
        expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
    });

    it.each(['?nocolor', '?NO_COLOR=1', '?no_color'])(
        '%s strips ANSI codes',
        async (q) => {
            const res = await app.request(`/${q}`, { headers: CURL });
            const body = await res.text();
            expect(body).not.toMatch(ANSI);
            expect(body).not.toContain('\x1b');
            expect(body).toContain('SKILLS');
        },
    );

    it.each(ROUTES)('every line of %s fits in 80 columns', async (path) => {
        for (const q of ['', '?nocolor']) {
            const res = await app.request(`${path}${q}`, { headers: CURL });
            const lines = (await res.text()).split('\n');
            for (const line of lines) {
                expect(visibleWidth(line), line).toBeLessThanOrEqual(80);
            }
        }
    });

    it('help text fits in 80 columns', () => {
        for (const line of renderHelp()) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(80);
        }
    });

    it('section routes only contain their section', async () => {
        const res = await app.request('/contact?nocolor', { headers: CURL });
        const body = await res.text();
        expect(body).toContain('CONTACT');
        expect(body).not.toContain('EXPERIENCE');
        expect(body).toContain('https://www.linkedin.com/in/faheem-naeem/');
        expect(body).toContain('https://github.com/faheem-naeem');
    });

    it('shows the real contact email and no placeholders', async () => {
        const email = getResume().links.email;
        expect(email).toMatch(/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/);
        expect(renderText('contact')).toContain(email);
        for (const s of SECTIONS) {
            expect(renderText(s)).not.toMatch(/<[A-Z_]+>/);
        }
        const json = await (await app.request('/resume.json')).text();
        expect(JSON.parse(json).links.email).toBe(email);
        expect(json).not.toMatch(/<[A-Z_]+>/);
    });

    it('nocolor output equals stripped colour output', async () => {
        const color = await (await app.request('/', { headers: CURL })).text();
        const plain = await (
            await app.request('/?nocolor', { headers: CURL })
        ).text();
        expect(plain).toBe(stripAnsi(color));
    });
});

describe('browsers', () => {
    it.each(ROUTES)('%s returns the terminal page', async (path) => {
        const res = await app.request(path, { headers: BROWSER });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
        const html = await res.text();
        expect(html).toContain('Try: <code>curl resume.faheemnaeem.dev</code>');
        expect(html).toContain('role="log"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('<script src="/terminal.js" defer></script>');
        expect(html).not.toMatch(ANSI);
        // No inline executable scripts: only the JSON data block and the external file.
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)];
        for (const m of inline) {
            expect(m[1]).toContain('type="application/json"');
        }
        expect(html).not.toContain('<style');
    });

    it('sets security and cache headers', async () => {
        const res = await app.request('/', { headers: BROWSER });
        const csp = res.headers.get('Content-Security-Policy') ?? '';
        expect(csp).toContain("script-src 'self'");
        expect(csp).not.toContain('unsafe-inline');
        expect(res.headers.get('Strict-Transport-Security')).toMatch(
            /max-age=\d+/,
        );
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Referrer-Policy')).toBe(
            'strict-origin-when-cross-origin',
        );
        expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
        expect(res.headers.get('Vary')).toContain('User-Agent');
    });

    it('serves terminal.js as valid JavaScript', async () => {
        const res = await app.request('/terminal.js');
        expect(res.headers.get('Content-Type')).toMatch(/javascript/);
        const js = await res.text();
        expect(js).toBe(TERMINAL_JS);
        expect(() => new Function(js)).not.toThrow();
        for (const cmd of [
            'help',
            'whoami',
            'skills',
            'experience',
            'projects',
            'contact',
            'clear',
            'theme',
            'exit',
        ]) {
            expect(js).toContain(`'${cmd}'`);
        }
    });

    it('serves styles.css', async () => {
        const res = await app.request('/styles.css');
        expect(res.headers.get('Content-Type')).toMatch(/^text\/css/);
        expect(await res.text()).toContain('.term__output');
    });

    it('help mentions the PDF on request with a contact link', async () => {
        const html = await (
            await app.request('/', { headers: BROWSER })
        ).text();
        const data = /<script type="application\/json" id="resume-data">(.*?)<\/script>/s.exec(
            html,
        );
        expect(data).not.toBeNull();
        const parsed = JSON.parse(data?.[1] ?? '{}') as { help: string };
        expect(parsed.help).toContain('PDF');
        expect(parsed.help).toContain(
            '<a href="https://www.linkedin.com/in/faheem-naeem/">',
        );
    });
});

describe('other routes', () => {
    it('/resume.json returns the raw data', async () => {
        const res = await app.request('/resume.json');
        expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
        const json = (await res.json()) as { name: string; links: object };
        expect(json.name).toBe('Faheem Naeem');
        expect(json.links).toHaveProperty('email', getResume().links.email);
    });

    it('/resume.pdf redirects to the main site', async () => {
        const res = await app.request('/resume.pdf');
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://faheemnaeem.dev');
    });

    it('unknown paths 404 in both modes', async () => {
        const text = await app.request('/nope', { headers: CURL });
        expect(text.status).toBe(404);
        expect(text.headers.get('Content-Type')).toMatch(/^text\/plain/);
        const html = await app.request('/nope', { headers: BROWSER });
        expect(html.status).toBe(404);
        expect(html.headers.get('Content-Type')).toMatch(/^text\/html/);
    });
});
