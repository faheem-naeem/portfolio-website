import { describe, expect, it } from 'vitest';
import { renderMarkdown, slugify, splitSections } from '../src/lib/markdown';

describe('renderMarkdown', () => {
    it('renders basic markdown', () => {
        expect(renderMarkdown('Hello **world**')).toBe(
            '<p>Hello <strong>world</strong></p>\n',
        );
    });

    it('escapes raw HTML blocks and inline tags instead of passing them through', () => {
        const html = renderMarkdown(
            '<script>alert(1)</script>\n\nText <img src=x onerror=alert(1)> end',
        );
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it.each([
        ['NOTE', 'note', 'Note'],
        ['TIP', 'tip', 'Tip'],
        ['WARNING', 'warning', 'Warning'],
    ])('turns > [!%s] into a %s callout', (marker, cls, label) => {
        const html = renderMarkdown(`> [!${marker}]\n> Be careful.`);
        expect(html).toContain(
            `<div class="callout callout--${cls}" role="note" aria-label="${label}">`,
        );
        // Not a landmark: repeated callouts must not trip axe landmark-unique.
        expect(html).not.toContain('<aside');
        expect(html).toContain('<p>Be careful.</p>');
        expect(html).not.toContain('[!');
    });

    it('keeps plain blockquotes', () => {
        expect(renderMarkdown('> quoted')).toContain('<blockquote>');
    });
});

describe('splitSections', () => {
    it('splits on ## headings and keeps the intro', () => {
        const { intro, sections } = splitSections(
            'Intro\n\n## One\n\nA\n\n### Sub\n\nB\n\n## Two\n\nC\n',
        );
        expect(intro).toBe('Intro');
        expect(sections.map((s) => s.heading)).toEqual(['One', 'Two']);
        expect(sections[0]?.markdown).toContain('### Sub');
        expect(sections[1]?.markdown).toBe('C');
    });
});

describe('slugify', () => {
    it('makes kebab-case ids', () => {
        expect(slugify('Working hours & timezone')).toBe(
            'working-hours-and-timezone',
        );
        expect(slugify('  Café — FAQ! ')).toBe('cafe-faq');
    });
});
