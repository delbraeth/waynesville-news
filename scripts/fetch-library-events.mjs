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
import { parseSignup } from "./lib/signup.mjs";

const CALENDAR_URL = "https://marylcook-main-oh.whofi.com/calendar/full";
const FEED_URL = "https://marylcook-main-oh.whofi.com/calendar/fetch_calendar_events";
const WINDOW_DAYS = 14;
const CAP = 8;
// The events calendar (src/lib/events.js) reads "calendar": every program in
// the next CALENDAR_DAYS, each with sign-up details read from its own page.
const CALENDAR_DAYS = 45;
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
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

// The feed's titles can carry a time prefix ("10:30a | Toddler Time").
const stripTimePrefix = (t) => t.replace(/^\d{1,2}(:\d{2})?\s*[ap]m?\s*\|\s*/i, "").trim();

// Fake-UTC wall clock → a real instant with the Eastern offset in effect.
function realISO(fakeUTC) {
  const d = new Date(fakeUTC);
  const probe = new Date(d.getTime() + 5 * 3_600_000);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const off = (/GMT([+-]\d{2}:\d{2})/.exec(name) || [, "-05:00"])[1];
  return fakeUTC.replace(/Z$/, "").slice(0, 19) + off;
}

// The program's own page: plain-text description (used only to read sign-up
// details; never published, since it can name staff) and room.
async function eventDetails(id) {
  try {
    const res = await fetch(`https://marylcook-main-oh.whofi.com/calendar/event/${id}`, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return {};
    const html = await res.text();
    const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    const from = text.indexOf(" ICS ");
    const body = from >= 0 ? text.slice(from + 5) : text;
    const dateAt = body.search(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}, \d{4}\b/);
    const desc = dateAt > 0 ? body.slice(0, dateAt) : "";
    return { desc };
  } catch { return {}; }
}

async function buildCalendar(events, nowET) {
  const until = nowET.getTime() + CALENDAR_DAYS * 86_400_000;
  const picked = [];
  for (const e of events) {
    if (e.type && e.type !== "event") continue; // closures ("Thanksgiving") aren't programs
    if (e.closure_name) continue;
    const title = stripTimePrefix(decodeEntities(e.clean_title ?? e.title ?? ""));
    const start = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/.exec(e.start ?? "");
    const end = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/.exec(e.end ?? "");
    if (!title || !start || !/^\d+$/.test(String(e.id))) continue;
    if (/cancel/i.test(`${title} ${e.status_message ?? ""}`)) continue;
    const fake = `${start[1]}T${start[2]}:00Z`;
    if (new Date(fake) < nowET || new Date(fake).getTime() > until) continue;
    picked.push({ id: String(e.id), title, fake, fakeEnd: end ? `${end[1]}T${end[2]}:00Z` : null });
  }
  picked.sort((a, b) => new Date(a.fake) - new Date(b.fake));
  // Same program's page once (weekly storytimes share a description but not an id).
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < picked.length) { const p = picked[i++]; p.details = await eventDetails(p.id); }
  }));
  return picked.map((p) => {
    // A start before 6 AM is a data-entry slip on the library's side
    // ("4:15a" for an after-school class); show the date without a time.
    const hour = Number(p.fake.slice(11, 13));
    const timeOK = hour >= 6;
    const day = new Date(p.fake).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const signup = parseSignup(p.details?.desc ?? "", p.fake);
    return {
      title: p.title,
      dateISO: timeOK ? realISO(p.fake) : `${p.fake.slice(0, 10)}T12:00:00${realISO(p.fake).slice(19)}`,
      ...(timeOK && p.fakeEnd && p.fakeEnd > p.fake ? { endISO: realISO(p.fakeEnd) } : {}),
      // Same "Sat, Nov 7 · 10:00 AM" form as the rest of the calendar.
      dateLabel: timeOK
        ? `${day} · ${new Date(p.fake).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`
        : `${day} · check the library for the time`,
      link: `https://marylcook-main-oh.whofi.com/calendar/event/${p.id}/`,
      ...(signup ? { signup } : {}),
    };
  });
}

async function main() {
  // "Now" in the same fake-UTC form as dateISO, so same-day morning events
  // aren't dropped by a 4-5 hour offset.
  const nowET = new Date(
    new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T") + "Z"
  );
  const day = (d) => d.toISOString().slice(0, 10);
  const until = new Date(nowET.getTime() + CALENDAR_DAYS * 86_400_000);
  const briefUntil = new Date(nowET.getTime() + WINDOW_DAYS * 86_400_000);
  const url = `${FEED_URL}?locationid=&categoryid=&audienceid=&ageid=&start=${day(nowET)}&end=${day(until)}`;

  const res = await fetch(url, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
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
    if (new Date(dateISO) > briefUntil) continue; // the brief shows the next two weeks
    items.push({ title, dateISO, dateLabel: fmtDate(dateISO), link: `https://marylcook-main-oh.whofi.com/calendar/event/${e.id}/` });
  }
  items.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
  const calendar = await buildCalendar(events, nowET);

  await write(
    { items: items.slice(0, CAP), calendar },
    `Mary L. Cook Public Library — upcoming programs from the library's WhoFi event calendar (${CALENDAR_URL}). "items": next ${WINDOW_DAYS} days, for the daily brief (dateISO is Eastern wall-clock marked Z). "calendar": next ${CALENDAR_DAYS} days for the events calendar, real offsets, with sign-up details read from each program's page (scripts/lib/signup.mjs). Canceled events and closures excluded.`
  );
  console.log(`library-events.json: ${Math.min(items.length, CAP)} upcoming event(s) for the brief; ${calendar.length} on the calendar (${calendar.filter((c) => c.signup?.required).length} need sign-up)`);
}

main().catch(async (e) => {
  console.error("library events refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "library-events",
    writeEmpty: async (note) => { await write({ items: [], calendar: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
