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

// "Forrest D. Bush" and "Forrest Bush" are the same person: match on first
// and last name only.
const nameKey = (n) => {
  const w = String(n).toLowerCase().replace(/["'“”‘’()]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ").split(/\s+/).filter((x) => x && !/^[a-z]\.?$/.test(x));
  return w.length ? `${w[0]} ${w[w.length - 1]}` : "";
};

const TOWNS = ["Waynesville", "Corwin", "Harveysburg", "Oregonia"];
const NEWS_Q = `(${TOWNS.map((t) => `"${t}, OH"`).join(" OR ")}) obituary when:10d`;
// "Jane Doe Obituary (2026) - Waynesville, OH - Some Funeral Home - Legacy | Obituary"
const LEGACY_RE = new RegExp(`^(.+?) Obituary \\(\\d{4}\\) - (${TOWNS.join("|")}), OH - (.+?) - Legacy`);

async function otherHomes(cutoff) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_Q)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();
  const out = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = (/<title>([\s\S]*?)<\/title>/.exec(item)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    const m = LEGACY_RE.exec(title);
    if (!m) continue;
    const [, name, town, source] = m;
    if (/stubbs-conner/i.test(source)) continue; // already read directly above
    const posted = new Date(/<pubDate>([^<]+)<\/pubDate>/.exec(item)?.[1] ?? "");
    if (isNaN(posted) || posted < cutoff) continue;
    const link = /<link>([^<]+)<\/link>/.exec(item)?.[1];
    if (!link || out.some((o) => nameKey(o.name) === nameKey(name))) continue;
    const label = posted.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    out.push({
      name: name.replace(/[<>]/g, "").trim(),
      dateRange: `${town}, Ohio · notice posted ${label} (${source.replace(/[<>]/g, "").trim()})`,
      postedISO: posted.toISOString(),
      link,
    });
  }
  return out;
}

async function main() {
  const res = await fetch(INDEX_URL, { headers: { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" }, signal: AbortSignal.timeout(20_000) });
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

  // A 200 whose body no longer matches (redesign, Cloudflare interstitial,
  // WAF stub) used to write items:[] as a confident success — "no deaths this
  // week" — bypassing the staleness ceiling entirely. Zero RAW blocks means
  // the page did not parse; throw so keepOrExpire decides what ships.
  const rawBlocks = [...html.matchAll(blockRe)];
  if (rawBlocks.length === 0) throw new Error("obituary listing markup not found — parse failed, not an empty week");

  const items = rawBlocks
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

  // Other funeral homes (added 2026-11-12): notices that Legacy.com files
  // under Waynesville, Corwin, Harveysburg or Oregonia, found through Google
  // News. Catches residents served by homes in Lebanon, Springboro,
  // Wilmington and beyond, whose own sites are script-rendered or
  // bot-blocked. Best-effort: a failure here never costs the Stubbs-Conner list.
  try {
    for (const extra of await otherHomes(cutoff)) {
      if (items.some((i) => nameKey(i.name) === nameKey(extra.name))) continue;
      items.push(extra);
    }
  } catch (e) {
    console.error("obituaries: other funeral homes skipped:", e.message);
  }

  await write(items, "Obituaries for the past 7 days: Stubbs-Conner Funeral Home (Waynesville) by date of death, plus Legacy.com notices from other funeral homes that list Waynesville, Corwin, Harveysburg or Oregonia as the hometown (by date posted). Names reproduced verbatim; each links to the full notice.");
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
      const d = i.postedISO ? new Date(i.postedISO) : diedFrom(i.dateRange);
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
