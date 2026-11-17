// Public entry point of @faheem/data. Runtime code here must stay free of
// Node-only APIs (no fs/path): consumers are Cloudflare Workers and Astro.
import { bugEntries } from './bugs/index';
import careerJson from './career.json';
import funFactsJson from './fun-facts.json';
import incidentsJson from './incidents.json';
import { manual as manualModule } from './manual';
import projectsJson from './projects.json';
import resumeJson from './resume.json';
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
    type BugEntry,
    type Career,
    type FunFact,
    type Incident,
    type Manual,
    type Project,
    type Resume,
    type Site,
    type SiteId,
    type Status,
} from './schema';
import sitesJson from './sites.json';
import statusJson from './status.json';

export * from './schema';

/** Raw (unvalidated) inputs, exported so tests can validate them. */
export const rawData = {
    resume: resumeJson as unknown,
    projects: projectsJson as unknown,
    career: careerJson as unknown,
    status: statusJson as unknown,
    sites: sitesJson as unknown,
    funFacts: funFactsJson as unknown,
    incidents: incidentsJson as unknown,
    bugs: bugEntries as unknown,
    manual: manualModule as unknown,
};

// Parse lazily and memoise so importing the package is cheap in a Worker.
function memo<T>(fn: () => T): () => T {
    let value: T | undefined;
    let done = false;
    return () => {
        if (!done) {
            value = fn();
            done = true;
        }
        return value as T;
    };
}

export const getResume: () => Resume = memo(() =>
    ResumeSchema.parse(rawData.resume),
);
export const getProjects: () => Project[] = memo(() =>
    ProjectsSchema.parse(rawData.projects),
);
export const getCareer: () => Career = memo(() =>
    CareerSchema.parse(rawData.career),
);
export const getStatus: () => Status = memo(() =>
    StatusSchema.parse(rawData.status),
);
export const getSites: () => Site[] = memo(() =>
    SitesSchema.parse(rawData.sites),
);
export const getFunFacts: () => FunFact[] = memo(
    () => FunFactsSchema.parse(rawData.funFacts).facts,
);
export const getIncidents: () => Incident[] = memo(
    () => IncidentsSchema.parse(rawData.incidents).incidents,
);
/** Bug museum entries, newest first. */
export const getBugs: () => BugEntry[] = memo(() =>
    [...BugsSchema.parse(rawData.bugs)].sort((a, b) =>
        b.frontmatter.date.localeCompare(a.frontmatter.date),
    ),
);
export const getManual: () => Manual = memo(() =>
    ManualSchema.parse(rawData.manual),
);

export function getSite(id: SiteId): Site {
    const site = getSites().find((s) => s.id === id);
    if (!site) throw new Error(`Unknown site id: ${id}`);
    return site;
}

export function getBug(slug: string): BugEntry | undefined {
    return getBugs().find((b) => b.slug === slug);
}
