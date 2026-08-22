// Pull the most recently posted Wayne Township meeting agendas. The site
// (an IONOS MyWebsite CMS page, no JS needed) lists each posted agenda as a
// PDF download block with a title ("Trustees Meeting Agenda") and a
// filename that encodes the date ("August+18+2026.pdf" /
// "June+15%2C+2026.pdf" — format is inconsistent, so we parse leniently).
// No agenda text is scraped, only title/date/link — each item links
// straight to the township's own PDF.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const AGENDAS_URL = "https://www.waynetownship.us/minutes-agendas/agendas-2026/";
const CAP = 3;
const OUT = new URL("../src/data/township-agendas.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function parseDateFromFilename(filename) {
  // e.g. "August 18 2026.pdf" or "June 15, 2026.pdf" (after URL-decoding).
  const decoded = decodeURIComponent(filename).replace(/\.pdf$/i, "").replace(",", "");
  const m = /([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/.exec(decoded);
  if (!m) return null;
  const monthIdx = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIdx === -1) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  // Store as a plain date (no reliable time on the source) at noon Eastern.
  return new Date(Date.UTC(year, monthIdx, day, 16, 0, 0));
}

async function main() {
  const res = await fetch(AGENDAS_URL, { headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const re = /class="rightDownload">\s*<strong>([^<]*)<\/strong><br\/>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    const [, title, link, filename] = m;
    const date = parseDateFromFilename(filename);
    if (!date) continue;
    items.push({
      title: title.replace(/[<>]/g, "").trim(), // goes into auto-published Markdown
      dateISO: date.toISOString(),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
      link,
    });
  }
  items.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));

  await write(
    { items: items.slice(0, CAP) },
    "Wayne Township Trustees — most recently posted meeting agendas (titles/dates/links only, reproduced verbatim; agenda text lives in the linked PDF)."
  );
  console.log(`township-agendas.json: ${Math.min(items.length, CAP)} agenda(s)`);
}

main().catch(async (e) => {
  console.error("township agendas refresh failed:", e.message);
  if (existsSync(OUT)) {
    console.error("keeping previously fetched data (source may be temporarily down)");
  } else {
    await write({ items: [] }, "township agendas fetch failed; empty (draft falls back to the general schedule).");
  }
  process.exit(0); // don't fail the workflow
});
