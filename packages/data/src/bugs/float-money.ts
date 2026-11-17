// SAMPLE bug museum entry. Generic on purpose: no employer or client details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'float-money',
    frontmatter: {
        title: 'The missing cent',
        date: '2019-11-05',
        severity: 'low',
        stack: ['PHP', 'MySQL'],
        tags: ['money', 'floating-point'],
        sample: true,
    },
    body: `## Symptom

Invoice totals were occasionally one cent lower than the sum of their line items.

## Investigation

The difference only appeared for certain prices and quantities, and never in the database itself.

## Root cause

Amounts were multiplied as floating-point numbers and truncated instead of rounded.

## Fix

Store and calculate money as integer cents, and round once at display time.

## Lesson

Never use floats for money.
`,
};

export default entry;
