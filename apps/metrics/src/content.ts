// "Currently learning" and "Now reading" are not in @faheem/data yet, so they
// live here as SAMPLE content. Move them to packages/data and replace them
// with real entries before deploying.
export interface NowItem {
    title: string;
    detail: string;
}

export interface NowContent {
    learning: NowItem[];
    reading: NowItem[];
    sample: boolean;
}

export const NOW: NowContent = {
    sample: true,
    learning: [
        {
            title: 'Cloudflare Workers + D1',
            detail: 'Edge-first APIs on the free plan.',
        },
        {
            title: 'Rust basics',
            detail: 'Ownership and borrowing, one small CLI at a time.',
        },
    ],
    reading: [
        {
            title: 'Designing Data-Intensive Applications',
            detail: 'Martin Kleppmann',
        },
    ],
};
