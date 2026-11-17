import { getManual, getResume, type Manual } from '@faheem/data';
import { describe, expect, it } from 'vitest';
import { SECTION_PLAN } from '../src/content';
import { buildSections, supportLinks } from '../src/lib/manual';

describe('buildSections (real data)', () => {
    const sections = buildSections();

    it('renders the spec sections in order', () => {
        const ids = sections.map((s) => s.id);
        const expected = [
            'quick-start',
            'communication',
            'working-hours',
            'feedback',
            'great-at',
            'known-bugs',
            'faq',
            'support',
        ];
        const positions = expected.map((id) => ids.indexOf(id));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it('has unique ids', () => {
        const ids = sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('puts the live clock on the working hours section only', () => {
        expect(sections.filter((s) => s.clock).map((s) => s.id)).toEqual([
            'working-hours',
        ]);
    });

    it('does not drop data sections that are not in the plan', () => {
        expect(sections.some((s) => s.title === 'What I value')).toBe(true);
    });

    it('renders focus areas from resume data', () => {
        const great = sections.find((s) => s.id === 'great-at');
        for (const area of getResume().focusAreas) {
            expect(great?.html).toContain(area.replace(/&/g, '&amp;'));
        }
    });

    it('uses the manual body from @faheem/data', () => {
        const comm = sections.find((s) => s.id === 'communication');
        const firstLine = getManual()
            .body.split('## Communication')[1]
            ?.trim()
            .split('\n')[0];
        expect(firstLine).toBeTruthy();
        expect(comm?.html).toContain(firstLine?.slice(0, 20));
    });
});

describe('buildSections (custom data)', () => {
    const manual: Manual = {
        frontmatter: { title: 'T', updated: '2026-01-01' },
        body: '## Communication\n\n<b>x</b>\n\n## Extra\n\nMore\n',
    };

    it('escapes raw HTML from the data body', () => {
        const comm = buildSections(manual).find((s) => s.id === 'communication');
        expect(comm?.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('keeps the clock section even when its data heading is missing', () => {
        const ids = buildSections(manual).map((s) => s.id);
        expect(ids).toContain('working-hours');
        expect(ids).toContain('extra');
        expect(ids).not.toContain('feedback');
    });

    it('accepts a custom plan', () => {
        const plan = SECTION_PLAN.filter((p) => p.id === 'support');
        expect(buildSections(manual, getResume(), plan).map((s) => s.id)).toEqual([
            'support',
        ]);
    });
});

describe('supportLinks', () => {
    it('never exposes the email placeholder and uses https links', () => {
        const links = supportLinks(getResume());
        expect(links.length).toBeGreaterThan(2);
        for (const l of links) {
            expect(l.href.startsWith('https://')).toBe(true);
            expect(l.href).not.toContain('EMAIL');
        }
    });
});
