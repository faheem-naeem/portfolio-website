// Bug museum entry. Generic on purpose: no employer, client or product details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'llm-date-ambiguity',
    frontmatter: {
        title: 'The deadline that depended on the document',
        date: '2026-11-17',
        severity: 'high',
        stack: ['Python', 'FastAPI', 'LangChain', 'Pydantic'],
        tags: ['llm', 'ocr', 'dates', 'validation'],
    },
    body: `## Symptom

A document-processing pipeline used OCR and a language model to pull key fields out of scanned PDFs. Some extracted deadlines were months off. The output always passed validation, so nothing flagged it; a person noticed when a date in the summary did not match the original page.

## Investigation

The wrong dates all had a day of 12 or less, such as \`03/04/2025\`. Running the same pages several times showed that the model read some of them as day/month and others as month/day, depending on the wording around the date. The Pydantic model declared the field as \`date\`, so any well-formed date was accepted, whether it was the right one or not.

## Root cause

The pipeline asked the model to do two jobs at once: find the date *and* interpret an ambiguous format. Documents came from different regions with different conventions, and nothing in the prompt or the code decided which convention applied. Schema validation checked the shape of the answer, not its meaning.

## Fix

- The model now returns the date exactly as written (\`raw_text\`), plus the page it came from, instead of a normalized date.
- Plain Python code parses that string with an explicit, per-document format, using other unambiguous dates in the same document as evidence.
- When a date is still ambiguous, the pipeline marks the field as needing review instead of guessing.
- Added an evaluation set of tricky pages (ambiguous dates, poor scans, handwritten corrections) that runs on every prompt change.

## Lesson

Use the model for what it is good at (finding things in messy text) and deterministic code for what must be exact. A valid schema is not the same as a correct answer, so design for "I am not sure" as a real outcome.
`,
};

export default entry;
