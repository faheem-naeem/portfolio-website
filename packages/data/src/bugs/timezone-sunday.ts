// SAMPLE bug museum entry. Generic on purpose: no employer or client details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'timezone-sunday',
    frontmatter: {
        title: 'The report that skipped Sundays',
        date: '2024-03-10',
        severity: 'medium',
        stack: ['Python', 'PostgreSQL'],
        tags: ['timezones', 'dates', 'reporting'],
        sample: true,
    },
    body: `## Symptom

A weekly report was missing every row created late on Sunday evenings.

## Investigation

Rows existed in the database. The report query filtered by date, and only rows close to midnight were affected.

## Root cause

Timestamps were stored in UTC, but the report boundary was computed in local time and then compared as if it were UTC.

## Fix

Convert the report boundaries to UTC explicitly before querying, and add a test that inserts rows a minute either side of midnight.

## Lesson

Store UTC, convert at the edges, and always test the boundaries.
`,
};

export default entry;
