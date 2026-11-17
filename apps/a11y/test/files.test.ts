// Validates the committed files: every report in src/reports and the workflow YAML.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSites } from '@faheem/data';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseReports } from '../src/lib/load';

const here = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(here, '../src/reports');
const workflowPath = join(here, '../../../.github/workflows/a11y-audit.yml');

describe('reports', () => {
    const files = readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
    const entries = Object.fromEntries(
        files.map((f) => [f, JSON.parse(readFileSync(join(reportsDir, f), 'utf8')) as unknown]),
    );

    it('all match the report schema', () => {
        expect(files.length).toBeGreaterThan(0);
        expect(() => parseReports(entries)).not.toThrow();
    });

    it('are named seed.json or <date>.json matching their date', () => {
        for (const [file, data] of Object.entries(entries)) {
            if (file === 'seed.json') continue;
            expect(file).toBe(`${(data as { date: string }).date}.json`);
        }
    });

    it('ships a seed clearly marked as sample that lists every site', () => {
        const [seed] = parseReports({ 'seed.json': entries['seed.json'] });
        expect(seed?.sample).toBe(true);
        expect(seed?.note).toMatch(/SAMPLE/);
        expect(seed?.sites.map((s) => s.id).sort()).toEqual(getSites().map((s) => s.id).sort());
    });
});

describe('workflow', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = parse(readFileSync(workflowPath, 'utf8')) as any;
    const steps: { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown> }[] =
        wf.jobs.audit.steps;

    it('runs weekly and on demand only (never on push)', () => {
        expect(Object.keys(wf.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
        expect(wf.on.schedule[0].cron).toBe('0 6 * * 1');
    });

    it('has write access to contents only', () => {
        expect(wf.permissions).toEqual({ contents: 'write' });
    });

    it('pins actions to major tags and uses pnpm 9.15.9 + Node 22', () => {
        for (const s of steps.filter((s) => s.uses)) {
            expect(s.uses).toMatch(/@v\d+$/);
        }
        expect(steps.find((s) => s.uses?.startsWith('pnpm/action-setup'))?.with?.version).toBe('9.15.9');
        expect(steps.find((s) => s.uses?.startsWith('actions/setup-node'))?.with?.['node-version']).toBe(22);
    });

    it('installs audit tools outside the workspace, Chromium only', () => {
        const install = steps.find((s) => s.run?.includes('playwright install'))?.run ?? '';
        expect(install).toContain('--no-save');
        expect(install).toContain('lighthouse@12');
        expect(install).toMatch(/playwright install --with-deps chromium\s*$/m);
    });

    it('commits with [skip ci] only on master', () => {
        const commit = steps.find((s) => s.run?.includes('git commit'));
        expect(commit?.if).toBe("github.ref == 'refs/heads/master'");
        expect(commit?.run).toContain('[skip ci]');
        expect(commit?.run).toContain('git diff --cached --quiet');
    });
});
