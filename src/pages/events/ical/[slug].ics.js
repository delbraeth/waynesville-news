// One downloadable calendar file per dated event: /events/ical/<slug>.ics
import { eventSlug, icsFor } from "../../../lib/ical.js";
import { datedEvents } from "../../../lib/events.js";

// events.json plus the library and Caesar Creek feeds (see src/lib/events.js).
const dated = () => datedEvents();

export function getStaticPaths() {
  const seen = new Set();
  return dated()
    .filter((e) => { const s = eventSlug(e); if (seen.has(s)) return false; seen.add(s); return true; })
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
