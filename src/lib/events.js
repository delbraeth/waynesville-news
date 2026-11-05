// Seasonal guides: events in events.json carrying a matching `tags` entry are
// pulled out onto their own page (e.g. /trick-or-treat/). A guide only shows
// up on the home and events pages while it has upcoming events, so it
// disappears on its own once the season is over. Tag community trick-or-treats,
// trunk-or-treats and treat walks open to kids, not haunted attractions.
import eventsData from "../data/events.json";

export const TRICK_OR_TREAT = "trick-or-treat";

// "Waynesville area" vs. regional, like the directory's `local` flag. An event
// is local when its venue names a Waynesville-area place (same towns/ZIPs as
// scripts/fetch-directory.mjs, plus Caesar Creek); set `local: true|false` on
// an event in events.json to override (e.g. an online survey about Waynesville).
const LOCAL_RE = /\b(waynesville|corwin|harveysburg|oregonia|ridgeville|lytle|mount holly|crosswick|caesar creek|45068|45054|45065)\b/i;
export const isLocalEvent = (e) => (typeof e.local === "boolean" ? e.local : LOCAL_RE.test(e.venue ?? ""));

export function upcomingEvents(tag) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return eventsData.items
    .filter((e) => !e.evergreen && e.dateISO)
    .filter((e) => !tag || (e.tags ?? []).includes(tag))
    .map((e) => ({
      ...e,
      _local: isLocalEvent(e),
      _d: new Date(e.dateISO),
      // Multi-day events stay listed until their last day.
      _end: new Date(e.endISO ?? e.dateISO),
    }))
    .filter((e) => e._end >= startOfToday)
    .sort((a, b) => a._d.getTime() - b._d.getTime());
}
