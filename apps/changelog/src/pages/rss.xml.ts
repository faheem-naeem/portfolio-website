import rss from '@astrojs/rss';
import { getCareer, getResume } from '@faheem/data';
import type { APIRoute } from 'astro';
import { buildRssItems } from '../lib/feed';

export const GET: APIRoute = ({ site }) => {
    if (!site) throw new Error('`site` must be set in astro.config.mjs');
    const career = getCareer();
    const { name } = getResume();
    return rss({
        title: `${name} changelog`,
        description: `${name}'s career, written up as release notes.${career.sample ? ' (Sample data.)' : ''}`,
        site,
        items: buildRssItems(career, site.toString()),
        customData: '<language>en</language>',
    });
};
