import type { BugEntry } from '@faheem/data';
import { describe, expect, it } from 'vitest';
import {
    extractHook,
    filterExhibits,
    formatDate,
    formatNumber,
    getExhibits,
    getFeatured,
    getFilterOptions,
    getStats,
    slugify,
    toExhibits,
} from '../src/lib/exhibits';

const body = (symptom: string) =>
    `## Symptom\n\n${symptom}\n\nMore detail.\n\n## Investigation\n\nx\n\n## Root cause\n\nx\n\n## Fix\n\nx\n\n## Lesson\n\nx\n`;

const entry = (
    slug: string,
    date: string,
    extra: Partial<BugEntry['frontmatter']> = {},
): BugEntry => ({
    slug,
    frontmatter: {
        title: slug,
        date,
        severity: 'low',
        stack: ['Node.js'],
        tags: ['http'],
        ...extra,
    },
    body: body(`Symptom of ${slug}.`),
});

describe('helpers', () => {
    it('slugifies labels for URLs', () => {
        expect(slugify('Node.js')).toBe('node-js');
        expect(slugify('REST APIs')).toBe('rest-apis');
        expect(slugify('floating-point')).toBe('floating-point');
    });

    it('formats numbers and dates', () => {
        expect(formatNumber(7)).toBe('#007');
        expect(formatDate('2023-08-22')).toBe('22 August 2023');
    });

    it('extracts the first Symptom paragraph as plain text', () => {
        expect(extractHook(body('The `cron` job **never** ran.'))).toBe(
            'The cron job never ran.',
        );
    });
});

describe('toExhibits', () => {
    const exhibits = toExhibits([
        entry('b', '2024-01-01', { severity: 'high', sample: true }),
        entry('a', '2020-01-01', { stack: ['PHP'], tags: ['money'] }),
        entry('c', '2025-01-01', { severity: 'critical' }),
    ]);

    it('sorts newest first and numbers oldest first', () => {
        expect(exhibits.map((e) => [e.slug, e.number])).toEqual([
            ['c', 3],
            ['b', 2],
            ['a', 1],
        ]);
        expect(exhibits[1]?.sample).toBe(true);
        expect(exhibits[0]?.sample).toBe(false);
    });

    it('features the most recent exhibit', () => {
        expect(getFeatured(exhibits)?.slug).toBe('c');
        expect(getFeatured([])).toBeUndefined();
    });

    it('builds filter options with counts', () => {
        expect(getFilterOptions(exhibits, 'stack')).toEqual([
            { kind: 'stack', value: 'node-js', label: 'Node.js', count: 2 },
            { kind: 'stack', value: 'php', label: 'PHP', count: 1 },
        ]);
        expect(
            getFilterOptions(exhibits, 'severity').map((o) => o.value),
        ).toEqual(['low', 'high', 'critical']);
    });

    it('filters by slug', () => {
        expect(
            filterExhibits(exhibits, 'stack', 'node-js').map((e) => e.slug),
        ).toEqual(['c', 'b']);
        expect(filterExhibits(exhibits, 'tag', 'money')).toHaveLength(1);
        expect(filterExhibits(exhibits, 'severity', 'medium')).toHaveLength(0);
    });

    it('computes stats', () => {
        expect(getStats(exhibits)).toEqual({
            captured: 3,
            bySeverity: { low: 1, medium: 0, high: 1, critical: 1 },
            habitats: 2,
        });
    });
});

describe('real data', () => {
    const exhibits = getExhibits();

    it('has exhibits with hooks', () => {
        expect(exhibits.length).toBeGreaterThan(0);
        for (const e of exhibits) expect(e.hook.length).toBeGreaterThan(10);
    });

    it('has no colliding filter slugs', () => {
        for (const kind of ['tag', 'stack', 'severity'] as const) {
            const labels = new Set(
                exhibits.flatMap((e) =>
                    kind === 'tag'
                        ? e.tags
                        : kind === 'stack'
                          ? e.stack
                          : [e.severity],
                ),
            );
            const slugs = new Set([...labels].map(slugify));
            expect(slugs.size).toBe(labels.size);
        }
    });
});
