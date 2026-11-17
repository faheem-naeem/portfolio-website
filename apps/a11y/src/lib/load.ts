// Loads every report in src/reports at build time. A malformed report fails
// the build (and the workflow's validation step) instead of rendering garbage.
import { ReportSchema, selectReports, type Report } from './report';

const files = import.meta.glob<unknown>('../reports/*.json', {
    eager: true,
    import: 'default',
});

export function parseReports(entries: Record<string, unknown>): Report[] {
    return Object.entries(entries).map(([file, data]) => {
        const parsed = ReportSchema.safeParse(data);
        if (!parsed.success) {
            throw new Error(`Invalid report ${file}: ${parsed.error.message}`);
        }
        return parsed.data;
    });
}

let cache: Report[] | undefined;

/** Reports to render, oldest first (sample reports only when no real one exists). */
export function loadReports(): Report[] {
    cache ??= selectReports(parseReports(files));
    return cache;
}
