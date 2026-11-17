// App-local manual content (Quick start, extra Known bugs, FAQ) plus the
// section plan. The main body comes from packages/data/src/manual.ts.
//
// Markdown, rendered with the same renderer as the data body (raw HTML is escaped).
// Callouts: start a blockquote with [!NOTE], [!TIP] or [!WARNING].

export const MANUAL_VERSION = '1.0';

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

const quickStart = `The short version, if you only read one section.

- Send context in writing first: the goal, the deadline and what "done" looks like.
- Async is my default; I reply within one working day, usually much sooner.
- I am on Mountain Time (Calgary). Mornings are best for live discussions.
- Ask "why" as often as you like. I will do the same.
- Bad news early beats good news late, in both directions.

> [!TIP]
> A short written brief gets a faster, better answer than a meeting invite with no agenda.`;

const knownBugsExtra = `- **Goes quiet when deep in a problem.** Workaround: ping me. I would rather be interrupted than leave you blocked.
- **Wants to fix the neighbouring code too.** I keep those improvements in separate, clearly labelled pull requests so reviews stay small.

> [!NOTE]
> I will push back, politely, on scope added late in a sprint. It is not personal; it is about shipping what we promised.`;

const faq = `### Can we just hop on a quick call?

Yes. Send two lines of context first so the call is actually quick, and I will share notes afterwards.

### What is the best way to give me a task?

A short written brief with the goal, the constraints and the deadline. Links to tickets, designs or data beat attachments.

### What kind of work do you enjoy most?

Taking a product from an unclear idea to a stable application: full-stack features, APIs and integrations, and practical LLM workflows that have to be reliable, not just impressive in a demo.

### Do you work outside your hours?

For real production incidents, yes. Everything else can wait until the next working morning, and I do not expect replies from others outside their hours either.

### How do I request an interview?

Use the [interview request form](https://api.faheemnaeem.dev/contact), email me, or message me on LinkedIn (see Support below).

> [!NOTE]
> This manual is versioned like software. If something here is wrong or out of date, file a bug through any channel in Support.`;

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
