// "Currently learning" and "Now reading" for the metrics page.
export interface NowItem {
    title: string;
    detail: string;
}

export interface NowContent {
    learning: NowItem[];
    reading: NowItem[];
    /** Legacy placeholder marker; launch content never sets it. */
    sample?: boolean;
}

export const NOW: NowContent = {
    learning: [
        {
            title: 'LLM evaluation',
            detail: 'Test sets and regression checks for prompts and structured outputs.',
        },
        {
            title: 'Cloudflare Workers, D1 and Workers AI',
            detail: 'Edge-first APIs, built while running this site on the free plan.',
        },
        {
            title: 'Retrieval-augmented generation',
            detail: 'Grounding answers in documents, with citations and guardrails.',
        },
    ],
    reading: [
        {
            title: 'Designing Data-Intensive Applications',
            detail: 'Martin Kleppmann',
        },
        {
            title: 'The Pragmatic Programmer',
            detail: 'David Thomas and Andrew Hunt',
        },
    ],
};
