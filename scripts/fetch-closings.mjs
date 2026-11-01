// Wayne Local Schools delays and closings, from the district's own news page:
// https://www.wayne-local.com/district-news (no RSS; the listing HTML is parsed).
//
// The district posts every delay/closing there ("Wayne Local Schools will be on
// a 2 hour delay on February 20, 2025"), and on Facebook. This keeps only posts
// from the last 36 hours that read as a schedule change (scripts/lib/closings.mjs)
// and writes src/data/closings.json; draft-brief.mjs puts them at the top of
// the brief. Titles are the district's own words, linked back.
//
// Fail-safe: on error the previous file is kept for at most one day (CEILINGS),
// because a delay notice is only true for one morning.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";
import { isScheduleChange, CLOSING_WINDOW_HOURS } from "./lib/closings.mjs";

const OUT = new URL("../src/data/closings.json", import.meta.url);
// Testing: `node scripts/fetch-closings.mjs --dry --hours 9000 --page 20` reads an
// older listing page with a wider window and prints matches without writing.
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes("--dry");
const URL_NEWS = "https://www.wayne-local.com/district-news" + (arg("--page") ? `?page=${arg("--page")}` : "");
const WINDOW_HOURS = Number(arg("--hours")) || CLOSING_WINDOW_HOURS;
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
const NOTE = "Wayne Local Schools delays/closings posted on wayne-local.com/district-news in the last 36 hours. The district's own words, linked. Built by scripts/fetch-closings.mjs.";

const decode = (s) => String(s ?? "")
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&lt;|&gt;|[<>]/g, "")
  .replace(/\s+/g, " ").trim();

const write = (items, note = NOTE) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

async function main() {
  const res = await fetch(URL_NEWS, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Each entry: title link, then a date like "OCT 7, 2026", then a synopsis.
  const blocks = html.split(/class="divBlogDetail divBlogDetail-title"/).slice(1);
  if (!blocks.length) throw new Error("no news entries found — page layout changed?");

  const cutoff = Date.now() - WINDOW_HOURS * 3600_000;
  const items = [];
  for (const b of blocks) {
    const a = /<a class="anchBlogTitle" href="([^"]+)">([\s\S]*?)<\/a>/.exec(b);
    const d = /divBlogDateDetail-date">\s*([A-Z]{3} \d{1,2}, \d{4})/.exec(b);
    if (!a || !d) continue;
    const syn = /divBlockBody-synopsis[^>]*>([\s\S]*?)<\/div>/.exec(b);
    const title = decode(a[2]);
    const synopsis = decode(syn?.[1] ?? "");
    // The listing shows a date only; treat it as noon ET that day so a post
    // from yesterday still counts this morning and one from two days ago doesn't.
    const posted = Date.parse(`${d[1]} 12:00:00 GMT-0500`);
    if (isNaN(posted) || posted < cutoff) continue;
    if (!isScheduleChange(`${title} ${synopsis}`)) continue;
    items.push({ title, link: a[1], posted: d[1], synopsis: synopsis.slice(0, 280) });
  }
  if (DRY) { console.log(JSON.stringify(items, null, 2)); return; }
  await write(items);
  console.log(`closings.json: ${items.length ? items.map((i) => i.title).join("; ") : "no delays or closings posted in the last 36 hours"}`);
}

main().catch(async (e) => {
  const r = await keepOrExpire({ out: OUT, label: "closings", writeEmpty: (note) => write([], note) });
  console.error(`Closings refresh failed (${e.message}); cache ${r}.`);
  process.exit(0);
});
