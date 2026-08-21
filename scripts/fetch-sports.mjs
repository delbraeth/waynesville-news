// Pull Waynesville Spartans schedule + results from MaxPreps. The school's
// page embeds a Next.js __NEXT_DATA__ JSON blob with structured contest data
// (no scraping of rendered HTML, no browser needed) — pageProps.contestResults,
// each with hasResult (completed vs. upcoming), timestamp, sport, level, and
// both teams' scores. Window: past 7 days (results) through next 7 days
// (upcoming). Nothing invented — scores and matchups reproduced verbatim.
import { writeFile } from "node:fs/promises";

const SCHOOL_URL = "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/";
const WAYNESVILLE_SCHOOL_ID = "fad9ec30-4dd7-4a9f-b914-05e1a14ec1ea";
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 7;
const OUT = new URL("../src/data/sports.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

async function main() {
  const res = await fetch(SCHOOL_URL, { headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const m = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(html);
  if (!m) throw new Error("__NEXT_DATA__ not found on page");
  const data = JSON.parse(m[1]);
  const contests = data?.props?.pageProps?.contestResults ?? [];

  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - LOOKBACK_DAYS);
  const to = new Date(now); to.setDate(to.getDate() + LOOKAHEAD_DAYS);

  const inWindow = contests
    .map((c) => ({ ...c, _d: new Date(c.timestamp) }))
    .filter((c) => c._d >= from && c._d <= to)
    .sort((a, b) => a._d - b._d);

  const shape = (c) => {
    const us = c.teams.find((t) => t.teamId === WAYNESVILLE_SCHOOL_ID) ?? c.teams[0];
    const them = c.teams.find((t) => t.teamId !== WAYNESVILLE_SCHOOL_ID) ?? c.teams[1];
    return {
      dateISO: c.timestamp,
      sport: c.sport,
      level: c.teamLevel,
      opponent: them?.schoolName ?? "TBA",
      wayneScore: us?.score ?? null,
      opponentScore: them?.score ?? null,
      result: us?.result ?? null, // "W" / "L" / null
      link: c.canonicalUrl,
    };
  };

  const results = inWindow.filter((c) => c.hasResult && c._d < now).map(shape);
  const upcoming = inWindow.filter((c) => !c.hasResult || c._d >= now).map(shape);

  await write(
    { results, upcoming },
    `Waynesville Spartans schedule + results (MaxPreps), past ${LOOKBACK_DAYS} days / next ${LOOKAHEAD_DAYS} days. Scores and matchups reproduced verbatim from MaxPreps' own data; each links to their game page.`
  );
  console.log(`sports.json: ${results.length} result(s), ${upcoming.length} upcoming`);
}

main().catch(async (e) => {
  console.error("sports refresh failed:", e.message);
  await write({ results: [], upcoming: [] }, "sports fetch failed; empty (draft falls back to no sports section).");
  process.exit(0); // don't fail the workflow
});
