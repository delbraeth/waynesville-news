// "Add to calendar" support for events.json items: a stable slug, an .ics
// file body (served from /events/ical/<slug>.ics), and a Google Calendar link.
//
// Timing rules, so calendars show something sensible:
// - Same-day event with a real start time → timed event (end = endISO, or
//   start + 1 hour when no end is given).
// - Multi-day event, or a start at midnight / 11:59 PM (all-day or a
//   deadline) → all-day event across its dates; the dateLabel (which carries
//   the daily hours) goes in the description.
const SITE = "https://waynesville.news";

const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

export const eventSlug = (e) => `${(e.dateISO ?? "").slice(0, 10)}-${slugify(e.title)}`;
export const icsHref = (e) => `/events/ical/${eventSlug(e)}.ics`;

const ymd = (iso) => iso.slice(0, 10).replace(/-/g, "");
const addDays = (isoDate, n) => {
  const d = new Date(isoDate.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function eventTiming(e) {
  const start = e.dateISO;
  const end = e.endISO ?? null;
  const startDay = start.slice(0, 10);
  const endDay = (end ?? start).slice(0, 10);
  const hhmm = start.slice(11, 16);
  const allDay = endDay !== startDay || hhmm === "00:00" || hhmm === "23:59";
  if (allDay) {
    // DTEND for all-day events is exclusive: the day after the last day.
    return { allDay, startDate: ymd(startDay), endDate: ymd(addDays(endDay, 1)) };
  }
  const s = new Date(start);
  const en = end ? new Date(end) : new Date(s.getTime() + 60 * 60 * 1000);
  return { allDay, start: utcStamp(s), end: utcStamp(en > s ? en : new Date(s.getTime() + 60 * 60 * 1000)) };
}

const describe = (e) =>
  [e.dateLabel, e.note, e.source ? `Details: ${e.source.startsWith("/") ? SITE + e.source : e.source}` : "", `From the Waynesville News events calendar: ${SITE}/events/`]
    .filter(Boolean).join("\n\n");

// RFC 5545 text escaping and 75-octet line folding.
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function icsFor(e, now = new Date()) {
  const t = eventTiming(e);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waynesville News//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventSlug(e)}@waynesville.news`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(t.allDay
      ? [`DTSTART;VALUE=DATE:${t.startDate}`, `DTEND;VALUE=DATE:${t.endDate}`]
      : [`DTSTART:${t.start}`, `DTEND:${t.end}`]),
    `SUMMARY:${esc(e.title)}`,
    ...(e.venue ? [`LOCATION:${esc(e.venue)}`] : []),
    `DESCRIPTION:${esc(describe(e))}`,
    ...(e.source ? [`URL:${e.source.startsWith("/") ? SITE + e.source : e.source}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e) {
  const t = eventTiming(e);
  const dates = t.allDay ? `${t.startDate}/${t.endDate}` : `${t.start}/${t.end}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details: describe(e) });
  if (e.venue) p.set("location", e.venue);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
