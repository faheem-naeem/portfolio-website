import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { formatNumber, getExhibits } from '../lib/exhibits';

export function GET(context: APIContext) {
    return rss({
        title: 'The Bug Museum',
        description:
            'Memorable bugs: symptom, investigation, root cause, fix and lesson.',
        site: context.site ?? 'https://bugs.faheemnaeem.dev',
        items: getExhibits().map((e) => ({
            title: `Exhibit ${formatNumber(e.number)}: ${e.title}${e.sample ? ' (sample)' : ''}`,
            link: `/exhibits/${e.slug}/`,
            pubDate: new Date(`${e.date}T00:00:00Z`),
            description: e.hook,
            categories: [...e.stack, ...e.tags, e.severity],
        })),
    });
}
