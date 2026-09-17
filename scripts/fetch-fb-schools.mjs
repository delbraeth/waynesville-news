// Pull recent Wayne Local Schools Facebook posts via an RSS bridge (rss.app),
// since Facebook itself is robots-blocked and cannot be fetched directly.
// Published as a short quoted post title + link + a plain-text excerpt; the
// district's own words, linked back to the post. Never invents anything.
//
// Fail-safe: on any fetch/parse error, or zero usable items, the previous
// src/data/fb-schools.json is kept (the bridge is unofficial and may rate-limit
// or break); it must never fail the workflow.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

// Public RSS-bridge feed for facebook.com/waynelocalschools. Not a secret — an
// unauthenticated feed URL. To change the source, regenerate the feed and swap
// this URL.
const FEED = "https://rss.app/feeds/eZlZu4grcHXQYIpD.xml";
const OUT = new URL("../src/data/fb-schools.json", import.meta.url);
const LOOKBACK_DAYS = 10;
const LIMIT = 8;

// Decode entities, strip HTML tags AND stray angle brackets. These strings are
// interpolated into brief Markdown and auto-published with no human review — a
// Facebook post containing markup must never ship as live HTML.
const clean = (s) =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const write = (items) =>
  writeFile(OUT, JSON.stringify({
    _note: "Recent Wayne Local Schools Facebook posts via rss.app bridge. Title + link + short excerpt; the district's own words. Fail-safe: kept from last run if the bridge is down.",
    updated: new Date().toISOString(),
    items,
  }, null, 2) + "\n");

async function main() {
  const res = await fetch(FEED, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const pickFrom = (block) => (tag) => {
    const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s").exec(block);
    return r ? clean(r[1]) : "";
  };

  const items = [...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((m) => {
    const pick = pickFrom(m[1]);
    let title = pick("title");
    let excerpt = pick("description");
    // rss.app often repeats the post's opening line as the title; if the excerpt
    // starts with the (de-ellipsised) title, drop the duplication.
    const t = title.replace(/[.…]+$/, "").trim();
    if (t && excerpt.toLowerCase().startsWith(t.toLowerCase())) excerpt = excerpt.slice(t.length).replace(/^[\s.…-]+/, "");
    // Trim boilerplate some bridges append.
    excerpt = excerpt.replace(/\bThe post .*? appeared first on .*$/i, "").trim();
    if (excerpt.length > 300) excerpt = excerpt.slice(0, 297).replace(/\s+\S*$/, "") + "…";
    if (title.length > 140) title = title.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    return { title, link: pick("link"), date: pick("pubDate"), excerpt };
  })
    .filter((i) => i.title && i.link)
    .filter((i) => {
      const t = Date.parse(i.date);
      return !isNaN(t) && t >= cutoff; // drop undated or stale posts
    })
    .map((i) => ({
      title: i.title,
      link: i.link.replace("://m.facebook.com", "://www.facebook.com"),
      date: i.date,
      dateLabel: new Date(i.date).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York",
      }),
      excerpt: i.excerpt,
    }))
    .slice(0, LIMIT);

  if (items.length === 0) throw new Error("no items in feed window");

  await write(items);
  console.log(`fb-schools.json: ${items.length} recent district posts`);
}

main().catch(async (e) => {
  console.error("fb-schools refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "fb-schools",
    writeEmpty: async (note) => { await write([]); },
  });
  process.exit(0); // don't fail the workflow
});
