# Editor to-do list (from the 2026-11-06 session)

Open items from the day's work. Check items off as they're done.

## 1. Merge
- [ ] **PR #115**: reviewer fixes, the Visiting Waynesville page (`/visit/`) and the "No targeted ads. No algorithm." statement.

## 2. Fill in details only the editor can confirm
For each entry: fill in the confirmed fields, set `verified` to the date checked, add a `source` (or "Confirmed by the editor" plus how), and delete `toConfirm`.

**Churches** (`src/data/churches.json`)
- [ ] Waynesville Church of the Nazarene: everything (no church website found)
- [ ] Waynesville Community Church: tradition, phone, service times; is facebook.com/Waynesville.us theirs?
- [ ] Friendship Baptist (Harveysburg)
- [ ] Harveysburg Full Gospel Church: current name (also listed as Pillar of Fire Worship Center)
- [ ] Corwin Pentecostal
- [ ] Silver Grove Baptist (Oregonia): still active?
- [ ] Ridgeville Community Church: listing sites give conflicting phone numbers
- [ ] Service times for St. Augustine and Waynesville UMC (their sites block automated checks)

**Community organizations** (`src/data/organizations.json`)
- [ ] Progressive Women's Club: meeting place (Methodist church or Quaker Heights?)
- [ ] American Legion Post 615
- [ ] Scouting: which of Pack 840, Troops 51 / 1051 / 318, Crew 6151 are active
- [ ] Waynesville Spartan Lacrosse Club: grades, fees, sign-up dates (club site was blocked from the session)
- [ ] Waynesville Youth Basketball Association: season and contact
- [ ] Youth wrestling, band boosters, Friends of the Library
- [ ] Rotary: which club? (District 6670 lists none in Waynesville; nearest is Lebanon)

**Visiting Waynesville** (`src/data/visit.json`): no official source could be read for these
- [ ] Caesar Creek State Park and nature center hours
- [ ] Corwin trailhead parking and restrooms
- [ ] Typical downtown shop hours
- [ ] DORA hours and boundaries

**Directory: places to eat and stay** (`src/data/directory-manual.json`)
- [ ] Possibly missing; found only on listing sites, so not added: Remember When Tea Room (370 Old Stage Rd), Coffee Hub (415 S. Main), Sun Sprouts Cafe and The Corwin Peddler (Corwin, by the trail), Terrapin Village B&B (Oregonia), Miller's Campground (6964 Townshipline Rd; its website now redirects to a for-sale page), Sinclair House B&B
- [ ] Hammel House Inn: a commercial real-estate listing offers 121 S. Main for sale. Still open as an inn?
- [ ] Roscoe's (Coletranes) Pizza: one listing site marks it closed. Still open?
- [ ] McDonald's: no official description found; add one or leave blank

## 3. Check
- [ ] The STEP 1 edit to the daily routine took effect (the run report should show a permits refresh)
- [ ] `main` was force-updated on the morning of 2026-11-06, before the daily run. Confirm that was expected.

## 4. Decide
- [ ] Show Village Council and school board dates before the County Commissioners in the info bar?
- [ ] A Friday "This weekend in Waynesville" email for visitors, separate from the daily brief?
- [ ] Optional owner-supplied hours lines in the directory (still text-only)?
- [ ] Supporter page fixes: name the Patreon business tier, mention receipts, show the supporter's phone as promised
- On hold (no action): human review before publishing; directory photos

## 5. Next builds (pick one)
- [ ] School status badge (open / delay / closed) and a school calendar (top parent ask)
- [ ] Shorter Schools page that opens with a "This week" summary
- [ ] Site-wide search (directory, community, resources, visit), with exact matches ranked first
- [ ] Corrections policy page and public corrections log
- [ ] Tips and corrections forms (events already has one)
- [ ] Library programs and Caesar Creek events added to the calendar automatically, plus sign-up reminders
- [ ] Lighter fonts (about 90% of page weight; would save about 120 KB per page)
