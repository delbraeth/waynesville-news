// Pull the most recently posted Warren County Commissioners agendas, minutes
// and resolutions (links and dates only).
// The county's index page has three <fieldset>s — Agendas, Minutes,
// Resolutions — each a year accordion of links whose text starts with the
// meeting date: "10/13/2026", "10/06/2026 Regular Session 1",
// "08/18/2026 Special Meeting Agenda". The link text is the date source.
// The PDFs themselves are scanned images with no text layer, so nothing is
// read from them here; each item links straight to the county's own PDF.
// Hrefs use literal backslashes ("/doc/AgendaMinutes/Agenda\2026\101326.pdf");
// they are percent-encoded so the links work everywhere.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const BASE = "https://commissioners.warrencountyohio.gov";
const INDEX_URL = `${BASE}/News/AgendaMinutes/Index`;
// Minutes post a few weeks after the meeting, so keep enough dates that the
// latest minutes are still in the window.
const CAP = 6; // most recent meeting dates kept
const OUT = new URL("../src/data/commissioners.json", import.meta.url);
const NOTE =
  "Warren County Commissioners — most recently posted agendas, minutes and resolutions, grouped by meeting date (dates/labels/links only, reproduced from the county's index; the documents are scanned PDFs on the county site).";

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const KINDS = { agendas: "Agendas", minutes: "Minutes", resolutions: "Resolutions" };

const encodeHref = (href) =>
  BASE + href.replace(/&amp;/g, "&").replace(/\\/g, "%5C").replace(/ /g, "%20");

function parseSection(html, legend) {
  const start = html.search(new RegExp(`<legend>\\s*${legend}\\s*</legend>`, "i"));
  if (start === -1) return null;
  const end = html.indexOf("</fieldset>", start);
  const block = html.slice(start, end === -1 ? undefined : end);
  const out = [];
  const re = /<a\s+href="([^"]+\.pdf)"[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*([^<]*)<\/a>/gi;
  for (const m of block.matchAll(re)) {
    out.push({
      key: `${m[4]}-${m[2]}-${m[3]}`,
      label: m[5].trim() || null,
      link: encodeHref(m[1]),
    });
  }
  return out;
}

async function main() {
  const res = await fetch(INDEX_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const meetings = new Map();
  for (const [kind, legend] of Object.entries(KINDS)) {
    const docs = parseSection(html, legend);
    // A 200 without the section is a changed page, not an empty one — throw
    // so the staleness guard runs instead of writing items:[] as success.
    if (!docs) throw new Error(`"${legend}" section not found — parse failed`);
    for (const { key, label, link } of docs) {
      if (!meetings.has(key)) meetings.set(key, { agendas: [], minutes: [], resolutions: [] });
      meetings.get(key)[kind].push({ ...(label ? { label } : {}), link });
    }
  }
  if (!meetings.size) throw new Error("no dated documents found — parse failed");

  const items = [...meetings.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, CAP)
    .map(([key, docs]) => {
      // Plain date (no time on the source) at noon Eastern, like township-agendas.
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
      return {
        dateISO: date.toISOString(),
        dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
        ...docs,
      };
    });

  await write({ source: INDEX_URL, items }, NOTE);
  const latest = (kind) => items.find((i) => i[kind].length)?.dateLabel ?? "none";
  console.log(
    `commissioners.json: ${items.length} meeting(s); latest agenda ${latest("agendas")}, minutes ${latest("minutes")}, resolutions ${latest("resolutions")}`
  );
}

main().catch(async (e) => {
  console.error("commissioners refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "commissioners",
    writeEmpty: async (note) => { await write({ source: INDEX_URL, items: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
