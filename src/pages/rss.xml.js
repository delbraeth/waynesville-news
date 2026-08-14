import rss from '@astrojs/rss';
import { getPublicBriefs } from '../lib/briefs.js';

export async function GET(context) {
  const { briefs } = await getPublicBriefs();
  return rss({
    title: 'Waynesville Daily Brief',
    description: "The Waynesville & Warren County news you'd otherwise miss.",
    site: context.site,
    items: briefs.map((b) => ({
      title: b.data.title,
      description: b.data.dek ?? '',
      pubDate: b.data.date,
      link: `/briefs/${b.id}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
