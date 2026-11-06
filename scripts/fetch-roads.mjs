// Road work and closures near Waynesville, from two official sources:
//
// 1. ODOT's OHGO feed — state routes and interstates. With OHGO_API_KEY set
//    (free: https://publicapi.ohgo.com/accounts/registration) this uses the
//    documented public API with a radius filter. Without a key it falls back
//    to https://api.ohgo.com/construction, the keyless backend behind the
//    ohgo.com map: undocumented, so it may change without notice, and it
//    ignores filters (the whole state, ~5 MB), so distance is computed here.
// 2. Warren County Engineer news releases — county and township road closures
//    OHGO does not carry. The filename date is the closure's START date, not
//    the release date. Each release's PDF is read for its end ("through
//    Friday, November 13", "for five (5) days"), and closures that have ended
//    are dropped; a release with no parseable end is kept for
//    ENGINEER_PAST_DAYS after it starts.
//
// Descriptions are ODOT's own text, reproduced verbatim (trimmed to length).
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// The release's last closed day, from its own wording, or null. Text from
// these PDFs splits digits ("October 1 6 th", "202 6"), so digit runs are
// re-joined first. Every "through/to/until … <Month> <day>" and "for N
// days/weeks" is read and the latest wins, so "closed from … Friday, October
// 16th, to … Sunday, October 18th" ends on the 18th.
export function parseReleaseEnd(text, startISO) {
  const t = String(text).replace(/\s+/g, " ").replace(/(\d) (?=\d)/g, "$1");
  const [sy, sm] = startISO.split("-").map(Number);
  const ends = [];
  const monthRe = new RegExp(`\\b(?:through|thru|to|until)\\b.{0,60}?\\b(${MONTHS.join("|")})\\s+(\\d{1,2})\\b`, "gi");
  for (const [, mon, day] of t.matchAll(monthRe)) {
    const m = MONTHS.indexOf(mon.toLowerCase()) + 1;
    const y = m < sm ? sy + 1 : sy; // a December closure can run into January
    ends.push(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  for (const [, word, num, unit] of t.matchAll(/\bfor\s+(?:(\w+)\s*)?\(?(\d+)?\)?\s*(day|week)s?\b/gi)) {
    const n = Number(num) || NUMBER_WORDS[String(word).toLowerCase()];
    if (n) ends.push(addDays(startISO, n * (/week/i.test(unit) ? 7 : 1) - 1));
  }
  const valid = ends.filter((e) => e >= startISO).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

async function releaseEnd(link, startISO) {
  try {
    const res = await fetch(link, { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()), isEvalSupported: false }).promise;
    let text = "";
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) text += " " + (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(" ");
    return parseReleaseEnd(text, startISO);
  } catch (e) {
    console.error(`roads: could not read ${link}: ${e.message}`);
    return null;
  }
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
  const recent = all
    .map(([, href, , ymd, text]) => {
      const startISO = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
      const title = clean(text).replace(/^[A-Za-z]+ \d{1,2},? \d{4}\s*-\s*/, "");
      const path = href.replace(/\\/g, "/").replace(/^(\.\.\/)+/, "/");
      return { source: "engineer", title, startISO, link: new URL(encodeURI(path), ENGINEER_BASE).toString() };
    })
    .filter((i) => /closure|closed/i.test(i.title) && i.startISO >= lo && i.startISO <= hi)
    .filter((i) => (seen.has(i.link) ? false : seen.add(i.link)))
    .sort((a, b) => b.startISO.localeCompare(a.startISO));
  const items = [];
  for (const i of recent) {
    const endISO = await releaseEnd(i.link, i.startISO);
    if (endISO && endISO < todayET) continue; // reopened
    items.push(endISO ? { ...i, endISO } : i);
  }
  return items;
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
    `State-route work within ${RADIUS_MI} miles of Waynesville (ODOT OHGO; Restricted/Closed only, ODOT's own descriptions) plus Warren County Engineer closure releases starting within ${ENGINEER_PAST_DAYS} days back / ${ENGINEER_AHEAD_DAYS} ahead (countywide; title, start date, and the end date the release states; ended closures dropped).`,
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
