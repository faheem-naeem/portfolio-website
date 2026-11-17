// Bug museum entry. Generic on purpose: no employer, client or product details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'float-money',
    frontmatter: {
        title: 'The invoice that was off by one cent',
        date: '2026-11-15',
        severity: 'medium',
        stack: ['PHP', 'Laravel', 'MySQL'],
        tags: ['money', 'floating-point', 'rounding'],
    },
    body: `## Symptom

In a billing-style module, an invoice total sometimes differed by one cent from the sum of its line items. It happened rarely, only for certain quantities and tax rates, and finance users spotted it before any test did.

## Investigation

Recomputing the same invoice in a REPL reproduced it. Printing the intermediate values with full precision showed numbers like \`19.989999999999998\` instead of \`19.99\`. Line totals were rounded one way, the grand total another way, and the two paths disagreed only when a value sat right on a rounding boundary.

## Root cause

Prices were stored as \`FLOAT\` columns and multiplied as PHP floats. Binary floating point cannot represent most decimal fractions exactly, so tiny errors built up. On top of that, rounding happened in two different places (per line, and again on the total), so the results could drift apart by a cent.

## Fix

- Changed the money columns to \`DECIMAL(12,2)\` with a migration, after checking existing values for precision loss.
- Did all arithmetic in integer **minor units** (cents), converting only at the edges for display.
- Defined one rounding rule (round each line, then sum the rounded lines) and put it in a single, well-tested function.
- Added table-driven tests with the tricky quantities and tax rates that had failed.

## Lesson

Never use floating point for money. Pick a representation and a rounding rule on purpose, write them down, and make every code path go through the same function.
`,
};

export default entry;
