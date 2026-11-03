// Podcast feed for the Daily Brief audio (RSS 2.0 + iTunes + Podcasting 2.0).
// One episode per entry in src/data/audio-index.json whose brief is published.
// Submitted to Apple Podcasts and Spotify; see PODCAST.md.
import { getCollection } from "astro:content";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import audioIndex from "../data/audio-index.json";

const SHOW = {
  title: "Waynesville News Daily Brief",
  author: "Waynesville News",
  email: "editor@waynesville.news",
  description:
    "The Daily Brief from Waynesville News: a few minutes each morning on Waynesville, Corwin and " +
    "Warren County, Ohio. Schools, local government, public safety, weather and things to do. " +
    "Each episode is read by an AI voice from the written edition; the full brief, with links to " +
    "every source, is at waynesville.news.",
  cover: "/podcast-cover.png",
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const hms = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const pad = (n) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// Podcasting 2.0 <podcast:guid>: UUIDv5 of the feed URL (no scheme, no
// trailing slash) under the namespace the spec fixes.
function podcastGuid(feedUrl) {
  const ns = Buffer.from("ead4c236bf5858c6a2c6a6b28d128cb6", "hex");
  const name = feedUrl.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
  const h = createHash("sha1").update(ns).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Enclosure length in bytes: the workflow's stored value, else the committed
// file in public/, else a HEAD request for files hosted elsewhere (R2).
async function byteLength(entry, absUrl, site) {
  if (Number(entry.bytes) > 0) return Number(entry.bytes);
  if (entry.url.startsWith("/") || absUrl.startsWith(site.origin + "/")) {
    const path = new URL(absUrl).pathname;
    try {
      return (await stat(fileURLToPath(new URL(`../../public${path}`, import.meta.url)))).size;
    } catch {}
  }
  try {
    const res = await fetch(absUrl, { method: "HEAD" });
    const n = Number(res.headers.get("content-length"));
    if (res.ok && n > 0) return n;
  } catch {}
  console.warn(`[podcast.xml] no byte length for ${absUrl}; using 0`);
  return 0;
}

export async function GET(context) {
  const site = new URL(context.site);
  const abs = (p) => new URL(p, site).href;
  const feedUrl = abs("/podcast.xml");

  const briefs = new Map(
    (await getCollection("briefs"))
      .filter((b) => b.data.published && !b.data.demo)
      .map((b) => [b.id, b])
  );

  const entries = Object.entries(audioIndex.items ?? {})
    .filter(([date, a]) => a?.url && briefs.has(date))
    .sort(([a], [b]) => (a < b ? 1 : -1));

  const items = await Promise.all(
    entries.map(async ([date, a]) => {
      const b = briefs.get(date);
      const briefUrl = abs(`/briefs/${b.id}/`);
      const audioUrl = abs(a.url);
      const bytes = await byteLength(a, audioUrl, site);
      const pub = a.recorded ? new Date(a.recorded) : b.data.date;
      const notes = `${b.data.dek ? b.data.dek.trim() + " " : ""}Read by an AI voice. Full edition with sources: ${briefUrl}`;
      return `    <item>
      <title>${esc(b.data.title)}</title>
      <description>${esc(notes)}</description>
      <itunes:summary>${esc(notes)}</itunes:summary>
      <link>${esc(briefUrl)}</link>
      <guid isPermaLink="false">waynesville-news-daily-brief-${date}</guid>
      <pubDate>${pub.toUTCString()}</pubDate>
      <enclosure url="${esc(audioUrl)}" length="${bytes}" type="audio/mpeg"/>
      <itunes:duration>${hms(a.seconds)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    })
  );

  const lastBuild = entries.length
    ? new Date(entries[0][1].recorded ?? briefs.get(entries[0][0]).data.date)
    : new Date();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(SHOW.title)}</title>
    <link>${esc(site.href)}</link>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml"/>
    <description>${esc(SHOW.description)}</description>
    <itunes:summary>${esc(SHOW.description)}</itunes:summary>
    <language>en-us</language>
    <copyright>© ${new Date().getFullYear()} Waynesville News</copyright>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <image>
      <url>${esc(abs(SHOW.cover))}</url>
      <title>${esc(SHOW.title)}</title>
      <link>${esc(site.href)}</link>
    </image>
    <itunes:image href="${esc(abs(SHOW.cover))}"/>
    <itunes:author>${esc(SHOW.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${esc(SHOW.author)}</itunes:name>
      <itunes:email>${esc(SHOW.email)}</itunes:email>
    </itunes:owner>
    <itunes:category text="News">
      <itunes:category text="Daily News"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <podcast:guid>${podcastGuid(feedUrl)}</podcast:guid>
    <podcast:locked owner="${esc(SHOW.email)}">no</podcast:locked>
    <podcast:medium>podcast</podcast:medium>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
