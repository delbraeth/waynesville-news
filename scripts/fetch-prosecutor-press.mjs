// Pull the Warren County Prosecutor's own press releases from the past 7 days.
// This is the highest-liability content this site publishes: per Cap'n's
// explicit choice (2026-08-21), it is auto-published unfiltered, including
// items about indictments and charges that name people who have not been
// convicted of anything — normally excluded under a "never auto-publish"
// note in SOURCES.md for this category. Titles and dates are reproduced
// verbatim from the prosecutor's own official release; nothing is
// paraphrased, summarized, or invented. Each item links straight to the
// prosecutor's own PDF release for verification.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const INDEX_URL = "https://prosecutor.warrencountyohio.gov/Public/Press/Index";
const BASE = "https://prosecutor.warrencountyohio.gov";
const LOOKBACK_DAYS = 7;
const OUT = new URL("../src/data/prosecutor-press.json", import.meta.url);

// Decode entities, then strip literal angle brackets — these titles are
// interpolated into auto-published Markdown where raw HTML would render.
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[<>]/g, "")
    .trim();

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

// href values look like `../..//doc/Press\2026\08202026_Title.pdf` — resolve
// to an absolute URL on the prosecutor's own site.
function resolveLink(href) {
  const cleaned = href.replace(/\\/g, "/").replace(/^(\.\.\/)+\/?/, "/");
  return new URL(cleaned, BASE).toString();
}

async function main() {
  const res = await fetch(INDEX_URL, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Rows look like:
  // <tr><td><a href="LINK">MM/DD/YYYY</a></td><td><a href="LINK">Title</a></td></tr>
  const rowRe = /<tr>\s*<td><a[^>]*href="([^"]+)"[^>]*>(\d{2}\/\d{2}\/\d{4})<\/a><\/td>\s*<td[^>]*><a[^>]*href="[^"]+"[^>]*>([^<]+)<\/a><\/td>\s*<\/tr>/gs;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const items = [...html.matchAll(rowRe)]
    .map((m) => {
      const [, href, dateStr, titleRaw] = m;
      const [mo, day, yr] = dateStr.split("/").map(Number);
      const date = new Date(yr, mo - 1, day);
      return { date, dateLabel: dateStr, title: decode(titleRaw), link: resolveLink(href) };
    })
    .filter((i) => i.date >= cutoff)
    .sort((a, b) => b.date - a.date)
    .map(({ date, ...rest }) => rest);

  await write(items, "Warren County Prosecutor press releases, past 7 days, unfiltered (includes pre-conviction items — Cap'n's explicit choice, 2026-08-21). Titles reproduced verbatim from the source; link goes to the prosecutor's own release.");
  console.log(`prosecutor-press.json: ${items.length} item(s) in the past ${LOOKBACK_DAYS} days`);
}

main().catch(async (e) => {
  console.error("prosecutor press refresh failed:", e.message);
  if (existsSync(OUT)) {
    console.error("keeping previously fetched data (source may be temporarily down)");
  } else {
    await write([], "prosecutor press fetch failed; empty list (draft falls back to the check-links line).");
  }
  process.exit(0); // don't fail the workflow
});
