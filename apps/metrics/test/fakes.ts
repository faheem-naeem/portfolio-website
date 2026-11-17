// Hand-made in-memory KV and fetch fakes.
export function createFakeKV() {
    const store = new Map<string, string>();
    const puts: string[] = [];
    const binding = {
        async get(key: string) {
            return store.get(key) ?? null;
        },
        async put(key: string, value: string) {
            puts.push(key);
            store.set(key, value);
        },
    } as unknown as KVNamespace;
    return { store, puts, binding };
}

export type Route = (
    url: string,
    init?: RequestInit,
) => Response | Promise<Response> | undefined;

/** Fake fetch: first matching route wins; unmatched URLs return 404. */
export function fakeFetch(...routes: Route[]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fn = async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        for (const r of routes) {
            const res = await r(url, init);
            if (res) return res;
        }
        return new Response('not found', { status: 404 });
    };
    return { fn, calls };
}

export const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

// 2026-11-17 14:20 UTC (a Tuesday).
export const NOW = Date.UTC(2026, 10, 17, 14, 20);

/** GraphQL calendar fixture: 3 weeks ending on NOW's week (padded future days). */
export function gqlCalendar() {
    const days: {
        date: string;
        contributionCount: number;
        contributionLevel: string;
    }[] = [];
    const start = Date.UTC(2026, 10, 1); // Sunday
    const counts = [
        0, 2, 3, 0, 1, 1, 1, 1, 0, 5, 0, 4, 4, 4, 0, 0, 2, 7, 0, 0, 0,
    ];
    counts.forEach((c, i) => {
        days.push({
            date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
            contributionCount: c,
            contributionLevel:
                c === 0 ? 'NONE' : c > 4 ? 'FOURTH_QUARTILE' : 'FIRST_QUARTILE',
        });
    });
    return {
        totalContributions: 35,
        weeks: [0, 1, 2].map((w) => ({
            contributionDays: days.slice(w * 7, w * 7 + 7),
        })),
    };
}

export function gqlResponse() {
    return {
        data: {
            user: {
                login: 'faheem-naeem',
                url: 'https://github.com/faheem-naeem',
                followers: { totalCount: 12 },
                contributionsCollection: {
                    contributionCalendar: gqlCalendar(),
                },
                repositories: {
                    totalCount: 2,
                    nodes: [
                        {
                            stargazerCount: 5,
                            languages: {
                                edges: [
                                    { size: 700, node: { name: 'TypeScript' } },
                                    { size: 100, node: { name: 'CSS' } },
                                ],
                            },
                        },
                        {
                            stargazerCount: 2,
                            languages: {
                                edges: [
                                    { size: 200, node: { name: 'Python' } },
                                ],
                            },
                        },
                    ],
                },
                recent: {
                    nodes: [
                        {
                            nameWithOwner: 'faheem-naeem/site',
                            defaultBranchRef: {
                                target: {
                                    history: {
                                        nodes: [
                                            {
                                                messageHeadline:
                                                    'Add <metrics> page',
                                                committedDate:
                                                    '2026-11-17T10:00:00Z',
                                                url: 'https://github.com/faheem-naeem/site/commit/a1',
                                                author: {
                                                    user: {
                                                        login: 'faheem-naeem',
                                                    },
                                                },
                                            },
                                            {
                                                messageHeadline: 'Bot bump',
                                                committedDate:
                                                    '2026-11-17T11:00:00Z',
                                                url: 'https://github.com/faheem-naeem/site/commit/b2',
                                                author: {
                                                    user: {
                                                        login: 'dependabot',
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                        {
                            nameWithOwner: 'faheem-naeem/empty',
                            defaultBranchRef: null,
                        },
                    ],
                },
            },
        },
    };
}

export const wakaStats = {
    data: {
        total_seconds: 36000,
        languages: [
            { name: 'TypeScript', total_seconds: 27000 },
            { name: 'Markdown', total_seconds: 9000 },
        ],
        editors: [{ name: 'VS Code', total_seconds: 36000 }],
    },
};

export const wakaSummaries = {
    data: Array.from({ length: 7 }, (_, i) => ({
        range: {
            date: new Date(Date.UTC(2026, 10, 11 + i))
                .toISOString()
                .slice(0, 10),
        },
        grand_total: { total_seconds: (i + 1) * 1800 },
    })),
};
