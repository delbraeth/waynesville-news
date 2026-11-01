// Track the North Warren County Transportation Plan (NWCTP) project site:
// https://northwarrencountytransportationplan-burgessniple.hub.arcgis.com
//
// The plan (Warren County, OKI, MVRPC; consultant Burgess & Niple) is studying
// new I-75-to-I-71 connections — one option runs along US 42 and S.R. 73 through
// Waynesville, Corwin and Harveysburg — plus a high-priority list that includes
// the S.R. 73 / US 42 intersection in Waynesville. Phase I runs through winter
// 2026/27; recommendations go to Phase II.
//
// The hub is a JavaScript app, so instead of scraping it this reads ArcGIS
// Online's public REST API: every public item the project account publishes
// (pages, PDFs of meeting boards, surveys, maps), with its last-modified time,
// plus the visible text of each hub page. Each run is compared with the last:
// new items and changed items are recorded in `changes` with the date they were
// first seen, so the daily brief can say "new plan materials posted".
//
// Facts only: titles and page text are copied as published. On failure the
// previous file is left untouched — never emptied, because it is the baseline
// the next run diffs against. check:staleness flags it if failures persist.
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../src/data/nwctp.json", import.meta.url);
const HUB = "https://northwarrencountytransportationplan-burgessniple.hub.arcgis.com";
const SITE_ID = "ef1881134f464a43bcd072d6ab490aa5";
const OWNER = "taylor.franco@burgessniple.com"; // the project's publishing account, per the site item
const REST = "https://www.arcgis.com/sharing/rest";
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
const KEEP_CHANGES = 40;

const getJSON = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const j = await r.json();
  if (j.error) throw new Error(`ArcGIS error ${j.error.code}: ${j.error.message}`);
  return j;
};

const etDate = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, "–").replace(/&mdash;/g, "—");
const clean = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Visible text blocks from a hub page/site layout (skips editor boilerplate).
function pageText(data) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if ((k === "text" || k === "markdown") && typeof v === "string") {
        const t = clean(v);
        if (t.length > 15 && !/Edit layout to customize|hero section is a row/i.test(t) && !/^(URL ?)+$/.test(t)) out.push(t);
      } else walk(v);
    }
  };
  walk(data);
  return [...new Set(out)];
}

const itemLink = (it) =>
  it.type === "PDF" ? `${REST}/content/items/${it.id}/data`
  : it.type === "Hub Page" ? `${HUB}/pages/${it.name || it.id}`
  : it.type === "Form" ? `https://survey123.arcgis.com/share/${it.id}`
  : `https://www.arcgis.com/home/item.html?id=${it.id}`;

async function main() {
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

  const q = encodeURIComponent(`owner:"${OWNER}"`);
  const search = await getJSON(`${REST}/search?q=${q}&num=100&sortField=modified&sortOrder=desc&f=json`);
  const results = search.results ?? [];
  if (!results.some((r) => r.id === SITE_ID)) throw new Error("project site item not found in owner's public content — account or sharing changed?");

  const items = [];
  for (const r of results) {
    const it = {
      id: r.id,
      type: r.type,
      title: clean(r.title ?? ""),
      modified: new Date(r.modified).toISOString(),
      link: itemLink(r),
    };
    if (r.type === "Hub Page" || r.type === "Hub Site Application") {
      try {
        const data = await getJSON(`${REST}/content/items/${r.id}/data?f=json`);
        it.text = pageText(data);
      } catch { it.text = []; }
      if (r.type === "Hub Site Application") it.link = HUB;
    }
    items.push(it);
  }

  // Diff against the previous run.
  const today = etDate();
  const before = new Map((prev?.items ?? []).map((i) => [i.id, i]));
  const changes = [...(prev?.changes ?? [])];
  if (prev) {
    for (const it of items) {
      const old = before.get(it.id);
      if (!old) changes.unshift({ date: today, kind: "new", id: it.id, type: it.type, title: it.title, link: it.link });
      else if (old.modified !== it.modified) changes.unshift({ date: today, kind: "updated", id: it.id, type: it.type, title: it.title, link: it.link });
    }
    for (const old of before.values()) {
      if (!items.some((i) => i.id === old.id)) changes.unshift({ date: today, kind: "removed", id: old.id, type: old.type, title: old.title });
    }
  }

  const out = {
    _note: "North Warren County Transportation Plan project site, tracked via ArcGIS Online's public REST API (items published by the project account, with page text). `changes` lists items first seen as new/updated/removed, newest first, dated by the Eastern date of the run that noticed them. Titles and text are as published. Built by scripts/fetch-nwctp.mjs.",
    updated: new Date().toISOString(),
    hub: HUB,
    items,
    changes: changes.slice(0, KEEP_CHANGES),
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  const fresh = changes.filter((c) => c.date === today && prev);
  console.log(`nwctp.json: ${items.length} item(s); ${fresh.length ? fresh.map((c) => `${c.kind}: ${c.title}`).join("; ") : "no changes since last run"}`);
}

main().catch((e) => {
  console.error(`NWCTP refresh failed, keeping previous nwctp.json: ${e.message}`);
  process.exit(0);
});
