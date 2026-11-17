import { z } from '@hono/zod-openapi';

const data = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema });
const list = <T extends z.ZodTypeAny>(schema: T) =>
    z.object({
        data: z.array(schema),
        meta: z.object({ count: z.number().int() }),
    });

export const LinksSchema = z
    .object({
        website: z.string().url(),
        linkedin: z.string().url(),
        github: z.string().url().nullable(),
    })
    .openapi('Links');

export const ProfileSchema = z
    .object({
        name: z.string(),
        title: z.string(),
        location: z.string(),
        timezone: z.string(),
        tagline: z.string(),
        summary: z.string(),
        about: z.string(),
        yearsOfExperience: z.number().int(),
        focusAreas: z.array(z.string()),
        links: LinksSchema,
    })
    .openapi('Profile');
export const ProfileResponse = data(ProfileSchema);

export const SkillLevel = z.enum(['expert', 'proficient', 'familiar']);
export const SkillSchema = z
    .object({
        name: z.string().openapi({ example: 'React.js' }),
        group: z.string().openapi({ example: 'Frameworks' }),
        level: SkillLevel,
        years: z.number().int(),
        sample: z.boolean().openapi({
            description: 'true when the level/years are placeholder values',
        }),
    })
    .openapi('Skill');
export const SkillsQuery = z.object({
    level: SkillLevel.optional().openapi({
        param: { name: 'level', in: 'query' },
        example: 'expert',
    }),
    q: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .optional()
        .openapi({
            param: { name: 'q', in: 'query' },
            description: 'Case-insensitive substring match on the skill name',
            example: 'react',
        }),
});
export const SkillsResponse = list(SkillSchema);

export const ExperienceSchema = z
    .object({
        index: z
            .number()
            .int()
            .openapi({ description: '0 = most recent role' }),
        company: z.string(),
        role: z.string(),
        location: z.string(),
        start: z.string().openapi({ example: '2021' }),
        end: z
            .string()
            .nullable()
            .openapi({ description: 'null = current role' }),
        highlights: z.array(z.string()),
        tech: z.array(z.string()),
    })
    .openapi('Experience');
export const ExperienceListResponse = list(ExperienceSchema);
export const ExperienceResponse = data(ExperienceSchema);
export const ExperienceParams = z.object({
    index: z
        .string()
        .regex(/^\d{1,3}$/, 'index must be a non-negative integer')
        .transform(Number)
        .openapi({
            param: { name: 'index', in: 'path' },
            example: '0',
            type: 'integer',
        }),
});

export const ProjectStatus = z.enum(['live', 'archived', 'wip']);
export const ProjectSchema = z
    .object({
        id: z.string().openapi({ example: 'faheemnaeem-dev' }),
        name: z.string(),
        tagline: z.string(),
        description: z.string(),
        tech: z.array(z.string()),
        repoUrl: z.string().url().nullable(),
        liveUrl: z.string().url().nullable(),
        status: ProjectStatus,
        sample: z.boolean(),
    })
    .openapi('Project');
export const ProjectsQuery = z.object({
    status: ProjectStatus.optional().openapi({
        param: { name: 'status', in: 'query' },
        example: 'live',
    }),
    tech: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .optional()
        .openapi({
            param: { name: 'tech', in: 'query' },
            description: 'Case-insensitive exact match on a technology',
            example: 'typescript',
        }),
});
export const ProjectsResponse = list(ProjectSchema);
export const ProjectResponse = data(ProjectSchema);
export const ProjectParams = z.object({
    id: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be lowercase-kebab-case')
        .max(80)
        .openapi({
            param: { name: 'id', in: 'path' },
            example: 'faheemnaeem-dev',
        }),
});

export const FactSchema = z
    .object({ id: z.string(), text: z.string() })
    .openapi('FunFact');
export const FactResponse = data(FactSchema);

export const HireMeResponse = data(
    z
        .object({
            message: z.string(),
            available: z.boolean(),
            nextSteps: z.array(z.string()),
            contact: z.object({
                linkedin: z.string().url(),
                github: z.string().url().nullable(),
                website: z.string().url(),
                interviewRequest: z.string(),
            }),
        })
        .openapi('HireMe'),
);

export const InterviewRequestBody = z
    .object({
        name: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .openapi({ example: 'Ada Lovelace' }),
        company: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .openapi({ example: 'Analytical Engines Ltd' }),
        email: z
            .string()
            .trim()
            .max(254)
            .email()
            .openapi({ example: 'ada@example.com' }),
        role: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .openapi({ example: 'Senior Software Engineer' }),
        message: z
            .string()
            .trim()
            .min(10)
            .max(2000)
            .openapi({
                example: 'We would love to chat about a backend role.',
            }),
        turnstileToken: z.string().min(1).max(2048).openapi({
            description:
                'Cloudflare Turnstile token from the widget on a faheemnaeem.dev page',
        }),
    })
    .strict()
    .openapi('InterviewRequest');
export type InterviewRequestInput = z.infer<typeof InterviewRequestBody>;

export const InterviewRequestCreated = data(
    z
        .object({
            id: z.string().uuid(),
            status: z.literal('received'),
            message: z.string(),
        })
        .openapi('InterviewRequestCreated'),
);
