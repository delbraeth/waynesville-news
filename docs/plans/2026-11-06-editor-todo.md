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
- [x] St. Augustine Mass times added from CatholicMassTime.org (editor's link, 2026-11-07). Phone left off: listings disagree (513-897-2821 vs. 513-897-0545)
- [ ] Service times for Waynesville UMC (waynesvilleumc.org is down, so its link was removed; the Facebook page, now linked, doesn't show times without logging in)

**Community organizations** (`src/data/organizations.json`)
- [ ] Progressive Women's Club: meeting place (Methodist church or Quaker Heights?)
- [ ] American Legion Post 615
- [ ] Scouting: which of Pack 840, Troops 51 / 1051 / 318, Crew 6151 are active
- [x] Waynesville Lacrosse Club: grades, season, registration deadline (Nov 30 to avoid late fee) and email from waynesvillelax.org (editor's link, 2026-11-07). Fees aren't on the home page.
- [ ] Waynesville Youth Basketball Association: season and contact
- [ ] Youth wrestling, band boosters, Friends of the Library
- [ ] Rotary: which club? (District 6670 lists none in Waynesville; nearest is Lebanon)

**Visiting Waynesville** (`src/data/visit.json`): no official source could be read for these
- [ ] Caesar Creek State Park and nature center hours
- [x] Corwin trailhead parking and restrooms: added from the Little Miami State Park trail map (editor's link, 2026-11-07)
- [ ] Typical downtown shop hours
- [x] DORA hours: every day, noon to 10 p.m. (editor, 2026-11-07)
- [ ] DORA boundaries: not on the Merchants' DORA page. They'd be in the village council ordinance that created it, or ask the Merchants Association / village office

- [x] Jamie Gabbard – Glass House Realty: phone, 220 N. Main St. office and agent page added from glasshouserealty.com (editor's link, 2026-11-07)

**Directory: Merchants Association members** (`src/data/directory-manual.json`)
Added 2026-11-07 from the 2026 member list: Lucky Kat, Petal Vintage, Past Perfect Antiques, The Stetson House (Airbnb), Wendy's Treasures, Windmill Farm Market (Springboro; marked outside the area).
- [ ] Wendy's Treasures: current street address (the visitors bureau's 174 Main St. is now the Chamber's office) and phone
- [ ] Past Perfect Antiques: OK to publish 513-855-4315? The Merchants listing labels it a cell number
- [ ] Blitzen & Pine Christmas Shop: not added; only its name and Facebook page are official. Needs an address (a craft site says 275 Miami St.)
- [ ] Red Brick Social Room: not added; event venue, only name and Facebook official. Listing sites say the 1836 Red Brick Meeting House, 407 High St., up to 120 guests

**Directory: places to eat and stay** (`src/data/directory-manual.json`)
- [ ] Possibly missing; found only on listing sites, so not added: Remember When Tea Room (370 Old Stage Rd), Sun Sprouts Cafe and The Corwin Peddler (Corwin, by the trail), Terrapin Village B&B (Oregonia), Miller's Campground (6964 Townshipline Rd; its website now redirects to a for-sale page), Sinclair House B&B
- Coffee Hub (415 S. Main) is closed, per the editor (2026-11-06); not added.
- Hammel House Inn: rooms open; restaurant expected to reopen soon (editor, 2026-11-06). Listing updated.
- [x] Roscoe's (Coletranes) Pizza: open, per the editor (2026-11-07). Listing stays.
- [x] McDonald's: described simply as a fast-food restaurant (editor, 2026-11-07)

## 3. Check
- [ ] The STEP 1 edit to the daily routine took effect (the run report should show a permits refresh)
- [ ] `main` was force-updated on the morning of 2026-11-06, before the daily run. Confirm that was expected.

## 4. Decide
- [x] Info bar shows the next Village Council or school board meeting on the calendar (within 3 weeks) before the County Commissioners (editor, 2026-11-07)
- [ ] A Friday "This weekend in Waynesville" email for visitors, separate from the daily brief?
- [x] Owner-supplied hours lines in the directory: `hours` + `hoursChecked` in directory-manual.json; shown as "from the owner" with the date (editor, 2026-11-07)
- [ ] Supporter page fixes: name the Patreon business tier, mention receipts, show the supporter's phone as promised
- On hold (no action): human review before publishing; directory photos

## 5. Next builds (pick one)
- [ ] School status badge (open / delay / closed) and a school calendar (top parent ask)
- [ ] Shorter Schools page that opens with a "This week" summary
- [x] Site-wide search (directory, community, churches, resources, visit), with exact matches ranked first (2026-11-07)
- [ ] Corrections policy page and public corrections log
- [x] Tips and corrections forms: /tips/ and /corrections/submit/ (mailto, like the events form); linked from the footer, About, briefs and stories (2026-11-07)
- [x] Library programs (next 45 days) and Caesar Creek programs now on the events calendar automatically, with a "Sign up soon" box on /events/ and sign-up notes in the brief draft (2026-11-07)
- [ ] Lighter fonts (about 90% of page weight; would save about 120 KB per page)
