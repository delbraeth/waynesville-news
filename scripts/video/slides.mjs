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
    // "7 p.m. Friday", "Mary L. Cook", "Mt. Holly" stay one sentence
    if (out.length && /(\b[ap]\.m\.|(?:^|\s)[A-Z]\.|\b(?:Mt|St|Dr|Rd|Ave|No|Jr|Sr|Mr|Mrs|Ms)\.)$/.test(out.at(-1))) out[out.length - 1] += " " + x;
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
// A paragraph that opens with one of these is that section, never a lead.
const OPENERS = [[/^(And |Also,? )?(in schools|at school)/i, "schools"], [/^(And |Also,? )?(in local government|at the (county|village|township))/i, "government"], [/^(And |Also,? )?on the roads/i, "roads"], [/^(And |Also,? )?(around town|around the area|looking ahead|nearby)/i, "around"]];
// Forecast language in a paragraph's first sentence ("a high near 50", "the weather").
const WEATHER = /\bweather\b|\bforecast\b|\b(high|low)s? (near|of|around|in the)\b|\bdegrees\b/i;
// A lead the weather paragraph may cover (a storm, a cold snap) — by its title.
const WEATHER_LEAD = /weather|forecast|rain|snow|storm|cold|heat|wind|ice|icy|fog|freez|flood|sunny|temperature/i;
const kindOf = (p, i, n) => {
  const first = sentences(p)[0] ?? "";
  if (i === 0) return "open";
  if (i === n - 1 && /That's your brief/i.test(p)) return "signoff";
  if (/is supported by/i.test(p)) return "sponsor";
  if (/^Also from Waynesville News/i.test(p)) return "stories";
  for (const [re, k] of OPENERS) if (re.test(first)) return k;
  if (WEATHER.test(first)) return "weather";
  if (/\btop story\b/i.test(first)) return "lead";
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

const kicker = (text, r) => `<div class="kicker it" data-r="${r}">${esc(text)}</div>`;
const helmet = '<img class="mark-h" src="spartans-helmet.svg" alt="">';
// Editor-made graphic for a date (src/data/video-graphics.json), or null.
export function graphicFor(root, date) {
  const f = path.join(root, "src/data/video-graphics.json");
  if (!fs.existsSync(f)) return null;
  return (read(f).items ?? []).find((g) => g.date === date && g.image) ?? null;
}
// Does this text talk about work on one of these route numbers? Route and work word within
// one sentence, either order. "Closed"/"closure" count only right after the route.
export function aboutZone(text, nums) {
  const work = "resurfac|turn lane|lane restriction|work zone|construction|paving";
  return nums.some((n) => {
    const rt = `(?:State Route|S\\.R\\.|U\\.S\\.|Route|I-)\\s*${n}\\b`;
    return new RegExp(`${rt}[^.]{0,60}(${work}|closed|closure)|(${work})[^.]{0,60}${rt}`, "i").test(text);
  });
}
// When item j of n appears, as a sentence index plus a fraction into that
// sentence: the first a third of the way into the opening sentence, the rest
// spread so the slide is fully built ~60% of the way through the paragraph
// and then holds while the narrator finishes.
export function buildAt(j, n, s0, m) {
  const last = Math.max(0.3, 0.6 * m);
  const x = Math.min(m - 0.2, n > 1 ? 0.3 + (j * (last - 0.3)) / (n - 1) : 0.3);
  const r = Math.floor(x);
  return { r: s0 + r, o: +(x - r).toFixed(2) };
}
// rows revealed across the paragraph's sentences [s0, s0+m)
function rowsHtml(rows, s0, m) {
  return `<div class="rows">${rows
    .map((v, j) => {
      const at = buildAt(j, rows.length, s0, m);
      return `<div class="row1 it" data-r="${at.r}" data-o="${at.o}">${esc(v)}</div>`;
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
  let leadCount = 0;
  const graphic = graphicFor(root, date);
  let graphicUsed = false;
  // Pair script paragraphs with brief leads by best word overlap across the
  // whole script (strongest pairs first), so a paragraph that only shares a
  // few words with a lead (the weather recap, the schools roundup) can't take
  // it from the paragraph that is actually about it.
  const kinds = paras.map((p, pi) => { const k = kindOf(p, pi, paras.length); return k !== "open" && k !== "signoff" && isHouse(p) ? "house" : k; });
  const leadOf = paras.map(() => -1);
  const pairs = [];
  paras.forEach((p, pi) => {
    const k = kinds[pi];
    if (["open", "signoff", "sponsor", "stories", "house"].includes(k)) return;
    if (OPENERS.some(([re]) => re.test(sentences(p)[0] ?? ""))) return;
    // a paragraph whose opening words say "schools" etc. needs a strong match to become a lead
    const min = k === "lead" ? 3 : k === "weather" ? 4 : 5;
    L.forEach((l, li) => {
      if (k === "weather" && !WEATHER_LEAD.test(l.title)) return;
      const sc = overlap(p, l.title + " " + l.body);
      if (sc >= min) pairs.push({ pi, li, sc });
    });
  });
  pairs.sort((a, b) => b.sc - a.sc);
  const takenP = new Set(), takenL = new Set();
  for (const { pi, li } of pairs) {
    if (takenP.has(pi) || takenL.has(li)) continue;
    takenP.add(pi); takenL.add(li); leadOf[pi] = li;
    if (kinds[pi] !== "weather") kinds[pi] = "lead"; // the weather recap keeps its forecast slide
  }
  const segs = [];

  // Places named in a text, nearest-duplicate removed (specific entries come first in places.json).
  const placesIn = (text) => {
    const hit = [];
    for (const p of places) {
      if (p.home) continue;
      if (p.until && date > p.until) continue; // temporary place (a closure) that has ended
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
  // Only when the narration talks about that road's work: the route and a work word in the
  // same sentence ("State Route 73 resurfacing", "lane restrictions on State Route 73").
  // A road named as a detour ("detour on Bunnell Hill Road and State Route 73") doesn't count.
  const zoneLinesFor = async (text) => {
    if (!aboutZone(text, roadNums)) return [];
    if (zones === null) zones = (await workZoneLines((roads.items ?? []).map((r) => r.route).filter(Boolean))).slice(0, 2);
    return zones;
  };
  // Time (seconds) at which a place is first spoken in the paragraph's sentences, or null.
  const normW = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const spokenAt = (place, s0, m) => {
    for (let i = s0; i < s0 + m && i < sents.length; i++) {
      const ws = sents[i].words ?? [];
      for (const mt of place.match) {
        const toks = mt.split(/\s+/).map(normW).filter(Boolean);
        for (let j = 0; j + toks.length <= ws.length; j++) {
          if (toks.every((tk, q) => normW(ws[j + q].w) === tk)) return ws[j].s;
        }
      }
    }
    return null;
  };
  const mapFor = async (hits, s0, m, extraLines = []) => {
    if (!hits.length && !extraLines.length) return "";
    const near = hits.some((p) => Math.hypot(p.lat - home.lat, p.lon - home.lon) < 0.12);
    const pins = [{ ...home, label: near ? "" : home.label, home: true, r: s0 }];
    const lines = extraLines.map((c) => ({ coords: c, r: s0, o: 0.2, dur: 4 }));
    for (const [k, p] of hits.entries()) {
      const at = buildAt(k + 1, hits.length + 1, s0, m).r;
      const t = spokenAt(p, s0, m); // when the narrator says the place, if they do
      pins.push({ lon: p.lon, lat: p.lat, label: p.label, r: at, t });
      if (p.route) {
        const c = await drivingRoute([home.lon, home.lat], [p.lon, p.lat]);
        if (c) lines.push({ coords: c, r: at, t, o: 0, dur: 3 });
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
    let kind = kinds[pi], leadK = -1, zone = false;
    const ps = sentences(p);
    let html = "", cls = "";
    if (kind === "open") {
      cls = "open";
      const bite = ps.slice(1).filter((s) => !/^It's \w+day/.test(s)).join(" ");
      html = `<div class="center"><div class="kicker it" data-r="-1">${esc(new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }))}</div>
        <div class="h it" data-r="-1">Good morning,<br>Waynesville.</div>${bite ? `<div class="badge it" data-r="${s0 + Math.min(m - 1, 2)}">${esc(bite)}</div>` : ""}</div>`;
    } else if (kind === "weather") {
      const days = [{ d: weather.periodName || "Today", hi: weather.highF ?? weather.tempF, lo: weather.lowF, c: weather.condition, today: true }, ...(weather.outlook ?? []).slice(0, 3).map((o) => ({ d: o.dayLabel, hi: o.highF, lo: o.lowF, c: o.condition }))];
      // Build day by day: today with the opening line, each later day when the
      // narrator names it ("Thanksgiving Day brings…"), else ~0.7 s after the
      // one before; every tile is in by 60% of the paragraph.
      const sT = (r, o = 0) => { const x = sents[Math.min(r, sents.length - 1)]; return x ? x.start + (x.end - x.start) * o : 0; };
      const endP = sents[s0 + m - 1]?.end ?? sT(s0) + 8;
      const cap = sT(s0) + 0.6 * (endP - sT(s0));
      let prevT = sT(s0, 0.15);
      const dayT = days.map((x, k) => {
        if (k === 0) return prevT;
        const tok = normW(String(x.d).split(/\s+/)[0]);
        let t = null;
        for (let i = s0; i < s0 + m && i < sents.length && t == null; i++) for (const w of sents[i].words ?? []) if (normW(w.w) === tok && w.s > prevT) { t = w.s; break; }
        t = Math.min(t ?? prevT + 0.7, Math.max(cap, prevT + 0.4));
        return (prevT = Math.max(t, prevT + 0.4));
      });
      const alertSent = ps.findIndex((x) => /\balerts?\b|\bwarning|\badvisory|\bwatch\b/i.test(x));
      // the alerts badge closes the build, right after the last tile (or when alerts are named, if sooner)
      const badgeT = Math.min(alertSent >= 0 && s0 + alertSent < sents.length ? sT(s0 + alertSent, 0.1) : Infinity, prevT + 0.8);
      const tiles = days.map((x, k) => `<div class="tile ${x.today ? "today" : ""} it" data-t="${dayT[k].toFixed(2)}"><div class="d">${esc(x.d)}</div>${weatherIcon(x.c, x.today)}<div><div class="hi">${x.hi ?? "–"}°</div><div class="lo">${x.lo != null ? `Low ${x.lo}° · ` : ""}${esc(x.c)}</div></div></div>`).join("");
      const alerts = weather.alerts?.length ? weather.alerts.map((a) => a.event || a.headline).filter(Boolean).join(" · ") : "No weather alerts in effect";
      html = `${kicker("Weather", s0)}<div class="h md it" data-r="${s0}">${esc(weather.condition)} today, high ${weather.highF ?? weather.tempF}°</div>
        <div class="wx">${tiles}</div><div class="badge ${weather.alerts?.length ? "" : "ghost"} it" data-t="${badgeT.toFixed(2)}">${esc(alerts)} · National Weather Service</div>`;
    } else if (kind === "lead" && (leadK = leadOf[pi]) >= 0) {
      zone = aboutZone(p, roadNums);
      const lead = L[leadK];
      const leadNo = ++leadCount;
      const text = `${lead.title}. ${lead.body}`;
      const sports = SPORTS.test(lead.title) || SPORTS.test(ps[0] + " " + (ps[1] ?? ""));
      const txt = `${kicker(leadNo === 1 ? "The top story" : "This morning in Waynesville", s0)}<div class="h md it" data-r="${s0}">${sports ? helmet : ""}${esc(lead.title)}</div>${rowsHtml(pick(sentences(lead.body)), s0, m)}`;
      // a work zone only when that road is what the story is about (headline or opening line),
      // not when it's a side mention like a detour
      // the day's editor graphic replaces the map on the first sports lead it fits
      if (sports && graphic && !graphicUsed && (!graphic.match || new RegExp(graphic.match, "i").test(text + " " + p))) {
        graphicUsed = true;
        const g = `<div class="graphic it" data-r="${s0}" data-o="0.3"><img src="graphic.webp" alt="${esc(graphic.alt ?? "")}">${graphic.caption ? `<div class="gcap">${esc(graphic.caption)}</div>` : ""}</div>`;
        html = split(txt, g);
      } else {
        html = split(txt, await mapFor(placesIn(text + " " + p), s0, m, await zoneLinesFor(p)));
      }
    } else if (["schools", "government", "roads", "around"].includes(kind)) {
      const body = narrative(md, HEADING[kind]);
      const src = (body ? sentences(body) : ps).filter((x) => !/\bNWS\b|weather alerts?/i.test(x));
      const lines = await zoneLinesFor(p);
      zone = lines.length > 0;
      const sports = false; // helmet only on sports lead stories
      // Title a roads slide with ODOT's project name only when the narration is about that project.
      const r0 = roads.items?.[0], n0 = /\b(?:S\.R\.|U\.S\.|I-)\s*(\d+)/.exec(r0?.route ?? "")?.[1];
      const aboutR0 = kind === "roads" && n0 && new RegExp(`(State Route|S\\.R\\.|U\\.S\\.|Route)\\s*${n0}\\b[^.]{0,60}(resurfac|turn lane|lane restriction|work zone)|(resurfac|turn lane|lane restriction|work zone)[^.]{0,60}(State Route|S\\.R\\.|U\\.S\\.|Route)\\s*${n0}\\b`, "i").test(p);
      const txt = `${kicker(LABEL[kind], s0)}<div class="h md it" data-r="${s0}">${esc(aboutR0 ? r0.route.replace(/\s+Addtiion/, " Addition") : LABEL[kind])}</div>${rowsHtml(pick(src), s0, m)}`;
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
        ${link ? `<div class="badge it" data-r="${s0 + Math.min(1, m - 1)}">${esc(link)}</div>` : ""}</div>`;
    }
    segs.push({ from: pi === 0 ? -1 : s0, cls, kind, html, pi, lead: leadK, zone, roadNums });
  }
  const mast = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const problems = checkSlides({ segs, paras, leads: L, weather, words, overlap, sents });
  if (graphic && !fs.existsSync(path.join(root, "public", graphic.image))) problems.push(`the graphic set for ${date} (${graphic.image}) isn't in public/`);
  const warnings = graphic && !graphicUsed ? [`graphic for ${date} not shown: no sports lead slide matched`] : [];
  return { segs, mast, problems, warnings, graphic: graphicUsed ? graphic : null };
}

// Quality gate: reasons the video would not match its narration. make-video
// refuses to render (and nothing is stored) while this list is non-empty.
export function checkSlides({ segs, paras, leads, weather, words, overlap, sents = [] }) {
  const out = [];
  const said = (pi) => `paragraph ${pi + 1} ("${paras[pi].slice(0, 60)}…")`;
  // 6. pacing: every slide is fully built at least 2 s before it leaves (1 s for a one-sentence
  //    paragraph), and the weather tiles come in one day at a time. Pins and route lines that
  //    appear as the narrator names the place are synced to the audio and don't count.
  const sT = (r, o = 0) => { const x = sents[r]; return x ? x.start + (x.end - x.start) * o : 0; };
  segs.forEach((s, i) => {
    if (s.zone && !aboutZone(paras[s.pi], s.roadNums)) out.push(`${s.kind} slide draws the ODOT work-zone outline, but ${said(s.pi)} isn't about that work`);
    if (i === 0 || i === segs.length - 1 || !sents.length) return; // the outro music holds the last slide
    const next = segs[i + 1];
    const leaves = next ? sT(next.from) - 0.9 : (sents.at(-1)?.end ?? 0);
    let last = 0;
    for (const m of s.html.matchAll(/<(?:div|path)[^>]*class="([^"]*\b(?:it|draw)\b[^"]*)"([^>]*)>/g)) {
      if (/\b(pin|draw)\b/.test(m[1]) && /data-t=/.test(m[2])) continue;
      const t = /data-t="([\d.]+)"/.exec(m[2]), r = /data-r="(-?\d+)"/.exec(m[2]), o = /data-o="([\d.]+)"/.exec(m[2]);
      const at = t ? +t[1] : r && +r[1] >= 0 ? sT(+r[1], o ? +o[1] : 0) : 0;
      last = Math.max(last, at);
    }
    const nSent = sents.filter((x) => x.para === s.pi).length;
    const need = nSent > 1 ? 2 : 1;
    if (leaves - last < need) out.push(`${s.kind} slide (${said(s.pi)}) finishes building only ${(leaves - last).toFixed(1)} s before it leaves`);
    if (s.kind === "weather") {
      const ts = [...s.html.matchAll(/class="tile[^"]*"([^>]*)>/g)].map((m) => { const t = /data-t="([\d.]+)"/.exec(m[1]), r = /data-r="(\d+)"/.exec(m[1]), o = /data-o="([\d.]+)"/.exec(m[1]); return t ? +t[1] : r ? sT(+r[1], o ? +o[1] : 0) : 0; });
      if (ts.some((t, k) => k && t - ts[k - 1] < 0.3)) out.push(`weather tiles don't build day by day (${ts.map((t) => t.toFixed(1)).join(", ")} s)`);
    }
  });
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  // 1. weather: a forecast paragraph needs the forecast slide, and the high it shows must be the one spoken
  const wxPara = paras.findIndex((p, pi) => pi > 0 && pi < 3 && WEATHER.test(p));
  const wxSeg = segs.find((s) => s.kind === "weather");
  if (wxPara >= 0 && !wxSeg) out.push(`no weather slide, though ${said(wxPara)} gives the forecast`);
  if (wxSeg) {
    const hi = weather.highF ?? weather.tempF;
    if (hi != null && !new RegExp(`\\b${hi}\\b`).test(paras[wxSeg.pi])) out.push(`weather slide shows a high of ${hi}°, but the narration doesn't say ${hi}: ${said(wxSeg.pi)}`);
  }
  // 2. every brief lead is shown once, on the paragraph about it
  const shown = segs.filter((s) => s.kind === "lead" && s.lead >= 0).map((s) => s.lead);
  leads.forEach((l, li) => { if (!shown.includes(li) && !segs.some((s) => s.kind === "weather" && s.pi != null && overlap(paras[s.pi], l.title + " " + l.body) >= 4 && WEATHER_LEAD.test(l.title))) out.push(`lead "${l.title}" never gets its slide`); });
  // 3. each story slide shares enough words with what is being said over it
  for (const s of segs) {
    if (!["lead", "schools", "government", "roads", "around"].includes(s.kind)) continue;
    const onScreen = text(s.html);
    const n = overlap(paras[s.pi], onScreen);
    if (n < 3) out.push(`${s.kind} slide doesn't match its narration (${n} shared words): ${said(s.pi)} over "${onScreen.slice(0, 80)}…"`);
  }
  // 4. a lead slide sits over the paragraph that is most about it, and that paragraph is most about this lead
  const ov = (pi, li) => overlap(paras[pi], leads[li].title + " " + leads[li].body);
  for (const s of segs) {
    if (s.kind !== "lead" || s.lead < 0) continue;
    const bestP = segs.filter((x) => x.kind !== "open" && x.kind !== "signoff").reduce((b, x) => (ov(x.pi, s.lead) > ov(b, s.lead) ? x.pi : b), s.pi);
    const bestL = leads.reduce((b, _, li) => (ov(s.pi, li) > ov(s.pi, b) ? li : b), s.lead);
    if (bestP !== s.pi) out.push(`lead "${leads[s.lead].title}" is shown over ${said(s.pi)}, but ${said(bestP)} is the one about it`);
    else if (bestL !== s.lead) out.push(`${said(s.pi)} is shown with lead "${leads[s.lead].title}", but it's about "${leads[bestL].title}"`);
  }
  // 5. no line on screen cut off at an initial ("The Mary L.")
  for (const s of segs) for (const m of s.html.matchAll(/class="row[^"]*"[^>]*>([^<]*)</g)) if (/(?:^|\s)[A-Z]\.$/.test(m[1].trim())) out.push(`a line on the ${s.kind} slide is cut off: "${m[1].trim()}"`);
  return out;
}
