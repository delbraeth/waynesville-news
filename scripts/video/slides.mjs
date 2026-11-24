// Builds the day's slides from the spoken script (one slide per paragraph),
// the published brief and the site's data files. Every fact on a slide comes
// from the brief, weather.json, roads.json, supporters.json or audio.json; the
// slides never add anything the brief doesn't say.
//
// Slide types, chosen per script paragraph:
//   open     first paragraph (greeting + day bite)
//   weather  "...the weather..." — tiles from weather.json
//   lead     next paragraphs, in order, matched to the brief's three lead items
//   schools / government / roads / around — by the paragraph's opening words,
//            filled from the matching brief section
//   stories  "Also from Waynesville News" — flagged stories
//   sponsor  "...is supported by..." — supporters.json
//   house    a house spot from audio.json
//   signoff  last paragraph
//   generic  anything else: the spoken paragraph's own first sentence
// Maps: roads slides draw ODOT's work-zone outline; any slide whose text names
// a place in places.json gets pins. The Spartan helmet appears only on sports
// slides (editor's rule).
import fs from "node:fs";
import path from "node:path";
import { buildMap, workZoneLines, drivingRoute } from "./maps.mjs";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Markdown -> plain text: drop *(source links)*, keep link text, strip emphasis.
export function plain(md) {
  return md
    .replace(/\*?\(\s*\[[^\]]*\]\([^)]*\)(?:\s*[·,]\s*\[[^\]]*\]\([^)]*\))*\s*\)\*?/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function sentences(text) {
  const parts = text.trim().split(/(?<=[.!?])\s+(?=[A-Z“"])/);
  const out = [];
  for (const x of parts) {
    if (out.length && /\b[ap]\.m\.$/.test(out.at(-1))) out[out.length - 1] += " " + x;
    else out.push(x);
  }
  return out.filter(Boolean);
}
function section(md, heading) {
  const m = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(md);
  return m ? m[1] : "";
}
// The editor-written narrative in a section: paragraphs that aren't auto lists.
function narrative(md, heading) {
  return section(md, heading)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(\*\*|- |\[|Next up|Latest posted|Also next up|Source:|See the|<!--|\d+\. )/.test(l) && !/TODO/.test(l))
    .map(plain)
    .filter((l) => l.split(/\s+/).length >= 6 && /[.!?]$/.test(l))
    .join(" ");
}
function leads(md) {
  return section(md, "This morning in Waynesville")
    .split("\n")
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => {
      const m = /^\d+\.\s+\*\*(.+?)\*\*\s*(.*)$/.exec(l);
      return m ? { title: plain(m[1]).replace(/[.:]$/, ""), body: plain(m[2]) } : { title: "", body: plain(l.replace(/^\d+\.\s+/, "")) };
    });
}

const STOP = new Set(["about","after","again","their","there","these","those","which","while","where","would","could","should","waynesville","today","tonight","morning","friday","monday","tuesday","wednesday","thursday","saturday","sunday","through","until","before","other","first","second","third","around","every","since","under"]);
const SPORTS = /\b(football|soccer|volleyball|basketball|wrestling|swim|cheer|Spartans|playoff|semifinal|state title|varsity)\b/i;
const kindOf = (p, i, n) => {
  const first = sentences(p)[0] ?? "";
  if (i === 0) return "open";
  if (i === n - 1 && /That's your brief/i.test(p)) return "signoff";
  if (/is supported by/i.test(p)) return "sponsor";
  if (/^Also from Waynesville News/i.test(p)) return "stories";
  if (/\bweather\b/i.test(first)) return "weather";
  if (/^In schools|^At school|Wayne Local/i.test(first)) return "schools";
  if (/local government|commissioners|trustees|village council/i.test(first)) return "government";
  if (/^On the roads/i.test(first)) return "roads";
  if (/downtown|around town|this weekend|looking ahead/i.test(first)) return "around";
  return "lead";
};
const LABEL = { schools: "Schools", government: "Local government", roads: "On the roads", around: "Around town" };
const HEADING = { schools: "Schools", government: "Local government", roads: "Public safety", around: "Around town" };

function weatherIcon(cond, big) {
  const k = big ? 1 : 0.8, c = (cond || "").toLowerCase();
  const s = (n) => Math.round(110 * n);
  const sun = `<svg width="${s(k)}" height="${s(k)}" viewBox="0 0 100 100"><g stroke="#e0a23a" stroke-width="7" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="50" y1="8" x2="50" y2="20" transform="rotate(${a} 50 50)"/>`).join("")}</g><circle cx="50" cy="50" r="22" fill="#f0b443"/></svg>`;
  const cloud = (x, y, col) => `<path transform="translate(${x} ${y})" d="M25 70h50a16 16 0 0 0 0-32a22 22 0 0 0-42-4a18 18 0 0 0-8 36z" fill="${col}"/>`;
  if (/rain|shower|drizzle|storm|thunder/.test(c))
    return `<svg width="${s(k)}" height="${s(k)}" viewBox="0 0 100 100">${cloud(0, -6, "#8d97a3")}<g stroke="#4f7fa8" stroke-width="5" stroke-linecap="round"><line x1="35" y1="74" x2="30" y2="88"/><line x1="52" y1="74" x2="47" y2="88"/><line x1="69" y1="74" x2="64" y2="88"/></g></svg>`;
  if (/snow|flurr|sleet|ice/.test(c))
    return `<svg width="${s(k)}" height="${s(k)}" viewBox="0 0 100 100">${cloud(0, -6, "#9aa3ad")}<g fill="#7aa6c9"><circle cx="34" cy="82" r="4"/><circle cx="52" cy="86" r="4"/><circle cx="70" cy="82" r="4"/></g></svg>`;
  if (/partly|mostly sunny|mostly clear/.test(c)) return `<svg width="${s(k)}" height="${s(k)}" viewBox="0 0 100 100"><circle cx="38" cy="38" r="20" fill="#f0b443"/>${cloud(8, 10, "#b9b0a2")}</svg>`;
  if (/cloud|overcast|fog/.test(c)) return `<svg width="${s(k)}" height="${s(k)}" viewBox="0 0 100 100">${cloud(0, 0, "#a49b8e")}</svg>`;
  return sun;
}

const kicker = (text, r, helmet) => `<div class="kicker it" data-r="${r}">${helmet ? '<img class="mark-k" src="spartans-helmet.svg" alt="">' : ""}${esc(text)}</div>`;
// rows revealed across the paragraph's sentences [s0, s0+m)
function rowsHtml(rows, s0, m) {
  return `<div class="rows">${rows
    .map((v, j) => {
      const at = s0 + Math.min(m - 1, Math.floor(((j + 1) * m) / (rows.length + 1)));
      return `<div class="row1 it" data-r="${at}">${esc(v)}</div>`;
    })
    .join("")}</div>`;
}
// Keep slide text short enough to fit: up to `max` sentences, ~380 characters.
function pick(sents, max = 3, budget = 380) {
  // a long sentence joined with semicolons reads better as separate lines
  sents = sents.flatMap((s) => (s.length > 200 && s.includes("; ") ? s.split("; ").map((x, i, a) => (i < a.length - 1 ? x + "." : x)).map((x) => x[0].toUpperCase() + x.slice(1)) : [s]));
  const out = [];
  let used = 0;
  for (const s of sents) {
    if (out.length >= max) break;
    if (s.length > 260 || used + s.length > budget) continue; // too long for a slide line; the caption still has it
    out.push(s);
    used += s.length;
  }
  if (!out.length && sents[0]) out.push(sents[0]);
  return out;
}

export async function buildSlides({ root, date, paras, sents, tilesDir }) {
  const D = (p) => path.join(root, p);
  const md = fs.readFileSync(D(`src/content/briefs/${date}.md`), "utf8");
  const weather = read(D("src/data/weather.json"));
  const roads = read(D("src/data/roads.json"));
  const places = read(path.join(path.dirname(new URL(import.meta.url).pathname), "places.json")).places;
  const supporters = read(D("src/data/supporters.json")).items ?? [];
  const L = leads(md);
  const home = places.find((p) => p.home);
  const firstSent = paras.map((_, pi) => sents.findIndex((s) => s.para === pi));
  const count = paras.map((_, pi) => sents.filter((s) => s.para === pi).length);
  const audioCfg = read(D("src/data/audio.json"));
  const norm = (x) => x.toLowerCase().replace(/[^a-z]/g, "");
  const spotHeads = [...(audioCfg.houseSpots ?? []).map((h) => h.text), audioCfg.housePromo ?? ""].filter(Boolean).map((t) => norm(t).slice(0, 40));
  const isHouse = (p) => spotHeads.some((h) => h.length > 20 && norm(p).includes(h));
  const words = (t) => new Set((t.toLowerCase().match(/[a-z][a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w)));
  const overlap = (a, b) => { const B = words(b); let n = 0; for (const w of words(a)) if (B.has(w)) n++; return n; };
  const usedLeads = new Set();
  let leadCount = 0;
  const bestLead = (p, min) => {
    let best = -1, score = min - 1;
    L.forEach((l, k) => { if (usedLeads.has(k)) return; const sc = overlap(p, l.title + " " + l.body); if (sc > score) { score = sc; best = k; } });
    if (best >= 0) usedLeads.add(best);
    return best;
  };
  // the weather paragraph may cover a weather lead; claim it first so it isn't reused
  paras.forEach((p, pi) => { if (kindOf(p, pi, paras.length) === "weather") bestLead(p, 4); });
  const segs = [];

  // Places named in a text, nearest-duplicate removed (specific entries come first in places.json).
  const placesIn = (text) => {
    const hit = [];
    for (const p of places) {
      if (p.home) continue;
      // "Harveysburg Road" names a road, not the village
      if (!p.match.some((m) => new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?! (Road|Rd|Pike|Drive|Avenue|Street|Lane|Way)\\b)").test(text))) continue;
      if (hit.some((h) => Math.hypot(h.lat - p.lat, h.lon - p.lon) < 0.012)) continue; // same spot
      hit.push(p);
    }
    // a town pin gives way to a specific place nearby (Kings Island over Mason)
    return hit.filter((p) => !p.town || !hit.some((h) => !h.town && h !== p && Math.hypot(h.lat - p.lat, h.lon - p.lon) < 0.08));
  };
  // ODOT work-zone outlines, fetched once, drawn on any slide that talks about
  // that road's work (e.g. "State Route 73 resurfacing", "lane restrictions").
  let zones = null;
  const roadNums = (roads.items ?? []).map((r) => /\b(?:S\.R\.|U\.S\.|I-)\s*(\d+)/.exec(r.route ?? "")?.[1]).filter(Boolean);
  const zoneLinesFor = async (text) => {
    if (!roadNums.some((n) => new RegExp(`(State Route|S\\.R\\.|U\\.S\\.|Route)\\s*${n}\\b`).test(text))) return [];
    if (!/resurfac|lane restriction|closed|closure|work zone|detour|construction/i.test(text)) return [];
    if (zones === null) zones = (await workZoneLines((roads.items ?? []).map((r) => r.route).filter(Boolean))).slice(0, 2);
    return zones;
  };
  const mapFor = async (hits, s0, m, extraLines = []) => {
    if (!hits.length && !extraLines.length) return "";
    const near = hits.some((p) => Math.hypot(p.lat - home.lat, p.lon - home.lon) < 0.12);
    const pins = [{ ...home, label: near ? "" : home.label, home: true, r: s0 }];
    const lines = extraLines.map((c) => ({ coords: c, r: s0, o: 0.2, dur: 4 }));
    for (const [k, p] of hits.entries()) {
      const at = s0 + Math.min(m - 1, Math.floor(((k + 1) * m) / (hits.length + 1)));
      pins.push({ lon: p.lon, lat: p.lat, label: p.label, r: at });
      if (p.route) {
        const c = await drivingRoute([home.lon, home.lat], [p.lon, p.lat]);
        if (c) lines.push({ coords: c, r: at, o: 0, dur: 3 });
      }
    }
    const fit = [[home.lon, home.lat], ...hits.map((p) => [p.lon, p.lat]), ...extraLines.flat()];
    try {
      return await buildMap({ fit, pins, lines, pad: extraLines.length ? 40 : 100, maxZoom: 13 }, tilesDir);
    } catch (e) {
      console.log(`map skipped: ${e.message}`);
      return "";
    }
  };
  const split = (txt, map) => (map ? `<div class="split"><div class="txt">${txt}</div>${map}</div>` : txt);

  for (let pi = 0; pi < paras.length; pi++) {
    const p = paras[pi], s0 = firstSent[pi], m = Math.max(1, count[pi]);
    let kind = kindOf(p, pi, paras.length), leadK = -1;
    if (kind !== "open" && kind !== "signoff" && isHouse(p)) kind = "house";
    const ps = sentences(p);
    let html = "", cls = "";
    if (kind === "open") {
      cls = "open";
      const bite = ps.slice(1).filter((s) => !/^It's \w+day/.test(s)).join(" ");
      html = `<div class="center"><div class="kicker it" data-r="-1">${esc(new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }))}</div>
        <div class="h it" data-r="-1">Good morning,<br>Waynesville.</div>${bite ? `<div class="badge it" data-r="${s0 + Math.min(m - 1, 2)}">${esc(bite)}</div>` : ""}</div>`;
    } else if (kind === "weather") {
      const days = [{ d: weather.periodName || "Today", hi: weather.highF ?? weather.tempF, lo: weather.lowF, c: weather.condition, today: true }, ...(weather.outlook ?? []).slice(0, 3).map((o) => ({ d: o.dayLabel, hi: o.highF, lo: o.lowF, c: o.condition }))];
      const tiles = days.map((x, k) => `<div class="tile ${x.today ? "today" : ""} it" data-r="${s0 + Math.min(m - 1, k === 0 ? 1 : Math.min(k + 1, m - 1))}"><div class="d">${esc(x.d)}</div>${weatherIcon(x.c, x.today)}<div><div class="hi">${x.hi ?? "–"}°</div><div class="lo">${x.lo != null ? `Low ${x.lo}° · ` : ""}${esc(x.c)}</div></div></div>`).join("");
      const alerts = weather.alerts?.length ? weather.alerts.map((a) => a.event || a.headline).filter(Boolean).join(" · ") : "No weather alerts in effect";
      html = `${kicker("Weather", s0)}<div class="h md it" data-r="${s0}">${esc(weather.condition)} today, high ${weather.highF ?? weather.tempF}°</div>
        <div class="wx">${tiles}</div><div class="badge ${weather.alerts?.length ? "" : "ghost"} it" data-r="${s0 + m - 1}">${esc(alerts)} · National Weather Service</div>`;
    } else if (kind === "lead" && (leadK = bestLead(p, 3)) >= 0) {
      const lead = L[leadK];
      const leadNo = ++leadCount;
      const text = `${lead.title}. ${lead.body}`;
      const sports = SPORTS.test(lead.title) || SPORTS.test(ps[0] + " " + (ps[1] ?? ""));
      const txt = `${kicker(leadNo === 1 ? "The top story" : "This morning in Waynesville", s0, sports)}<div class="h md it" data-r="${s0}">${esc(lead.title)}</div>${rowsHtml(pick(sentences(lead.body)), s0, m)}`;
      html = split(txt, await mapFor(placesIn(text + " " + p), s0, m, await zoneLinesFor(text + " " + p)));
    } else if (["schools", "government", "roads", "around"].includes(kind)) {
      const body = narrative(md, HEADING[kind]);
      const src = (body ? sentences(body) : ps).filter((x) => !/\bNWS\b|weather alerts?/i.test(x));
      const lines = await zoneLinesFor(body + " " + p);
      const sports = false; // helmet only on sports lead stories
      const txt = `${kicker(LABEL[kind], s0, sports)}<div class="h md it" data-r="${s0}">${esc(kind === "roads" && roads.items?.[0] ? roads.items[0].route.replace(/\s+Addtiion/, " Addition") : LABEL[kind])}</div>${rowsHtml(pick(src), s0, m)}`;
      html = split(txt, await mapFor(placesIn(body + " " + p), s0, m, lines));
    } else if (kind === "sponsor") {
      cls = "sponsor";
      const sp = supporters.find((s) => p.includes(s.name));
      html = `<div class="center"><div class="kicker it" data-r="${s0}">Today’s Daily Brief is supported by</div><div class="h it" data-r="${s0}" data-o=".15">${esc(sp?.name ?? "")}</div>
        ${sp?.what ? `<div class="sub it" data-r="${s0}" data-o=".35">${esc(sp.what)}</div>` : ""}<div class="badge ghost it" data-r="${s0 + m - 1}">waynesville.news/supporters</div></div>`;
    } else if (kind === "signoff") {
      cls = "open";
      html = `<div class="center"><div class="kicker it" data-r="${s0}">That’s your brief</div><div class="h it" data-r="${s0}">Waynesville News</div>
        <div class="sub it" data-r="${s0 + Math.min(1, m - 1)}">The full edition, with links to every source</div><div class="badge it" data-r="${s0 + m - 1}" data-o=".5">waynesville.news</div></div>`;
    } else {
      // house spot, flagged stories, or anything unmatched: show the paragraph's own words
      cls = "sponsor";
      const url = /waynesville dot news(?: slash ([a-z ]+?))?[.,]/i.exec(p);
      const link = url ? `waynesville.news${url[1] ? "/" + url[1].trim().replace(/\s+/g, "-") : ""}` : "";
      const head = ps[0].length <= 70 ? ps[0] : "From Waynesville News";
      const sub = ps[0].length <= 70 ? ps.slice(1, 2).join(" ") : ps[0];
      html = `<div class="center"><div class="kicker it" data-r="${s0}">${kind === "stories" ? "Also from Waynesville News" : "Waynesville News"}</div>
        <div class="h md it" data-r="${s0}">${esc(head)}</div>${sub && !/waynesville dot news/i.test(sub) ? `<div class="sub it" data-r="${s0 + Math.min(1, m - 1)}">${esc(sub)}</div>` : ""}
        ${link ? `<div class="badge it" data-r="${s0 + m - 1}">${esc(link)}</div>` : ""}</div>`;
    }
    segs.push({ from: pi === 0 ? -1 : s0, cls, kind, html });
  }
  const mast = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { segs, mast };
}
