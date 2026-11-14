// RSS feed made for the Zapier -> Facebook Page automation (see DEPLOY.md §6).
// Daily briefs only, newest first, each with:
//   - <enclosure> and <media:content>: the day's header graphic (/cards/<date>.png),
//     for a Zapier "Create Page Photo" step (map the enclosure URL to Photo URL);
//   - <description>: a ready-to-post plain-text caption: the dek, a direct
//     "Listen" link to the day's audio, and the link to the brief;
//   - the brief page itself carries the same graphic as og:image, so a plain
//     link post shows it too.
import { getPublicBriefs } from "../lib/briefs.js";
import { renderBriefCard, cardPath } from "../lib/brief-card.js";
import audioIndex from "../data/audio-index.json";

// Zapier posts an item once, the first time it sees it, so an edition is held
// out of this feed until its audio is recorded (daily-audio.yml pushes
// audio-index.json a few minutes after the brief goes live, which rebuilds the
// site). If the recording fails, the edition is released without the Listen
// line by any build after noon Eastern on its date, so it is never lost.
const RELEASE_WITHOUT_AUDIO_UTC_HOUR = 17; // noon EST / 1 p.m. EDT
const audioFor = (id) => {
  const a = audioIndex.items?.[id];
  return a?.url ? a : null;
};
const isReady = (b, now) =>
  audioFor(b.id) || now.getTime() >= b.data.date.getTime() + RELEASE_WITHOUT_AUDIO_UTC_HOUR * 3600 * 1000;

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FEED_ITEMS = 10;

export async function GET(context) {
  const site = String(context.site).replace(/\/$/, "");
  const { briefs } = await getPublicBriefs();
  const now = new Date();
  const recent = [...briefs]
    .filter((b) => isReady(b, now))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .slice(0, FEED_ITEMS);

  const items = await Promise.all(
    recent.map(async (b) => {
      const page = `${site}/briefs/${b.id}/`;
      const img = `${site}${cardPath(b.id)}`;
      const bytes = (await renderBriefCard(b)).length;
      const audio = audioFor(b.id);
      const mins = audio?.seconds ? ` (${Math.max(1, Math.round(audio.seconds / 60))} min)` : "";
      const caption = [
        b.data.dek ?? "",
        audio ? `🎧 Listen to today's brief${mins}: ${audio.url}` : "",
        `Read today's Daily Brief, with links to every source: ${page}`,
      ].filter(Boolean).join("\n\n");
      return `    <item>
      <title>${esc(b.data.title)}</title>
      <link>${esc(page)}</link>
      <guid isPermaLink="true">${esc(page)}</guid>
      <pubDate>${b.data.date.toUTCString()}</pubDate>
      <description>${esc(caption)}</description>
      <enclosure url="${esc(img)}" length="${bytes}" type="image/png" />
      <media:content url="${esc(img)}" medium="image" type="image/png" width="1200" height="630" />
    </item>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Waynesville News — Daily Brief (for Facebook)</title>
    <link>${site}/</link>
    <atom:link href="${site}/facebook.xml" rel="self" type="application/rss+xml" />
    <description>The Waynesville Daily Brief, one item per edition, with a header graphic for each day.</description>
    <language>en-us</language>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
