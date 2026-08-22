// Pull Waynesville Spartans schedule + results from MaxPreps.
//
// Scrapes each sport's own schedule page directly (varsity + JV), rather than
// the school's general hub page. The hub page exposes a __NEXT_DATA__ blob
// with a `contestResults` array that looks authoritative but has been
// observed to silently drop entire contests with no error — varsity
// football's 8/21 game vs Clinton-Massie (a 20-17 win) never appeared there,
// and only surfaced after a reader noticed the score was missing from the
// published brief. Per-sport schedule pages don't have that gap.
//
// Each schedule page's HTML table has a stable, semantic structure (plain
// `class="result W"` / `class="score"` spans — not the hashed
// styled-components classes used elsewhere on the page), so it's scraped
// directly rather than via a secondary JSON blob. Home/away comes straight
// from the row's "vs" (home) / "@" (away) marker, so there's no need for the
// old per-game follow-up fetch to determine it.
//
// Window: past 7 days (results) through next 7 days (upcoming). Nothing
// invented — scores and matchups reproduced verbatim from MaxPreps' own
// markup, each linking to their game page.
import { writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)";
const OUT = new URL("../src/data/sports.json", import.meta.url);
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 7;

// Fall sports tracked for the brief. Add/remove sport-season entries here as
// the school year moves through winter/spring sports. Note soccer fields
// BOTH a boys team (/soccer/) and a girls team (/soccer/girls/) — an
// earlier version tracked only the girls pages and silently missed every
// boys soccer game, so keep both, clearly labeled.
const SCHEDULE_PAGES = [
  { sport: "Football", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/football/schedule/" },
  { sport: "Football", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/football/jv/schedule/" },
  { sport: "Volleyball", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/volleyball/schedule/" },
  { sport: "Volleyball", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/volleyball/jv/schedule/" },
  { sport: "Boys Soccer", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/soccer/schedule/" },
  { sport: "Boys Soccer", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/soccer/jv/schedule/" },
  { sport: "Girls Soccer", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/soccer/girls/schedule/" },
  { sport: "Girls Soccer", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/soccer/girls/jv/schedule/" },
];

const ROW_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const DATE_CELL_RE = /aria-label="(\d{1,2}\/\d{1,2}) (\d{1,2}:\d{2}(?:am|pm)) (vs|at) [^"]+"[^>]*href="([^"]+)"/;
const RESULT_RE = /<span class="result (W|L|T)">\w<\/span>\s*<span class="score">(\d+)-(\d+)<\/span>/;
const HREF_DATE_RE = /\/(\d{1,2})-(\d{1,2})-(\d{4})\//;
const NAME_RE = /<span class="name">([^<]+)<\/span>/;

function toISO(year, month, day, time12) {
  const tm = /(\d{1,2}):(\d{2})(am|pm)/.exec(time12);
  let hour = Number(tm[1]) % 12;
  if (tm[3] === "pm") hour += 12;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  return `${year}-${mm}-${dd}T${hh}:${tm[2]}:00`;
}

function parseSchedule(html, sport, level) {
  const results = [];
  const upcoming = [];
  let m;
  ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(html))) {
    const row = m[1];
    const dm = DATE_CELL_RE.exec(row);
    if (!dm) continue; // header row or non-game row
    const [, , time, vsAt, href] = dm;
    const link = href.startsWith("http") ? href : `https://www.maxpreps.com${href}`;
    const dateMatch = HREF_DATE_RE.exec(href);
    if (!dateMatch) continue;
    const [, mo, day, year] = dateMatch;
    const opponentMatch = NAME_RE.exec(row);
    const opponent = opponentMatch ? opponentMatch[1] : "TBA";
    const isHome = vsAt === "vs";
    const dateISO = toISO(year, mo, day, time);

    const rm = RESULT_RE.exec(row);
    if (rm) {
      // MaxPreps lists the WINNER's score first in this span, not the home
      // team's or "our" score first -- confirmed against a real loss (Girls
      // Varsity Soccer @ Summit Country Day, 8/18: page shows "L 7-0", and
      // the actual box score is Waynesville 0, Summit Country Day 7). So for
      // a loss the two numbers must be swapped; for a win they're already
      // in the right order; a tie is symmetric either way.
      const [, result, a, b] = rm;
      const [wayneScore, opponentScore] = result === "L" ? [Number(b), Number(a)] : [Number(a), Number(b)];
      results.push({ dateISO, sport, level, opponent, wayneScore, opponentScore, result, isHome, link });
    } else {
      upcoming.push({ dateISO, sport, level, opponent, wayneScore: null, opponentScore: null, result: null, isHome, link });
    }
  }
  return { results, upcoming };
}

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

async function main() {
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - LOOKBACK_DAYS);
  const to = new Date(now); to.setDate(to.getDate() + LOOKAHEAD_DAYS);

  let allResults = [];
  let allUpcoming = [];
  const failures = [];

  for (const { sport, level, url } of SCHEDULE_PAGES) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { results, upcoming } = parseSchedule(html, sport, level);
      allResults.push(...results);
      allUpcoming.push(...upcoming);
    } catch (e) {
      failures.push(`${sport} (${level}): ${e.message}`);
    }
  }

  // dateISO strings are naive ET wall-clock (no offset). Parse them as UTC
  // ("+Z") so windowing behaves identically on UTC CI runners and local
  // Eastern machines — the 7-day window has hours of margin either way.
  const inWindow = (list) =>
    list
      .map((g) => ({ ...g, _d: new Date(g.dateISO + "Z") }))
      .filter((g) => g._d >= from && g._d <= to)
      .sort((a, b) => a._d - b._d)
      .map(({ _d, ...g }) => g);

  const results = inWindow(allResults);
  const upcoming = inWindow(allUpcoming);

  const note =
    `Waynesville Spartans schedule + results (MaxPreps), past ${LOOKBACK_DAYS} days / next ${LOOKAHEAD_DAYS} days. ` +
    `Scraped directly from each sport's own schedule page (football, volleyball, soccer -- varsity + JV), not the ` +
    `school hub page, which has been observed to silently omit some contests. Scores and matchups reproduced ` +
    `verbatim from MaxPreps' own markup; each links to their game page.` +
    (failures.length ? ` Fetch failures this run (skipped, not treated as fatal): ${failures.join("; ")}.` : "");

  await write({ results, upcoming }, note);
  console.log(`sports.json: ${results.length} result(s), ${upcoming.length} upcoming${failures.length ? `, ${failures.length} page fetch failure(s)` : ""}`);
}

main().catch(async (e) => {
  console.error("sports refresh failed:", e.message);
  await write({ results: [], upcoming: [] }, "sports fetch failed; empty (draft falls back to no sports section).");
  process.exit(0); // don't fail the workflow
});
