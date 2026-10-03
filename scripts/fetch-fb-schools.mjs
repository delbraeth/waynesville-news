// Pull recent Facebook posts via an RSS bridge (rss.app), since Facebook itself
// is robots-blocked and cannot be fetched directly. One data file per page:
// Wayne Local Schools -> src/data/fb-schools.json, Caesar Creek State Park ->
// src/data/fb-caesar-creek.json, Friends of Warren County Park District ->
// src/data/fb-wcpd-friends.json. Published as a short quoted post title + link
// + a plain-text excerpt; the page's own words, linked back to the post. Never
// invents anything.
//
// Fail-safe, per feed: on any fetch/parse error, or zero usable items, that
// feed's previous data file is kept (the bridge is unofficial and may
// rate-limit or break); one feed failing never affects the other, and it must
// never fail the workflow.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

// Public RSS-bridge feeds. Not secrets — unauthenticated feed URLs. To change
// a source, regenerate its feed and swap the URL. `label` is also the
// stale-cache ceiling key (scripts/lib/stale-cache.mjs).
const FEEDS = [
  {
    label: "fb-schools", // facebook.com/waynelocalschools
    url: "https://rss.app/feeds/eZlZu4grcHXQYIpD.xml",
    out: new URL("../src/data/fb-schools.json", import.meta.url),
    what: "recent district posts",
    note: "Recent Wayne Local Schools Facebook posts via rss.app bridge. Title + link + short excerpt; the district's own words. Fail-safe: kept from last run if the bridge is down.",
  },
  {
    label: "fb-caesar-creek", // facebook.com/CaesarCreekStatePark
    url: "https://rss.app/feeds/dT9ew5lQ8k75PcvI.xml",
    out: new URL("../src/data/fb-caesar-creek.json", import.meta.url),
    what: "recent Caesar Creek State Park posts",
    note: "Recent Caesar Creek State Park Facebook posts via rss.app bridge. Title + link + short excerpt; the park's own words. Fail-safe: kept from last run if the bridge is down.",
  },
  {
    // The Park District's own events page (Constant Contact) sits behind a
    // Cloudflare bot challenge, so its volunteer Friends group's page is the
    // reachable stand-in. It is NOT the Park District itself — attribute it so.
    label: "fb-wcpd-friends", // facebook.com/FriendsWCPD
    url: "https://rss.app/feeds/cTEtys64i58eRDTL.xml",
    out: new URL("../src/data/fb-wcpd-friends.json", import.meta.url),
    what: "recent Friends of Warren County Park District posts",
    note: "Recent Friends of Warren County Park District Facebook posts via rss.app bridge. Title + link + short excerpt; the group's own words. Fail-safe: kept from last run if the bridge is down.",
  },
];
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

const write = (feed, items, note = feed.note) =>
  writeFile(feed.out, JSON.stringify({
    _note: note,
    updated: new Date().toISOString(),
    items,
  }, null, 2) + "\n");

async function refresh(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" }, signal: AbortSignal.timeout(20_000) });
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
    if (t && excerpt.toLowerCase().startsWith(t.toLowerCase())) {
      // rss.app truncates the title MID-WORD ("…welcomed special guest music..."),
      // so slicing the excerpt by the title's length resumed mid-word too
      // ("ians from Mrs. Weiland's class") and the two published as
      // "special guest music... ians from". Back the cut up to the last word
      // boundary inside the title so both sides keep whole words.
      let cut = t.length;
      if (/\w/.test(excerpt.charAt(cut) || "") && /\w/.test(t.slice(-1))) {
        const back = t.lastIndexOf(" ");
        if (back > 0) cut = back;
      }
      title = t.slice(0, cut).trim() + "…";
      excerpt = excerpt.slice(cut).replace(/^[\s.…-]+/, "");
    }
    // Trim boilerplate some bridges append.
    excerpt = excerpt.replace(/\bThe post .*? appeared first on .*$/i, "").trim();
    if (excerpt.length > 300) excerpt = excerpt.slice(0, 297).replace(/\s+\S*$/, "") + "…";
    if (title.length > 140) title = title.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    return { title, link: pick("link"), date: pick("pubDate"), excerpt };
  })
    .filter((i) => i.title && i.link)
    // Photo-only posts arrive titled "<Page name> Posted" with no text.
    .filter((i) => i.excerpt || !/\bPosted$/.test(i.title))
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

  await write(feed, items);
  console.log(`${feed.label}.json: ${items.length} ${feed.what}`);
}

for (const feed of FEEDS) {
  try {
    await refresh(feed);
  } catch (e) {
    console.error(`${feed.label} refresh failed:`, e.message);
    // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
    try {
      await keepOrExpire({
        out: feed.out,
        label: feed.label,
        writeEmpty: async (note) => { await write(feed, [], note); },
      });
    } catch (e2) {
      console.error(`${feed.label} fallback failed:`, e2.message);
    }
  }
}
process.exit(0); // don't fail the workflow
