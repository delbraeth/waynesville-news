// Road work and closures near Waynesville, from two official sources:
//
// 1. ODOT's OHGO feed — state routes and interstates. With OHGO_API_KEY set
//    (free: https://publicapi.ohgo.com/accounts/registration) this uses the
//    documented public API with a radius filter. Without a key it falls back
//    to https://api.ohgo.com/construction, the keyless backend behind the
//    ohgo.com map: undocumented, so it may change without notice, and it
//    ignores filters (the whole state, ~5 MB), so distance is computed here.
// 2. Warren County Engineer news releases — county and township road closures
//    OHGO does not carry. Only the release title and its date are used; the
//    filename date is the closure's START date, not the release date.
//
// Descriptions are ODOT's own text, reproduced verbatim (trimmed to length).
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const OUT = new URL("../src/data/roads.json", import.meta.url);
const UA = { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" };
const CENTER = { lat: 39.5287, lon: -84.0891 }; // Waynesville village center
const RADIUS_MI = 8;
const ENGINEER_URL = "https://engineer.warrencountyohio.gov/Information/NewsReleases/Index";
const ENGINEER_BASE = "https://engineer.warrencountyohio.gov";
const ENGINEER_PAST_DAYS = 21; // closures that started up to 3 weeks ago
const ENGINEER_AHEAD_DAYS = 14;

const miles = (a, b) => {
  const t = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * t) / 2) ** 2 +
    Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lon - a.lon) * t) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

// OHGO dates are "M/D/YYYY" strings; EndDate may be null (open-ended).
const parseMDY = (s) => {
  const m = String(s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
const clean = (s) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const clip = (s, n = 280) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);

const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/api-key=[^&]+/, "api-key=***")}`);
  return res.json();
}

async function fetchOhgo() {
  const key = process.env.OHGO_API_KEY;
  let raw;
  if (key) {
    const q = `radius=${CENTER.lat},${CENTER.lon},${RADIUS_MI}&exclude-work-zone=true&page-all=true`;
    const data = await getJSON(`https://publicapi.ohgo.com/api/v1/construction?${q}`, { Authorization: `APIKEY ${key}` });
    if (data.RejectedFilters?.length) console.error("roads: OHGO rejected filters", JSON.stringify(data.RejectedFilters));
    raw = data.Results ?? [];
  } else {
    raw = await getJSON("https://api.ohgo.com/construction");
  }
  if (!Array.isArray(raw)) throw new Error("OHGO construction response was not a list");
  if (raw.length === 0 && !key) throw new Error("OHGO returned zero statewide items — feed broken, not a quiet day");

  const seen = new Set();
  const items = [];
  for (const i of raw) {
    if (typeof i.Latitude !== "number" || typeof i.Longitude !== "number") continue;
    const dist = miles(CENTER, { lat: i.Latitude, lon: i.Longitude });
    if (dist > RADIUS_MI) continue;
    // "Open" means traffic is unaffected (lane shifts, shoulder work).
    if (!["Restricted", "Closed"].includes(i.Status)) continue;
    const startISO = parseMDY(i.StartDate);
    const endISO = parseMDY(i.EndDate);
    if (startISO && startISO > addDays(todayET, 7)) continue; // not started within a week
    if (endISO && endISO < todayET) continue;
    const route = clean(i.RouteName || i.Location);
    const description = clip(clean(i.Description));
    // The feed repeats one project per direction/segment with identical text.
    const k = `${route}|${description}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ source: "ohgo", route, status: i.Status, category: clean(i.Category), startISO, endISO, description, miles: Math.round(dist * 10) / 10 });
  }
  // Full closures first, then nearest.
  items.sort((a, b) => (b.status === "Closed") - (a.status === "Closed") || a.miles - b.miles);
  return items;
}

async function fetchEngineer() {
  const res = await fetch(ENGINEER_URL, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ENGINEER_URL}`);
  const html = await res.text();
  // <a href="../../doc/Information/NewsReleases\2026\20260824_New_Burlington_Rd_Closure.pdf" ...>August 24 2026 -  New Burlington Rd Closure</a>
  const re = /href="([^"]*NewsReleases[\\/](\d{4})[\\/](\d{8})_[^"]+\.pdf)"[^>]*>([^<]+)</g;
  const all = [...html.matchAll(re)];
  if (all.length === 0) throw new Error("engineer release links not found — markup changed");
  const lo = addDays(todayET, -ENGINEER_PAST_DAYS), hi = addDays(todayET, ENGINEER_AHEAD_DAYS);
  const seen = new Set();
  return all
    .map(([, href, , ymd, text]) => {
      const startISO = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
      const title = clean(text).replace(/^[A-Za-z]+ \d{1,2},? \d{4}\s*-\s*/, "");
      const path = href.replace(/\\/g, "/").replace(/^(\.\.\/)+/, "/");
      return { source: "engineer", title, startISO, link: new URL(encodeURI(path), ENGINEER_BASE).toString() };
    })
    .filter((i) => /closure|closed/i.test(i.title) && i.startISO >= lo && i.startISO <= hi)
    .filter((i) => (seen.has(i.link) ? false : seen.add(i.link)))
    .sort((a, b) => b.startISO.localeCompare(a.startISO));
}

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

async function main() {
  const [ohgo, engineer] = await Promise.allSettled([fetchOhgo(), fetchEngineer()]);
  if (ohgo.status === "rejected") console.error("roads: OHGO failed:", ohgo.reason.message);
  if (engineer.status === "rejected") console.error("roads: county engineer failed:", engineer.reason.message);
  // One source down is a partial day, not a failure; both down falls back to cache.
  if (ohgo.status === "rejected" && engineer.status === "rejected") throw new Error("both road sources failed");

  const items = [...(ohgo.value ?? []), ...(engineer.value ?? [])];
  await write(
    {
      items,
      sources: {
        ohgo: ohgo.status === "fulfilled" ? (process.env.OHGO_API_KEY ? "publicapi.ohgo.com" : "api.ohgo.com (keyless)") : "FAILED",
        engineer: engineer.status === "fulfilled" ? ENGINEER_URL : "FAILED",
      },
    },
    `State-route work within ${RADIUS_MI} miles of Waynesville (ODOT OHGO; Restricted/Closed only, ODOT's own descriptions) plus Warren County Engineer closure releases starting within ${ENGINEER_PAST_DAYS} days back / ${ENGINEER_AHEAD_DAYS} ahead (countywide; title and start date only).`,
  );
  const o = ohgo.value?.length ?? "failed", g = engineer.value?.length ?? "failed";
  console.log(`roads.json: ${o} state-route item(s) within ${RADIUS_MI} mi, ${g} county closure release(s)`);
}

main().catch(async (e) => {
  console.error("roads refresh failed:", e.message);
  await keepOrExpire({
    out: OUT,
    label: "roads",
    writeEmpty: async (note) => { await write({ items: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
