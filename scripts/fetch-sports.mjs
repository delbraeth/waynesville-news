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
import { existsSync, readFileSync } from "node:fs";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const UA = "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)";
const OUT = new URL("../src/data/sports.json", import.meta.url);
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 7;

// Sports tracked for the brief. Add/remove sport-season entries here as
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
  // Winter (added 2026-11-12). Fall pages can stay: a finished season just
  // yields nothing in the 7-day window. Wrestling is mostly tournaments,
  // which MaxPreps lists without a vs/@ row, so only its duals appear here.
  // MaxPreps had no Waynesville bowling or swimming schedule pages (301) as
  // of 2026-11-12; add them if they appear.
  { sport: "Boys Basketball", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/basketball/schedule/" },
  { sport: "Boys Basketball", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/basketball/jv/schedule/" },
  { sport: "Girls Basketball", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/basketball/girls/schedule/" },
  { sport: "Girls Basketball", level: "JV", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/basketball/girls/jv/schedule/" },
  { sport: "Wrestling", level: "Varsity", url: "https://www.maxpreps.com/oh/waynesville/waynesville-spartans/wrestling/schedule/" },
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
    // strip angle brackets — opponent names go into auto-published Markdown
    // Strip MaxPreps' trailing league-game asterisk ("Brookville*") — it is
    // site jargon and was publishing verbatim into the brief.
    const opponent = opponentMatch ? opponentMatch[1].replace(/[<>]/g, "").replace(/\*+$/, "").trim() : "TBA";
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
      // The swap above rests on MaxPreps printing the winner first. If that
      // ever stops holding, the scores publish REVERSED with no error. Assert
      // the invariant and drop the row rather than print a false score.
      const consistent =
        (result === "W" && wayneScore > opponentScore) ||
        (result === "L" && wayneScore < opponentScore) ||
        (result === "T" && wayneScore === opponentScore);
      if (!consistent) {
        console.log(`sports: dropping inconsistent result ${sport} ${level} vs ${opponent} (${result} ${a}-${b})`);
        continue;
      }
      results.push({ dateISO, sport, level, opponent, wayneScore, opponentScore, result, isHome, link });
    } else {
      upcoming.push({ dateISO, sport, level, opponent, wayneScore: null, opponentScore: null, result: null, isHome, link });
    }
  }
  return { results, upcoming };
}

// The school's own athletics site (waynesvillesports.com) marks scrimmages,
// which MaxPreps lists as ordinary games (e.g. Nov 18, 2026: MaxPreps showed
// varsity boys basketball "vs. Little Miami" AND "vs. Cedarville" at 6 PM; the
// school lists one scrimmage vs. "Little Miami/Cedarville"). Its schedule page
// loads a public JSON feed; we use it for scrimmage and canceled labels and
// start times, and MaxPreps stays the source for matchups and scores. Rows with a
// malformed date (one golf row read "0206-08-24") are skipped. A failed fetch
// just means no school labels or times this run.
const ATHLETICS_FEED = "https://waynesvillesports.com/api/sport-events";

async function fetchAthletics() {
  try {
    const res = await fetch(ATHLETICS_FEED, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("unexpected feed shape");
    const year = new Date().getFullYear();
    return rows.filter((r) => {
      const m = /^(\d{4})-\d{2}-\d{2}$/.exec(r?.eventDate ?? "");
      return m && Math.abs(Number(m[1]) - year) <= 1 && typeof r.team === "string";
    });
  } catch (e) {
    console.log(`sports: athletics feed unavailable (${e.message}); no school labels or times this run`);
    return [];
  }
}

const norm = (s = "") => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// "Varsity Boys Basketball" / "JV Volleyball" / "Wrestling" -> level + sport words.
function athleticsMatches(row, g) {
  if (row.eventDate !== g.dateISO.slice(0, 10)) return false;
  const team = norm(row.team);
  const level = norm(g.level ?? "Varsity");
  const hasLevel = /^(varsity|jv|freshman|7th|8th|ms|hs)\b/.test(team);
  if (hasLevel ? !team.startsWith(level + " ") : level !== "varsity") return false;
  if (!norm(g.sport).split(" ").every((w) => team.split(" ").includes(w))) return false;
  const opp = norm(g.opponent);
  return String(row.opponent ?? "").split("/").map(norm).filter(Boolean)
    .some((o) => o.includes(opp) || opp.includes(o));
}

// "6:00 PM" or "5:30:00 PM" -> "18:00"; null for missing or odd values.
function schoolTime(t) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(String(t ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Editor rule (2026-11-12): the school's list wins for times, MaxPreps for
// scores and matchups. From the matching school row we take:
// - "scrimmage": true when its notes say scrimmage;
// - "canceled": true when its notes or status say canceled (the game stays
//   listed, labeled, so nobody wonders where it went);
// - its start time, when it differs from MaxPreps' ("maxprepsTime" keeps
//   the old one for reference).
function applySchoolSchedule(games, athletics) {
  return games.map((g) => {
    const row = athletics.find((r) => athleticsMatches(r, g));
    if (!row) return g;
    const out = { ...g };
    const notes = `${row.notes ?? ""} ${row.status ?? ""}`;
    if (/scrimmage/i.test(notes)) out.scrimmage = true;
    if (/cancel+ed/i.test(notes)) out.canceled = true;
    const t = schoolTime(row.startTime);
    if (t && t !== g.dateISO.slice(11, 16)) {
      out.maxprepsTime = g.dateISO.slice(11, 16);
      out.dateISO = `${g.dateISO.slice(0, 11)}${t}:00`;
      console.log(`sports: school time for ${g.level} ${g.sport} vs ${g.opponent} ${g.dateISO.slice(0, 10)}: ${out.maxprepsTime} -> ${t}`);
    }
    return out;
  });
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
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
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
  // dateISO digits are ET wall-clock, so compare them against an ET
  // wall-clock "now" expressed the same fake-UTC way.
  const nowET = new Date(
    new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T") + "Z"
  );
  const inWindow = (list, lower = from) =>
    list
      .map((g) => ({ ...g, _d: new Date(g.dateISO + "Z") }))
      .filter((g) => g._d >= lower && g._d <= to)
      .sort((a, b) => a._d - b._d)
      .map(({ _d, ...g }) => g);

  const athletics = await fetchAthletics();
  const results = applySchoolSchedule(applyOverrides(inWindow(allResults)), athletics);
  // A game lands in `upcoming` because no score parsed, NOT because it is in
  // the future — MaxPreps rarely posts JV scores, so played games sat here for
  // a week and published under "Upcoming". Require an actually-future date;
  // the 3h grace keeps a game in progress listed.
  // Re-sort after the school's times are applied.
  const upcoming = applySchoolSchedule(inWindow(allUpcoming, new Date(nowET.getTime() - 3 * 3600e3)), athletics)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const orphaned = allUpcoming.length - upcoming.length;

  const note =
    `Waynesville Spartans schedule + results (MaxPreps), past ${LOOKBACK_DAYS} days / next ${LOOKAHEAD_DAYS} days. ` +
    `Scraped directly from each sport's own schedule page (football, volleyball, soccer -- varsity + JV), not the ` +
    `school hub page, which has been observed to silently omit some contests. Scores and matchups reproduced ` +
    `verbatim from MaxPreps' own markup; each links to their game page. Start times, "scrimmage" and "canceled" come ` +
    `from the school's athletics site (waynesvillesports.com) when it lists the game; "maxprepsTime" is MaxPreps' time when they differ.` +
    (failures.length ? ` Fetch failures this run (skipped, not treated as fatal): ${failures.join("; ")}.` : "");

  await write({ results, upcoming }, note);
  console.log(`sports.json: ${results.length} result(s), ${upcoming.length} upcoming${failures.length ? `, ${failures.length} page fetch failure(s)` : ""}`);
}

// Editor score corrections (src/data/sports-overrides.json) win over MaxPreps.
function applyOverrides(results) {
  let overrides = [];
  try { overrides = JSON.parse(readFileSync(new URL("../src/data/sports-overrides.json", import.meta.url), "utf8")).items ?? []; } catch { /* optional */ }
  return results.map((g) => {
    const o = overrides.find((x) =>
      g.dateISO.slice(0, 10) === x.date &&
      g.sport.toLowerCase() === String(x.sport).toLowerCase() &&
      (!x.level || (g.level ?? "").toLowerCase() === x.level.toLowerCase()) &&
      g.opponent.toLowerCase().includes(String(x.opponent).toLowerCase()));
    if (!o || !Number.isFinite(o.wayneScore) || !Number.isFinite(o.opponentScore)) return g;
    const result = o.wayneScore > o.opponentScore ? "W" : o.wayneScore < o.opponentScore ? "L" : "T";
    console.log(`sports: editor override for ${g.sport} vs ${g.opponent} ${g.dateISO.slice(0, 10)}: ${g.wayneScore}-${g.opponentScore} -> ${o.wayneScore}-${o.opponentScore}`);
    return { ...g, wayneScore: o.wayneScore, opponentScore: o.opponentScore, result, scoreSource: "editor" };
  });
}

main().catch(async (e) => {
  console.error("sports refresh failed:", e.message);
  // Bounded fallback — see scripts/lib/stale-cache.mjs for why.
  await keepOrExpire({
    out: OUT,
    label: "sports",
    writeEmpty: async (note) => { await write({ results: [], upcoming: [] }, note); },
  });
  process.exit(0); // don't fail the workflow
});
