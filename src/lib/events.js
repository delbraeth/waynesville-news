// Seasonal guides: events in events.json carrying a matching `tags` entry are
// pulled out onto their own page (e.g. /trick-or-treat/). A guide only shows
// up on the home and events pages while it has upcoming events, so it
// disappears on its own once the season is over. Tag community trick-or-treats,
// trunk-or-treats and treat walks open to kids, not haunted attractions.
import eventsData from "../data/events.json";

export const TRICK_OR_TREAT = "trick-or-treat";

export function upcomingEvents(tag) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return eventsData.items
    .filter((e) => !e.evergreen && e.dateISO)
    .filter((e) => !tag || (e.tags ?? []).includes(tag))
    .map((e) => ({
      ...e,
      _d: new Date(e.dateISO),
      // Multi-day events stay listed until their last day.
      _end: new Date(e.endISO ?? e.dateISO),
    }))
    .filter((e) => e._end >= startOfToday)
    .sort((a, b) => a._d.getTime() - b._d.getTime());
}
