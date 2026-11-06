# Planning note: community hub review (2026-11-05)

**Status:** Living roadmap, last updated 2026-11-06. The first build is done
(see "Roadmap" below). The review that started it is kept further down for
reference.

## Roadmap

### Done (2026-11-05)

- **Directory data fix.** Taylor's Coffee & Creamery: the `999-999-9999`
  placeholder phone is gone and the website was added, via an override in
  `directory-manual.json` (#93).
- **Event submission form**, live at `/events/submit/` (#94). It builds a
  pre-filled email to editor@waynesville.news. The editor handles submissions
  by hand; the daily routine does not read them (editor's decision).
- **Resource center**, live at `/resources/` as "Living in Waynesville" (#95,
  #96, #98). Data is in `src/data/resources.json`. It covers:
  - emergency and non-emergency numbers
  - village office, utility billing, trash, leaf pickup, streets and the water
    report
  - Wayne Township
  - county offices
  - Community help: the Waynesville Food Pantry and Wayne Township Community
    Aid, and the Warren County Community Services senior programs
  - each Wayne Local building's office line, plus athletics and transportation
  - the library

  Every entry shows its source and the date it was checked. The page is linked
  from the masthead ("Resources") and the footer.
- **Announcement story** for the resource center and event form, flagged for
  the podcast (#97).
- **Calendar tools:** Waynesville-area vs. regional filter (#101), add-to-
  calendar links and a "This weekend" view (#102). An announcement story,
  flagged for the podcast, and Friday's Round 2 playoff game were added in
  #103. Cloudflare didn't start a production build for #103's merge, so a
  small follow-up commit was pushed to trigger one.
- **Directory cleanup:** Prairie View Storage added, and marked as outside the
  Waynesville area (#87, #88). Valentino Design removed because its website is
  dead (#89, #90).
- **Events:** the CrossView flyers are hosted under `public/images/events/` as
  sources, used when the organizer has no web page (#91, #92). Private contact
  names are cropped out of flyers.

### Up next (not started; pick when ready)

1. **Low-cost calendar wins:**
   - ~~"Add to calendar" links~~ **Done 2026-11-05.** Each upcoming event
     has "Apple / Outlook" (a static .ics at `/events/ical/<slug>.ics`, from
     `src/lib/ical.js`) and "Google" links. Multi-day events are all-day
     entries with the daily hours in the notes.
   - ~~"This weekend" filter~~ **Done 2026-11-05.** /events/ has "All
     upcoming / This weekend" (Mon–Thu shows the coming Fri–Sun; Fri–Sun
     shows today through Sunday). Shareable as `/events/?when=weekend`.
   - ~~a Waynesville-area vs. regional flag on events~~ **Done 2026-11-05.**
     `isLocalEvent()` in `src/lib/events.js` reads the venue, and an event
     can override it with `local: true|false`. /events/ has a "Waynesville
     area only" checkbox and a "Regional" label.
2. ~~**Structured data** (schema.org Event and NewsArticle) for search engines.~~
   **Done 2026-11-06.** JSON-LD from `src/lib/structuredData.js`, passed to
   `Base.astro` as `jsonLd`: NewsArticle on every brief and story, an
   ItemList of Events on /events/ (upcoming items only), and WebSite plus
   NewsMediaOrganization on the homepage. Built only from fields already on
   the page.
3. **Resource center upkeep:**
   - ~~a monthly link check, reusing `dropDeadWebsites` from
     `scripts/fetch-directory.mjs`~~ **Done 2026-11-06.**
     `npm run check:resources` (`scripts/check-resources.mjs`) tests every
     link and source URL in `resources.json` and lists entries not verified
     in 90 days. The test is shared with the directory refresh in
     `scripts/lib/link-check.mjs`. `.github/workflows/check-resources.yml`
     runs it on the 1st of each month, read-only; a red X (and GitHub's
     failure email) means something needs fixing, listed in the run summary.
   - re-verify entries older than about 90 days
4. **Homepage refresh:** give events, the directory, resources and "submit an
   event" clear entry points above the brief archive. Do this after the pieces
   above exist.

### Ideas (parked)

- **Church directory.** **First version built 2026-11-06** at `/churches/`
  (data in `src/data/churches.json`; checked monthly by
  `scripts/check-resources.mjs`). 9 churches verified from each church's own
  site or its denomination's official locator. Still to add once an official
  source can be confirmed: service times for St. Augustine and Waynesville
  UMC (their sites block automated checks), and the Waynesville Church of the
  Nazarene, Waynesville Community Church, Waynesville Church of Christ,
  Friendship Baptist (Harveysburg), the Harveysburg Full Gospel / Pillar of
  Fire church, Corwin Pentecostal, Silver Grove Baptist and Ridgeville
  Community Church, which have no readable website. Jonah's Run Baptist
  (near Harveysburg, Clinton County) and Lifehouse (Lebanon) were left out
  as outside the area. Original idea, 2026-11-05. A dedicated page listing
  Waynesville-area churches with:
  - address
  - service times, as each church publishes them
  - website
  - ministries open to the community, such as food pantries, community
    meals, youth groups, VBS and holiday services

  Starting point: the business directory already has a "Churches & places of
  worship" (`faith`) section with 5 listings, 4 of them in the area:
  Crossview Christian, Lifehouse, St. Augustine Parish, St. Mary's Episcopal
  and Waynesville United Methodist. A church page could build on those and
  add the churches that aren't Chamber members. CrossView's site is
  crossview.cc.

  Notes:
  - Service times change, so each entry needs a verified date.
  - Name only churches, not clergy or members, unless the church's own page
    names its pastor in that role.
  - Church events already flow into the events calendar.
- **Nonprofit and community organization listing.** Editor's idea; see
  "Editor's notes" below. Could share a format with the church directory.
  **Includes the schools and youth hub** (reviewer's priority 7; editor's
  decision, 2026-11-06): youth and school-connected groups such as athletic
  boosters, PTOs, scouts, 4-H, youth sports leagues and library youth
  programs go in this listing, not on a separate page. Name groups and
  their public contacts only, never students.
- **Volunteer board.** Could grow out of the nonprofit listing's "how to
  help" lines.
- **Visitor guide and government issue trackers.** From the review's
  Phase 3.

### On hold (editor's decision, 2026-11-06)

Don't build these or bring them up as next steps until the editor reopens them.

- **Human review before publishing**, including the middle path of review on
  sensitive days only (elections, public safety, allegations). The daily brief
  keeps auto-publishing as instructed on 2026-08-20.
- **Directory photos**, including as a supporter perk. The directory stays
  text-only.

## Source

This is an outside evaluation of waynesville.news, dated Nov. 5, 2026. The
editor pasted it into a session. The reviewer says it is an editorial
assessment, not a measured usability or accessibility audit.

**Central question the review poses:** should Waynesville News be a local
newspaper with useful directories, or a community information platform that
also publishes a local newspaper? The reviewer recommends the second, while
keeping editorial independence and sourcing standards.

### Reviewer's scorecard (1–5)

| Area | Score |
|---|---|
| Local news coverage | 5 |
| Community events | 4 |
| Business discovery | 3 |
| Community participation | 2 |
| Resident resources | 2 |
| Visitor information | 2 |

### Strengths to keep

- Daily briefs covering government, schools, elections, sports and community.
- A sourced events calendar.
- A free business directory with a transparent sourcing policy and a
  supporter badge that doesn't affect placement.
- Local government reporting, such as the I-75/I-71 connector and the Old
  Stage Road housing proposal.
- Sourcing discipline and the free email newsletter.

### Reviewer's ten priorities

1. Redesign the homepage as a community dashboard: what's happening, what I
   need to know, what I can do. Put events, businesses, services and
   volunteering above the archive of older briefs.
2. Make the calendar the definitive Waynesville calendar:
   - month, week and list views
   - category filters
   - Apple, Google and .ics export
   - "This Weekend" view
   - an event submission form with editorial approval
   - recurring club and church events
   - cost, registration and accessibility details
   - Waynesville-area events kept separate from regional attractions
3. Build a community resource center ("Living in Waynesville") that stays
   current year-round with last-verified dates. It would cover:
   - local government contacts and schedules
   - zoning and permits
   - trash, leaves, utilities and snow
   - schools and families
   - assistance: food pantry, seniors, transportation
   - public safety numbers
4. Improve the business directory:
   - consistent hours, accessibility and photos
   - map and downtown filter
   - restaurant and shopping sub-filters
   - claim and update with review
   - optional specials
   - verification dates and "report an error"
5. Add structured submission forms for events, tips, corrections, volunteer
   needs and announcements. Everything goes through a moderation queue; no
   open forum.
6. A volunteer opportunities board, plus lightweight organization profiles
   for nonprofits, clubs and civic groups.
7. A schools and youth hub. *(Folded into the nonprofit listing; see Ideas.)*
8. A visitor guide: itineraries (Saturday downtown, antiques, the Little
   Miami trail, Renaissance Festival, Christmas in the Village), parking,
   restrooms and maps.
9. Government issue trackers.
10. Accessibility and mobile improvements: a WCAG 2.2 AA audit, Core Web
    Vitals, structured data, link and feed monitoring, and a privacy policy
    for submissions.

The reviewer said items 1–5 would make the biggest difference to everyday use.

### Editorial quality controls

The review flags the published-without-review daily brief as a credibility
risk for elections, public safety and government reporting. It recommends:

- human review before publishing those topics
- a visible corrections policy and history
- published and last-updated timestamps
- labels separating original reporting, sourced summaries and community
  submissions
- automated checks for expired events, broken links and inconsistent dates

### Suggested phasing and metrics

- **Phase 1 (0–30 days):** homepage navigation, submission forms, directory
  data fixes, less homepage archive clutter, published editorial standards.
- **Phase 2 (30–90 days):** filterable calendar, resource center,
  organization directory, volunteer board, richer business profiles.
- **Phase 3 (3–6 months):** visitor guide, government trackers, personalized
  newsletters, organization self-service.

**Metrics:**

- returning monthly visitors
- newsletter subscribers
- calendar interactions
- business referral clicks
- community submissions
- active organization profiles
- resource-page visits

Set baselines first.

## How this fits the current site

Notes written when the review was saved.

**Confirmed bug.** The Taylor's Coffee & Creamery listing shows the phone
`999-999-9999`, which comes from the Chamber directory. To fix it, add a
manual override or blank the phone in `src/data/directory-manual.json`. It is
the only placeholder-style phone in `src/data/directory.json`.

**Low-cost wins.** The data already exists for these:

- .ics "add to calendar" links (events.json has dateISO and endISO)
- a "This weekend" filter on /events/
- schema.org Event and NewsArticle structured data
- last-verified dates on directory listings

**Area vs. regional events.** Directory listings already carry a
Waynesville-area `local` flag. Events could get the same flag so regional
items, such as Kings Island or the Lebanon fairgrounds, can be filtered out.

**Resource center is the biggest gap.** Much of its raw material is already
gathered daily: commissioners, township agendas, village minutes, notices,
roads, closings, elections. It isn't arranged as a permanent reference page.

**Points that conflict with deliberate choices:**

- **Photos, hours and owner-claimed listings in the directory.** The
  directory is text-only by design, and `scripts/fetch-directory.mjs`
  deliberately skips hours and images. One option discussed on 2026-11-05:
  offer a photo or logo as a supporter-tier perk instead of for everyone.
- **Submission forms.** Each form adds a moderation queue for the editor.
  Start with events and corrections only.
- **Human review before publishing.** This needs an explicit decision from
  the editor, not a backlog slot. The daily brief has auto-published without
  review since 2026-08-20, by the editor's instruction. A possible middle
  path: hold the brief for review only on sensitive days (elections, public
  safety, allegations).
- **Volunteer board, organization profiles and visitor guide.** These need
  ongoing upkeep. They work best tied to partners who keep them current,
  such as the Chamber, the library and the Lions.

## Editor's notes

**2026-11-05: nonprofit listing.** The editor thinks a nonprofit and community
organization listing could be a good resource, separate from the business
directory. Examples:

- athletic boosters
- the Waynesville Lions Club
- the food pantry
- youth sports leagues

A first version could be built like the business directory:

- **Format:** a hand-kept JSON list with name, what the group does, how to
  reach it (public contact only), and when it meets.
- **Links:** each group links to its own page and its upcoming events on the
  calendar.
- **Volunteering:** an optional "how to help" line. This would make it the
  seed of the volunteer board without a separate moderation queue.
- **Sources:** many groups already appear in events.json, for example the
  Lions breakfast, the Friends of the Library auction and the food pantry
  beneficiaries.

**2026-11-05: next priority decided.** The editor picked the resource center
plus an event submission form as the next thing to build. See "Next build"
below.

**Suggested order:**

1. The low-cost wins plus the Taylor's phone fix.
2. The resource center plus an event submission form.
3. A homepage redesign once those sections exist to link to.

## Next build: resource center and event submission form

Scoped 2026-11-05. **Built and live 2026-11-05** (see Roadmap above).

### Resource center (`/resources/`, "Living in Waynesville")

- **Format:** a hand-kept data file, `src/data/resources.json`. Each entry
  has name, what it's for, phone, address or hours where published, a link,
  a `source` URL and a `verified` date. A page groups the entries by topic.
- **Topics for a first version:**
  - **Local government:** Village of Waynesville (village office, council
    schedule, zoning and permits, utilities), Wayne Township (trustees, fire
    department, cemetery, road department), Warren County (commissioners,
    engineer, auditor, Board of Elections).
  - **Resident services:** trash and recycling, leaf pickup, water and sewer,
    snow emergencies, as published by the village and township.
  - **Schools and families:** Wayne Local (district office, calendar, board
    meetings), the Mary L. Cook Public Library.
  - **Community help:** the Waynesville Food Pantry, senior services,
    transportation, mental health and crisis lines.
  - **Public safety:** 911, the sheriff's non-emergency line, the township
    fire non-emergency line, links to NWS alerts and OHGO.
- **Rules:** list only what an official or organization page publishes. No
  private individuals. Show each entry's verified date.
- **Upkeep:** a monthly check that every link still loads, using the same
  approach as `dropDeadWebsites` in `scripts/fetch-directory.mjs`.
- **Links in:** the masthead or footer, and the homepage.
- **Facts already confirmed** (2026-11-05):
  - Village office: 1400 Lytle Rd, 513-897-8015.
  - Chamber of Commerce: 513-897-8855.

### Event submission form (`/events/submit/`)

- **v1 needs no backend.** The site is static (Cloudflare, assets only), so
  the form builds a pre-filled email to editor@waynesville.news with the
  subject "Event submission". It asks for title, date and time, venue and
  address, organizer, cost, a public link or flyer, and a public contact.
- **Review:** the daily routine already reads Gmail (read-only). It could
  pick up "Event submission" emails and stage them for the editor's
  approval, never auto-publish them. **Decided 2026-11-05: not for now.** The
  editor will handle submissions by hand from the inbox. Don't add Gmail
  pickup of submissions to the daily routine.
- **Later option:** a Cloudflare Worker endpoint that opens a GitHub issue or
  sends an email. This would avoid the mail-client step, but it needs
  secrets and spam protection.
- **Links in:** a "Submit an event" button on /events/ and in the footer.
