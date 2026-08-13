import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const briefs = (await getCollection('briefs')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
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
