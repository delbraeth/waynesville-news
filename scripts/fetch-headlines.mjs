// Pull candidate local headlines from Google News RSS (a stable feed that
// aggregates Dayton Daily News, WCPO, Warren County Post, etc.). These are
// SUGGESTIONS for the editor to read, summarize briefly, and link to the
// original source — never republish. Runs in CI/production, not the sandbox.
import { writeFile } from "node:fs/promises";

const QUERY = '("Waynesville" OR "Warren County") Ohio';
const FEED = `https://news.google.com/rss/search?q=${encodeURIComponent(QUERY)}&hl=en-US&gl=US&ceid=US:en`;
const LIMIT = 8;
const OUT = new URL("../src/data/suggested-headlines.json", import.meta.url);

const decode = (s) =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .trim();

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

async function main() {
  const res = await fetch(FEED, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>(.*?)<\/item>/gs)].slice(0, LIMIT).map((m) => {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s").exec(block);
      return r ? decode(r[1]) : "";
    };
    let title = pick("title");
    const source = pick("source");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(` - ${source}`).length);
    return { title, link: pick("link"), source, date: pick("pubDate") };
  }).filter((i) => i.title && i.link);

  await write(items, "Candidate local headlines (Google News RSS). Read the source, summarize briefly, link the original — never republish.");
  console.log(`suggested-headlines.json: ${items.length} items`);
}

main().catch(async (e) => {
  console.error("headlines refresh failed:", e.message);
  await write([], "headlines fetch failed; empty list (draft falls back to source pages).");
  process.exit(0); // don't fail the workflow — the draft still works
});
