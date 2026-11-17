import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { escapeHtml, layout } from '../src/index';
import { baseCss, tokensCss } from '../src/styles';

describe('layout', () => {
    const html = layout({
        title: 'Bugs <script>alert(1)</script> & "co"',
        body: '<p>Hello</p>',
        current: 'bugs',
    });

    it('renders a full document with a lang attribute', () => {
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<html lang="en">');
        expect(layout({ title: 'x', body: '', lang: 'fr' })).toContain(
            '<html lang="fr">',
        );
    });

    it('has a skip link pointing at main', () => {
        expect(html).toMatch(/<a class="skip-link" href="#main">/);
        expect(html).toContain('<main id="main"');
    });

    it('escapes the title', () => {
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain(
            '<title>Bugs &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot; · Faheem Naeem</title>',
        );
    });

    it('marks only the current site with aria-current', () => {
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).toContain(
            '<a href="https://bugs.faheemnaeem.dev" aria-current="page">',
        );
        expect(layout({ title: 'x', body: '' })).not.toContain(
            'aria-current="page"',
        );
    });

    it('links back to the main site and every subdomain', () => {
        expect(html).toContain('href="https://faheemnaeem.dev"');
        for (const sub of [
            'resume',
            'api',
            'status',
            'changelog',
            'manual',
            'a11y',
            'ask',
            'metrics',
        ]) {
            expect(html).toContain(`href="https://${sub}.faheemnaeem.dev"`);
        }
    });

    it('never lists hidden sites (the CTF) in the navigation', () => {
        expect(html).not.toContain('ctf.faheemnaeem.dev');
        const onCtf = layout({ title: 'CTF', body: '', current: 'ctf' });
        expect(onCtf).not.toContain('ctf.faheemnaeem.dev');
        expect(onCtf).not.toContain('aria-current="page"');
    });

    it('inlines the CSS by default and can opt out', () => {
        expect(html).toContain('--color-bg');
        const bare = layout({
            title: 'x',
            body: '',
            inlineCss: false,
            stylesheets: ['/s.css'],
        });
        expect(bare).not.toContain('<style>');
        expect(bare).toContain('<link rel="stylesheet" href="/s.css">');
    });

    it('has header, main and footer landmarks in order', () => {
        const h = html.indexOf('<header');
        const m = html.indexOf('<main');
        const f = html.indexOf('<footer');
        expect(h).toBeGreaterThan(0);
        expect(m).toBeGreaterThan(h);
        expect(f).toBeGreaterThan(m);
    });

    it('can render the body without a main landmark for embedded widgets', () => {
        const page = layout({ title: 'x', body: '<p>hi</p>', mainLandmark: false });
        expect(page).not.toContain('<main');
        expect(page).toContain('<div id="main" class="site-main" tabindex="-1">');
        expect(page).toMatch(/<a class="skip-link" href="#main">/);
    });
});

describe('escapeHtml', () => {
    it('escapes all special characters', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
            '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
        );
    });
});

describe('css', () => {
    const read = (name: string) =>
        readFileSync(
            fileURLToPath(new URL(`../src/${name}`, import.meta.url)),
            'utf8',
        );

    it('TS string exports are in sync with the .css files (run `pnpm --filter @faheem/ui sync-css`)', () => {
        expect(tokensCss).toBe(read('tokens.css'));
        expect(baseCss).toBe(read('base.css'));
    });

    it('defines dark mode, focus-visible, skip link and reduced motion', () => {
        expect(tokensCss).toContain('@media (prefers-color-scheme: dark)');
        expect(baseCss).toContain(':focus-visible');
        expect(baseCss).toContain('.skip-link');
        expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
    });

    // WCAG 2.2 AA: 4.5:1 for normal text.
    const luminance = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => {
            const v = parseInt(hex.slice(i, i + 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
            number,
            number,
        ];
        return (hi + 0.05) / (lo + 0.05);
    };
    const tokensFor = (block: string) =>
        Object.fromEntries(
            [...block.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map(
                (m) => [m[1], m[2]],
            ),
        );
    const [lightBlock, darkBlock] = tokensCss.split(
        '@media (prefers-color-scheme: dark)',
    ) as [string, string];

    it.each([
        ['light', tokensFor(lightBlock)],
        ['dark', { ...tokensFor(lightBlock), ...tokensFor(darkBlock) }],
    ])('%s theme text colours meet 4.5:1', (_theme, t) => {
        const pairs: [string, string][] = [
            ['color-text', 'color-bg'],
            ['color-text', 'color-surface-alt'],
            ['color-muted', 'color-bg'],
            ['color-muted', 'color-surface-alt'],
            ['color-link', 'color-bg'],
            ['color-link', 'color-surface-alt'],
            ['color-accent', 'color-bg'],
            ['color-accent', 'color-surface-alt'],
            ['color-on-accent', 'color-accent'],
        ];
        for (const [fg, bg] of pairs) {
            const ratio = contrast(t[fg]!, t[bg]!);
            expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});
