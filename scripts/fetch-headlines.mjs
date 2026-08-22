// Pull candidate local headlines from Google News RSS (a stable feed that
// aggregates Dayton Daily News, WCPO, Warren County Post, etc.). Published as a
// quoted headline + source + link; never reproduce article body text.
//
// Best-effort enrichment: Google News RSS links redirect through a JS-rendered
// interstitial rather than the publisher's real URL, so a headless browser is
// used (if available) to follow the redirect and read the publisher's own
// meta description as a short, publisher-authored excerpt. This step is
// entirely optional — if no Chrome is available, or a page fails/times out,
// that item (or the whole batch) just falls back to the RSS headline alone,
// exactly as before. It must never fail the workflow.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const QUERY = '("Waynesville" OR "Warren County") Ohio';
const FEED = `https://news.google.com/rss/search?q=${encodeURIComponent(QUERY)}&hl=en-US&gl=US&ceid=US:en`;
const LIMIT = 8;
const LOOKBACK_DAYS = 7; // Google News ranks by relevance, not recency — a
// query can surface months-old articles (an obituary notice, a stale event
// writeup) mixed in with today's news. Filter to the same window used
// elsewhere in this pipeline before capping to LIMIT.
const OUT = new URL("../src/data/suggested-headlines.json", import.meta.url);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PER_PAGE_TIMEOUT_MS = 12_000;
const TOTAL_BROWSER_BUDGET_MS = 90_000;

// Decode entities, then strip literal angle brackets. These strings are
// interpolated into brief Markdown, and Astro renders raw HTML inside
// Markdown — with auto-publish and no human review, a hostile headline
// containing markup would otherwise ship straight to the live site.
const decode = (s) =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[<>]/g, "")
    .trim();

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

// For each item, follow the Google News redirect and read the publisher's own
// meta description as a short excerpt. Returns items unchanged if the browser
// can't be launched or the overall time budget is exhausted; per-item failures
// just skip enrichment for that one item.
async function enrichWithExcerpts(items) {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("headlines: no Chrome found (CHROME_PATH unset) — skipping excerpt enrichment");
    return items;
  }

  let puppeteer;
  try {
    ({ default: puppeteer } = await import("puppeteer-core"));
  } catch {
    console.log("headlines: puppeteer-core not installed — skipping excerpt enrichment");
    return items;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (e) {
    console.log(`headlines: Chrome failed to launch (${e.message}) — skipping excerpt enrichment`);
    return items;
  }

  const deadline = Date.now() + TOTAL_BROWSER_BUDGET_MS;
  const enriched = [];
  try {
    for (const item of items) {
      if (Date.now() > deadline) {
        enriched.push(item);
        continue;
      }
      try {
        const page = await browser.newPage();
        await page.setUserAgent(UA);
        await page.goto(item.link, { waitUntil: "networkidle2", timeout: PER_PAGE_TIMEOUT_MS });
        const resolvedUrl = page.url();
        const excerpt = (await page.evaluate(() => {
          const m = document.querySelector('meta[property="og:description"]') || document.querySelector('meta[name="description"]');
          return m ? m.content.trim() : "";
        })).replace(/[<>]/g, ""); // goes into published Markdown — never allow markup through
        await page.close();

        const redirected = resolvedUrl && !resolvedUrl.startsWith("https://news.google.com/");
        const usableExcerpt = excerpt && excerpt.length > 20 && excerpt.toLowerCase() !== item.title.toLowerCase();
        enriched.push(
          redirected && usableExcerpt ? { ...item, sourceUrl: resolvedUrl, excerpt } : item
        );
      } catch (e) {
        console.log(`headlines: enrichment failed for "${item.title}" (${e.message}) — using headline only`);
        enriched.push(item);
      }
    }
  } finally {
    await browser.close();
  }
  return enriched;
}

async function main() {
  const res = await fetch(FEED, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  let items = [...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((m) => {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s").exec(block);
      return r ? decode(r[1]) : "";
    };
    let title = pick("title");
    const source = pick("source");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(` - ${source}`).length);
    return { title, link: pick("link"), source, date: pick("pubDate") };
  })
    .filter((i) => i.title && i.link)
    .filter((i) => {
      const t = Date.parse(i.date);
      return !isNaN(t) && t >= cutoff; // drop undated or stale-dated items rather than risk showing them
    })
    .slice(0, LIMIT);

  items = await enrichWithExcerpts(items);

  await write(items, "Candidate local headlines (Google News RSS). Published as a quoted headline (or, when available, a short publisher-written excerpt) + source + link; never reproduce article body text.");
  console.log(`suggested-headlines.json: ${items.length} items (${items.filter((i) => i.excerpt).length} with excerpts)`);
}

main().catch(async (e) => {
  console.error("headlines refresh failed:", e.message);
  if (existsSync(OUT)) {
    console.error("keeping previously fetched data (source may be temporarily down)");
  } else {
    await write([], "headlines fetch failed; empty list (draft falls back to source pages).");
  }
  process.exit(0); // don't fail the workflow — the draft still works
});
