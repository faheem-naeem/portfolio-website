// Bug museum entry. Generic on purpose: no employer, client or product details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'dst-schedule',
    frontmatter: {
        title: 'The weekly reminder that moved by an hour',
        date: '2026-11-16',
        severity: 'medium',
        stack: ['Python', 'Django', 'PostgreSQL'],
        tags: ['timezones', 'dates', 'scheduling'],
    },
    body: `## Symptom

In a scheduling feature, users set a weekly reminder for "Monday at 9:00". Twice a year, right after the clocks changed for daylight saving time, every reminder arrived an hour early or an hour late, then stayed wrong until users edited it.

## Investigation

The stored values looked correct at first glance. Comparing the database rows with the user's settings showed the problem: each reminder was saved as a UTC timestamp for the *next* occurrence, and later occurrences were calculated by adding seven days to that UTC value. Before the clock change, 9:00 local was 16:00 UTC; after it, 9:00 local was 15:00 UTC, but the code kept using 16:00.

## Root cause

A recurring local-time event was modelled as a fixed point in UTC. "Every Monday at 9:00 in America/Edmonton" is a rule, not an instant, and the UTC offset of that rule changes during the year. Adding \`timedelta(days=7)\` to an aware UTC datetime keeps the UTC time, not the wall-clock time.

## Fix

- Stored the rule instead of the instant: local time, weekday and an IANA time-zone name (for example \`America/Edmonton\`).
- Computed each next occurrence in the user's time zone with \`zoneinfo\`, then converted to UTC only for the job queue.
- Defined what happens for local times that do not exist or happen twice on transition days.
- Added tests that freeze time on both sides of the spring and autumn transitions.

## Lesson

Store instants in UTC, but store human schedules as local time plus a named time zone. Any date code that has not been tested across a daylight-saving change has not really been tested.
`,
};

export default entry;
