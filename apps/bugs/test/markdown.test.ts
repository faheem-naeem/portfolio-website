import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';

describe('renderMarkdown', () => {
    it('renders exhibit sections as h2', async () => {
        const html = await renderMarkdown('## Symptom\n\nIt broke.\n');
        expect(html).toMatch(/<h2[^>]*>Symptom<\/h2>/);
        expect(html).toContain('<p>It broke.</p>');
    });

    it('highlights code blocks at build time', async () => {
        const html = await renderMarkdown(
            '```ts\nconst cents: number = 199;\n```\n',
        );
        expect(html).toContain('class="astro-code');
        expect(html).toContain('--shiki-dark');
    });

    it('supports before/after diff blocks', async () => {
        const html = await renderMarkdown(
            '```diff\n- total = price * qty\n+ totalCents = priceCents * qty\n```\n',
        );
        expect(html).toContain('data-language="diff"');
        expect(html).toContain('totalCents');
    });
});
