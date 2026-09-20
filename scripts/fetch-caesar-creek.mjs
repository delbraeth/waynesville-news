// Pull upcoming Caesar Creek State Park programs from ODNR.
//
// The public events calendar at
//   ohiodnr.gov/go-and-do/plan-a-visit/events-calendar/events-calendar?keyword=Caesar%20Creek
// renders nothing server-side — the raw HTML contains zero event text. Its own
// JavaScript fetches the whole statewide event set from a plain JSON endpoint
// and filters it in the browser. We call that same endpoint directly and apply
// the same keyword filter, so there is no scraping, no headless browser, and
// no bot-detection to fight. If ODNR ever changes the endpoint, this fetcher
// fails loudly and the section expires rather than going stale (see
// scripts/lib/stale-cache.mjs).
//
// Caesar Creek State Park is roughly five miles east of the village, and its
// naturalist programs — fossil hunts at the spillway, night hikes, Pioneer
// Village events — are the closest thing Waynesville has to a public outdoor
// calendar. Only events whose ODNR title names Caesar Creek are included;
// nothing is inferred from geography.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const API_URL =
  "https://ohiodnr.gov/wps/odx-common/content/search/odnr.en?q=authoringTemplate:Event&size=2000";
const CALENDAR_URL =
  "https://ohiodnr.gov/go-and-do/plan-a-visit/events-calendar/events-calendar?keyword=Caesar%20Creek";
const KEYWORD = "caesar creek";
const HORIZON_DAYS = 60; // how far ahead to cache; the brief shows a shorter window
const OUT = new URL("../src/data/caesar-creek-events.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

// Unlike the shops/library fetchers — which parse wall-clock strings and store
// them as fake-UTC — ODNR hands us true epoch milliseconds. So these are real
// instants and we format them in Eastern, which stays correct across the
// November DST change.
const ET = "America/New_York";
const fmtDate = (d) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET });
const fmtTime = (d) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET });

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// Titles read "Fossil Hunt at the Spillway - Caesar Creek". Inside a section
// already headed Caesar Creek, that suffix is noise.
const stripParkSuffix = (title) =>
  collapse(title).replace(/\s*[-–—]\s*Caesar\s+Creek(\s+State\s+Park)?\s*$/i, "");

// Turn a WCM content path into the public event page.
//
// ODNR's own calendar JS rewrites the path to /wps/portal/gov/odnr/... — that
// form 404s (or returns an empty shell) for anything but a real browser
// session. The public vanity path, which is just the content path with the
// "Ohio Content English/odnr" prefix removed, serves the fully rendered event
// page. Twenty-one of the twenty-four current paths end in a stray dot left by
// the CMS, and that dot is load-bearing: strip it and you get a 200 with an
// empty page body, which is worse than a 404 because nothing looks broken.
// So the path is passed through exactly as stored.
const eventURL = (contentPath) => {
  const path = String(contentPath ?? "").replace(/^.*?\/odnr/i, "");
  if (!path.startsWith("/")) return null;
  return "https://ohiodnr.gov" + encodeURI(path);
};

async function main() {
  const res = await fetch(API_URL, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const hits = data?.hits?.hits;
  if (!Array.isArray(hits) || hits.length === 0) {
    throw new Error("event feed returned no hits — endpoint shape may have changed");
  }

  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 86_400_000;

  const items = [];
  for (const hit of hits) {
    const src = hit?._source ?? {};
    const el = src.elements ?? {};
    const title = collapse(src.title);
    if (!title.toLowerCase().includes(KEYWORD)) continue;

    const startMs = Number(el.startDateAndTime);
    if (!Number.isFinite(startMs) || startMs <= 0) continue;
    if (startMs < now || startMs > horizon) continue;

    const start = new Date(startMs);
    const endMs = Number(el.endDateAndTime);
    const end = Number.isFinite(endMs) && endMs > startMs ? new Date(endMs) : null;
    const timeRange = end ? `${fmtTime(start)}–${fmtTime(end)}` : fmtTime(start);

    items.push({
      title: stripParkSuffix(title) || title,
      dateISO: start.toISOString(),
      dateLabel: `${fmtDate(start)} · ${timeRange}`,
      // Where to actually show up — ODNR puts the meeting point here.
      meetAt: collapse(el.locationName) || null,
      summary: collapse(el.summary) || null,
      link: eventURL(src.contentPath) ?? CALENDAR_URL,
    });
  }

  items.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

  await write(
    { source: CALENDAR_URL, items },
    "Caesar Creek State Park programs from the ODNR events calendar, next " +
      `${HORIZON_DAYS} days. Titles, times and meeting points reproduced from ODNR's own listing.`
  );
  console.log(`caesar-creek-events.json: ${items.length} upcoming event(s)`);
}

main().catch(async (e) => {
  console.error("caesar creek refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "caesar-creek-events",
    writeEmpty: async (note) => { await write({ source: CALENDAR_URL, items: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
