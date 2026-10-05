// Pull the ballot issues for the next Warren County election from the Board of
// Elections' own site, and carry the board's published early-voting schedule.
//
// Source limits (checked 2026-10-05): vote.warrencountyohio.gov serves plain
// HTML to a plain fetch. The candidate list, precinct sample ballots and
// election-night results all live on Ohio Secretary of State hosts
// (lookup.boe.ohio.gov, liveresults.boe.ohio.gov) that answer 403 to this
// network, so they are linked, never scraped. The early-voting hours exist only
// as a PDF notice; they are fixed for an election, so they are transcribed
// below from that notice rather than re-parsed daily.
//
// Issue titles are the board's own file labels, reproduced verbatim. Which
// issues appear on a Waynesville ballot is decided by keyword only — anything
// that does not plainly name the state, the county, or Wayne/Waynesville is
// counted as "elsewhere in the county", never asserted as on our ballot.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const BASE = "https://vote.warrencountyohio.gov";
const ISSUES_URL = `${BASE}/CandIssues/UpcomingIssues/Index`;
const HOME_URL = `${BASE}/`;
const OUT = new URL("../src/data/elections.json", import.meta.url);
const UA = { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" };

// Transcribed from the board's Public Election Notice for the November 3, 2026
// General Election (https://vote.warrencountyohio.gov/doc/Public_Election_Notice.pdf).
// Replace this block when the board publishes the next election's notice.
const ELECTION = {
  dateISO: "2026-11-03",
  label: "November 3, 2026 General Election",
  noticeUrl: `${BASE}/doc/Public_Election_Notice.pdf`,
  earlyVotingLocation: "Warren County Board of Elections, 520 Justice Dr, Lebanon",
  registrationDeadline: { dateISO: "2026-10-05", hours: "8:00 AM–9:00 PM" },
  absenteeRequestDeadline: "2026-10-27",
  pollsHours: "6:30 AM–7:30 PM",
  // [first day, last day, hours] — weekdays only within a range unless noted.
  earlyVoting: [
    ["2026-10-06", "2026-10-09", "8:00 AM–5:00 PM"],
    ["2026-10-12", "2026-10-16", "8:00 AM–5:00 PM"],
    ["2026-10-19", "2026-10-23", "8:00 AM–5:00 PM"],
    ["2026-10-24", "2026-10-24", "8:00 AM–4:00 PM"],
    ["2026-10-26", "2026-10-26", "7:30 AM–7:30 PM"],
    ["2026-10-27", "2026-10-27", "7:30 AM–8:30 PM"],
    ["2026-10-28", "2026-10-30", "7:30 AM–7:30 PM"],
    ["2026-10-31", "2026-10-31", "8:00 AM–4:00 PM"],
    ["2026-11-01", "2026-11-01", "1:00 PM–5:00 PM"],
  ],
};

// Statewide, countywide, or ours. Everything else is another district's issue.
const LOCAL_RE = /\b(constitutional|state issue|statewide|warren county|mental health recovery board|wayne|waynesville)\b/i;

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#x27;|&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

// hrefs look like `../../\doc\CandIssues\Elections\20261103\Issues\03_x.pdf`.
const resolveLink = (href) =>
  new URL(encodeURI(href.replace(/\\/g, "/").replace(/^(\.\.\/)+\/*/, "/")), BASE).toString();

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main() {
  const html = await get(ISSUES_URL);

  // The page lists each upcoming election under an <h5> like "November 03 2026".
  const [y, m, d] = ELECTION.dateISO.split("-");
  const monthName = new Date(Date.UTC(+y, +m - 1, +d)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const headRe = new RegExp(`<h5>\\s*${monthName}\\s+${d}\\s+${y}\\s*</h5>`, "i");
  const start = html.search(headRe);
  if (start < 0) throw new Error(`no "${monthName} ${d} ${y}" heading on the issues page — markup changed or election not listed`);
  const rest = html.slice(start + 5);
  const nextHead = rest.search(/<h5>/i);
  const block = nextHead < 0 ? rest : rest.slice(0, nextHead);

  const issues = [...block.matchAll(/<li>\s*<a href="([^"]+\.pdf)"[^>]*>([^<]+)<\/a>/gi)].map(([, href, raw]) => {
    const title = decode(raw);
    const num = title.match(/^(\d+)\s+/)?.[1] ?? null;
    return {
      number: num,
      title: num ? title.slice(num.length).trim() : title,
      link: resolveLink(href),
      onWaynesvilleBallot: LOCAL_RE.test(title),
    };
  });
  if (issues.length === 0) throw new Error("election heading found but no issue links parsed — markup changed");

  // The results link changes every election; read it from the board's home page.
  let resultsUrl = null;
  try {
    const home = await get(HOME_URL);
    resultsUrl = home.match(/href="(https:\/\/liveresults\.boe\.ohio\.gov\/ENR\/[^"]+)"[^>]*>\s*Current Election Results/i)?.[1] ?? null;
  } catch { /* optional */ }

  await write(
    { election: ELECTION, issues, resultsUrl, sources: { issues: ISSUES_URL, candidates: `${BASE}/CandIssues/UpcomingCandidates/Index` } },
    "Warren County Board of Elections. Issue titles verbatim from the board's issue list; onWaynesvilleBallot is a keyword match (state/county/Wayne), not a precinct lookup. Early-voting hours transcribed from the board's Public Election Notice PDF.",
  );
  const local = issues.filter((i) => i.onWaynesvilleBallot).length;
  console.log(`elections.json: ${issues.length} issue(s) for ${ELECTION.dateISO} (${local} statewide/countywide/Wayne), results link ${resultsUrl ? "found" : "not found"}`);
}

main().catch(async (e) => {
  console.error("elections refresh failed:", e.message);
  await keepOrExpire({
    out: OUT,
    label: "elections",
    writeEmpty: async (note) => { await write({ election: ELECTION, issues: [], resultsUrl: null }, note); },
  });
  process.exit(0); // don't fail the workflow
});
