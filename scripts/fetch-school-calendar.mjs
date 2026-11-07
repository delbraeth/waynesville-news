// Wayne Local Schools district calendar, from the public Google Calendar the
// district embeds on https://www.wayne-local.com/calendars/wayne-local-schools/
// (its public iCal feed). Writes src/data/school-calendar.json; the Schools
// page, the school status badge and src/lib/schools.js read it, together with
// the hand-kept src/data/school-calendar-manual.json (from the board-approved
// PDF calendar, for dates the district hasn't put on the Google Calendar yet).
//
// Titles are the district's own. Only past-30-days-to-next-year events are
// kept. On failure the previous file is kept for a week (stale-cache.mjs).
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const CAL_ID = "c_5600ebade3e1ab81f0080e8d62ac8c72adb0ff2569099cad0bb29aea49c0ffe6@group.calendar.google.com";
const ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CAL_ID)}/public/basic.ics`;
const PAGE_URL = "https://www.wayne-local.com/calendars/wayne-local-schools/";
const OUT = new URL("../src/data/school-calendar.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), source: PAGE_URL, items }, null, 2) + "\n");

const unescape = (s = "") => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").replace(/\s+/g, " ").trim();

// "20261123" → "2026-11-23"; "20261109T230000Z" → ISO instant.
function parseDate(v) {
  if (/^\d{8}$/.test(v)) return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, allDay: true };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? "Z" : ""}`;
  return { iso: new Date(iso).toISOString(), allDay: false };
}

// What kind of day it is, from the district's title.
export function kindOf(title) {
  if (/\bno school\b|\bbreak\b|\bholiday\b|day off|conference exchange/i.test(title)) return "no-school";
  if (/early release|early dismissal/i.test(title)) return "early-release";
  if (/board/i.test(title) && /meeting|retreat|hearing|session/i.test(title)) return "board";
  return "event";
}

async function main() {
  const res = await fetch(ICS_URL, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (await res.text()).replace(/\r?\n[ \t]/g, ""); // unfold lines
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCal feed");

  const now = Date.now();
  const from = now - 30 * 86_400_000;
  const to = now + 400 * 86_400_000;
  const items = [];
  for (const block of text.split("BEGIN:VEVENT").slice(1)) {
    const get = (k) => (new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "m").exec(block) || [])[1]?.trim() ?? "";
    const title = unescape(get("SUMMARY"));
    if (!title || /^STATUS:CANCELLED/m.test(block)) continue;
    const start = parseDate(get("DTSTART"));
    const end = parseDate(get("DTEND"));
    if (!start) continue;
    let item;
    if (start.allDay) {
      // DTEND is exclusive for all-day events: "20261123"–"20261128" is Nov 23–27.
      const last = end?.date ? new Date(Date.parse(end.date + "T12:00:00Z") - 86_400_000).toISOString().slice(0, 10) : start.date;
      item = { title, date: start.date, ...(last > start.date ? { endDate: last } : {}), allDay: true };
    } else {
      item = { title, dateISO: start.iso, ...(end?.iso ? { endISO: end.iso } : {}), allDay: false };
    }
    const t = Date.parse(item.date ? item.date + "T12:00:00Z" : item.dateISO);
    const tEnd = Date.parse(item.endDate ? item.endDate + "T12:00:00Z" : item.endISO ?? item.dateISO ?? item.date + "T12:00:00Z");
    if (tEnd < from || t > to) continue;
    const location = unescape(get("LOCATION"));
    items.push({ ...item, kind: kindOf(title), ...(location ? { location } : {}) });
  }
  items.sort((a, b) => (a.date ?? a.dateISO).localeCompare(b.date ?? b.dateISO));
  await write(items, `Wayne Local Schools district calendar (public Google Calendar embedded at ${PAGE_URL}). District's own titles. Built by scripts/fetch-school-calendar.mjs; dates the district hasn't entered yet come from src/data/school-calendar-manual.json.`);
  console.log(`school-calendar.json: ${items.length} event(s), ${items.filter((i) => i.kind === "no-school").length} no-school`);
}

main().catch(async (e) => {
  console.error("school calendar refresh failed:", e.message);
  await keepOrExpire({ out: OUT, label: "school-calendar", writeEmpty: async (note) => { await write([], note); } });
  process.exit(0);
});
