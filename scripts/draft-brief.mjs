// Assemble a review-ready DRAFT brief from deterministic data.
//
// The editor runs `npm run draft`, which auto-fills the factual scaffolding
// (weather, this-week's events, the next government meeting) and leaves clearly
// marked TODOs for the reported items — each with the source links to check.
// The editor writes/verifies those items, then publishes by moving the file
// into src/content/briefs/ and pushing. Nothing here invents news.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { nextCommissionersMeeting } from "../src/lib/nextMeeting.js";

const root = new URL("..", import.meta.url);
const readJSON = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));

const events = await readJSON("src/data/events.json");
let weather = null;
try { weather = await readJSON("src/data/weather.json"); } catch { /* optional */ }

const now = new Date();
const iso = now.toISOString().slice(0, 10);
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
  ],
  "Around Town": [
    "Auditor property transfers — https://auditor.warrencountyohio.gov/RealEstate/TransfersAndConveyance/Index",
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

const list = (section) => (SOURCES[section] || []).map((s) => `  - ${s}`).join("\n");
const eventsBlock = soon.length
  ? soon.map((e) => `- **${e.dateLabel}** — ${e.title} (${e.venue})${e.source ? ` — [details](${e.source})` : ""}`).join("\n")
  : "- (no dated events in the window — see the full calendar)";

const draft = `---
title: "TODO — headline for ${longDate}"
date: ${iso}
dek: "TODO — one-line summary of today's brief."
demo: false
---

<!--
  DRAFT — not published (this folder is outside src/content/briefs/).
  Auto-filled: weather = ${weather ? `${weather.tempF}° ${weather.condition}` : "n/a"}, the events list, and the next meeting.
  Your job: fill each TODO with a real, sourced item using the links under each section.
  QA before publishing: names/dates verified, links resolve, no unverified crime claims.
  Publish: move this file into src/content/briefs/ and push (see drafts/README.md).
-->

## This morning in Waynesville

1. TODO — lead item (schools first). *(link the source)*
2. TODO — second item. *(link the source)*
3. TODO — third item. *(link the source)*

## Schools
TODO — Wayne Local board, Spartans, closings, library programs. Check:
${list("Schools")}

## Local government
Next up: **${meeting.body}**, ${meeting.whenLabel} — [agenda](${meeting.source}).
TODO — village council & county items, each linked to the agenda/minutes. Check:
${list("Local Government")}

## Around town
TODO — new businesses, the antiques district, notable property transfers. Check:
${list("Around Town")}

## Public safety
TODO — road/weather alerts, sheriff/prosecutor news (handle with care). Check:
${list("Public Safety")}

## This week's events
${eventsBlock}

See the [full events calendar](/events/).

---
*Candidate headlines to scan (pick, summarize briefly, link out — never republish):*
${list("Headlines")}
`;

await mkdir(new URL("drafts/", root), { recursive: true });
await writeFile(new URL(`drafts/${iso}.md`, root), draft);
console.log(`Draft written: drafts/${iso}.md  (${soon.length} events, next meeting ${meeting.whenLabel})`);
