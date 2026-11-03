// Podcast feed for the audio Daily Brief: one episode per brief that has a
// recording in src/data/audio-index.json. Submit https://waynesville.news/podcast.xml
// to Apple Podcasts / Spotify; they poll it for new episodes.
import { getCollection } from "astro:content";
import audioIndex from "../data/audio-index.json";

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hms = (sec = 0) =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, "0")).join(":");

export async function GET(context) {
  const site = String(context.site).replace(/\/$/, "");
  const abs = (u) => (/^https?:\/\//.test(u) ? u : site + u);
  const items = audioIndex.items ?? {};

  const briefs = (await getCollection("briefs"))
    .filter((b) => b.data.published && !b.data.demo && items[b.id]?.url && items[b.id]?.bytes)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const episodes = briefs.map((b) => {
    const a = items[b.id];
    const page = `${site}/briefs/${b.id}/`;
    const desc = `${b.data.dek ?? ""}${a.sponsor ? ` Supported by ${a.sponsor}.` : ""} Read the full edition, with links to every source: ${page}`.trim();
    const pub = new Date(a.recorded || b.data.date).toUTCString();
    return `    <item>
      <title>${esc(b.data.title)}</title>
      <link>${esc(page)}</link>
      <guid isPermaLink="false">waynesville-news-brief-${b.id}</guid>
      <pubDate>${pub}</pubDate>
      <description>${esc(desc)}</description>
      <itunes:summary>${esc(desc)}</itunes:summary>
      <enclosure url="${esc(abs(a.url))}" length="${a.bytes}" type="audio/mpeg"/>
      <itunes:duration>${hms(a.seconds)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
  });

  const about =
    "Waynesville, Ohio's Daily Brief in about three minutes: schools, local government, events and what's happening around town in Waynesville, Corwin and Wayne Township. Every edition, with links to every source, is at waynesville.news.";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Waynesville News Daily Brief</title>
    <link>${site}/</link>
    <atom:link href="${site}/podcast.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <copyright>© ${new Date().getFullYear()} Waynesville News</copyright>
    <description>${esc(about)}</description>
    <itunes:summary>${esc(about)}</itunes:summary>
    <itunes:author>Waynesville News</itunes:author>
    <itunes:owner>
      <itunes:name>Waynesville News</itunes:name>
      <itunes:email>editor@waynesville.news</itunes:email>
    </itunes:owner>
    <itunes:image href="${site}/podcast-cover.jpg"/>
    <image>
      <url>${site}/podcast-cover.jpg</url>
      <title>Waynesville News Daily Brief</title>
      <link>${site}/</link>
    </image>
    <itunes:category text="News">
      <itunes:category text="Daily News"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <podcast:locked>no</podcast:locked>
${episodes.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
