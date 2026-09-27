// Pull upcoming programs from the Mary L. Cook Public Library's WhoFi event
// calendar (https://marylcook-main-oh.whofi.com/calendar/full). That page is
// a shell around an iframe whose FullCalendar widget loads a JSON feed —
// fetch_calendar_events, which takes start/end dates — so read the feed
// directly instead of scraping HTML. Canceled events are dropped. Nothing
// invented — titles, times, and links reproduced verbatim, each linking to
// the library's own event page.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const CALENDAR_URL = "https://marylcook-main-oh.whofi.com/calendar/full";
const FEED_URL = "https://marylcook-main-oh.whofi.com/calendar/fetch_calendar_events";
const WINDOW_DAYS = 14;
const CAP = 8;
const OUT = new URL("../src/data/library-events.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

// Decode entities, then strip literal angle brackets — titles are
// interpolated into auto-published Markdown where raw HTML would render.
const decodeEntities = (s) =>
  s.replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[<>]/g, "").trim();

// The feed's "start" is a naive Eastern wall-clock string ("2026-10-06
// 15:00:00"). It's stored as dateISO with a "Z" suffix — the same fake-UTC
// convention the old homepage scrape produced and draft-brief.mjs expects —
// and formatted with timeZone: "UTC" so the label shows the library's own
// wall-clock time.
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).replace(",", " ·");

async function main() {
  // "Now" in the same fake-UTC form as dateISO, so same-day morning events
  // aren't dropped by a 4-5 hour offset.
  const nowET = new Date(
    new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T") + "Z"
  );
  const day = (d) => d.toISOString().slice(0, 10);
  const until = new Date(nowET.getTime() + WINDOW_DAYS * 86_400_000);
  const url = `${FEED_URL}?locationid=&categoryid=&audienceid=&ageid=&start=${day(nowET)}&end=${day(until)}`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)", Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const events = await res.json();
  if (!Array.isArray(events)) throw new Error("unexpected feed shape (not an array)");

  const items = [];
  for (const e of events) {
    const title = decodeEntities(e.clean_title ?? e.title ?? "");
    const start = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(e.start ?? "");
    if (!title || !start || !/^\d+$/.test(String(e.id))) continue;
    if (/cancel/i.test(`${title} ${e.status_message ?? ""}`)) continue; // don't publish canceled programs
    const dateISO = `${start[1]}T${start[2]}Z`;
    if (new Date(dateISO) < nowET) continue; // only upcoming (ET wall-clock, see nowET)
    items.push({ title, dateISO, dateLabel: fmtDate(dateISO), link: `https://marylcook-main-oh.whofi.com/calendar/event/${e.id}/` });
  }
  items.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

  await write(
    { items: items.slice(0, CAP) },
    `Mary L. Cook Public Library — upcoming programs from the library's WhoFi event calendar (${CALENDAR_URL}), next ${WINDOW_DAYS} days. Canceled events excluded.`
  );
  console.log(`library-events.json: ${Math.min(items.length, CAP)} upcoming event(s)`);
}

main().catch(async (e) => {
  console.error("library events refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "library-events",
    writeEmpty: async (note) => { await write({ items: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
