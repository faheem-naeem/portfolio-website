// App-local manual content that @faheem/data does not have yet (Quick start,
// extra Known bugs, FAQ) plus the section plan. SAMPLE: replace with real text,
// ideally by moving it into packages/data/src/manual.ts.
//
// Markdown, rendered with the same renderer as the data body (raw HTML is escaped).
// Callouts: start a blockquote with [!NOTE], [!TIP] or [!WARNING].

export const MANUAL_VERSION = '1.0';

/** True while the app-local text below is placeholder content. */
export const APP_CONTENT_SAMPLE = true;

export type SectionSource =
    /** Markdown from a `## heading` of the @faheem/data manual body. */
    | { kind: 'data'; heading: string; extra?: string }
    /** Markdown kept in this app. */
    | { kind: 'app'; markdown: string }
    /** Rendered from resume.focusAreas. */
    | { kind: 'focus' }
    /** Contact links from resume.links and sites.json. */
    | { kind: 'support' }
    /** Any data sections not referenced above, so nothing is silently dropped. */
    | { kind: 'rest' };

export interface SectionPlan {
    id: string;
    title: string;
    source: SectionSource;
    /** Adds the live local-time widget to this section. */
    clock?: boolean;
}

const quickStart = `SAMPLE: the short version, if you only read one section.

- Send context in writing first: the goal, the deadline and what "done" looks like.
- Async is my default; I reply within one working day.
- Ask "why" as often as you like. I will do the same.
- Bad news early beats good news late.

> [!TIP]
> SAMPLE: a short written brief gets a faster, better answer than a meeting invite with no agenda.`;

const knownBugsExtra = `SAMPLE: more open issues, with workarounds.

- **Over-explains in pull request descriptions.** Workaround: skim the TL;DR at the top.
- **Gets quiet when deep in a problem.** Workaround: ping me; I would rather be interrupted than stuck.

> [!WARNING]
> SAMPLE: I will push back on scope added late in a sprint. It is not personal; it is about shipping.`;

const faq = `### Can we just hop on a quick call?

SAMPLE: Yes, but send two lines of context first so the call is actually quick.

### What is the best way to give me a task?

SAMPLE: A short written brief with the goal, constraints and deadline. Links beat attachments.

### Do you work outside your hours?

SAMPLE: For real incidents, yes. For everything else, it can wait until morning.

> [!NOTE]
> SAMPLE: this manual is versioned like software. If something here is wrong, file a bug (see Support).`;

/** Section order shown on the page (and in the sidebar). */
export const SECTION_PLAN: SectionPlan[] = [
    { id: 'quick-start', title: 'Quick start', source: { kind: 'app', markdown: quickStart } },
    {
        id: 'communication',
        title: 'Communication preferences',
        source: { kind: 'data', heading: 'Communication' },
    },
    {
        id: 'working-hours',
        title: 'Working hours & timezone',
        source: { kind: 'data', heading: 'Working hours' },
        clock: true,
    },
    {
        id: 'feedback',
        title: 'How I give & receive feedback',
        source: { kind: 'data', heading: 'Feedback' },
    },
    { id: 'great-at', title: 'What I’m great at', source: { kind: 'focus' } },
    { id: 'rest', title: '', source: { kind: 'rest' } },
    {
        id: 'known-bugs',
        title: 'Known bugs (my weaknesses)',
        source: { kind: 'data', heading: 'What I am working on', extra: knownBugsExtra },
    },
    { id: 'faq', title: 'FAQ', source: { kind: 'app', markdown: faq } },
    { id: 'support', title: 'Support', source: { kind: 'support' } },
];
