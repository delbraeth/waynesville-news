// One downloadable calendar file per dated event: /events/ical/<slug>.ics
import { eventSlug, icsFor } from "../../../lib/ical.js";
import { datedEvents } from "../../../lib/events.js";

// events.json plus the library and Caesar Creek feeds (see src/lib/events.js).
const dated = () => datedEvents();

export function getStaticPaths() {
  // Two different events must never share a slug (and so a file and calendar
  // UID). The same event listed twice (same title and start) is fine.
  const seen = new Map();
  return dated()
    .filter((e) => {
      const s = eventSlug(e);
      const prev = seen.get(s);
      if (prev) {
        if (prev.title !== e.title || prev.dateISO !== e.dateISO) {
          throw new Error(`Calendar slug collision: "${prev.title}" (${prev.dateISO}) and "${e.title}" (${e.dateISO}) both map to ${s}.ics`);
        }
        return false;
      }
      seen.set(s, e);
      return true;
    })
    .map((e) => ({ params: { slug: eventSlug(e) }, props: { event: e } }));
}

export function GET({ props }) {
  return new Response(icsFor(props.event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${eventSlug(props.event)}.ics"`,
    },
  });
}
