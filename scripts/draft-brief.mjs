// Assemble an UNPUBLISHED draft brief straight into the content collection.
//
// Writes src/content/briefs/<date>.md with `published: false` (hidden from the
// site). It auto-fills the factual scaffolding — weather, this-week's events,
// the next government meeting, candidate headlines — and leaves TODO slots for
// the reported items, each with source links. To publish, the editor fills it
// in and flips `published: true` (easiest on github.com — no terminal).
// Nothing here invents news.
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { nextCommissionersMeeting } from "../src/lib/nextMeeting.js";
import { nextTownshipMeeting } from "../src/lib/nextTownshipMeeting.js";

const root = new URL("..", import.meta.url);
const readJSON = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));

const now = new Date();
// Today's date in EASTERN time, not UTC — toISOString() would roll to
// tomorrow's date for any run after 8 PM ET, misdating the brief and then
// blocking the next morning's run via the exists-check below.
// (en-CA formats as YYYY-MM-DD.)
const iso = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);

// Never clobber a brief that already exists for today — draft or already
// published. If the daily workflow runs more than once in a day (retry,
// manual re-run, race with a same-day publish), this must be a no-op, not a
// silent overwrite of real content with a blank TODO scaffold.
const targetPath = new URL(`src/content/briefs/${iso}.md`, root);
if (existsSync(targetPath)) {
  console.log(`src/content/briefs/${iso}.md already exists — not overwriting. Skipping draft generation.`);
  process.exit(0);
}

const events = await readJSON("src/data/events.json");
let weather = null;
try { weather = await readJSON("src/data/weather.json"); } catch { /* optional */ }
let suggested = [];
try { suggested = (await readJSON("src/data/suggested-headlines.json")).items ?? []; } catch { /* optional */ }
let prosecutorItems = [];
try { prosecutorItems = (await readJSON("src/data/prosecutor-press.json")).items ?? []; } catch { /* optional */ }
let obituaries = [];
try { obituaries = (await readJSON("src/data/obituaries.json")).items ?? []; } catch { /* optional */ }
let sports = { results: [], upcoming: [] };
try { sports = await readJSON("src/data/sports.json"); } catch { /* optional */ }
let libraryEvents = [];
try { libraryEvents = (await readJSON("src/data/library-events.json")).items ?? []; } catch { /* optional */ }
let townshipAgendas = [];
try { townshipAgendas = (await readJSON("src/data/township-agendas.json")).items ?? []; } catch { /* optional */ }
let shopsEvents = [];
try { shopsEvents = (await readJSON("src/data/shops-events.json")).items ?? []; } catch { /* optional */ }
let caesarCreekEvents = [];
try { caesarCreekEvents = (await readJSON("src/data/caesar-creek-events.json")).items ?? []; } catch { /* optional */ }
let villageMinutes = null;
try { villageMinutes = (await readJSON("src/data/village-minutes.json")).item ?? null; } catch { /* optional */ }
let boardRecap = null;
try { boardRecap = (await readJSON("src/data/board-recap.json")).item ?? null; } catch { /* optional */ }
let fbSchools = [];
try { fbSchools = (await readJSON("src/data/fb-schools.json")).items ?? []; } catch { /* optional */ }

const longDate = now.toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York",
});
// `new Date("YYYY-MM-DD")` is UTC midnight — 8:00 PM ET the PREVIOUS evening —
// so a 9 PM event stayed "upcoming" for four hours after it ended. Anchor to
// Eastern midnight using the offset actually in effect on that date.
const etOffset = (() => {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
    .formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  return s.replace("GMT", "") || "-05:00";
})();
const todayStart = new Date(`${iso}T00:00:00${etOffset}`);

// Caesar Creek State Park runs naturalist programs most weeks, and the cache
// holds 60 days of them. Showing all of that daily would bury everything else,
// so the brief works from a two-week window.
const CAESAR_WINDOW_DAYS = 14;
// How many park programs may also appear in "This week's events". They already
// get their own section; a couple of entries in the shared list is a pointer,
// more would let one source crowd out the village calendar.
const CAESAR_IN_EVENTS_LIST = 2;

const caesarHorizon = new Date(todayStart.getTime() + CAESAR_WINDOW_DAYS * 86_400_000);
const caesarSoon = caesarCreekEvents
  .filter((e) => e.dateISO)
  .map((e) => ({ ...e, _d: new Date(e.dateISO) }))
  .filter((e) => e._d >= todayStart && e._d <= caesarHorizon)
  .sort((a, b) => a._d - b._d);

const soon = [
  ...events.items
    .filter((e) => !e.evergreen && e.dateISO)
    .map((e) => ({ ...e, _d: new Date(e.dateISO) })),
  ...caesarSoon.slice(0, CAESAR_IN_EVENTS_LIST).map((e) => ({
    ...e,
    venue: "Caesar Creek State Park",
    source: e.link,
  })),
]
  .filter((e) => e._d >= todayStart)
  .sort((a, b) => a._d - b._d)
  .slice(0, 6);

const meeting = nextCommissionersMeeting(now);
const townshipMeeting = nextTownshipMeeting(now);
const latestAgenda = townshipAgendas[0];

const SOURCES = {
  Schools: [
    "Wayne Local BoardDocs — https://go.boarddocs.com/oh/waylo/Board.nsf/Public",
    "District news — https://www.wayne-local.com/district-news",
    "Spartans / MaxPreps — https://www.maxpreps.com/oh/waynesville/waynesville-spartans/",
    "Mary L. Cook Library — https://www.mlcook.lib.oh.us/",
    "Wayne Local Schools Facebook — https://www.facebook.com/waynelocalschools",
  ],
  "Local Government": [
    "Commissioners agendas/minutes — https://commissioners.warrencountyohio.gov/News/AgendaMinutes/Index",
    "Village of Waynesville — https://www.villageofwaynesville.org/news/ and /meetings/",
    "Wayne Township (covers Waynesville & Corwin) — https://waynetwpwarrencooh.gov/board-of-trustees/",
  ],
  "Around Town": [
    "Chamber — https://www.waynesvilleohio.com/ · Merchants — https://waynesvilleshops.com/",
  ],
  "Caesar Creek": [
    "ODNR events calendar — https://ohiodnr.gov/go-and-do/plan-a-visit/events-calendar/events-calendar?keyword=Caesar%20Creek",
    "Caesar Creek State Park — https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/caesar-creek-state-park",
  ],
  "Public Safety": [
    "Sheriff — https://sheriff.warrencountyohio.gov/",
    "Prosecutor press — https://prosecutor.warrencountyohio.gov/Public/Press/Index",
  ],
  Headlines: [
    "Warren County Post (Patch) — https://warrencountypost.com/g/waynesville-oh",
    "Dayton Daily News — https://www.daytondailynews.com/community/warren-county/",
    "WCPO Waynesville — https://www.wcpo.com/news/local-news/warren-county/waynesville",
  ],
};

// Several data files are hand- or OCR-written and are not schema-validated.
// A missing URL used to interpolate as `](undefined)`, publishing a 404 under
// an authoritative label. Drop the link instead of shipping a broken one.
const link = (label, url) => (url ? `[${label}](${encodeURI(String(url)).replace(/\(/g, "%28").replace(/\)/g, "%29")})` : label);

const listSrc = (section) => (SOURCES[section] || []).map((s) => `  - ${s}`).join("\n");
const eventsBlock = soon.length
  ? soon.map((e) => `- **${e.dateLabel}** — ${e.title} (${e.venue})${e.source ? ` — ${link("details", e.source)}` : ""}${e.registrationUrl ? ` — ${link("register", e.registrationUrl)}` : ""}`).join("\n")
  : "- (no dated events in the window — see the full calendar)";

// NWS active alerts, fetched by refresh:weather. null = the alerts check itself
// failed (unknown), [] = checked and clear. Never claim "no alerts" on null.
const alerts = weather ? weather.alerts : null;
const alertsLine = Array.isArray(alerts)
  ? (alerts.length
      ? `\n**Alerts:** ` + alerts.map((a) => `${a.event}${a.headline ? ` — ${a.headline}` : ""}`).join("; ")
      : "\nNo NWS alerts in effect.")
  : "\nAlert status unavailable this morning — check the NWS link below.";
const alertsSafety = Array.isArray(alerts)
  ? (alerts.length
      ? `NWS alerts in effect: ` + alerts.map((a) => `**${a.event}**${a.headline ? ` (${a.headline})` : ""}`).join("; ") + "."
      : "No NWS weather alerts are in effect this morning.")
  : "NWS alert status could not be checked this morning.";

const safetyBlock = prosecutorItems.length
  ? `From the Warren County Prosecutor's Office, released in the past week:\n` +
    prosecutorItems.map((p) => `- **${p.dateLabel}** — ${p.title} (${link("release", p.link)})`).join("\n") +
    `\n\n${alertsSafety} Check:`
  : `${alertsSafety} TODO — road closures, sheriff/prosecutor news (handle with care). Check:`;

const obituariesBlock = obituaries.length
  ? obituaries.map((o) => `- **${o.name}** — ${o.dateRange} (${link("tribute", o.link)})`).join("\n")
  : null;

// sports.json dateISO values are naive ET wall-clock strings (no offset),
// scraped from MaxPreps' Eastern-time schedule pages. Parse as UTC and
// format as UTC so the printed time matches the source digits on ANY
// machine — the previous America/New_York conversion silently shifted
// every game time by 4-5 hours when run on a UTC machine (GitHub Actions).
const fmtGameDate = (iso) =>
  new Date(iso + "Z").toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).replace(",", " ·");

const sportsResultsBlock = sports.results.length
  ? sports.results.map((g) =>
      `- **${g.sport} (${g.level})** — Waynesville ${g.wayneScore}, ${g.opponent} ${g.opponentScore}${g.sport === "Volleyball" ? " (sets)" : ""}${g.isHome === true ? " (Home)" : g.isHome === false ? " (Away)" : ""} — ${link("box score", g.link)}`
    ).join("\n")
  : null;
// sports.json can be served from cache on the staleness path, so re-filter by
// date here too — "Upcoming" must never contain a game that has been played.
const nowFakeET = new Date(
  new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T") + "Z"
);
sports.upcoming = (sports.upcoming ?? []).filter(
  (g) => !g.dateISO || new Date(g.dateISO + "Z") >= new Date(nowFakeET.getTime() - 3 * 3600e3)
);
const sportsUpcomingBlock = sports.upcoming.length
  ? sports.upcoming.map((g) =>
      `- **${g.sport} (${g.level})** — ${g.isHome === false ? "@" : "vs"} ${g.opponent}, ${fmtGameDate(g.dateISO)} — ${link("details", g.link)}`
    ).join("\n")
  : null;
const sportsBlock = (sportsResultsBlock || sportsUpcomingBlock)
  ? [
      sportsResultsBlock ? `**Results**\n${sportsResultsBlock}` : null,
      sportsUpcomingBlock ? `**Upcoming**\n${sportsUpcomingBlock}` : null,
    ].filter(Boolean).join("\n\n")
  : null;

// library-events.json can be served from cache on the staleness path, so drop
// anything dated before today: a cached feed must not print yesterday's story
// times as today's. dateISO is a naive ET wall-clock string mislabelled "Z",
// so compare the calendar-date part only.
const libraryUpcoming = libraryEvents.filter((e) => !e.dateISO || e.dateISO.slice(0, 10) >= iso);
const libraryBlock = libraryUpcoming.length
  ? libraryUpcoming.map((e) => `- **${e.dateLabel}** — ${link(e.title, e.link)}`).join("\n")
  : null;

// Facebook is robots-blocked, so the writer can't open the posts — the excerpt
// here carries the substance, reproduced from the district's own post and
// attributed to it, with a link back.
const fbBlock = fbSchools.length
  ? "**From Wayne Local Schools on Facebook**\n" +
    fbSchools.slice(0, 6).map((p) => `- **${p.dateLabel}** — ${p.title} ${p.excerpt} (${link("post", p.link)})`).join("\n")
  : null;

const shopsBlock = shopsEvents.length
  ? shopsEvents.map((e) => `- **${e.dateLabel}** — ${link(e.title, e.link)}`).join("\n")
  : null;

// ODNR stores a meeting point in locationName, but it is free text: sometimes a
// place ("Nature Center"), sometimes a whole sentence that repeats the summary
// ("Meet at Pioneer Village."). Only the short place-like values are worth
// printing; the rest would just duplicate the line beside it.
const meetingPoint = (e) => {
  const m = e.meetAt;
  if (!m || m.length > 45 || /^meet\b/i.test(m)) return null;
  if (e.summary && e.summary.toLowerCase().includes(m.toLowerCase())) return null;
  return m;
};

const caesarBlock = caesarSoon.length
  ? caesarSoon.map((e) => {
      const where = meetingPoint(e);
      return `- **${e.dateLabel}** — ${link(e.title, e.link)}${where ? ` (${where})` : ""}`;
    }).join("\n")
  : null;

const villageMinutesBlock = villageMinutes?.meetingDateLabel
  ? [
      `**Village Council** — minutes of the ${villageMinutes.meetingDateLabel} meeting (posted as part of the ${villageMinutes.agendaDateLabel} agenda packet)` +
      `${villageMinutes.calledToOrder ? `, called to order ${villageMinutes.calledToOrder}` : ""}` +
      `${villageMinutes.adjourned ? `, adjourned ${villageMinutes.adjourned}` : ""}` + ":",
      ...(villageMinutes.votes ?? []).map((v) => `- ${v.context} *(Motion: ${v.motion}, Second: ${v.second}, Roll Call: ${v.rollCall})*`),
      // Only the first few votes are stored. Saying so beats implying the list
      // is the meeting's complete formal record.
      villageMinutes.voteCountTotal > (villageMinutes.votes ?? []).length
        ? `*(${villageMinutes.voteCountTotal - villageMinutes.votes.length} further recorded vote(s) not shown — see the full packet.)*`
        : "",
      link("full agenda/minutes packet", villageMinutes.link),
    ].join("\n")
  : null;

// A board recap is written up once, in the brief that follows the meeting.
// RECAP_MAX_AGE_DAYS keeps a recap from resurfacing in every edition for weeks
// after the meeting; drop the file (or let the next one replace it) once used.
const RECAP_MAX_AGE_DAYS = 21;
const recapFresh = (() => {
  if (!boardRecap?.meetingDate) return false;
  const age = (Date.now() - new Date(boardRecap.meetingDate).getTime()) / 86400000;
  return age >= 0 && age <= RECAP_MAX_AGE_DAYS;
})();

// NOTE: never copy links out of the district's recap newsletter — they are
// per-recipient tracking URLs with the subscriber's email address encoded in
// them. Link to BoardDocs instead, as this block does.
const boardRecapBlock = recapFresh
  ? [
      `**${boardRecap.body}** — from the district's recap of the ${boardRecap.meetingDateLabel} meeting` +
        `${boardRecap.attendanceNote ? ` (${boardRecap.attendanceNote})` : ""}:`,
      ...(boardRecap.lead ?? []).map((t) => `- ${t}`),
      ...(boardRecap.finance ?? []).map((t) => `- ${t}`),
      ...(boardRecap.operations ?? []).map((t) => `- ${t}`),
      boardRecap.nextMeeting
        ? `\nNext meeting: **${boardRecap.nextMeeting.label}**, ${boardRecap.nextMeeting.location}.`
        : "",
      link("full agenda and minutes on BoardDocs", boardRecap.boardDocs),
    ].filter(Boolean).join("\n")
  : null;

const boardRecapSchoolsBlock = recapFresh && (boardRecap.schools ?? []).length
  ? `**From the ${boardRecap.meetingDateLabel} board meeting**\n` +
    boardRecap.schools.map((t) => `- ${t}`).join("\n")
  : null;

const weatherBlock = weather && weather.tempF != null
  ? [
      `**${weather.periodName ?? "Today"}:** ${weather.tempF}°F, ${weather.condition} (high ${weather.highF}° / low ${weather.lowF}°)`,
      weather.outlook?.length
        ? `\n**Outlook:**\n${weather.outlook.map((d) =>
            `- **${d.dayLabel}** — high ${d.highF}°${d.lowF !== null ? ` / low ${d.lowF}°` : ""}, ${d.condition}`
          ).join("\n")}`
        : "",
      alertsLine,
      `\nSource: [National Weather Service](https://forecast.weather.gov/MapClick.php?lat=39.5287&lon=-84.0891)`,
    ].join("\n")
  : null;

const candidateBlock = suggested.length
  ? suggested.map((h) => {
      // Always quote the publisher's headline. The excerpt is extra context,
      // appended unquoted — never a substitute for the title, which is how
      // lede sentences ("The 32-year-old was pronounced dead at the scene")
      // and "send flowers and sign the guestbook" reached Local headlines.
      const url = h.sourceUrl || h.link;
      const extra = h.excerpt && h.excerpt.trim() && h.excerpt.trim() !== h.title.trim()
        ? ` ${h.excerpt.trim().replace(/\s+/g, " ")}`
        : "";
      return `- "${h.title}"${h.source ? ` — ${h.source}` : ""}, ${link("full story", url)}.${extra}`;
    }).join("\n")
  : listSrc("Headlines");

const draft = `---
title: "TODO — headline for ${longDate}"
date: ${iso}
dek: "TODO — one-line summary of today's brief."
demo: false
published: false
---

<!--
  UNPUBLISHED (published: false = hidden from the site). This is your draft.
  Auto-filled: weather = ${weather ? `${weather.tempF}° ${weather.condition}` : "n/a"}, the events list,
  the next meeting, and candidate headlines below.
  TO PUBLISH (easiest on github.com — no terminal):
    1) fill each TODO with a real, sourced item using the links,
    2) set the title and dek,
    3) delete this comment,
    4) change published: false  ->  published: true, and commit.
  QA: names/dates verified, links resolve.
-->

## Weather
${weatherBlock ?? "TODO — weather unavailable this morning; check https://forecast.weather.gov/MapClick.php?lat=39.5287&lon=-84.0891"}

## This morning in Waynesville

1. TODO — lead item (schools first). *(link the source)*
2. TODO — second item. *(link the source)*
3. TODO — third item. *(link the source)*

## Schools
TODO — Wayne Local board, Spartans, closings, library programs. Check:
${listSrc("Schools")}
${boardRecapSchoolsBlock ? `\n${boardRecapSchoolsBlock}\n` : ""}${fbBlock ? `\n${fbBlock}\n` : ""}${libraryBlock ? `\n**Library programs** (Mary L. Cook Public Library)\n${libraryBlock}\n` : ""}
${sportsBlock ? `\n## This week in sports\n${sportsBlock}\n` : ""}
## Local government
Next up: **${meeting.body}**, ${meeting.whenLabel} — [agenda](${meeting.source}).
Also next up: **${townshipMeeting.body}**, ${townshipMeeting.whenLabel}, ${townshipMeeting.location}${latestAgenda ? ` — ${link(`latest posted agenda: ${latestAgenda.title}, ${latestAgenda.dateLabel}`, latestAgenda.link)}` : ` — [agendas](${townshipMeeting.source})`}.
TODO — village council & county items, each linked to the agenda/minutes. Check:
${listSrc("Local Government")}
${villageMinutesBlock ? `\n${villageMinutesBlock}\n` : ""}${boardRecapBlock ? `\n${boardRecapBlock}\n` : ""}

## Around town
TODO — new businesses, the antiques district. Check:
${listSrc("Around Town")}
<!-- Editor note (stripped before publication): occasionally write a free \`## Business spotlight\` section — a short editorial profile of a local business. It's coverage, not sponsorship: never tied to the paid Supporters list, and labeled as a spotlight. -->
${shopsBlock ? `\n**Merchant Association events** (waynesvilleshops.com)\n${shopsBlock}\n` : ""}

${caesarBlock ? `\n## Caesar Creek State Park\nNaturalist programs at the park, about five miles east of the village, over the next ${CAESAR_WINDOW_DAYS} days. Times and meeting points are ODNR's own. Check:\n${listSrc("Caesar Creek")}\n\n${caesarBlock}\n` : ""}
## Public safety
${safetyBlock}
${listSrc("Public Safety")}

## This week's events
${eventsBlock}

See the [full events calendar](/events/).
${obituariesBlock ? `\n## Obituaries\n${obituariesBlock}\n` : ""}
## Local headlines
${candidateBlock}
`;

await writeFile(targetPath, draft);
console.log(`Unpublished brief written: src/content/briefs/${iso}.md  (${soon.length} events, ${caesarSoon.length} Caesar Creek, next meeting ${meeting.whenLabel})`);
