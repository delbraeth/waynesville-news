// Wayne Local Board of Education meeting recaps, from the district's own Board
// of Education page (added 2026-11-12, per the editor). BoardDocs blocks
// automated visitors, but the district links a public "<Month> Board Meeting
// Recap" newsletter for every meeting on
// https://www.wayne-local.com/departments/board-of-education/ (newest first).
//
// When a new recap appears, this reads it and stores its plain text in
// src/data/board-recap-feed.json with firstSeen = today. draft-brief.mjs then
// hands that text to the writer in an editor note (stripped before
// publication) for the Schools / Local government narrative.
//
// Privacy: the newsletter's own links, email addresses and phone numbers are
// removed from the stored text, and the newsletter URL itself is never put
// in a brief (the privacy gate rejects smore.com). Cite the recap and link
// the district's Board of Education page instead.
import { readFile, writeFile } from "node:fs/promises";

const PAGE = "https://www.wayne-local.com/departments/board-of-education/";
const UA = "WaynesvilleDailyBrief/1.0 (waynesville.news)";
const OUT = new URL("../src/data/board-recap-feed.json", import.meta.url);
const MAX_TEXT = 16000;

const get = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
};

const decode = (s) => s
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "’").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

function toText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decode(s)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "")
    .replace(/\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g, "")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  // Skip the page chrome before the recap's own title.
  const start = s.search(/Board Meeting Recap\s*\n\s*Wayne Local Schools/);
  if (start > 0) s = s.slice(start);
  return s.slice(0, MAX_TEXT);
}

async function main() {
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

  const page = await get(PAGE);
  const m = /href="(https:\/\/(?:app|secure)\.smore\.com\/n\/[A-Za-z0-9]+)"[^>]*>\s*([A-Z][a-z]+) Board Meeting Recap/.exec(page);
  if (!m) throw new Error("no Board Meeting Recap link found on the district's Board of Education page");
  const [, url, month] = m;

  if (prev?.url === url) {
    await writeFile(OUT, JSON.stringify({ ...prev, checked: new Date().toISOString() }, null, 2) + "\n");
    console.log(`board-recap-feed.json: no new recap (latest: ${prev.meetingDateLabel ?? month})`);
    return;
  }

  const text = toText(await get(url));
  const dm = /Wayne Local Schools\s*-\s*([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(text);
  const meetingDate = dm ? new Date(dm[1] + " 12:00 UTC").toISOString().slice(0, 10) : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const out = {
    _note: "Latest Wayne Local Board of Education meeting recap, read from the district's public recap newsletter linked on its Board of Education page. Plain text with links, emails and phone numbers removed. 'url' is for change detection only: never publish it; cite the recap and link the district's Board of Education page. 'seeded' marks a recap that was already out when this feed started and was not flagged as new.",
    checked: new Date().toISOString(),
    url,
    month,
    meetingDate,
    meetingDateLabel: dm ? dm[1] : `${month} meeting`,
    page: PAGE,
    firstSeen: today,
    seeded: !prev, // the first recap this feed ever sees was already covered
    text,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`board-recap-feed.json: ${prev ? "NEW recap" : "seeded with"} ${out.meetingDateLabel} (${text.length} chars)`);
}

main().catch((e) => {
  // Keep the previous file: a recap is only flagged once, on the day it's
  // first seen, so a failed check just delays it to the next run.
  console.error("board recap refresh failed:", e.message);
  process.exit(0);
});
