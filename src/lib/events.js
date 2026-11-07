// Seasonal guides: events in events.json carrying a matching `tags` entry are
// pulled out onto their own page (e.g. /trick-or-treat/). A guide only shows
// up on the home and events pages while it has upcoming events, so it
// disappears on its own once the season is over. Tag community trick-or-treats,
// trunk-or-treats and treat walks open to kids, not haunted attractions.
import eventsData from "../data/events.json";
import libraryData from "../data/library-events.json";
import caesarData from "../data/caesar-creek-events.json";

export const TRICK_OR_TREAT = "trick-or-treat";

// "Waynesville area" vs. regional, like the directory's `local` flag. An event
// is local when its venue names a Waynesville-area place (same towns/ZIPs as
// scripts/fetch-directory.mjs, plus Caesar Creek); set `local: true|false` on
// an event in events.json to override (e.g. an online survey about Waynesville).
const LOCAL_RE = /\b(waynesville|corwin|harveysburg|oregonia|ridgeville|lytle|mount holly|crosswick|caesar creek|45068|45054|45065)\b/i;
export const isLocalEvent = (e) => (typeof e.local === "boolean" ? e.local : LOCAL_RE.test(e.venue ?? ""));

// Long-running items that have already started (a donation drive, a month-long
// request window) sort by their end date, so they don't sit above this
// weekend's dated events. Everything else sorts by start.
const WEEK = 7 * 86400000;
function sortKey(e, today) {
  const started = e._d < today;
  const long = e._end.getTime() - e._d.getTime() > WEEK;
  return started && long ? e._end.getTime() : e._d.getTime();
}

// Programs pulled automatically each morning (scripts/fetch-library-events.mjs,
// scripts/fetch-caesar-creek.mjs) join the hand-kept calendar. A feed program
// that's already in events.json (same day, same name) is left out, so the
// editor's entry, with its fuller note, wins.
const LIBRARY_VENUE = "Mary L. Cook Public Library, 381 Old Stage Rd., Waynesville";
const etDay = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const words = (t = "") => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
function sameEvent(a, b) {
  if (etDay(a.dateISO) !== etDay(b.dateISO)) return false;
  const wa = words(a.title), wb = words(b.title);
  if (!wa.size || !wb.size) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

function feedEvents() {
  const library = (libraryData.calendar ?? []).map((e) => ({
    title: e.title, dateISO: e.dateISO, ...(e.endISO ? { endISO: e.endISO } : {}), dateLabel: e.dateLabel,
    venue: LIBRARY_VENUE, category: "Library", source: e.link, local: true, signup: e.signup, _feed: "library",
  }));
  const caesar = (caesarData.items ?? []).map((e) => ({
    title: e.title, dateISO: e.dateISO, ...(e.endISO ? { endISO: e.endISO } : {}), dateLabel: e.dateLabel,
    venue: `Caesar Creek State Park${e.meetAt ? ` (${e.meetAt})` : ""}, Waynesville`, category: "Outdoors",
    source: e.link, ...(e.summary ? { note: e.summary } : {}), local: true, signup: e.signup, _feed: "caesar-creek",
  }));
  const manual = eventsData.items.filter((e) => !e.evergreen && e.dateISO);
  return [...library, ...caesar].filter((f) => f.title && f.dateISO && !manual.some((m) => sameEvent(m, f)));
}

// Every dated event: events.json plus the automatic feeds.
export function datedEvents() {
  return [...eventsData.items.filter((e) => !e.evergreen && e.dateISO), ...feedEvents()];
}

export function upcomingEvents(tag) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return datedEvents()
    .filter((e) => !tag || (e.tags ?? []).includes(tag))
    .map((e) => ({
      ...e,
      _local: isLocalEvent(e),
      _d: new Date(e.dateISO),
      // Multi-day events stay listed until their last day.
      _end: new Date(e.endISO ?? e.dateISO),
    }))
    .filter((e) => e._end >= startOfToday)
    .sort((a, b) => sortKey(a, startOfToday) - sortKey(b, startOfToday));
}

// Sign-up reminders: programs that need registration and are coming up within
// `days`, or whose registration opens within the next week. Each gets a short
// reader-facing line ("Registration opens Mon, Nov 23", "Sign up now").
const fmtDay = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export function signupReminders(days = 14) {
  const now = new Date();
  const today = etDay(now.toISOString());
  const inDays = (n) => etDay(new Date(now.getTime() + n * 86400000).toISOString());
  return upcomingEvents()
    .filter((e) => e.signup?.required && e._d > now)
    .map((e) => {
      const s = e.signup;
      let when = "";
      if (s.opens && s.opens > today) {
        if (s.opens > inDays(7)) return null; // not open yet and not soon
        when = `Registration opens ${fmtDay(s.opens)}`;
      } else if (s.deadline && s.deadline >= today) {
        when = `Sign up by ${fmtDay(s.deadline)}`;
      } else if (etDay(e.dateISO) > inDays(days)) {
        return null;
      } else {
        when = "Registration required";
      }
      const how = [s.inPerson && "in person at the library", s.cost].filter(Boolean).join(", ");
      return { ...e, signupLine: how ? `${when} (${how})` : when };
    })
    .filter(Boolean);
}
