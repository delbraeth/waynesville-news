// Holiday Lights guide helpers. The guide lives at /holiday-lights/ and is
// promoted (home page, events page, daily brief) only inside its season window,
// so it switches itself on in November and off after the holidays.
import lights from "../data/holiday-lights.json";
import churches from "../data/churches.json";
import { slug } from "./slug.js";
import { upcomingEvents } from "./events.js";

export const HOLIDAY = "holiday";

const etToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" }); // YYYY-MM-DD

export function inHolidaySeason(today = etToday()) {
  const s = lights.season ?? {};
  return !!s.showFrom && !!s.showUntil && today >= s.showFrom && today <= s.showUntil;
}

// Displays that haven't ended. Undated (2026 dates not announced) ones stay listed.
export function currentDisplays(today = etToday()) {
  return (lights.items ?? []).filter((d) => d && d.name && (!d.endDate || d.endDate >= today));
}

export function holidayEvents() {
  return upcomingEvents(HOLIDAY);
}

export function holidayGuideCount() {
  return currentDisplays().length + holidayEvents().length;
}

// Christmas Eve services, kept on each church in churches.json as
// `christmasEve: { year, services: [{ start: "HH:MM", what }], source, checked }`.
// Only entries for this season's year count, so last year's never resurface.

const timeLabel = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "p.m." : "a.m.";
  const h12 = h % 12 || 12;
  return h === 0 && m === 0 ? "midnight" : `${h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${suffix}`;
};

export function christmasEveServices() {
  const year = lights.season?.label;
  return (churches.items ?? [])
    .filter((c) => c.christmasEve && c.christmasEve.year === year && (c.christmasEve.services ?? []).length)
    .flatMap((c) => c.christmasEve.services.map((s) => ({
      church: c.name, slug: slug(c.name), town: c.town, address: c.address, website: c.website, start: s.start, time: timeLabel(s.start), what: s.what ?? "",
    })))
    .sort((a, b) => a.start.localeCompare(b.start) || a.church.localeCompare(b.church));
}

// One church's services for this season, e.g. "5 p.m. family candlelight service · 11 p.m. ...".
export function christmasEveLine(church) {
  const ce = church?.christmasEve;
  if (!ce || ce.year !== lights.season?.label || !(ce.services ?? []).length) return "";
  return ce.services.map((s) => [timeLabel(s.start), s.what].filter(Boolean).join(" ")).join(" · ");
}
