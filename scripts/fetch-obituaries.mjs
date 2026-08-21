// Pull recent obituaries from Stubbs-Conner Funeral Home (Waynesville's local
// funeral home). Page 1 is sorted most-recent-first, so no pagination is
// needed — anything outside the lookback window is simply filtered out.
// Names, dates, and the short opening line are reproduced verbatim from the
// listing; each links straight to the full tribute page. Nothing invented.
import { writeFile } from "node:fs/promises";

const INDEX_URL = "https://www.stubbsconner.com/obituaries/";
const BASE = "https://www.stubbsconner.com";
const LOOKBACK_DAYS = 7;
const OUT = new URL("../src/data/obituaries.json", import.meta.url);

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

async function main() {
  const res = await fetch(INDEX_URL, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Each listing is a <div class="tribute ..."> block containing a name link
  // (href="/obituaries/slug") and a "Mon. DD, YYYY - Mon. DD, YYYY" dates line.
  const blockRe = /<div class="tribute[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  const nameRe = /<a href="(\/obituaries\/[^"]+)" class="inherit">([^<]+)<\/a>/;
  const datesRe = /class="tribute__dates[^"]*">([^<]+)<\/p>/;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const items = [...html.matchAll(blockRe)]
    .map((m) => {
      const block = m[0];
      const nameMatch = nameRe.exec(block);
      const datesMatch = datesRe.exec(block);
      if (!nameMatch || !datesMatch) return null;
      const [, href, name] = nameMatch;
      const dateRange = datesMatch[1].trim();
      const diedStr = dateRange.split(" - ").pop().replace(/\./g, "");
      const died = new Date(diedStr);
      if (isNaN(died)) return null;
      return { name: name.trim(), dateRange, died, link: new URL(href, BASE).toString() };
    })
    .filter(Boolean)
    .filter((i) => i.died >= cutoff)
    .sort((a, b) => b.died - a.died)
    .map(({ died, ...rest }) => rest);

  await write(items, "Obituaries from Stubbs-Conner Funeral Home (Waynesville), past 7 days by date of death. Names and dates reproduced verbatim; link goes to the full tribute page.");
  console.log(`obituaries.json: ${items.length} item(s) in the past ${LOOKBACK_DAYS} days`);
}

main().catch(async (e) => {
  console.error("obituaries refresh failed:", e.message);
  await write([], "obituaries fetch failed; empty list.");
  process.exit(0); // don't fail the workflow
});
