// Pull upcoming programs from the Mary L. Cook Public Library's homepage
// "Upcoming Events" block. This is server-rendered (a WhoFi calendar feed
// baked into the Drupal page at build/request time) with a real ISO
// datetime on each entry — no scraping of a JS calendar widget needed.
// Canceled events (titled "Canceled Event - ...") are dropped. Nothing
// invented — titles, times, and links reproduced verbatim, each linking to
// the library's own event page.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const LIBRARY_URL = "https://www.mlcook.lib.oh.us/";
const CAP = 8;
const OUT = new URL("../src/data/library-events.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

// Decode entities, then strip literal angle brackets — titles are
// interpolated into auto-published Markdown where raw HTML would render.
const decodeEntities = (s) =>
  s.replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[<>]/g, "").trim();

// The site's datetime attributes carry a "Z" (UTC) suffix, but the digits are
// actually already Eastern wall-clock time (confirmed: the page's own human-
// readable text next to datetime="...T17:30:00Z" reads "5:30 pm", not the
// 1:30 pm a true UTC->Eastern conversion would give). Format using the literal
// UTC field values so the displayed time matches what the library intended.
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).replace(",", " ·");

async function main() {
  const res = await fetch(LIBRARY_URL, { headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Each event card: <a href="{eventUrl}?method=rss">{title}</a><br />\s*<time datetime="{ISO}" ...>
  const re = /<a href="(https:\/\/marylcook-main-oh\.whofi\.com\/calendar\/event\/\d+\/)\?method=rss">([^<]*)<\/a><br \/>\s*<time datetime="([^"]+)" class="datetime">/g;

  const now = new Date();
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    const [, link, rawTitle, dateISO] = m;
    const title = decodeEntities(rawTitle);
    if (/canceled event/i.test(title)) continue; // don't publish canceled programs
    if (new Date(dateISO) < now) continue; // only upcoming
    items.push({ title, dateISO, dateLabel: fmtDate(dateISO), link });
  }
  items.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

  await write(
    { items: items.slice(0, CAP) },
    "Mary L. Cook Public Library — upcoming programs from the library's own homepage event feed. Canceled events excluded."
  );
  console.log(`library-events.json: ${Math.min(items.length, CAP)} upcoming event(s)`);
}

main().catch(async (e) => {
  console.error("library events refresh failed:", e.message);
  if (existsSync(OUT)) {
    console.error("keeping previously fetched data (source may be temporarily down)");
  } else {
    await write({ items: [] }, "library events fetch failed; empty (draft omits the library programs line).");
  }
  process.exit(0); // don't fail the workflow
});
