import { describe, expect, it } from 'vitest';
import {
    BugsSchema,
    CareerSchema,
    FunFactsSchema,
    IncidentsSchema,
    ManualSchema,
    ProjectsSchema,
    ResumeSchema,
    SitesSchema,
    StatusSchema,
    getBug,
    getBugs,
    getCareer,
    getFunFacts,
    getIncidents,
    getManual,
    getProjects,
    getResume,
    getSite,
    getSites,
    getStatus,
    rawData,
} from '../src/index';

describe('data files match their schemas', () => {
    const cases = [
        ['resume', ResumeSchema, rawData.resume],
        ['projects', ProjectsSchema, rawData.projects],
        ['career', CareerSchema, rawData.career],
        ['status', StatusSchema, rawData.status],
        ['sites', SitesSchema, rawData.sites],
        ['funFacts', FunFactsSchema, rawData.funFacts],
        ['incidents', IncidentsSchema, rawData.incidents],
        ['bugs', BugsSchema, rawData.bugs],
        ['manual', ManualSchema, rawData.manual],
    ] as const;

    it.each(cases)('%s is valid', (_name, schema, raw) => {
        const result = schema.safeParse(raw);
        if (!result.success)
            throw new Error(JSON.stringify(result.error.issues, null, 2));
        expect(result.success).toBe(true);
    });
});

describe('getters', () => {
    it('return typed data', () => {
        expect(getResume().name).toBe('Faheem Naeem');
        expect(getProjects().length).toBeGreaterThan(0);
        expect(getCareer().releases.length).toBeGreaterThan(0);
        expect(getStatus().components.length).toBeGreaterThan(0);
        expect(getFunFacts().length).toBeGreaterThan(0);
        expect(getIncidents().length).toBeGreaterThan(0);
        expect(getManual().body).toContain('## ');
    });

    it('lists every planned site, main domain first', () => {
        const sites = getSites();
        expect(sites).toHaveLength(11);
        expect(getSite('web').url).toBe('https://faheemnaeem.dev');
        expect(getSite('resume').url).toBe('https://resume.faheemnaeem.dev');
    });

    it('sorts bugs newest first and finds by slug', () => {
        const dates = getBugs().map((b) => b.frontmatter.date);
        expect(dates).toEqual([...dates].sort().reverse());
        expect(getBug('retry-storm')?.frontmatter.title).toBeTruthy();
        expect(getBug('nope')).toBeUndefined();
    });

    it('career versions increase with dates', () => {
        const releases = getCareer().releases;
        for (let i = 1; i < releases.length; i++) {
            const prev = releases[i - 1]!;
            const cur = releases[i]!;
            expect(cur.date >= prev.date).toBe(true);
            const cmp = cur.version.split('.').map(Number);
            const prv = prev.version.split('.').map(Number);
            const bigger =
                cmp[0]! - prv[0]! || cmp[1]! - prv[1]! || cmp[2]! - prv[2]!;
            expect(bigger).toBeGreaterThan(0);
        }
    });
});

describe('content safety', () => {
    const all = JSON.stringify(rawData);

    it('publishes a real, valid contact email (and no other email)', () => {
        const email = getResume().links.email;
        expect(email).toMatch(/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/);
        expect(email).not.toMatch(/[<>]/);
        const found = all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
        expect(new Set(found)).toEqual(new Set([email]));
    });

    it('contains no sample or placeholder content', () => {
        expect(getCareer().sample).toBeUndefined();
        expect(getStatus().sample).toBeUndefined();
        expect(getManual().frontmatter.sample).toBeUndefined();
        expect(getBugs().every((b) => b.frontmatter.sample === undefined)).toBe(
            true,
        );
        expect(getResume().skills.every((g) => g.sample === undefined)).toBe(
            true,
        );
        expect(getProjects().every((p) => p.sample === undefined)).toBe(true);
        expect(FunFactsSchema.parse(rawData.funFacts).sample).toBeUndefined();
        expect(IncidentsSchema.parse(rawData.incidents).sample).toBeUndefined();
        expect(all).not.toMatch(/\bSAMPLE\b/);
        expect(all).not.toMatch(/<[A-Z_]+>/);
    });

    it('never claims more years for a skill than the career span', () => {
        const r = getResume();
        for (const g of r.skills)
            for (const s of g.items)
                expect(s.years).toBeLessThanOrEqual(r.yearsOfExperience);
    });
});

describe('schemas reject bad data', () => {
    it('rejects a bug missing a section', () => {
        const bad = [{ ...getBugs()[0]!, body: '## Symptom\n\nOnly this.' }];
        expect(BugsSchema.safeParse(bad).success).toBe(false);
    });

    it('rejects a non-semver release', () => {
        const career = {
            ...getCareer(),
            releases: [{ ...getCareer().releases[0]!, version: 'v1' }],
        };
        expect(CareerSchema.safeParse(career).success).toBe(false);
    });

    it('rejects a site outside faheemnaeem.dev', () => {
        const sites = getSites().map((s, i) =>
            i === 0 ? { ...s, url: 'https://example.com' } : s,
        );
        expect(SitesSchema.safeParse(sites).success).toBe(false);
    });
});
