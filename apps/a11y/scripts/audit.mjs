#!/usr/bin/env node
// Accessibility + Lighthouse audit for every faheemnaeem.dev site.
//
// Plain Node ESM, run by .github/workflows/a11y-audit.yml (weekly + manual).
//
// Heavy dependencies (playwright, @axe-core/playwright, lighthouse) are NOT in
// apps/a11y/package.json on purpose: they would slow down every Cloudflare
// build install. The workflow installs them into a temporary directory and
// passes it as AUDIT_DEPS_DIR; this script resolves them from there.
//
// Usage:
//   AUDIT_DEPS_DIR=/tmp/audit-deps node apps/a11y/scripts/audit.mjs [--sites web,bugs] [--out dir] [--date YYYY-MM-DD]
//
// An unreachable site (DNS failure, timeout, non-2xx) is recorded as
// "not-deployed" in the report. That is expected while subdomains are being
// built, so it never fails the run. Only a fatal problem (for example the
// browser cannot start) exits non-zero.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCHEMA_VERSION = 1;

/** Viewports checked with axe-core. 360px is the narrowest width every app must support. */
export const VIEWPORTS = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 360, height: 740 },
];

/** Both colour schemes, because every app has a dark mode. */
export const COLOR_SCHEMES = ['light', 'dark'];

/** axe-core rule tags: WCAG 2.0, 2.1 and 2.2 at levels A and AA, plus axe best practices. */
export const AXE_TAGS = [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
];

export const LIGHTHOUSE_CATEGORIES = [
    'performance',
    'accessibility',
    'best-practices',
    'seo',
];

/** Lighthouse is run through npx with a pinned major version. */
export const LIGHTHOUSE_PACKAGE = 'lighthouse@12';

export const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

const REACH_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 60_000;
const LIGHTHOUSE_TIMEOUT_MS = 240_000;
const MAX_TARGETS = 5;

/** UTC calendar date used for the report file name. */
export function reportDate(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

/** Turns axe tags such as "wcag143" or "wcag1410" into WCAG criteria ("1.4.3", "1.4.10"). */
export function wcagCriteria(tags) {
    const out = new Set();
    for (const tag of tags ?? []) {
        const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
        if (match) out.add(`${match[1]}.${match[2]}.${match[3]}`);
    }
    return [...out].sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true }),
    );
}

/** WCAG conformance level of an axe rule from its tags, or null for best practices. */
export function wcagLevel(tags) {
    const list = tags ?? [];
    if (list.some((t) => /^wcag2\d?a$/.test(t))) return 'A';
    if (list.some((t) => /^wcag2\d?aa$/.test(t))) return 'AA';
    if (list.some((t) => /^wcag2\d?aaa$/.test(t))) return 'AAA';
    return null;
}

function normaliseImpact(impact) {
    return IMPACTS.includes(impact) ? impact : 'minor';
}

/**
 * Merges the axe results of every viewport/colour-scheme run into one list,
 * so a rule that fails in all four runs is reported once.
 * @param {Array<{viewport: string, width: number, colorScheme: string, violations?: any[], error?: string}>} runs
 */
export function mergeAxeRuns(runs) {
    const byRule = new Map();
    const summary = [];
    for (const run of runs) {
        const key = `${run.viewport}-${run.colorScheme}`;
        summary.push({
            viewport: run.viewport,
            width: run.width,
            colorScheme: run.colorScheme,
            violations: run.error ? null : (run.violations ?? []).length,
            ...(run.error ? { error: run.error } : {}),
        });
        for (const v of run.violations ?? []) {
            const existing = byRule.get(v.id);
            const targets = (v.nodes ?? [])
                .map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target ?? '')))
                .filter(Boolean);
            if (existing) {
                existing.runs.push(key);
                existing.nodes = Math.max(existing.nodes, (v.nodes ?? []).length);
                for (const t of targets) {
                    if (existing.targets.length < MAX_TARGETS && !existing.targets.includes(t)) {
                        existing.targets.push(t);
                    }
                }
                if (IMPACTS.indexOf(normaliseImpact(v.impact)) < IMPACTS.indexOf(existing.impact)) {
                    existing.impact = normaliseImpact(v.impact);
                }
            } else {
                byRule.set(v.id, {
                    id: v.id,
                    impact: normaliseImpact(v.impact),
                    help: v.help ?? v.id,
                    description: v.description ?? '',
                    helpUrl: v.helpUrl ?? '',
                    wcag: wcagCriteria(v.tags),
                    level: wcagLevel(v.tags),
                    nodes: (v.nodes ?? []).length,
                    targets: [...new Set(targets)].slice(0, MAX_TARGETS),
                    runs: [key],
                });
            }
        }
    }
    const violations = [...byRule.values()].sort(
        (a, b) =>
            IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) ||
            a.id.localeCompare(b.id),
    );
    return { runs: summary, violations };
}

/** Lighthouse category scores as 0-100 integers (null when a category is missing). */
export function summarizeLighthouse(lhr) {
    const score = (id) => {
        const value = lhr?.categories?.[id]?.score;
        return typeof value === 'number' ? Math.round(value * 100) : null;
    };
    return {
        performance: score('performance'),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo'),
    };
}

function describeFetchError(error) {
    const code = error?.cause?.code ?? error?.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS lookup failed';
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Timed out';
    if (code) return `Network error (${code})`;
    return `Network error (${error?.message ?? 'unknown'})`;
}

/**
 * Checks whether a site answers with a 2xx status. DNS failures, timeouts and
 * non-2xx responses mean "not deployed yet".
 */
export async function checkReachable(url, fetchImpl = fetch, timeoutMs = REACH_TIMEOUT_MS) {
    try {
        const res = await fetchImpl(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'user-agent': 'faheemnaeem-a11y-audit' },
        });
        if (res.status >= 200 && res.status < 300) {
            return { reachable: true, httpStatus: res.status };
        }
        return { reachable: false, httpStatus: res.status, reason: `HTTP ${res.status}` };
    } catch (error) {
        return { reachable: false, httpStatus: null, reason: describeFetchError(error) };
    }
}

/** Entry for a site that could not be reached. */
export function notDeployedEntry(site, reach) {
    return {
        id: site.id,
        url: site.url,
        title: site.title,
        status: 'not-deployed',
        httpStatus: reach.httpStatus,
        reason: reach.reason,
        lighthouse: null,
        axe: null,
        errors: [],
    };
}

/** Assembles the final report object written to src/reports/<date>.json. */
export function buildReport({ date, generatedAt, sites, tools, source, sample = false }) {
    return {
        schemaVersion: SCHEMA_VERSION,
        sample,
        date,
        generatedAt,
        source,
        tools,
        config: {
            viewports: VIEWPORTS.map(({ name, width }) => ({ name, width })),
            colorSchemes: COLOR_SCHEMES,
            axeTags: AXE_TAGS,
            lighthouseCategories: LIGHTHOUSE_CATEGORIES,
            lighthouseFormFactor: 'mobile',
        },
        sites,
    };
}

/** Parses --flag value pairs. */
export function parseArgs(argv) {
    const args = { sites: null, out: null, date: null };
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        const value = argv[i + 1];
        if (flag === '--sites' && value) {
            args.sites = value.split(',').map((s) => s.trim()).filter(Boolean);
            i += 1;
        } else if (flag === '--out' && value) {
            args.out = value;
            i += 1;
        } else if (flag === '--date' && value) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Bad --date: ${value}`);
            args.date = value;
            i += 1;
        }
    }
    return args;
}

// ---------------------------------------------------------------- runtime ---

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const repoRoot = resolve(appDir, '../..');
/** Site list: the single source of truth in @faheem/data. */
const SITES_JSON = join(repoRoot, 'packages/data/src/sites.json');

function run(cmd, args, options) {
    return new Promise((resolvePromise, reject) => {
        execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                reject(error);
            } else {
                resolvePromise({ stdout, stderr });
            }
        });
    });
}

async function readVersion(depsDir, name) {
    try {
        const pkg = JSON.parse(
            await readFile(join(depsDir, 'node_modules', name, 'package.json'), 'utf8'),
        );
        return pkg.version ?? null;
    } catch {
        return null;
    }
}

async function runAxe(browser, AxeBuilder, url) {
    const runs = [];
    for (const viewport of VIEWPORTS) {
        for (const colorScheme of COLOR_SCHEMES) {
            const context = await browser.newContext({
                viewport: { width: viewport.width, height: viewport.height },
                colorScheme,
            });
            const base = { viewport: viewport.name, width: viewport.width, colorScheme };
            try {
                const page = await context.newPage();
                await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
                // Give client-side code a moment to render before scanning.
                await page.waitForTimeout(1500);
                const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
                runs.push({ ...base, violations: result.violations, engine: result.testEngine?.version });
            } catch (error) {
                runs.push({ ...base, error: String(error?.message ?? error).slice(0, 300) });
            } finally {
                await context.close();
            }
        }
    }
    return runs;
}

async function runLighthouse(url, chromePath, depsDir, workDir) {
    const output = join(workDir, `lh-${Date.now()}.json`);
    await run(
        'npx',
        [
            '--yes',
            LIGHTHOUSE_PACKAGE,
            url,
            '--output=json',
            `--output-path=${output}`,
            `--only-categories=${LIGHTHOUSE_CATEGORIES.join(',')}`,
            '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
            '--quiet',
        ],
        {
            cwd: depsDir,
            timeout: LIGHTHOUSE_TIMEOUT_MS,
            env: { ...process.env, CHROME_PATH: chromePath },
        },
    );
    const lhr = JSON.parse(await readFile(output, 'utf8'));
    return { scores: summarizeLighthouse(lhr), version: lhr.lighthouseVersion ?? null };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const depsDir = resolve(process.env.AUDIT_DEPS_DIR ?? process.cwd());
    const requireDep = createRequire(join(depsDir, 'package.json'));
    const { chromium } = requireDep('playwright');
    const axeModule = requireDep('@axe-core/playwright');
    const AxeBuilder = axeModule.AxeBuilder ?? axeModule.default ?? axeModule;

    const allSites = JSON.parse(await readFile(SITES_JSON, 'utf8'));
    const sites = args.sites ? allSites.filter((s) => args.sites.includes(s.id)) : allSites;
    const date = args.date ?? reportDate();
    const outDir = resolve(args.out ?? join(appDir, 'src/reports'));
    const workDir = await mkdtemp(join(tmpdir(), 'a11y-audit-'));

    const browser = await chromium.launch();
    const chromePath = chromium.executablePath();
    const chromiumVersion = browser.version();
    const entries = [];
    let axeVersion = null;
    let lighthouseVersion = null;

    try {
        for (const site of sites) {
            const reach = await checkReachable(site.url);
            if (!reach.reachable) {
                console.log(`- ${site.id}: not deployed yet (${reach.reason})`);
                entries.push(notDeployedEntry(site, reach));
                continue;
            }
            console.log(`- ${site.id}: auditing ${site.url}`);
            const errors = [];
            const axeRuns = await runAxe(browser, AxeBuilder, site.url);
            axeVersion ??= axeRuns.find((r) => r.engine)?.engine ?? null;
            for (const r of axeRuns) {
                if (r.error) errors.push(`axe ${r.viewport}/${r.colorScheme}: ${r.error}`);
            }
            let lighthouse = null;
            try {
                const lh = await runLighthouse(site.url, chromePath, depsDir, workDir);
                lighthouse = lh.scores;
                lighthouseVersion ??= lh.version;
            } catch (error) {
                errors.push(`lighthouse: ${String(error?.message ?? error).slice(0, 300)}`);
            }
            const axeOk = axeRuns.some((r) => !r.error);
            entries.push({
                id: site.id,
                url: site.url,
                title: site.title,
                status: axeOk || lighthouse ? 'ok' : 'error',
                httpStatus: reach.httpStatus,
                lighthouse,
                axe: axeOk ? mergeAxeRuns(axeRuns) : null,
                errors,
            });
        }
    } finally {
        await browser.close();
        await rm(workDir, { recursive: true, force: true });
    }

    const repository = process.env.GITHUB_REPOSITORY ?? null;
    const runId = process.env.GITHUB_RUN_ID;
    const report = buildReport({
        date,
        generatedAt: new Date().toISOString(),
        sites: entries,
        source: {
            repository,
            commit: process.env.GITHUB_SHA ?? null,
            runUrl:
                repository && runId
                    ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${runId}`
                    : null,
        },
        tools: {
            axeCore: axeVersion,
            axePlaywright: await readVersion(depsDir, '@axe-core/playwright'),
            playwright: await readVersion(depsDir, 'playwright'),
            lighthouse: lighthouseVersion ?? (await readVersion(depsDir, 'lighthouse')),
            chromium: chromiumVersion,
        },
    });

    await mkdir(outDir, { recursive: true });
    const file = join(outDir, `${date}.json`);
    await writeFile(file, `${JSON.stringify(report, null, 4)}\n`);
    console.log(`Wrote ${file}`);
}

const invokedDirectly =
    process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
