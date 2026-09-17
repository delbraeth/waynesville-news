// Pull recent obituaries from Stubbs-Conner Funeral Home (Waynesville's local
// funeral home). Page 1 is sorted most-recent-first, so no pagination is
// needed — anything outside the lookback window is simply filtered out.
// Names, dates, and the short opening line are reproduced verbatim from the
// listing; each links straight to the full tribute page. Nothing invented.
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const INDEX_URL = "https://www.stubbsconner.com/obituaries/";
const BASE = "https://www.stubbsconner.com";
const LOOKBACK_DAYS = 7;
const OUT = new URL("../src/data/obituaries.json", import.meta.url);

const write = (items, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), items }, null, 2) + "\n");

// "Jul. 11, 1934 - Sep. 02, 2026" -> Date(Sep 02 2026), or null.
const diedFrom = (dateRange) => {
  const d = new Date(String(dateRange).split(" - ").pop().replace(/\./g, ""));
  return isNaN(d) ? null : d;
};

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
  // Entries carry a date but no time, so they parse to local midnight. Without
  // this the cutoff keeps the current time of day and anything dated exactly
  // LOOKBACK_DAYS ago is dropped — a silently one-day-short window.
  cutoff.setHours(0, 0, 0, 0);

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
      // strip angle brackets — these go into auto-published Markdown
      return { name: name.replace(/[<>]/g, "").trim(), dateRange: dateRange.replace(/[<>]/g, ""), died, link: new URL(href, BASE).toString() };
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

  const outcome = await keepOrExpire({
    out: OUT,
    label: "obituaries",
    writeEmpty: async (note) => { await write([], note); },
  });

  // If the cache is recent enough to keep, its entries must still satisfy the
  // lookback window this section's wording promises — otherwise an obituary
  // silently ages past "the last 7 days" while still being published.
  if (outcome === "kept") {
    const cached = JSON.parse(await readFile(OUT, "utf8"));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
    cutoff.setHours(0, 0, 0, 0);
    const kept = (cached.items ?? []).filter((i) => {
      const d = diedFrom(i.dateRange);
      return d && d >= cutoff;
    });
    if (kept.length !== (cached.items ?? []).length) {
      await write(kept, cached._note ?? "");
      console.error(
        `obituaries: kept ${kept.length} of ${(cached.items ?? []).length} cached item(s) ` +
          `still inside the ${LOOKBACK_DAYS}-day window`
      );
    }
  }
  process.exit(0); // don't fail the workflow
});
