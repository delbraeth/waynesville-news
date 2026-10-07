// Friday "Weekend planner": everything already in the data files that happens
// Friday through Sunday, grouped by day, plus the weekend weather outlook.
// Like the rest of the draft it only rearranges sourced items — it adds one
// TODO line for the writer's best-bets intro and invents nothing.
//
// Date formats differ by feed, so every item is reduced to an Eastern-time
// calendar date and HH:MM before it is compared or sorted:
//   - events.json, caesar-creek, museum: real instants (offset or true UTC)
//   - library, shops: naive ET wall-clock strings mislabelled "Z"

const TZ = "America/New_York";
const etParts = (d) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t)?.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
};
const fromInstant = (s) => (s ? etParts(new Date(s)) : null);
const fromNaive = (s) => (s ? { date: s.slice(0, 10), time: s.slice(11, 16) || "00:00" } : null);

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function isFridayET(now) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now) === "Fri";
}

/**
 * @param {object} o
 * @param {string} o.iso  Friday's date, YYYY-MM-DD (ET)
 * @param {(label: string, url?: string) => string} o.link
 */
export function buildWeekendPlanner({ iso, link, events = [], caesar = [], library = [], shops = [], museum = [], sports = [], weather = null }) {
  const days = [iso, addDays(iso, 1), addDays(iso, 2)];
  const [fri, , sun] = days;
  const byDay = Object.fromEntries(days.map((d) => [d, []]));
  const ongoing = [];
  const seen = []; // [date, normalized title] for de-duplication across feeds

  // Feeds name the same thing differently ("Historical Haunts - Downtown
  // Waynesville" vs "Historical Haunts — ghost walk of …"), so compare the
  // part before any dash, and treat containment as a match.
  const key = (title) => norm(String(title ?? "").split(/\s[—–-]\s/)[0]);
  const dupe = (date, title) => {
    const t = key(title);
    return seen.some(([d, s]) => (d === date || d === "*") && (s.includes(t) || t.includes(s)));
  };
  const add = (where, date, time, title, line) => {
    if (dupe(date, title)) return;
    seen.push([date, key(title)]);
    if (where === "ongoing") ongoing.push({ time, line });
    else byDay[date].push({ time, line });
  };

  // "Thu, Oct 8 · 1:00 PM–2:00 PM" -> "1:00 PM–2:00 PM"; the library's
  // "Wed · Oct 7, 10:30 AM" -> "10:30 AM"; a label with no time -> "".
  const timeOf = (label = "") => {
    const t = label.includes("·") ? label.slice(label.lastIndexOf("·") + 1).trim().replace(/^[A-Z][a-z]{2} \d{1,2}, /, "") : "";
    return /\d/.test(t) ? t : "";
  };
  const withTime = (label, rest) => (timeOf(label) ? `${timeOf(label)} — ${rest}` : rest);
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  // Village calendar. Multi-day items that cover the weekend go under "All
  // weekend"; single-day items under their day. Government sessions are not
  // weekend plans.
  for (const e of events) {
    if (e.evergreen || !e.dateISO || /government/i.test(e.category ?? "")) continue;
    const start = fromInstant(e.dateISO);
    const end = e.endISO ? fromInstant(e.endISO) : start;
    if (end.date < fri || start.date > sun) continue;
    const line = `${e.title} (${e.venue})${e.source ? ` — ${link("details", e.source)}` : ""}`;
    if (end.date !== start.date) add("ongoing", "*", start.time, e.title, `**${e.dateLabel}** — ${line}`);
    else add("day", start.date, timeOf(e.dateLabel) ? start.time : "00:00", e.title, withTime(e.dateLabel, line));
  }

  const feed = (items, parse, title, line) => {
    for (const it of items) {
      const p = parse(it);
      if (!p || !byDay[p.date]) continue;
      add("day", p.date, p.time, title(it), line(it, p));
    }
  };

  // Varsity games, home and away: a Friday-night football game is the
  // weekend for a lot of families. sports.json dateISO is naive ET.
  feed(sports.filter((g) => g.level === "Varsity" && g.dateISO), (g) => fromNaive(g.dateISO), (g) => `${g.sport} ${g.opponent}`,
    (g, p) => `${clock(p.time)} — Spartans ${g.sport.toLowerCase()} ${g.isHome === false ? "at" : "vs."} ${g.opponent}${g.isHome === true ? " (home)" : ""} — ${link("details", g.link)}`);
  feed(caesar, (e) => fromInstant(e.dateISO), (e) => e.title, (e) => withTime(e.dateLabel, `${link(e.title, e.link)} (Caesar Creek State Park)`));
  feed(library, (e) => fromNaive(e.dateISO), (e) => e.title, (e) => withTime(e.dateLabel, `${link(e.title, e.link)} (Mary L. Cook Public Library)`));
  feed(shops, (e) => fromNaive(e.dateISO), (e) => e.title, (e) => withTime(e.dateLabel, `${link(e.title, e.link)} (downtown merchants)`));
  feed(museum, (e) => fromInstant(e.startISO), (e) => e.title, (e) =>
    withTime(e.dateLabel, `${link(e.title, e.link)} (Museum at the Friends Home)${e.soldOut ? " — sold out" : ""}`));

  const sortT = (a, b) => a.time.localeCompare(b.time);
  const sections = [];
  if (ongoing.length) sections.push(`**All weekend**\n` + ongoing.sort(sortT).map((x) => `- ${x.line}`).join("\n"));
  for (const d of days) {
    if (byDay[d].length) sections.push(`**${dayName(d)}**\n` + byDay[d].sort(sortT).map((x) => `- ${x.line}`).join("\n"));
  }
  if (!sections.length) return null;

  // NWS outlook names days ("Saturday"); show Saturday and Sunday if present.
  const wx = (weather?.outlook ?? [])
    .filter((o) => /^(Saturday|Sunday)$/i.test(o.dayLabel))
    .map((o) => `${o.dayLabel} — high ${o.highF}°${o.lowF != null ? ` / low ${o.lowF}°` : ""}, ${o.condition}`);

  return [
    "TODO — one or two sentences: the weekend's best bets, picked from the list below.",
    ...(wx.length ? [`**Weekend weather:** ${wx.join(" · ")} (National Weather Service)`] : []),
    sections.join("\n\n"),
    "See the [full events calendar](/events/) for what's coming after the weekend.",
  ].join("\n\n");
}
