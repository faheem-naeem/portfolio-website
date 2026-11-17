import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { getFunFacts, getProjects, getResume } from '@faheem/data';
import type { AppEnv } from '../env';
import { errorResponse, jsonError } from '../lib/errors';
import {
    ExperienceListResponse,
    ExperienceParams,
    ExperienceResponse,
    FactResponse,
    HireMeResponse,
    ProfileResponse,
    ProjectParams,
    ProjectResponse,
    ProjectsQuery,
    ProjectsResponse,
    SkillsQuery,
    SkillsResponse,
} from '../schemas';

const json = <T>(schema: T, description: string) => ({
    description,
    content: { 'application/json': { schema } },
});

function experienceList() {
    return getResume().experience.map((e, index) => ({
        index,
        company: e.company,
        role: e.role,
        location: e.location,
        start: e.start,
        end: e.end,
        highlights: e.highlights,
        tech: e.tech,
    }));
}

function projectList() {
    return getProjects().map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        tech: p.tech,
        repoUrl: p.repoUrl,
        liveUrl: p.liveUrl,
        status: p.status,
        sample: p.sample === true,
    }));
}

export function resumeRoutes(app: OpenAPIHono<AppEnv>) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/profile',
            tags: ['Resume'],
            summary: 'Profile summary and public links',
            responses: { 200: json(ProfileResponse, 'Profile') },
        }),
        (c) => {
            const r = getResume();
            return c.json(
                {
                    data: {
                        name: r.name,
                        title: r.title,
                        location: r.location,
                        timezone: r.timezone,
                        tagline: r.tagline,
                        summary: r.summary,
                        about: r.about,
                        yearsOfExperience: r.yearsOfExperience,
                        focusAreas: r.focusAreas,
                        links: {
                            website: r.links.website,
                            linkedin: r.links.linkedin,
                            github: r.links.github,
                        },
                    },
                },
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/skills',
            tags: ['Resume'],
            summary: 'Skills, optionally filtered by level and name',
            request: { query: SkillsQuery },
            responses: {
                200: json(SkillsResponse, 'Matching skills'),
                400: errorResponse('Invalid query parameters'),
            },
        }),
        (c) => {
            const { level, q } = c.req.valid('query');
            const needle = q?.toLowerCase();
            const items = getResume()
                .skills.flatMap((g) =>
                    g.items.map((s) => ({
                        name: s.name,
                        group: g.group,
                        level: s.level,
                        years: s.years,
                        sample: g.sample === true,
                    })),
                )
                .filter((s) => !level || s.level === level)
                .filter(
                    (s) => !needle || s.name.toLowerCase().includes(needle),
                );
            return c.json({ data: items, meta: { count: items.length } }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/experience',
            tags: ['Resume'],
            summary: 'Work history, most recent first',
            responses: { 200: json(ExperienceListResponse, 'All roles') },
        }),
        (c) => {
            const items = experienceList();
            return c.json({ data: items, meta: { count: items.length } }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/experience/{index}',
            tags: ['Resume'],
            summary: 'One role by index (0 = most recent)',
            request: { params: ExperienceParams },
            responses: {
                200: json(ExperienceResponse, 'The role'),
                400: errorResponse('Index is not a non-negative integer'),
                404: errorResponse('No role at that index'),
            },
        }),
        (c) => {
            const { index } = c.req.valid('param');
            const item = experienceList()[index];
            if (!item) {
                return jsonError(
                    c,
                    404,
                    'NOT_FOUND',
                    `No experience at index ${index}`,
                );
            }
            return c.json({ data: item }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/projects',
            tags: ['Projects'],
            summary: 'Projects, optionally filtered by status and technology',
            request: { query: ProjectsQuery },
            responses: {
                200: json(ProjectsResponse, 'Matching projects'),
                400: errorResponse('Invalid query parameters'),
            },
        }),
        (c) => {
            const { status, tech } = c.req.valid('query');
            const needle = tech?.toLowerCase();
            const items = projectList()
                .filter((p) => !status || p.status === status)
                .filter(
                    (p) =>
                        !needle ||
                        p.tech.some((t) => t.toLowerCase() === needle),
                );
            return c.json({ data: items, meta: { count: items.length } }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/projects/{id}',
            tags: ['Projects'],
            summary: 'One project by id',
            request: { params: ProjectParams },
            responses: {
                200: json(ProjectResponse, 'The project'),
                400: errorResponse('Malformed id'),
                404: errorResponse('Unknown project'),
            },
        }),
        (c) => {
            const { id } = c.req.valid('param');
            const project = projectList().find((p) => p.id === id);
            if (!project) {
                return jsonError(
                    c,
                    404,
                    'NOT_FOUND',
                    `No project with id "${id}"`,
                );
            }
            return c.json({ data: project }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/random-fact',
            tags: ['Fun'],
            summary: 'A random fun fact (not cached)',
            responses: { 200: json(FactResponse, 'A fun fact') },
        }),
        (c) => {
            const facts = getFunFacts();
            const fact =
                facts[Math.floor(Math.random() * facts.length)] ?? facts[0]!;
            c.header('Cache-Control', 'no-store');
            return c.json({ data: { id: fact.id, text: fact.text } }, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/v1/hire-me',
            tags: ['Fun'],
            summary: 'How to hire me',
            responses: {
                200: json(HireMeResponse, 'Contact details and next steps'),
            },
        }),
        (c) => {
            const { name, links } = getResume();
            const first = name.split(' ')[0] ?? name;
            return c.json(
                {
                    data: {
                        message: `200 OK: ${first} is accepting interview requests. No 418s here (that is /teapot).`,
                        available: true,
                        nextSteps: [
                            'Send an interview request: https://api.faheemnaeem.dev/contact',
                            'Say hello on LinkedIn or by email',
                            'Browse the code on GitHub',
                            'POST /v1/interview-requests from a faheemnaeem.dev page',
                        ],
                        contact: {
                            email: links.email,
                            linkedin: links.linkedin,
                            github: links.github,
                            website: links.website,
                            interviewRequest: '/v1/interview-requests',
                            contactForm: '/contact',
                        },
                    },
                },
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/teapot',
            tags: ['Fun'],
            summary: "418 I'm a teapot",
            responses: { 418: errorResponse("I'm a teapot") },
        }),
        (c) =>
            jsonError(
                c,
                418,
                'IM_A_TEAPOT',
                "I'm a teapot. I can't brew coffee, but I can serve JSON.",
            ),
    );
}
