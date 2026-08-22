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

function cleanContext(raw, isFromStart) {
  // strip angle brackets too — OCR text goes into auto-published Markdown
  let context = raw.replace(/\s*\n\s*/g, " ").replace(/--\s*\d+ of \d+\s*--/g, "").replace(/[<>]/g, "").trim();
  if (!isFromStart) {
    const firstSpace = context.indexOf(" ");
    if (firstSpace > 0 && firstSpace < 40) context = context.slice(firstSpace + 1);
  }
  return context;
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
    const start = Math.max(prevEnd, m.index - 350);
    const context = cleanContext(combined.slice(start, m.index), start === 0);
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
