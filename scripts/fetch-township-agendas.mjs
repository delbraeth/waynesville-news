// Pull the most recently posted Wayne Township trustee meeting agendas.
// The township moved to a WordPress site in 2026 (waynetwpwarrencooh.gov).
// The Board of Trustees page lists each meeting on its own line:
//   "September 15 — <a>Minutes</a> | <a>Agenda</a><br />"
// Minutes may be absent for recent meetings. The agenda PDF filename encodes
// the full date ("September-15-2026.pdf", "January-6-2026.pdf") and is the
// reliable date source; minutes filenames are inconsistent, so a minutes link
// is only attached when it sits on the same line as its agenda.
// No agenda text is scraped, only title/date/links — each item links straight
// to the township's own PDF.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const AGENDAS_URL = "https://waynetwpwarrencooh.gov/board-of-trustees/";
const CAP = 3;
const OUT = new URL("../src/data/township-agendas.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function parseDateFromFilename(filename) {
  // e.g. "September-15-2026.pdf", "January-6-2026.pdf", "September-01-2026.pdf"
  const m = /([A-Za-z]+)-(\d{1,2})-(\d{4})\.pdf$/i.exec(decodeURIComponent(filename));
  if (!m) return null;
  const monthIdx = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIdx === -1) return null;
  // Plain date (no reliable time on the source) at noon Eastern.
  return new Date(Date.UTC(Number(m[3]), monthIdx, Number(m[2]), 16, 0, 0));
}

async function main() {
  const res = await fetch(AGENDAS_URL, { headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // One meeting per <br />-separated line. Match the agenda anchor by its
  // filename shape, then look for a minutes anchor on the same line.
  const agendaRe = /<a\s+href="([^"]+\/([A-Za-z]+-\d{1,2}-\d{4}\.pdf))"[^>]*>\s*Agenda\s*<\/a>/i;
  const minutesRe = /<a\s+href="([^"]+\.pdf)"[^>]*>\s*Minutes\s*<\/a>/i;
  const lines = html.split(/<br\s*\/?>/i);
  const items = [];
  for (const line of lines) {
    const a = agendaRe.exec(line);
    if (!a) continue;
    const date = parseDateFromFilename(a[2]);
    if (!date) continue;
    // Minutes precede Agenda on each line; only look BEFORE the agenda anchor so
    // a trailing line that runs into the next year's block can't borrow its
    // first Minutes link.
    const mm = minutesRe.exec(line.slice(0, a.index));
    items.push({
      title: "Trustees Meeting Agenda",
      dateISO: date.toISOString(),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
      link: a[1],
      ...(mm ? { minutesLink: mm[1] } : {}),
    });
  }
  // A 200 that matches nothing is a changed page, not an empty agenda list —
  // throw so the staleness guard runs instead of writing items:[] as success.
  if (!items.length) throw new Error("agenda listing markup not found — parse failed");

  items.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  await write(
    { items: items.slice(0, CAP) },
    "Wayne Township Trustees — most recently posted meeting agendas (titles/dates/links only, reproduced verbatim; agenda text lives in the linked PDF; minutesLink present when the township has posted minutes for that meeting)."
  );
  console.log(`township-agendas.json: ${Math.min(items.length, CAP)} agenda(s), latest ${items[0].dateLabel}`);
}

main().catch(async (e) => {
  console.error("township agendas refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "township-agendas",
    writeEmpty: async (note) => { await write({ items: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
