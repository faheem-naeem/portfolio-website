// Upstream fetchers (GitHub + WakaTime). Every call goes through a budgeted
// fetch so one cron run stays under the free plan's 50 subrequests.
import type { GithubData, WakatimeData } from './snapshot';
import {
    aggregateLanguages,
    calendarFromGraphql,
    commitsFromGraphql,
    commitsFromRest,
    computeStreaks,
    isoDay,
    newestCommits,
    type GqlCalendar,
    type GqlRecentRepo,
    type RestCommit,
    type WakaStats,
    type WakaSummaries,
    wakatimeFrom,
} from './transform';

export const USER_AGENT = 'faheemnaeem-metrics';
/** Hard cap per cron run (free plan limit is 50). */
export const SUBREQUEST_BUDGET = 45;
/** Repos whose languages are fetched in REST mode (one request each). */
export const MAX_LANGUAGE_REPOS = 30;
/** Recently pushed repos scanned for commits in REST mode. */
export const MAX_COMMIT_REPOS = 3;
const TIMEOUT_MS = 10_000;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class BudgetedFetch {
    used = 0;
    constructor(
        private readonly inner: FetchFn,
        private readonly limit = SUBREQUEST_BUDGET,
    ) {}

    async json<T>(url: string, init: RequestInit = {}): Promise<T> {
        if (this.used >= this.limit)
            throw new Error('subrequest budget exhausted');
        this.used++;
        const res = await this.inner(url, {
            ...init,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
        return (await res.json()) as T;
    }
}

// ---------------------------------------------------------------- GitHub

const GITHUB_QUERY = `query($login:String!){
user(login:$login){
login url
followers{totalCount}
contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}
repositories(first:100,ownerAffiliations:OWNER,privacy:PUBLIC,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){
totalCount
nodes{stargazerCount languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}
}
recent:repositories(first:5,ownerAffiliations:OWNER,privacy:PUBLIC,orderBy:{field:PUSHED_AT,direction:DESC}){
nodes{nameWithOwner defaultBranchRef{target{...on Commit{history(first:10){nodes{messageHeadline committedDate url author{user{login}}}}}}}}
}
}
}`;

interface GqlResponse {
    data?: {
        user: {
            login: string;
            url: string;
            followers: { totalCount: number };
            contributionsCollection: { contributionCalendar: GqlCalendar };
            repositories: {
                totalCount: number;
                nodes: {
                    stargazerCount: number;
                    languages: {
                        edges: { size: number; node: { name: string } }[];
                    };
                }[];
            };
            recent: { nodes: GqlRecentRepo[] };
        } | null;
    };
    errors?: { message: string }[];
}

function githubHeaders(token?: string): Record<string, string> {
    const h: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

export async function fetchGithubGraphql(
    f: BudgetedFetch,
    login: string,
    token: string,
    nowMs: number,
): Promise<GithubData> {
    const res = await f.json<GqlResponse>('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            ...githubHeaders(token),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: GITHUB_QUERY, variables: { login } }),
    });
    const user = res.data?.user;
    if (!user || res.errors?.length)
        throw new Error('GitHub GraphQL returned errors');
    const calendar = calendarFromGraphql(
        user.contributionsCollection.contributionCalendar,
        isoDay(nowMs),
    );
    const repos = user.repositories.nodes;
    return {
        login: user.login,
        profileUrl: `https://github.com/${user.login}`,
        source: 'graphql',
        followers: user.followers.totalCount,
        stars: repos.reduce((a, r) => a + r.stargazerCount, 0),
        publicRepos: user.repositories.totalCount,
        reposScanned: repos.length,
        calendar,
        streaks: calendar ? computeStreaks(calendar) : null,
        languages: aggregateLanguages(
            repos.map((r) => ({
                languages: r.languages.edges.map((e) => ({
                    name: e.node.name,
                    bytes: e.size,
                })),
            })),
        ),
        commits: commitsFromGraphql(user.recent.nodes, user.login),
    };
}

interface RestUser {
    login: string;
    followers: number;
    public_repos: number;
}
interface RestRepo {
    full_name: string;
    fork: boolean;
    stargazers_count: number;
}

/** No token: unauthenticated REST (60 requests/hour per IP), no calendar. */
export async function fetchGithubRest(
    f: BudgetedFetch,
    login: string,
): Promise<GithubData> {
    const base = 'https://api.github.com';
    const headers = githubHeaders();
    const enc = encodeURIComponent(login);
    const [user, allRepos] = await Promise.all([
        f.json<RestUser>(`${base}/users/${enc}`, { headers }),
        f.json<RestRepo[]>(
            `${base}/users/${enc}/repos?type=owner&sort=pushed&per_page=100`,
            { headers },
        ),
    ]);
    const repos = allRepos.filter(
        (r) => !r.fork && /^[\w.-]+\/[\w.-]+$/.test(r.full_name),
    );
    const langRepos = repos.slice(0, MAX_LANGUAGE_REPOS);
    const commitRepos = repos.slice(0, MAX_COMMIT_REPOS);
    const [langs, commitLists] = await Promise.all([
        Promise.allSettled(
            langRepos.map((r) =>
                f.json<Record<string, number>>(
                    `${base}/repos/${r.full_name}/languages`,
                    { headers },
                ),
            ),
        ),
        Promise.allSettled(
            commitRepos.map((r) =>
                f
                    .json<RestCommit[]>(
                        `${base}/repos/${r.full_name}/commits?author=${enc}&per_page=10`,
                        { headers },
                    )
                    .then((list) => commitsFromRest(r.full_name, list)),
            ),
        ),
    ]);
    if (langRepos.length > 0 && langs.every((l) => l.status === 'rejected'))
        throw new Error('GitHub REST language requests failed');
    return {
        login: user.login,
        profileUrl: `https://github.com/${user.login}`,
        source: 'rest',
        followers: user.followers,
        stars: repos.reduce((a, r) => a + r.stargazers_count, 0),
        publicRepos: user.public_repos,
        reposScanned: langRepos.length,
        calendar: null,
        streaks: null,
        languages: aggregateLanguages(
            langs.flatMap((l) =>
                l.status === 'fulfilled'
                    ? [
                          {
                              languages: Object.entries(l.value).map(
                                  ([name, bytes]) => ({ name, bytes }),
                              ),
                          },
                      ]
                    : [],
            ),
        ),
        commits: newestCommits(
            commitLists.flatMap((c) =>
                c.status === 'fulfilled' ? c.value : [],
            ),
        ),
    };
}

// ---------------------------------------------------------------- WakaTime

export async function fetchWakatime(
    f: BudgetedFetch,
    apiKey: string,
): Promise<WakatimeData> {
    const base = 'https://wakatime.com/api/v1/users/current';
    const headers = {
        'User-Agent': USER_AGENT,
        Authorization: `Basic ${btoa(apiKey)}`,
    };
    const [stats, summaries] = await Promise.all([
        f.json<WakaStats>(`${base}/stats/last_7_days`, { headers }),
        f.json<WakaSummaries>(`${base}/summaries?range=last_7_days`, {
            headers,
        }),
    ]);
    return wakatimeFrom(stats, summaries);
}
