// Upcoming sessions at the Museum at the Friends Home (ghost walks, dinners,
// classes), with exact start times from its Wix Bookings calendar.
//
// The museum's pages don't publish start times; its booking widget does.
// These are the same anonymous endpoints the public booking page calls:
//   1. /_api/v1/access-tokens  -> anonymous Bookings app instance token
//   2. /_api/bookings/v2/services/query  -> service names
//   3. /_api/availability-calendar/v1/availability/query -> dated sessions
// Undocumented, so they may change without notice; failure falls back to the
// bounded cache like every other source. Sold-out sessions are kept and marked.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const SITE = "https://www.friendshomemuseum.org";
const BOOKINGS_APP = "13d21c63-b5ec-5912-8397-c3a5ddb27a97";
const OUT = new URL("../src/data/museum-events.json", import.meta.url);
const UA = { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" };
const WINDOW_DAYS = 45;

async function api(path, auth, body) {
  const res = await fetch(`${SITE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...UA, ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

const clean = (s) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const fmtET = (iso, opts) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", ...opts });

async function main() {
  const tokens = await api("/_api/v1/access-tokens");
  const auth = tokens?.apps?.[BOOKINGS_APP]?.instance;
  if (!auth) throw new Error("no Bookings app token — site setup changed");

  const { services = [] } = await api("/_api/bookings/v2/services/query", auth, { query: { paging: { limit: 100 } } });
  if (services.length === 0) throw new Error("no booking services listed — API changed");
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));

  const start = new Date();
  const end = new Date(start.getTime() + WINDOW_DAYS * 86400000);
  const avail = await api("/_api/availability-calendar/v1/availability/query", auth, {
    query: { filter: { serviceId: services.map((s) => s.id), startDate: start.toISOString(), endDate: end.toISOString() } },
    timezone: "America/New_York",
  });

  const items = (avail.availabilityEntries ?? [])
    .map(({ slot, bookable, openSpots, totalSpots }) => {
      const svc = byId[slot?.serviceId];
      if (!svc || !slot?.startDate) return null;
      const slug = svc.mainSlug?.name;
      return {
        title: clean(svc.name),
        startISO: slot.startDate,
        endISO: slot.endDate ?? null,
        dateLabel: `${fmtET(slot.startDate, { weekday: "short", month: "short", day: "numeric" })} · ${fmtET(slot.startDate, { hour: "numeric", minute: "2-digit" })}`,
        location: clean(slot.location?.formattedAddress) || null,
        soldOut: bookable === false || openSpots === 0,
        openSpots: typeof openSpots === "number" ? openSpots : null,
        totalSpots: typeof totalSpots === "number" ? totalSpots : null,
        link: slug ? `${SITE}/service-page/${slug}` : `${SITE}/ghost-tours-class-dinners`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));

  await writeFile(OUT, JSON.stringify({
    _note: `Museum at the Friends Home bookable sessions in the next ${WINDOW_DAYS} days, from its Wix Bookings calendar. Names and times are the museum's own; sold-out sessions are kept and flagged.`,
    updated: new Date().toISOString(),
    items,
  }, null, 2) + "\n");
  console.log(`museum-events.json: ${items.length} session(s) in the next ${WINDOW_DAYS} days (${items.filter((i) => i.soldOut).length} sold out)`);
}

main().catch(async (e) => {
  console.error("museum events refresh failed:", e.message);
  await keepOrExpire({
    out: OUT,
    label: "museum-events",
    writeEmpty: async (note) => { await writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items: [] }, null, 2) + "\n"); },
  });
  process.exit(0); // don't fail the workflow
});
