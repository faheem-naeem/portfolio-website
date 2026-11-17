import type { Career } from '@faheem/data';
import { buildReleases, releaseUrl } from './changelog';

export interface RssItem {
    title: string;
    link: string;
    pubDate: Date;
    description: string;
    categories: string[];
}

/** RSS items, newest first. Plain-text descriptions (no HTML). */
export function buildRssItems(career: Career, site: string): RssItem[] {
    return buildReleases(career).map((r) => ({
        title: `${r.tag}: ${r.title}`,
        link: releaseUrl(site, r),
        pubDate: new Date(`${r.date}T00:00:00Z`),
        description: r.notes.map((n) => `${n.label}: ${n.text}`).join(' · '),
        categories: [r.label, r.type],
    }));
}
