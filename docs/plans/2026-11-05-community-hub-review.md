# Planning note: community hub review (2026-11-05)

**Status:** Parked for future planning. Nothing here has been built or approved.
Saved at the editor's request so a future session can pick it up. The editor
said: "Don't act on this, but consider the feedback when developing a future
plan for site enhancements."

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
7. A schools and youth hub.
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

**Suggested order:**

1. The low-cost wins plus the Taylor's phone fix.
2. The resource center plus an event submission form.
3. A homepage redesign once those sections exist to link to.
