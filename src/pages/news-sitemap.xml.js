// Google News sitemap: briefs and stories from the last two days, the window
// Google News reads. https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
import { getCollection } from "astro:content";
import { getPublicBriefs } from "../lib/briefs.js";

const SITE = "https://waynesville.news";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d) => d.toISOString().slice(0, 10);

export async function GET() {
  const { briefs, isDemoMode } = await getPublicBriefs();
  const stories = (await getCollection("stories")).filter((s) => s.data.published);
  const cutoff = Date.now() - 2 * 86400000 - 86400000; // two days, plus a day of slack for midnight-UTC dates
  const items = [
    ...(isDemoMode ? [] : briefs).map((b) => ({ url: `${SITE}/briefs/${b.id}/`, date: b.data.date, title: b.data.title })),
    ...stories.map((s) => ({ url: `${SITE}/stories/${s.id}/`, date: s.data.date, title: s.data.title })),
  ].filter((i) => i.date.getTime() >= cutoff);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items.map((i) => `  <url>
    <loc>${esc(i.url)}</loc>
    <news:news>
      <news:publication><news:name>Waynesville News</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${day(i.date)}</news:publication_date>
      <news:title>${esc(i.title)}</news:title>
    </news:news>
  </url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
