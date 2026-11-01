// Holiday Lights guide helpers. The guide lives at /holiday-lights/ and is
// promoted (home page, events page, daily brief) only inside its season window,
// so it switches itself on in November and off after the holidays.
import lights from "../data/holiday-lights.json";
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
