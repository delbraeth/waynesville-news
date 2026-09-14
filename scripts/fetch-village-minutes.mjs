// Pull the most recently posted Village Council agenda packet and OCR the
// embedded minutes of the PREVIOUS meeting from it. The Village's site
// posts agendas promptly, but its dedicated "Minutes" documents lag by
// months — however, each agenda packet's own pages 3+ are a scan of the
// prior meeting's draft minutes (submitted for approval that night), which
// is far more current (~2 weeks old, not ~5 months). Those pages are
// scanned images with no text layer, so this OCRs them (tesseract.js,
// no native binary needed) at a high render scale for accuracy, then
// extracts factual "key items": every formal vote (Motion/Second/Roll
// Call) with its verbatim preceding context. Nothing is generated or
// paraphrased — OCR output may contain occasional character errors, which
// is disclosed in the written note. Links to the full agenda PDF for
// anything not captured here.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

const MEETINGS_URL = "https://www.villageofwaynesville.org/meetings/";
const OUT = new URL("../src/data/village-minutes.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
const MAX_VOTES = 6;
const MAX_MINUTES_PAGES = 10; // safety cap; minutes packets have run 5-7 pages historically
const OCR_SCALE = 3; // low-res renders produce garbled OCR; this range tested clean

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

// The minutes are a scan of a bordered table, so OCR emits the borders and
// margin marks as stray characters. Strip them before the text reaches
// auto-published Markdown (pipes would also break table rendering).
function scrubOcr(s) {
  return s
    .replace(/[<>|]/g, " ")
    .replace(/--\s*\d+ of \d+\s*--/g, "")
    // superscript ordinals scan as quotes/percent: August 17" → August 17
    .replace(new RegExp(`(?:${MONTHS})\\s+\\d{1,2}\\s*["'’%]+`, "gi"), (t) => t.replace(/\s*["'’%]+$/, ""))
    .replace(new RegExp(`((?:${MONTHS})\\s+\\d{1,2})\\s+(\\d{4})`, "gi"), "$1, $2")
    .split("\n")
    .filter((line) => {
      const t = line.trim().split(/\s+/).filter(Boolean);
      if (t.length === 1 && /^\d{1,3}$/.test(t[0])) return false; // stray page number
      // rule/border rows OCR as runs of tiny letter tokens ("Ee A A TT TTT")
      return !(t.length >= 2 && !t.some((w) => /[A-Za-z]{4,}/.test(w)) && !t.some((w) => /\d/.test(w)));
    })
    .join("\n")
    .replace(/\s+[:;!i’']\s*$/gm, "") // margin marks stranded at line ends
    .replace(/[ \t]{2,}/g, " ");
}

// Snap the start of a vote's context to a structural boundary. A fixed-width
// backward slice used to cut through an item heading — which once dropped
// "Ordinance 2026-034" and left the subordinate "Ordinance No. 2026-029" it
// amends, attributing the vote to the wrong ordinance.
const HEADING_RE = /(?:^|\n)[ \t]*(?:Ordinance|Resolution)\s+(?:No\.\s*)?\d{4}-\d{2,4}/gi;
const MOTION_RE = /(?:^|\n)[ \t]*(?:Mr|Mrs|Ms|Mayor|Mer|Mis)\.?\s+[A-Za-z]+\s+(?:moved|motioned|made a motion)/gi;

function lastMatchIndex(re, hay) {
  re.lastIndex = 0;
  let m, last = -1;
  while ((m = re.exec(hay))) last = m.index + (m[0].startsWith("\n") ? 1 : 0);
  return last;
}

function cleanContext(win) {
  let rel = lastMatchIndex(HEADING_RE, win);
  if (rel < 0) rel = lastMatchIndex(MOTION_RE, win);
  if (rel < 0) rel = Math.max(0, win.length - 350);
  return scrubOcr(win.slice(rel)).replace(/\s*\n\s*/g, " ").trim();
}

async function findLatestAgenda() {
  const res = await fetch(MEETINGS_URL, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const rows = html.split('<div class="divPseudoTR searchParent row m-0">').slice(1);
  const candidates = [];
  for (const row of rows) {
    const values = [...row.matchAll(/spanDataValue spanSearchKeyword spanDeleteKeyword">([^<]+)</g)].map((m) => m[1]);
    const [dateStr, meetingType] = values;
    if (meetingType !== "Council Meeting" || !dateStr) continue;

    const agendaM = /Agenda<\/span>\s*<span class="spanDataValue">\s*<a href="([^"]+)"[^>]*title="View ([^"]*)"/.exec(row);
    const link = agendaM?.[1];
    const filename = agendaM?.[2];
    if (!link || !filename || !filename.toLowerCase().endsWith(".pdf")) continue;

    const date = new Date(dateStr);
    if (isNaN(date)) continue;
    candidates.push({ date, dateStr, link });
  }
  candidates.sort((a, b) => b.date - a.date);
  return candidates[0] ?? null;
}

async function main() {
  const agenda = await findLatestAgenda();
  if (!agenda) { await write({ item: null }, "No Village Council agenda with a posted PDF found."); console.log("village-minutes.json: no agenda found"); return; }

  const pdfRes = await fetch(encodeURI(agenda.link), { headers: UA });
  if (!pdfRes.ok) throw new Error(`Agenda PDF fetch HTTP ${pdfRes.status}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const worker = await createWorker("eng");

  const ocrPage = async (n) => {
    const shots = await parser.getScreenshot({ first: n, last: n, scale: OCR_SCALE });
    if (!shots.pages.length) return "";
    const { data } = await worker.recognize(shots.pages[0].data);
    return data.text;
  };

  // Page 1 (the agenda cover) states the previous meeting's date under
  // "Disposition of Minutes of Previous Meetings" — a short, predictable
  // line that's more reliable to parse than the minutes' own stylized
  // header several pages in.
  const page1Text = await ocrPage(1);
  const prevMeetingM = /Council,\s*([A-Za-z]+\.?\s+\d{1,2},?\s*\d{4})/i.exec(page1Text);

  let combined = "";
  let pagesScanned = 0;
  for (let p = 3; p < 3 + MAX_MINUTES_PAGES; p++) {
    const text = await ocrPage(p);
    if (!text.trim()) break; // ran past the end of the document
    combined += "\n" + text;
    pagesScanned++;
    if (/adjourn/i.test(text)) break; // reached the end of the embedded minutes
  }
  await worker.terminate();

  const ctoM = /called the meeting to order at ([\d:.]+\s*[ap]\.?m\.?)/i.exec(combined);
  const adjM = /adjourn(?:ing|ed)(?: the meeting)? at ([\d:.]+\s*[ap]\.?m\.?)/i.exec(combined);

  // Capture only the leading name token for Motion/Second — OCR sometimes
  // tacks a stray character onto the end of these short lines (a table
  // border or margin mark misread as a letter), which a greedy [^\n]+
  // would otherwise pull in.
  const voteRe = /Motion\s*[–—-]\s*([A-Za-z][A-Za-z.'-]*)[^\n]*\nSecond\s*[–—-]\s*([A-Za-z][A-Za-z.'-]*)[^\n]*\n\S*\s*Roll Call\s*[–—-]\s*(\d+)\s*(yeas?|nays?)/gi;
  const votes = [];
  let m;
  let prevEnd = 0;
  while ((m = voteRe.exec(combined))) {
    const start = Math.max(prevEnd, m.index - 800);
    const context = cleanContext(combined.slice(start, m.index));
    votes.push({ context, motion: m[1].trim(), second: m[2].trim(), rollCall: `${m[3]} ${m[4]}` });
    prevEnd = voteRe.lastIndex;
  }

  await write(
    {
      item: {
        agendaDateLabel: agenda.dateStr, // the meeting this agenda packet is FOR
        meetingDateLabel: prevMeetingM?.[1] ?? null, // the meeting these minutes are OF (the previous one)
        calledToOrder: ctoM?.[1] ?? null,
        adjourned: adjM?.[1] ?? null,
        link: agenda.link,
        votes: votes.slice(0, MAX_VOTES),
        voteCountTotal: votes.length,
        pagesScanned,
      },
    },
    "Village of Waynesville Council — draft minutes of the meeting prior to the most recently posted agenda, OCR'd from that agenda packet's own embedded scan (the site's dedicated Minutes postings run months behind, but each agenda includes the previous meeting's minutes for approval). OCR output may contain occasional character errors; each vote's context text is extracted verbatim, not generated or paraphrased. Links to the full agenda PDF."
  );
  console.log(`village-minutes.json: agenda for ${agenda.dateStr}, minutes of ${prevMeetingM?.[1] ?? "unknown"}, ${votes.length} vote(s), ${pagesScanned} page(s) scanned`);
}

main().catch(async (e) => {
  console.error("village minutes refresh failed:", e.message);
  if (existsSync(OUT)) {
    console.error("keeping previously fetched data (source may be temporarily down)");
  } else {
    await write({ item: null }, "village minutes fetch failed; empty (draft omits the minutes summary).");
  }
  process.exit(0); // don't fail the workflow
});
