// Waynesville swimming & diving meets from swimmeet.com, the statewide Ohio
// high school meet-results site (added 2026-11-12, per the editor). MaxPreps
// has no Waynesville swimming pages.
//
// swimmeet.com lists each season's invitational and championship meets in
// /ohio/nav.html (name, date, city). For meets from 7 days ago through 14
// days ahead, it reads the meet's schools.xml to see whether Waynesville is
// entered, then, once the meet is done, its team-scores XML files for
// Waynesville's place and points. Dual meets are not on swimmeet.com.
//
// Writes src/data/swimming.json: { results: [...], upcoming: [...] }.
// Places and scores reproduced verbatim from swimmeet.com; each links to the
// meet's own page. Fail-safe: on error the previous file is kept (CEILINGS).
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const BASE = "https://www.swimmeet.com";
const UA = "WaynesvilleDailyBrief/1.0 (waynesville.news)";
const OUT = new URL("../src/data/swimming.json", import.meta.url);
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 14;
const IS_WAYNESVILLE = (attrs) => /\bname="Waynesville"/.test(attrs) || (/\bsh="Waynesville"/.test(attrs) && /\bct="Waynesville"/.test(attrs));

const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[<>]/g, "").trim();
const MONTHS = "January February March April May June July August September October November December".split(" ");

// "January 16-17, 2027" / "December 5, 2026" / "February 27-28, 2027" ->
// { start: "2027-01-16", end: "2027-01-17" }
function parseDates(text) {
  const m = /([A-Z][a-z]+) (\d{1,2})(?:-(\d{1,2}))?, (\d{4})/.exec(text);
  if (!m) return null;
  const mo = String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0");
  if (mo === "00") return null;
  const d = (x) => `${m[4]}-${mo}-${String(x).padStart(2, "0")}`;
  return { start: d(m[2]), end: d(m[3] ?? m[2]) };
}

function currentSeasonMeets(nav) {
  const start = nav.indexOf("Current Season");
  const stop = nav.indexOf("Last Season", start);
  if (start < 0) throw new Error("swimmeet nav markup changed: no Current Season block");
  const block = nav.slice(start, stop > 0 ? stop : undefined);
  const re = /<a href="\/([a-z0-9-]+)\/">([^<]+)<\/a>[\s\S]*?<li class="brief">([^<]+)<br>([^<]+)<\/li>/g;
  return [...block.matchAll(re)].map(([, slug, name, when, city]) => ({ slug, name: decode(name), dates: parseDates(when), city: decode(city) }))
    .filter((m) => m.dates);
}

async function teamPlaces(slug) {
  let nav;
  try { nav = await get(`/${slug}/team-scores/nav.html`); } catch { return []; }
  const places = [];
  // Links look like <a href="/swbl26/team-scores/girls-d2.html">Girls</a>.
  for (const [, file, label] of nav.matchAll(/href="(\/[^"]+\/team-scores\/[^"]+)\.html"[^>]*>([^<]+)</g)) {
    // Skip pre-meet projections and all-division "mythical" standings; only
    // the actual final team scores count.
    if (/projected|mythical/i.test(file)) continue;
    let xml;
    try { xml = await get(`${file}.xml`); } catch { continue; }
    const rows = [...xml.matchAll(/<score ([^>]+)\/>/g)].map((m) => m[1]);
    const ours = rows.find(IS_WAYNESVILLE);
    if (!ours) continue;
    const rk = /\brk="(\d+)"/.exec(ours)?.[1];
    const scr = /\bscr="([\d.]+)"/.exec(ours)?.[1];
    const g = /girls/i.test(file) ? "Girls" : /boys/i.test(file) ? "Boys" : decode(label);
    if (rk) places.push({ team: g, place: Number(rk), of: rows.length, score: scr ?? null });
  }
  return places;
}

async function main() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const shift = (days) => new Date(Date.parse(today + "T12:00:00Z") + days * 86400e3).toISOString().slice(0, 10);
  const from = shift(-LOOKBACK_DAYS), to = shift(LOOKAHEAD_DAYS);

  const meets = currentSeasonMeets(await get("/ohio/nav.html"));
  if (meets.length === 0) throw new Error("no meets parsed from swimmeet nav");

  const results = [], upcoming = [];
  for (const m of meets.filter((x) => x.dates.end >= from && x.dates.start <= to)) {
    let schools;
    try { schools = await get(`/${m.slug}/schools.xml`); } catch { continue; } // entries not posted yet
    if (![...schools.matchAll(/<school ([^>]+)\/>/g)].some((s) => IS_WAYNESVILLE(s[1]))) continue;
    const base = { meet: m.name, city: m.city, dateISO: m.dates.start, endISO: m.dates.end, link: `${BASE}/${m.slug}/` };
    if (m.dates.end < today) {
      const places = await teamPlaces(m.slug);
      results.push({ ...base, places });
    } else {
      upcoming.push(base);
    }
  }
  results.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  upcoming.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  await writeFile(OUT, JSON.stringify({
    _note: "Waynesville swimming & diving at invitational and championship meets listed on swimmeet.com: results from the past 7 days (team place and points as posted) and meets in the next 14 days with Waynesville entered. Dual meets are not covered.",
    updated: new Date().toISOString(), results, upcoming,
  }, null, 2) + "\n");
  console.log(`swimming.json: ${results.length} result(s), ${upcoming.length} upcoming (of ${meets.length} meets this season)`);
}

main().catch(async (e) => {
  console.error("swimming refresh failed:", e.message);
  await keepOrExpire({
    out: OUT,
    label: "swimming",
    writeEmpty: async (note) => {
      await writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), results: [], upcoming: [] }, null, 2) + "\n");
    },
  });
  process.exit(0);
});
