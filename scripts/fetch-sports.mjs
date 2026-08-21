// Pull Waynesville Spartans schedule + results from MaxPreps. The school's
// page embeds a Next.js __NEXT_DATA__ JSON blob with structured contest data
// (no scraping of rendered HTML, no browser needed) — pageProps.contestResults,
// each with hasResult (completed vs. upcoming), timestamp, sport, level, and
// both teams' scores. Window: past 7 days (results) through next 7 days
// (upcoming). Nothing invented — scores and matchups reproduced verbatim.
//
// Home/away: the roster page's team ordering is NOT a reliable signal (verified
// against real games — order doesn't consistently mean home-first or away-first).
// Each individual game page carries a proper schema.org SportsEvent block with
// homeTeam/awayTeam names, so that's fetched per-game instead. Best-effort: if a
// given game's page can't be read, isHome is just left out for that one item
// rather than failing the whole run or guessing.
import { writeFile } from "node:fs/promises";

const SCHOOL_URL = "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/";
const WAYNESVILLE_SCHOOL_ID = "fad9ec30-4dd7-4a9f-b914-05e1a14ec1ea";
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 7;
const GAME_PAGE_DELAY_MS = 400; // be polite — this adds one fetch per game
const UA = "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)";
const OUT = new URL("../src/data/sports.json", import.meta.url);

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchIsHome(gameUrl) {
  try {
    const res = await fetch(gameUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const home = /"homeTeam":\{"@type":"SportsTeam","name":"([^"]+)"/.exec(html)?.[1];
    if (!home) return null;
    return home.includes("Waynesville");
  } catch {
    return null; // unknown — draft falls back to plain "vs" for this one game
  }
}

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

  let fetchCount = 0;
  const shape = async (c) => {
    const us = c.teams.find((t) => t.teamId === WAYNESVILLE_SCHOOL_ID) ?? c.teams[0];
    const them = c.teams.find((t) => t.teamId !== WAYNESVILLE_SCHOOL_ID) ?? c.teams[1];
    if (fetchCount++ > 0) await sleep(GAME_PAGE_DELAY_MS);
    const isHome = c.canonicalUrl ? await fetchIsHome(c.canonicalUrl) : null;
    return {
      dateISO: c.timestamp,
      sport: c.sport,
      level: c.teamLevel,
      opponent: them?.schoolName ?? "TBA",
      wayneScore: us?.score ?? null,
      opponentScore: them?.score ?? null,
      result: us?.result ?? null, // "W" / "L" / null
      isHome, // true / false / null (unknown)
      link: c.canonicalUrl,
    };
  };

  const shapeAll = async (list) => {
    const out = [];
    for (const c of list) out.push(await shape(c));
    return out;
  };

  const results = await shapeAll(inWindow.filter((c) => c.hasResult && c._d < now));
  const upcoming = await shapeAll(inWindow.filter((c) => !c.hasResult || c._d >= now));

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
