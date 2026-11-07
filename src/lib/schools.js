// Wayne Local Schools: the district calendar (src/data/school-calendar.json,
// refreshed daily from the district's public Google Calendar, plus
// src/data/school-calendar-manual.json from the board-approved PDF) and
// today's status for the badge on the homepage and the Schools page.
//
// The status is computed when the site builds (each morning, after the
// closings check), so it always says when it was checked and points to the
// district for anything posted later. A delay or closing comes only from the
// district's own post (src/data/closings.json); nothing is inferred.
import gcal from "../data/school-calendar.json";
import manual from "../data/school-calendar-manual.json";
import closings from "../data/closings.json";

const ET = "America/New_York";
export const etDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: ET });
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const weekday = (iso) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 Sun … 6 Sat
export const fmtDay = (iso, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export const DISTRICT_NEWS = "https://www.wayne-local.com/district-news";
export const CALENDAR_PAGE = "https://www.wayne-local.com/calendars/wayne-local-schools/";
export const CALENDAR_PDF = manual.source;

// One list of calendar entries. Timed entries (board meetings) get a date in
// Eastern time. A manual entry is dropped when the Google Calendar already has
// an entry of the same kind on that day.
export function schoolCalendar() {
  const fromGoogle = (gcal.items ?? []).map((i) => ({
    ...i, date: i.date ?? etDate(new Date(i.dateISO)), from: "district",
  }));
  const covers = (i, d) => d >= i.date && d <= (i.endDate ?? i.date);
  const fromManual = (manual.items ?? [])
    .filter((m) => !fromGoogle.some((g) => g.kind === m.kind && (covers(g, m.date) || covers(m, g.date))))
    .map((m) => ({ ...m, from: "approved-calendar" }));
  return [...fromGoogle, ...fromManual].sort((a, b) => a.date.localeCompare(b.date) || (a.dateISO ?? "").localeCompare(b.dateISO ?? ""));
}

const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET });
export function whenLabel(i) {
  const day = fmtDay(i.date);
  if (i.endDate && i.endDate !== i.date) return `${day} – ${fmtDay(i.endDate)}`;
  return i.allDay === false && i.dateISO ? `${day} · ${timeLabel(i.dateISO)}` : day;
}

// Calendar entries touching the next `days` days (from today), in order.
export function upcomingSchoolDays(days = 7, kinds) {
  const today = etDate();
  const until = addDays(today, days);
  return schoolCalendar()
    .filter((i) => (i.endDate ?? i.date) >= today && i.date <= until)
    .filter((i) => !kinds || kinds.includes(i.kind));
}

// A district post about a delay/closing that applies to `day`. The listing
// gives a posted date only, so a post counts for the day it was posted and,
// when it names a weekday or a month and day, for that day.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function closingFor(day) {
  for (const c of closings.items ?? []) {
    const text = `${c.title} ${c.synopsis ?? ""}`;
    const posted = c.posted ? etDate(new Date(Date.parse(`${c.posted} 12:00:00 GMT-0500`))) : null;
    const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text);
    let applies = false;
    if (md) {
      const mon = MONTHS.indexOf(md[1].toLowerCase().slice(0, 3)) + 1;
      applies = day.slice(5) === `${String(mon).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
    } else {
      const named = DAYS.find((d) => new RegExp(`\\b${d}\\b`, "i").test(text));
      if (named) applies = DAYS[weekday(day)] === named && posted && day >= posted && day <= addDays(posted, 6);
      else if (/\btomorrow\b/i.test(text)) applies = posted && day === addDays(posted, 1);
      else applies = posted === day || (posted && day === addDays(posted, 1) && /\btonight\b|\bovernight\b/i.test(text));
    }
    if (!applies) continue;
    const kind = /\b(2|two)[- ]hour delay|\bdelay/i.test(text) ? "delay"
      : /early (dismissal|release)/i.test(text) ? "early"
      : /\b(remote|virtual|e-?learning|blizzard bag)\b/i.test(text) ? "remote"
      : "closed";
    return { kind, title: c.title, link: c.link };
  }
  return null;
}

// Today's status. state: closed | delay | early | remote | no-school | weekend | summer | open.
export function schoolStatus(now = new Date()) {
  const day = etDate(now);
  const asOf = now.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ET });
  const base = { day, dayLabel: fmtDay(day, { weekday: "long", month: "long", day: "numeric" }), asOf };

  const post = closingFor(day);
  if (post) {
    const label = { delay: "Delay", early: "Early dismissal", remote: "Remote learning day", closed: "Closed" }[post.kind];
    return { ...base, state: post.kind, label, detail: post.title, link: post.link };
  }

  const cal = schoolCalendar().filter((i) => day >= i.date && day <= (i.endDate ?? i.date));
  const off = cal.find((i) => i.kind === "no-school");
  if (off) return { ...base, state: "no-school", label: "No school", detail: off.title.replace(/^No School\s*[-–:]\s*/i, ""), link: CALENDAR_PAGE };

  const wd = weekday(day);
  if (wd === 0 || wd === 6) {
    const next = nextSchoolDay(day);
    return { ...base, state: "weekend", label: "No school", detail: `Weekend${next ? `; classes resume ${fmtDay(next, { weekday: "long", month: "short", day: "numeric" })}` : ""}` };
  }
  if (day < manual.firstDay || day > manual.lastDay) return { ...base, state: "summer", label: "Summer break", detail: "" };

  const early = cal.find((i) => i.kind === "early-release");
  if (early) return { ...base, state: "early", label: "2-hour early release", detail: early.title, link: CALENDAR_PAGE };

  return { ...base, state: "open", label: "Open", detail: "No delays or closings posted" };
}

// Next weekday that isn't a no-school day on the calendar.
export function nextSchoolDay(after) {
  const cal = schoolCalendar().filter((i) => i.kind === "no-school");
  let d = addDays(after, 1);
  for (let n = 0; n < 30; n++, d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 0 || wd === 6) continue;
    if (cal.some((i) => d >= i.date && d <= (i.endDate ?? i.date))) continue;
    return d;
  }
  return null;
}
