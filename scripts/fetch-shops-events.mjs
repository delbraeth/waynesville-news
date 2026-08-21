// Pull upcoming events from the Waynesville Merchant Association
// (waynesvilleshops.com) — the Main/High Street antiques-district group.
// Their homepage sidebar lists upcoming event links; each event's own page
// has a structured "Start:"/"End:" block with a real date and time. No
// scraping of prose/Facebook-only listings — only events with their own
// detail page and structured times are included. Times are reproduced
// verbatim; nothing invented. Respects the site's robots.txt Crawl-Delay
// of 20s between requests.
import { writeFile } from "node:fs/promises";

const HOME_URL = "https://waynesvilleshops.com/";
const CAP = 6;
const CRAWL_DELAY_MS = 20_000;
const TOTAL_BUDGET_MS = 3 * 60_000; // don't let a slow site block the workflow indefinitely
const OUT = new URL("../src/data/shops-events.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

// The site's posted times are Eastern wall-clock. Rather than convert to a
// true UTC instant (which would need DST-aware handling to redisplay
// correctly), store the digits directly as if they were UTC and format
// back out with timeZone: "UTC" — same convention already used for
// library-events.mjs. Good enough for a display label; "upcoming" date
// filtering has multi-day margin so a few hours of internal skew doesn't
// matter.
function parseEasternDateTime(str) {
  // e.g. "Sep 12, 2026 10:00 AM"
  const m = /([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(str);
  if (!m) return null;
  const [, monStr, day, year, hourStr, min, ampm] = m;
  const monthIdx = MONTHS[monStr.toLowerCase().slice(0, 3)];
  if (monthIdx === undefined) return null;
  let hour = Number(hourStr) % 12;
  if (/pm/i.test(ampm)) hour += 12;
  return new Date(Date.UTC(Number(year), monthIdx, Number(day), hour, Number(min)));
}

const fmtDate = (d) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtTime = (d) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

async function main() {
  const res = await fetch(HOME_URL, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const linkRe = /<div class="side side-event">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g;
  const seen = new Set();
  const links = [];
  let lm;
  while ((lm = linkRe.exec(html))) {
    if (!seen.has(lm[1])) { seen.add(lm[1]); links.push(lm[1]); }
  }

  const items = [];
  const budgetStart = Date.now();
  for (const link of links.slice(0, CAP)) {
    if (Date.now() - budgetStart > TOTAL_BUDGET_MS) break;
    let detailHtml;
    try {
      const r = await fetch(link, { headers: UA });
      if (!r.ok) { await sleep(CRAWL_DELAY_MS); continue; }
      detailHtml = await r.text();
    } catch {
      await sleep(CRAWL_DELAY_MS);
      continue;
    }

    const titleM = /<div id="the-content">[\s\S]*?<h2>([^<]+)<\/h2>/.exec(detailHtml);
    // End: has no trailing <br> (it's the last field before </p>), so accept either.
    const startM = /Start:<\/span>\s*([^<]+?)(?:<br|<\/p)/.exec(detailHtml);
    const endM = /End:<\/span>\s*([^<]+?)(?:<br|<\/p)/.exec(detailHtml);
    const start = startM ? parseEasternDateTime(startM[1]) : null;

    if (titleM && start) {
      const end = endM ? parseEasternDateTime(endM[1]) : null;
      const timeRange = end && end.getTime() !== start.getTime()
        ? `${fmtTime(start)}–${fmtTime(end)}`
        : fmtTime(start);
      items.push({
        title: titleM[1].trim(),
        dateISO: start.toISOString(),
        dateLabel: `${fmtDate(start)} · ${timeRange}`,
        link,
      });
    }

    await sleep(CRAWL_DELAY_MS);
  }

  const now = new Date();
  const upcoming = items
    .filter((e) => new Date(e.dateISO) >= now)
    .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

  await write(
    { items: upcoming },
    "Waynesville Merchant Association (waynesvilleshops.com) — upcoming events with their own detail page and a structured Start/End time; times reproduced verbatim."
  );
  console.log(`shops-events.json: ${upcoming.length} upcoming event(s)`);
}

main().catch(async (e) => {
  console.error("shops events refresh failed:", e.message);
  await write({ items: [] }, "shops events fetch failed; empty (draft omits the shops events line).");
  process.exit(0); // don't fail the workflow
});
