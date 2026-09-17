// Pull recent obituaries from Stubbs-Conner Funeral Home (Waynesville's local
// funeral home). Page 1 is sorted most-recent-first, so no pagination is
// needed — anything outside the lookback window is simply filtered out.
// Names, dates, and the short opening line are reproduced verbatim from the
// listing; each links straight to the full tribute page. Nothing invented.
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const INDEX_URL = "https://www.stubbsconner.com/obituaries/";
const BASE = "https://www.stubbsconner.com";
const LOOKBACK_DAYS = 7;
// How long cached data may survive a source outage before we stop publishing
// it. An unbounded "keep the last good copy" fallback silently turns an
// outage into misinformation: the section keeps claiming "past 7 days" while
// the entries age out and newly posted deaths go missing. Better to show
// nothing than something untrue on this particular section.
const MAX_STALE_DAYS = 2;
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

  if (!existsSync(OUT)) {
    await write([], "obituaries fetch failed; empty list.");
    process.exit(0);
  }

  // Decide whether the cached copy is still safe to publish.
  let cached;
  try {
    cached = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    await write([], "obituaries fetch failed and cache unreadable; empty list.");
    console.error("OBITUARIES: cache unreadable — publishing an empty list");
    process.exit(0);
  }

  const updated = new Date(cached.updated ?? 0);
  const ageDays = (Date.now() - updated.getTime()) / 86400000;

  if (!isFinite(ageDays) || ageDays > MAX_STALE_DAYS) {
    await write(
      [],
      `obituaries source unreachable since ${isFinite(ageDays) ? updated.toISOString().slice(0, 10) : "an unknown date"}; ` +
        `cached data exceeded the ${MAX_STALE_DAYS}-day staleness ceiling and was dropped. ` +
        `The Obituaries section is omitted rather than published stale.`
    );
    console.error(
      `OBITUARIES STALE: last good fetch ${isFinite(ageDays) ? `${ageDays.toFixed(1)} days ago` : "unknown"} ` +
        `(ceiling ${MAX_STALE_DAYS}d) — dropping cached items; the section will be omitted from the brief. ` +
        `Deaths posted since then are NOT being reported. Fix the source.`
    );
    process.exit(0);
  }

  // Cache is recent enough to keep, but entries still must satisfy the
  // lookback window the section's wording promises.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const kept = (cached.items ?? []).filter((i) => {
    const d = diedFrom(i.dateRange);
    return d && d >= cutoff;
  });

  if (kept.length !== (cached.items ?? []).length) {
    await write(kept, cached._note ?? "");
    console.error(
      `obituaries: source down; kept ${kept.length} of ${(cached.items ?? []).length} cached item(s) ` +
        `still inside the ${LOOKBACK_DAYS}-day window`
    );
  } else {
    console.error(`keeping previously fetched data (${ageDays.toFixed(1)}d old; source may be temporarily down)`);
  }
  process.exit(0); // don't fail the workflow
});
