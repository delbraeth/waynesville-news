// Building permits issued in Wayne Township and the villages of Waynesville
// and Corwin, from the Warren County Building Department's monthly report.
//
// DELAY: the county publishes each month's report around the 10th of the
// following month, so this data is always 5–6 weeks behind. The brief says so
// every time it shows it.
//
// The report is a PDF table whose cells wrap across lines, so plain text
// extraction scrambles it. pdfjs gives each text fragment's x/y position; each
// fragment is assigned to a column by x and to a permit by y (a permit starts
// at a row whose Issued Date cell holds a date).
//
// Privacy: residential permits often carry the homeowner's name in the
// applicant and project-name columns. For residential permits only the street
// name (no house number), the work description and the cost are kept — never a
// name. Commercial permits keep the address and project name (the business).
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const BASE = "https://www.warrencountyohio.gov";
const INDEX_URL = `${BASE}/bldginsp/BuildingElectrical/MonthlyReport/Index`;
const OUT = new URL("../src/data/permits.json", import.meta.url);
const UA = { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" };
const JURISDICTIONS = /^(wayne|village of waynesville|village of corwin)$/i;

// Left edge (pt) of each column in the report's landscape layout.
const COLUMNS = [
  ["issued", 0], ["permit", 90], ["applicant", 160], ["subdivision", 208], ["useGroup", 250],
  ["address", 295], ["projectName", 338], ["description", 380], ["valuation", 425],
  ["cost", 490], ["sqft", 555], ["comRes", 580], ["lot", 635], ["jurisdiction", 665], ["parcel", 715],
];
// Numbers sit on a permit's first line only; text columns may wrap.
const FIRST_LINE_ONLY = new Set(["issued", "permit", "valuation", "cost", "sqft", "comRes", "lot", "parcel"]);
const MAX_SPAN_PT = 64; // ~8 wrapped lines; stops page-footer text bleeding in
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const colOf = (x) => { let c = COLUMNS[0][0]; for (const [name, left] of COLUMNS) if (x >= left - 2) c = name; return c; };
const clean = (s) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const money = (s) => { const n = Number(String(s ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

async function get(url, as = "text") {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === "buffer" ? new Uint8Array(await res.arrayBuffer()) : res.text();
}

async function parseReport(buf) {
  const doc = await getDocument({ data: buf, useSystemFonts: true, isEvalSupported: false }).promise;
  const permits = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const frags = (await page.getTextContent()).items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
    // Header row sits above the first data row; anchors are date cells.
    const anchors = frags.filter((f) => colOf(f.x) === "issued" && DATE_RE.test(f.s)).sort((a, b) => b.y - a.y);
    anchors.forEach((a, i) => {
      const floor = Math.max(i + 1 < anchors.length ? anchors[i + 1].y : -Infinity, a.y - MAX_SPAN_PT);
      const cells = {};
      frags
        .filter((f) => f.y <= a.y + 1 && f.y > floor + 1)
        .sort((m, n) => n.y - m.y || m.x - n.x)
        .forEach((f) => {
          const c = colOf(f.x);
          if (FIRST_LINE_ONLY.has(c) && Math.abs(f.y - a.y) > 1) return;
          cells[c] = cells[c] ? `${cells[c]} ${f.s}` : f.s;
        });
      const [, mo, d, y] = a.s.match(DATE_RE);
      const row = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, clean(v)]));
      // The permit cell also carries a contact person's name, and the Lot
      // number sits close enough to Com/Res to share its column: keep only
      // the permit digits and the Com/Res word.
      row.permit = row.permit?.match(/\d{6,}/)?.[0] ?? null;
      row.comRes = row.comRes?.match(/commercial|residential/i)?.[0] ?? row.comRes;
      permits.push({ ...row, issuedISO: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` });
    });
  }
  return permits;
}

async function main() {
  const html = await get(INDEX_URL);
  // <a href="/bldginsp/doc/BuildingElectrical/MonthlyReportsWC\2026\08.pdf">August
  const reports = [...html.matchAll(/href="([^"]*MonthlyReportsWC[\\/](\d{4})[\\/](\d{2})\.pdf)"/g)]
    .map(([, href, y, m]) => ({ href, ym: `${y}-${m}` }))
    .sort((a, b) => b.ym.localeCompare(a.ym));
  if (!reports.length) throw new Error("no monthly report links found — markup changed");
  const latest = reports[0];
  // The server wants the backslashes as %5C. reportUrl keeps them raw because
  // the brief's link() helper percent-encodes on output.
  const reportUrl = `${BASE}${latest.href}`;
  const pdfUrl = encodeURI(reportUrl);

  // Same report as last run? Keep firstSeen so the brief shows it only once.
  let prev = null;
  if (existsSync(OUT)) { try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* ignore */ } }
  const firstSeen = prev?.reportMonth === latest.ym && prev?.firstSeen ? prev.firstSeen : new Date().toISOString().slice(0, 10);

  const all = await parseReport(await get(pdfUrl, "buffer"));
  // Sanity: nearly every row should parse as Commercial/Residential. If not,
  // the layout moved and the columns are wrong — fail rather than publish junk.
  const typed = all.filter((r) => /^(commercial|residential)$/i.test(r.comRes ?? "")).length;
  if (all.length < 10 || typed / all.length < 0.9) throw new Error(`report layout changed: ${typed}/${all.length} rows parsed cleanly`);

  const items = all
    .filter((r) => JURISDICTIONS.test(r.jurisdiction ?? ""))
    .map((r) => {
      const residential = /^residential$/i.test(r.comRes);
      const address = clean(r.address);
      return {
        issuedISO: r.issuedISO,
        permit: r.permit ?? null,
        type: residential ? "Residential" : "Commercial",
        jurisdiction: /^wayne$/i.test(r.jurisdiction) ? "Wayne Township" : r.jurisdiction,
        useGroup: clean(r.useGroup),
        // Residential: street only, house number dropped.
        location: residential ? address.replace(/^\d+[A-Z]?\s+/, "") : address,
        projectName: residential ? null : clean(r.projectName) || null,
        description: clean(r.description),
        cost: money(r.cost) ?? money(r.valuation),
      };
    })
    .sort((a, b) => a.issuedISO.localeCompare(b.issuedISO));

  const monthLabel = new Date(`${latest.ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  await writeFile(OUT, JSON.stringify({
    _note: "Warren County Building Department monthly permit report, filtered to Wayne Township and the villages of Waynesville and Corwin. Published ~5-6 weeks after the month ends. Residential permits: street name only, no house number or names.",
    updated: new Date().toISOString(),
    reportMonth: latest.ym,
    reportLabel: monthLabel,
    reportUrl,
    indexUrl: INDEX_URL,
    firstSeen,
    countyTotal: all.length,
    items,
  }, null, 2) + "\n");
  console.log(`permits.json: ${monthLabel} report, ${items.length} Wayne-area permit(s) of ${all.length} countywide (first seen ${firstSeen})`);
}

main().catch(async (e) => {
  console.error("permits refresh failed:", e.message);
  await keepOrExpire({
    out: OUT,
    label: "permits",
    writeEmpty: async (note) => { await writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items: [] }, null, 2) + "\n"); },
  });
  process.exit(0); // don't fail the workflow
});
