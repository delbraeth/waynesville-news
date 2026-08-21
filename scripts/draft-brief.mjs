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
const iso = now.toISOString().slice(0, 10);

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
let villageMinutes = null;
try { villageMinutes = (await readJSON("src/data/village-minutes.json")).item ?? null; } catch { /* optional */ }

const longDate = now.toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
});
const todayStart = new Date(iso);

const soon = events.items
  .filter((e) => !e.evergreen && e.dateISO)
  .map((e) => ({ ...e, _d: new Date(e.dateISO) }))
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
  ],
  "Local Government": [
    "Commissioners agendas/minutes — https://commissioners.warrencountyohio.gov/News/AgendaMinutes/Index",
    "Village of Waynesville — https://www.villageofwaynesville.org/news/ and /meetings/",
    "Wayne Township (covers Waynesville & Corwin) — https://www.waynetownship.us/minutes-agendas/agendas-2026/",
  ],
  "Around Town": [
    "Chamber — https://www.waynesvilleohio.com/ · Merchants — https://waynesvilleshops.com/",
  ],
  "Public Safety": [
    "Sheriff — https://sheriff.warrencountyohio.gov/  (⚠ presumption of innocence; do NOT name un-convicted arrestees)",
    "Prosecutor press — https://prosecutor.warrencountyohio.gov/Public/Press/Index",
  ],
  Headlines: [
    "Warren County Post (Patch) — https://warrencountypost.com/g/waynesville-oh",
    "Dayton Daily News — https://www.daytondailynews.com/community/warren-county/",
    "WCPO Waynesville — https://www.wcpo.com/news/local-news/warren-county/waynesville",
  ],
};

const listSrc = (section) => (SOURCES[section] || []).map((s) => `  - ${s}`).join("\n");
const eventsBlock = soon.length
  ? soon.map((e) => `- **${e.dateLabel}** — ${e.title} (${e.venue})${e.source ? ` — [details](${e.source})` : ""}${e.registrationUrl ? ` — [register](${e.registrationUrl})` : ""}`).join("\n")
  : "- (no dated events in the window — see the full calendar)";

const safetyBlock = prosecutorItems.length
  ? `From the Warren County Prosecutor's Office, released in the past week:\n` +
    prosecutorItems.map((p) => `- **${p.dateLabel}** — ${p.title} ([release](${p.link}))`).join("\n") +
    `\n\nCheck:`
  : "TODO — road/weather alerts, sheriff/prosecutor news (handle with care). Check:";

const obituariesBlock = obituaries.length
  ? obituaries.map((o) => `- **${o.name}** — ${o.dateRange} ([tribute](${o.link}))`).join("\n")
  : null;

const fmtGameDate = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }).replace(",", " ·");

const sportsResultsBlock = sports.results.length
  ? sports.results.map((g) =>
      `- **${g.sport} (${g.level})** — Waynesville ${g.wayneScore}, ${g.opponent} ${g.opponentScore}${g.isHome === true ? " (Home)" : g.isHome === false ? " (Away)" : ""} — [box score](${g.link})`
    ).join("\n")
  : null;
const sportsUpcomingBlock = sports.upcoming.length
  ? sports.upcoming.map((g) =>
      `- **${g.sport} (${g.level})** — ${g.isHome === false ? "@" : "vs"} ${g.opponent}, ${fmtGameDate(g.dateISO)} — [details](${g.link})`
    ).join("\n")
  : null;
const sportsBlock = (sportsResultsBlock || sportsUpcomingBlock)
  ? [
      sportsResultsBlock ? `**Results**\n${sportsResultsBlock}` : null,
      sportsUpcomingBlock ? `**Upcoming**\n${sportsUpcomingBlock}` : null,
    ].filter(Boolean).join("\n\n")
  : null;

const libraryBlock = libraryEvents.length
  ? libraryEvents.map((e) => `- **${e.dateLabel}** — [${e.title}](${e.link})`).join("\n")
  : null;

const shopsBlock = shopsEvents.length
  ? shopsEvents.map((e) => `- **${e.dateLabel}** — [${e.title}](${e.link})`).join("\n")
  : null;

const villageMinutesBlock = villageMinutes?.meetingDateLabel
  ? [
      `**Village Council** — minutes of the ${villageMinutes.meetingDateLabel} meeting (posted as part of the ${villageMinutes.agendaDateLabel} agenda packet)` +
      `${villageMinutes.calledToOrder ? `, called to order ${villageMinutes.calledToOrder}` : ""}` +
      `${villageMinutes.adjourned ? `, adjourned ${villageMinutes.adjourned}` : ""}` + ":",
      ...villageMinutes.votes.map((v) => `- ${v.context} *(Motion: ${v.motion}, Second: ${v.second}, Roll Call: ${v.rollCall})*`),
      `[full agenda/minutes packet](${encodeURI(villageMinutes.link)})`,
    ].join("\n")
  : null;

const weatherBlock = weather
  ? [
      `**Today:** ${weather.tempF}°F, ${weather.condition} (high ${weather.highF}° / low ${weather.lowF}°)`,
      weather.outlook?.length
        ? `\n**Outlook:**\n${weather.outlook.map((d) =>
            `- **${d.dayLabel}** — high ${d.highF}°${d.lowF !== null ? ` / low ${d.lowF}°` : ""}, ${d.condition}`
          ).join("\n")}`
        : "",
      `\nSource: [National Weather Service](https://forecast.weather.gov/MapClick.php?lat=39.5287&lon=-84.0891)`,
    ].join("\n")
  : null;

const candidateBlock = suggested.length
  ? suggested.map((h) => {
      const quote = h.excerpt || h.title;
      const url = h.sourceUrl || h.link;
      return `- "${quote}"${h.source ? ` — ${h.source}` : ""}, [full story](${url})`;
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
  QA: names/dates verified, links resolve, no unverified crime claims.
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
${libraryBlock ? `\n**Library programs** (Mary L. Cook Public Library)\n${libraryBlock}\n` : ""}
${sportsBlock ? `\n## This week in sports\n${sportsBlock}\n` : ""}
## Local government
Next up: **${meeting.body}**, ${meeting.whenLabel} — [agenda](${meeting.source}).
Also next up: **${townshipMeeting.body}**, ${townshipMeeting.whenLabel}, ${townshipMeeting.location}${latestAgenda ? ` — [latest posted agenda: ${latestAgenda.title}, ${latestAgenda.dateLabel}](${latestAgenda.link})` : ` — [agendas](${townshipMeeting.source})`}.
TODO — village council & county items, each linked to the agenda/minutes. Check:
${listSrc("Local Government")}
${villageMinutesBlock ? `\n${villageMinutesBlock}\n` : ""}

## Around town
TODO — new businesses, the antiques district. Check:
${listSrc("Around Town")}
${shopsBlock ? `\n**Merchant Association events** (waynesvilleshops.com)\n${shopsBlock}\n` : ""}

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
console.log(`Unpublished brief written: src/content/briefs/${iso}.md  (${soon.length} events, next meeting ${meeting.whenLabel})`);
