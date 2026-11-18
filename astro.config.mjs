// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

// Utility pages carry <meta name="robots" content="noindex"> (Base.astro's
// `noindex` prop); keep them out of the sitemap too.
const NOINDEX = new Set(['/search/', '/events/submit/', '/corrections/submit/']);
// The Christmas Eve page is noindexed while no church has this season's services.
const season = readJson('./src/data/holiday-lights.json').season?.label;
const hasChristmasEve = (readJson('./src/data/churches.json').items ?? [])
  .some((c) => c.christmasEve?.year === season && (c.christmasEve.services ?? []).length);
if (!hasChristmasEve) NOINDEX.add('/holiday-lights/christmas-eve/');

// Briefs and stories carry their date in the URL; give search engines that as
// lastmod. Other pages change daily with the data, so they get no lastmod
// rather than a misleading one.
const DATED = /\/(?:briefs|stories)\/(\d{4}-\d{2}-\d{2})/;

// Waynesville News — static site, deployed on Cloudflare (Workers static assets).
export default defineConfig({
  site: 'https://waynesville.news',
  build: {
    format: 'directory', // clean URLs: /schools/ not /schools.html
  },
  integrations: [
    sitemap({
      filter: (page) => !NOINDEX.has(new URL(page).pathname),
      serialize(item) {
        const m = new URL(item.url).pathname.match(DATED);
        if (m) item.lastmod = m[1];
        return item;
      },
    }),
  ],
});
