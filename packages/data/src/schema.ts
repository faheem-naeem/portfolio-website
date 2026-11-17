import { z } from 'zod';

/** "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
const partialDate = z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Expected YYYY, YYYY-MM or YYYY-MM-DD');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoDateTime = z.string().datetime({ offset: true });
const httpsUrl = z.string().url().startsWith('https://');
const slug = z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected a lowercase-kebab-case id');
/** Legacy marker for placeholder content. Launch data must never set it. */
const sample = z.boolean().optional();

export const SkillLevelSchema = z.enum(['expert', 'proficient', 'familiar']);

export const ResumeSchema = z
    .object({
        name: z.string().min(1),
        title: z.string().min(1),
        location: z.string().min(1),
        timezone: z.string().min(1),
        tagline: z.string().min(1),
        summary: z.string().min(1),
        about: z.string().min(1),
        yearsOfExperience: z.number().int().positive(),
        focusAreas: z.array(z.string().min(1)),
        links: z
            .object({
                website: httpsUrl,
                linkedin: httpsUrl,
                github: httpsUrl.nullable(),
                // Public contact address (already published on the main site).
                email: z.string().email(),
            })
            .strict(),
        skills: z.array(
            z
                .object({
                    group: z.string().min(1),
                    sample,
                    items: z
                        .array(
                            z
                                .object({
                                    name: z.string().min(1),
                                    level: SkillLevelSchema,
                                    years: z.number().int().nonnegative(),
                                })
                                .strict(),
                        )
                        .min(1),
                })
                .strict(),
        ),
        experience: z
            .array(
                z
                    .object({
                        company: z.string().min(1),
                        role: z.string().min(1),
                        location: z.string().min(1),
                        start: partialDate,
                        end: partialDate.nullable(),
                        highlights: z.array(z.string().min(1)).min(1),
                        tech: z.array(z.string().min(1)),
                    })
                    .strict()
                    .refine(
                        (e) => e.end === null || e.end >= e.start,
                        'end must not be before start',
                    ),
            )
            .min(1),
        selectedWork: z.array(
            z
                .object({
                    category: z.string().min(1),
                    title: z.string().min(1),
                    description: z.string().min(1),
                    tech: z.array(z.string().min(1)),
                })
                .strict(),
        ),
        education: z.array(
            z
                .object({
                    degree: z.string().min(1),
                    institution: z.string().min(1),
                    start: partialDate,
                    end: partialDate.nullable(),
                    note: z.string().optional(),
                })
                .strict(),
        ),
        certifications: z.array(
            z
                .object({
                    name: z.string().min(1),
                    issuer: z.string().min(1),
                    year: z.string().regex(/^\d{4}$/),
                })
                .strict(),
        ),
    })
    .strict();

export const ProjectSchema = z
    .object({
        id: slug,
        name: z.string().min(1),
        tagline: z.string().min(1),
        description: z.string().min(1),
        tech: z.array(z.string().min(1)).min(1),
        repoUrl: httpsUrl.nullable(),
        liveUrl: httpsUrl.nullable(),
        status: z.enum(['live', 'archived', 'wip']),
        healthcheckUrl: httpsUrl.optional(),
        sample,
    })
    .strict();
export const ProjectsSchema = z
    .array(ProjectSchema)
    .refine(
        (list) => new Set(list.map((p) => p.id)).size === list.length,
        'project ids must be unique',
    );

export const ReleaseSchema = z
    .object({
        version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Expected semver'),
        date: isoDate,
        type: z.enum(['major', 'minor', 'patch']),
        title: z.string().min(1),
        notes: z.array(z.string().min(1)).min(1),
    })
    .strict();
export const CareerSchema = z
    .object({
        sample,
        note: z.string().optional(),
        releases: z.array(ReleaseSchema).min(1),
    })
    .strict();

export const StatusStateSchema = z.enum([
    'operational',
    'degraded',
    'outage',
    'maintenance',
]);
export const StatusSchema = z
    .object({
        sample,
        components: z
            .array(
                z
                    .object({
                        name: z.string().min(1),
                        state: StatusStateSchema,
                        message: z.string().min(1),
                    })
                    .strict(),
            )
            .min(1),
    })
    .strict();

export const SiteIdSchema = z.enum([
    'web',
    'resume',
    'api',
    'status',
    'bugs',
    'changelog',
    'manual',
    'a11y',
    'ask',
    'ctf',
    'metrics',
]);
export const SiteSchema = z
    .object({
        id: SiteIdSchema,
        url: httpsUrl.regex(
            /^https:\/\/([a-z0-9]+\.)?faheemnaeem\.dev$/,
            'Expected a faheemnaeem.dev origin',
        ),
        title: z.string().min(1),
        pitch: z.string().min(1),
        kind: z.enum(['static', 'worker']),
        /** Hidden sites (e.g. the CTF puzzle) are left out of shared navigation. */
        hidden: z.boolean().optional(),
    })
    .strict();
export const SitesSchema = z
    .array(SiteSchema)
    .refine(
        (list) => new Set(list.map((s) => s.id)).size === list.length,
        'site ids must be unique',
    )
    .refine(
        (list) =>
            SiteIdSchema.options.every((id) => list.some((s) => s.id === id)),
        'every site id must be listed',
    );

export const FunFactsSchema = z
    .object({
        sample,
        facts: z
            .array(z.object({ id: slug, text: z.string().min(1) }).strict())
            .min(1),
    })
    .strict();

export const IncidentSchema = z
    .object({
        id: slug,
        title: z.string().min(1),
        component: z.string().min(1),
        severity: z.enum(['minor', 'major', 'critical']),
        startedAt: isoDateTime,
        resolvedAt: isoDateTime.nullable(),
        summary: z.string().min(1),
        updates: z
            .array(
                z
                    .object({ at: isoDateTime, message: z.string().min(1) })
                    .strict(),
            )
            .min(1),
    })
    .strict();
export const IncidentsSchema = z
    .object({
        sample,
        incidents: z.array(IncidentSchema),
    })
    .strict();

/** Required "## Heading" sections of a bug museum entry, in order. */
export const BUG_SECTIONS = [
    'Symptom',
    'Investigation',
    'Root cause',
    'Fix',
    'Lesson',
] as const;

const markdownWithSections = (sections: readonly string[]) =>
    z
        .string()
        .min(1)
        .superRefine((body, ctx) => {
            const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) =>
                m[1]?.trim(),
            );
            const missing = sections.filter((s) => !headings.includes(s));
            if (missing.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `missing sections: ${missing.join(', ')}`,
                });
                return;
            }
            const order = sections.map((s) => headings.indexOf(s));
            if (order.some((v, i) => i > 0 && v < (order[i - 1] ?? -1))) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `sections must be in order: ${sections.join(', ')}`,
                });
            }
        });

export const BugFrontmatterSchema = z
    .object({
        title: z.string().min(1),
        date: isoDate,
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        stack: z.array(z.string().min(1)).min(1),
        tags: z.array(z.string().min(1)),
        sample,
    })
    .strict();
export const BugEntrySchema = z
    .object({
        slug,
        frontmatter: BugFrontmatterSchema,
        body: markdownWithSections(BUG_SECTIONS),
    })
    .strict();
export const BugsSchema = z
    .array(BugEntrySchema)
    .refine(
        (list) => new Set(list.map((b) => b.slug)).size === list.length,
        'bug slugs must be unique',
    );

export const ManualSchema = z
    .object({
        frontmatter: z
            .object({ title: z.string().min(1), updated: isoDate, sample })
            .strict(),
        body: z
            .string()
            .min(1)
            .regex(/^## /m, 'manual needs at least one ## section'),
    })
    .strict();

export type SkillLevel = z.infer<typeof SkillLevelSchema>;
export type Resume = z.infer<typeof ResumeSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
export type Career = z.infer<typeof CareerSchema>;
export type StatusState = z.infer<typeof StatusStateSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type SiteId = z.infer<typeof SiteIdSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type FunFacts = z.infer<typeof FunFactsSchema>;
export type FunFact = FunFacts['facts'][number];
export type Incident = z.infer<typeof IncidentSchema>;
export type BugFrontmatter = z.infer<typeof BugFrontmatterSchema>;
export type BugEntry = z.infer<typeof BugEntrySchema>;
export type Manual = z.infer<typeof ManualSchema>;
/** Authoring types for the TS content modules (validated at load time). */
export type BugEntryInput = z.input<typeof BugEntrySchema>;
export type ManualInput = z.input<typeof ManualSchema>;
