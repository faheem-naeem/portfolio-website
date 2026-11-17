import { describe, expect, it } from 'vitest';
import {
    aggregateLanguages,
    calendarFromGraphql,
    cleanMessage,
    commitsFromGraphql,
    commitsFromRest,
    computeStreaks,
    formatHours,
    loginFromUrl,
    newestCommits,
    wakatimeFrom,
} from '../src/transform';
import { gqlCalendar, gqlResponse, wakaStats, wakaSummaries } from './fakes';

describe('loginFromUrl', () => {
    it('takes the first path segment of a github.com URL', () => {
        expect(loginFromUrl('https://github.com/faheem-naeem', 'x')).toBe(
            'faheem-naeem',
        );
        expect(loginFromUrl('https://github.com/faheem-naeem/repo', 'x')).toBe(
            'faheem-naeem',
        );
    });
    it('falls back for missing or foreign URLs', () => {
        expect(loginFromUrl(null, 'fb')).toBe('fb');
        expect(loginFromUrl('https://gitlab.com/someone', 'fb')).toBe('fb');
        expect(loginFromUrl('not a url', 'fb')).toBe('fb');
    });
});

describe('calendarFromGraphql', () => {
    it('flattens weeks and drops padded future days', () => {
        const cal = calendarFromGraphql(gqlCalendar(), '2026-11-17');
        expect(cal?.start).toBe('2026-11-01');
        expect(cal?.counts).toHaveLength(17);
        expect(cal?.counts.at(-1)).toBe(2);
        expect(cal?.levels[9]).toBe(4);
        expect(cal?.total).toBe(35);
    });
    it('fills gaps with zero and returns null when empty', () => {
        const cal = calendarFromGraphql(
            {
                totalContributions: 2,
                weeks: [
                    {
                        contributionDays: [
                            { date: '2026-01-01', contributionCount: 1 },
                            { date: '2026-01-03', contributionCount: 1 },
                        ],
                    },
                ],
            },
            '2026-12-31',
        );
        expect(cal?.counts).toEqual([1, 0, 1]);
        expect(cal?.levels).toEqual([1, 0, 1]);
        expect(
            calendarFromGraphql(
                { totalContributions: 0, weeks: [] },
                '2026-01-01',
            ),
        ).toBeNull();
    });
});

describe('computeStreaks', () => {
    const cal = (counts: number[]) => ({
        start: '2026-01-01',
        counts,
        levels: counts,
        total: 0,
    });
    it('counts the current streak ending today', () => {
        expect(computeStreaks(cal([1, 0, 1, 1, 1]))).toEqual({
            current: 3,
            longest: 3,
        });
    });
    it('does not break the streak when today is still empty', () => {
        expect(computeStreaks(cal([1, 1, 0, 2, 2, 0]))).toEqual({
            current: 2,
            longest: 2,
        });
    });
    it('is zero after a missed day', () => {
        expect(computeStreaks(cal([1, 1, 1, 1, 0, 0]))).toEqual({
            current: 0,
            longest: 4,
        });
    });
});

describe('aggregateLanguages', () => {
    it('sums bytes across repos with one-decimal percentages', () => {
        const out = aggregateLanguages([
            {
                languages: [
                    { name: 'TypeScript', bytes: 600 },
                    { name: 'CSS', bytes: 100 },
                ],
            },
            {
                languages: [
                    { name: 'TypeScript', bytes: 100 },
                    { name: 'Python', bytes: 200 },
                ],
            },
        ]);
        expect(out.map((l) => [l.name, l.percent])).toEqual([
            ['TypeScript', 70],
            ['Python', 20],
            ['CSS', 10],
        ]);
    });
    it('folds the tail into Other', () => {
        const repos = [
            {
                languages: 'abcdefgh'
                    .split('')
                    .map((n, i) => ({ name: n, bytes: 100 - i })),
            },
        ];
        const out = aggregateLanguages(repos, 6);
        expect(out).toHaveLength(7);
        expect(out.at(-1)).toMatchObject({ name: 'Other', bytes: 93 + 94 });
    });
    it('returns [] with no bytes', () => {
        expect(
            aggregateLanguages([{ languages: [{ name: 'Go', bytes: 0 }] }]),
        ).toEqual([]);
    });
});

describe('commits', () => {
    it('keeps only the owner commits from GraphQL history', () => {
        const repos = gqlResponse().data.user.recent.nodes;
        const out = commitsFromGraphql(repos, 'Faheem-Naeem');
        expect(out).toEqual([
            {
                repo: 'faheem-naeem/site',
                message: 'Add <metrics> page',
                url: 'https://github.com/faheem-naeem/site/commit/a1',
                date: '2026-11-17T10:00:00Z',
            },
        ]);
    });
    it('maps REST commits and keeps the first line only', () => {
        const out = commitsFromRest('o/r', [
            {
                html_url: 'javascript:alert(1)',
                commit: {
                    message: 'Fix bug\n\nlong body',
                    author: { date: '2026-11-01T00:00:00Z' },
                },
            },
        ]);
        expect(out[0]).toEqual({
            repo: 'o/r',
            message: 'Fix bug',
            url: '',
            date: '2026-11-01T00:00:00Z',
        });
    });
    it('sorts newest first, dedupes and caps at 10', () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            repo: 'r',
            message: `m${i}`,
            url: `https://github.com/r/${i}`,
            date: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        }));
        const out = newestCommits([...many, many[11]!]);
        expect(out).toHaveLength(10);
        expect(out[0]?.message).toBe('m11');
    });
    it('truncates long messages', () => {
        expect(cleanMessage('x'.repeat(200))).toHaveLength(120);
    });
});

describe('wakatimeFrom', () => {
    it('builds days, languages and editors', () => {
        const w = wakatimeFrom(wakaStats, wakaSummaries);
        expect(w.totalSeconds).toBe(36000);
        expect(w.days).toHaveLength(7);
        expect(w.days[6]).toEqual({ date: '2026-11-17', seconds: 12600 });
        expect(w.languages).toEqual([
            { name: 'TypeScript', seconds: 27000, percent: 75 },
            { name: 'Markdown', seconds: 9000, percent: 25 },
        ]);
        expect(w.editors[0]?.percent).toBe(100);
    });
});

describe('formatHours', () => {
    it('formats minutes and hours', () => {
        expect(formatHours(300)).toBe('5 min');
        expect(formatHours(3600)).toBe('1 h');
        expect(formatHours(5400)).toBe('1 h 30 min');
    });
});
