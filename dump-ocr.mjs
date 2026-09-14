// One-off: cache the OCR text so parser changes can be iterated without re-OCRing.
import { writeFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
const MEETINGS_URL = "https://www.villageofwaynesville.org/meetings/";

const res = await fetch(MEETINGS_URL, { headers: UA });
const html = await res.text();
const rows = html.split('<div class="divPseudoTR searchParent row m-0">').slice(1);
const cands = [];
for (const row of rows) {
  const values = [...row.matchAll(/spanDataValue spanSearchKeyword spanDeleteKeyword">([^<]+)</g)].map(m=>m[1]);
  const [dateStr, meetingType] = values;
  if (meetingType !== "Council Meeting" || !dateStr) continue;
  const am = /Agenda<\/span>\s*<span class="spanDataValue">\s*<a href="([^"]+)"[^>]*title="View ([^"]*)"/.exec(row);
  if (!am?.[1] || !am?.[2]?.toLowerCase().endsWith(".pdf")) continue;
  const date = new Date(dateStr); if (isNaN(date)) continue;
  cands.push({ date, dateStr, link: am[1] });
}
cands.sort((a,b)=>b.date-a.date);
const agenda = cands[0];
console.log("agenda:", agenda.dateStr, agenda.link);

const buf = Buffer.from(await (await fetch(encodeURI(agenda.link), { headers: UA })).arrayBuffer());
const parser = new PDFParse({ data: buf });
const worker = await createWorker("eng");
const ocrPage = async (n) => {
  const shots = await parser.getScreenshot({ first:n, last:n, scale:3 });
  if (!shots.pages.length) return "";
  return (await worker.recognize(shots.pages[0].data)).data.text;
};
const page1 = await ocrPage(1);
let combined = "";
for (let p=3; p<13; p++) {
  const t = await ocrPage(p);
  if (!t.trim()) break;
  combined += "\n" + t;
  if (/adjourn/i.test(t)) break;
}
await worker.terminate();
await writeFile("/tmp/ocr-page1.txt", page1);
await writeFile("/tmp/ocr-combined.txt", combined);
console.log("cached. combined length:", combined.length);
