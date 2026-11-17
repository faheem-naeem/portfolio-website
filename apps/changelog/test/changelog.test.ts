import { getCareer, type Career } from '@faheem/data';
import { describe, expect, it } from 'vitest';
import {
    branchFor,
    buildChangelogJson,
    buildReleases,
    classifyNote,
    compareSemver,
    currentRelease,
    formatMonth,
    gitLogLines,
    layoutGraph,
    shortHash,
} from '../src/lib/changelog';
import { buildRssItems } from '../src/lib/feed';

const SITE = 'https://changelog.faheemnaeem.dev';

// The legacy sample flag is still supported by the app; real data never sets it.
const LEGACY_SAMPLE = true;

const fixture: Career = {
    sample: LEGACY_SAMPLE,
    note: 'Legacy sample fixture',
    releases: [
        { version: '1.0.0', date: '2016-12-01', type: 'major', title: 'Graduated: B.S. in CS', notes: ['Initial release.'] },
        { version: '1.10.0', date: '2019-01-01', type: 'minor', title: 'Role B', notes: ['Added things.'] },
        { version: '1.2.0', date: '2018-01-01', type: 'minor', title: 'Role A', notes: ['Patched gaps.'] },
        { version: '1.11.0', date: '2020-01-01', type: 'minor', title: 'M.S. in Data Science', notes: ['Learned.'] },
        { version: '1.11.1', date: '2020-06-01', type: 'patch', title: 'Some Specialization', notes: ['More.'] },
        { version: '2.0.0', date: '2021-01-01', type: 'major', title: 'Role C', notes: ['Breaking change: moved city.', 'Made builds faster.'] },
    ],
};

describe('semver', () => {
    it('compares numerically, not lexically', () => {
        expect(compareSemver('1.10.0', '1.2.0')).toBeGreaterThan(0);
        expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
        expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
    });

    it('sorts newest first and marks only the newest as latest', () => {
        const releases = buildReleases(fixture);
        expect(releases.map((r) => r.version)).toEqual(['2.0.0', '1.11.1', '1.11.0', '1.10.0', '1.2.0', '1.0.0']);
        expect(releases.filter((r) => r.latest).map((r) => r.version)).toEqual(['2.0.0']);
        expect(currentRelease(releases).tag).toBe('v2.0.0');
    });
});

describe('labels', () => {
    it('maps release types to headline labels', () => {
        const byVersion = Object.fromEntries(buildReleases(fixture).map((r) => [r.version, r.label]));
        expect(byVersion['2.0.0']).toBe('BREAKING');
        expect(byVersion['1.10.0']).toBe('feat');
        expect(byVersion['1.11.1']).toBe('fix');
    });

    it('classifies notes and strips the breaking prefix', () => {
        expect(classifyNote('Breaking change: legacy PHP migrated.', 'major')).toEqual({ label: 'BREAKING', text: 'Legacy PHP migrated.' });
        expect(classifyNote('Patched gaps.', 'minor').label).toBe('fix');
        expect(classifyNote('Made builds faster.', 'minor').label).toBe('perf');
        expect(classifyNote('Migrated the CI.', 'minor').label).toBe('chore');
        expect(classifyNote('Added support.', 'minor').label).toBe('feat');
        expect(classifyNote('Something.', 'patch').label).toBe('fix');
    });
});

describe('git log', () => {
    it('produces stable 7-char hex hashes', () => {
        expect(shortHash('a')).toMatch(/^[0-9a-f]{7}$/);
        expect(shortHash('a')).toBe(shortHash('a'));
        expect(shortHash('a')).not.toBe(shortHash('b'));
    });

    it('decorates HEAD on the newest line', () => {
        const lines = gitLogLines(buildReleases(fixture));
        expect(lines[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main, tag: v2\.0\.0\) feat!: Role C$/);
        expect(lines[1]).toContain('(tag: v1.11.1) fix: Some Specialization');
    });

    it('formats months without locale dependence', () => {
        expect(formatMonth('2025-01-01')).toBe('Jan 2025');
        expect(formatMonth('2016-12-01')).toBe('Dec 2016');
    });
});

describe('commit graph', () => {
    it('puts learning milestones on a side branch, except the root', () => {
        const [root] = fixture.releases;
        expect(branchFor(root!, true)).toBe('main');
        expect(branchFor(root!, false)).toBe('learning');
        const branches = Object.fromEntries(buildReleases(fixture).map((r) => [r.version, r.branch]));
        expect(branches).toMatchObject({ '1.0.0': 'main', '1.11.0': 'learning', '1.11.1': 'learning', '2.0.0': 'main' });
    });

    it('draws main trunk, one fork, one chain and one merge for a side run', () => {
        const layout = layoutGraph(buildReleases(fixture));
        expect(layout.nodes).toHaveLength(6);
        expect(layout.edges.filter((e) => e.branch === 'main')).toHaveLength(1);
        expect(layout.edges.filter((e) => e.branch === 'learning')).toHaveLength(3);
        const ys = layout.nodes.map((n) => n.y);
        expect([...ys].sort((a, b) => a - b)).toEqual(ys);
        expect(layout.height).toBeGreaterThan(ys[ys.length - 1]!);
    });
});

describe('feeds', () => {
    it('builds the JSON payload', () => {
        const json = buildChangelogJson(fixture, SITE, 'Test changelog');
        expect(json.currentVersion).toBe('2.0.0');
        expect(json.sample).toBe(true);
        expect(json.homepage).toBe(`${SITE}/`);
        expect(json.releases[0]?.url).toBe(`${SITE}/#v2.0.0`);
        expect(json.releases[0]?.notes[0]).toEqual({ label: 'BREAKING', text: 'Moved city.' });
    });

    it('builds RSS items with UTC dates', () => {
        const items = buildRssItems(fixture, SITE);
        expect(items[0]?.title).toBe('v2.0.0: Role C');
        expect(items[0]?.pubDate.toISOString()).toBe('2021-01-01T00:00:00.000Z');
        expect(items[0]?.description).toContain('perf: Made builds faster.');
    });

    it('works with the real @faheem/data career releases', () => {
        const career = getCareer();
        const json = buildChangelogJson(career, SITE, 'x');
        expect(json.releases).toHaveLength(career.releases.length);
        expect(json.sample).toBe(career.sample === true);
        expect(layoutGraph(buildReleases(career)).nodes).toHaveLength(career.releases.length);
    });
});
