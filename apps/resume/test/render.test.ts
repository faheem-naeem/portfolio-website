import { describe, expect, it } from 'vitest';
import { ansiToHtml, paint, stripAnsi } from '../src/ansi';
import { bannerLines } from '../src/banner';
import { wrap } from '../src/render';

describe('wrap', () => {
    it('wraps to width with hanging indent', () => {
        const lines = wrap('one two three four five six', 12, '  ', '- ');
        expect(lines[0]?.startsWith('- ')).toBe(true);
        for (const l of lines) expect(l.length).toBeLessThanOrEqual(12);
        expect(lines.slice(1).every((l) => l.startsWith('  '))).toBe(true);
    });

    it('hard-breaks words longer than the width', () => {
        const lines = wrap('x'.repeat(30), 10);
        expect(lines).toHaveLength(3);
    });
});

describe('ansi', () => {
    it('strips codes', () => {
        expect(stripAnsi(paint('hi', 'bold', 'cyan'))).toBe('hi');
    });

    it('converts to escaped HTML spans with links', () => {
        const html = ansiToHtml(
            `${paint('<b>', 'bold')} see https://example.com/x.`,
        );
        expect(html).toBe(
            '<span class="t-bold">&lt;b&gt;</span> see <a href="https://example.com/x">https://example.com/x</a>.',
        );
    });
});

describe('banner', () => {
    it('draws the name within 80 columns', () => {
        const lines = bannerLines('Faheem Naeem', 78);
        expect(lines).toHaveLength(5);
        for (const l of lines ?? []) expect([...l].length).toBeLessThanOrEqual(78);
    });

    it('falls back when a glyph is missing or too wide', () => {
        expect(bannerLines('Zoë', 78)).toBeNull();
        expect(bannerLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 78)).toBeNull();
    });
});
