# Editor to-do list (started 2026-11-06, updated 2026-11-07)

Open items first; what's done is logged at the bottom. Check items off as they're done.

## 1. Fill in details only the editor can confirm
For each entry: fill in the confirmed fields, set `verified` to the date checked, add a `source` (or "Confirmed by the editor" plus how), and delete `toConfirm`.

**Churches** (`src/data/churches.json`)
- [ ] Waynesville Church of the Nazarene: everything (no church website found)
- [ ] Waynesville Community Church: tradition, phone, service times; is facebook.com/Waynesville.us theirs?
- [ ] Friendship Baptist (Harveysburg)
- [ ] Harveysburg Full Gospel Church: current name (also listed as Pillar of Fire Worship Center)
- [ ] Corwin Pentecostal
- [ ] Silver Grove Baptist (Oregonia): still active?
- [ ] Ridgeville Community Church: listing sites give conflicting phone numbers
- [ ] St. Augustine phone: listings disagree (513-897-2821 vs. 513-897-0545), so it's left off
- [ ] Waynesville UMC service times (waynesvilleumc.org is down; the Facebook page doesn't show times without logging in)

**Community organizations** (`src/data/organizations.json`)
- [ ] Progressive Women's Club: meeting place (Methodist church or Quaker Heights?); left off until known
- [ ] American Legion Post 615: confirm the Chamber listing's phone, email and 174 S. Fourth St. address are current (Facebook page linked, 2026-11-07)
- [ ] Waynesville Lacrosse Club: fees (not on the club's home page)
- [ ] Waynesville Youth Basketball Association: grades, season and registration dates (website and contact form added from waynesvilleyouthbasketball.com, 2026-11-07; the site lists no season details)
- [ ] Youth wrestling: ages, season and contact (Facebook page linked, 2026-11-07)
- [ ] Band boosters: meeting schedule and contact (Facebook page linked, 2026-11-07)
- [ ] Friends of the Library
- [ ] Waynesville Area Arts Council (added 2026-11-07 with its Facebook page): programs, how to join, contact
- [ ] Rotary: which club? (District 6670 lists none in Waynesville; nearest is Lebanon)

**Visiting Waynesville** (`src/data/visit.json`)
- [ ] Caesar Creek State Park, Nature Center and Visitor Center (separate buildings) opening hours, and the Visitor Center's address (the Nature Center is now listed from the Nature Center Association's page, with phone and program days, but that page gives no hours)
- [ ] Typical downtown shop hours
- [ ] DORA boundaries: not on the Merchants' DORA page. They'd be in the village council ordinance that created it, or ask the Merchants Association / village office

**Directory: Merchants Association members** (`src/data/directory-manual.json`)
- [ ] Wendy's Treasures: current street address (the visitors bureau's 174 Main St. is now the Chamber's office) and phone
- [ ] Blitzen & Pine Christmas Shop: not added; only its name and Facebook page are official. Needs an address (a craft site says 275 Miami St.)
- [ ] Red Brick Social Room: not added; event venue, only name and Facebook official. Listing sites say the 1836 Red Brick Meeting House, 407 High St., up to 120 guests

**Directory: places to eat and stay**
- [ ] Possibly missing; found only on listing sites, so not added: Remember When Tea Room (370 Old Stage Rd), Sun Sprouts Cafe and The Corwin Peddler (Corwin, by the trail), Terrapin Village B&B (Oregonia), Miller's Campground (6964 Townshipline Rd; its website now redirects to a for-sale page), Sinclair House B&B

**Directory hours (new, optional)**
- [ ] When an owner gives you their hours, add `"hours": "Tue–Sat 10–5"` and `"hoursChecked": "YYYY-MM-DD"` to their listing (or a `recategorize` entry for a Chamber listing) and run `npm run refresh:directory -- --manual-only`. Never copy hours from listing sites.

## 2. Check
- [ ] Corrections log (/corrections/): entries before Nov 7 were reconstructed from the change history; prune or reword any you don't want public. Add new ones to `src/data/corrections.json`
- [ ] School calendar: spring 2027 days off were read from the board-approved PDF by color (yellow holiday, blue break, gray conference exchange, orange teacher day). Glance at /schools/#calendar against the PDF. Update `src/data/school-calendar-manual.json` each spring
- [ ] The STEP 1 edit to the daily routine took effect (the run report should show a permits refresh)
- [ ] `main` was force-updated on the morning of 2026-11-06, before the daily run. Confirm that was expected.
- [ ] After the next daily run: library and Caesar Creek programs appear on /events/ and the "Sign up soon" box looks right (both feeds were refreshed during the 2026-11-06 daily run)

## 3. Decide
- Friday "This weekend in Waynesville" email: not now (editor, 2026-11-07)
- [x] Supporter page fixes (2026-11-07): one Patreon link, with "choose the $10 a month tier"; receipts come from Patreon; not tax-deductible; listing promise is now phone and/or website. Cassidy Travel lists its website only; its phone is on that site (editor)
- On hold (no action): human review before publishing; directory photos

## 4. Next builds
- [ ] Nothing queued; pick from the reviewer list or suggest one

## Done
**PR #115 (merged 2026-11-06):** reviewer fixes, the Visiting Waynesville page, "No targeted ads. No algorithm."

**Caesar Creek Nature Center (2026-11-07):** added to the Visit page from caesarcreekstatepark.com (editor's link): exhibits, free programs most Thu/Fri/Sat, 513-897-2437. Its events feed was checked but not added: it is mostly Cowan Lake programs, and the Caesar Creek ones are already on the calendar from ODNR

**Schools, corrections, menu (2026-11-07):**
- School status badge (homepage and /schools/): delay / closed / early release from the district's own post, else no school (calendar, weekend, summer), else open; always marked "Not official" with the time checked
- School calendar from the district's public Google Calendar (refreshed daily, `scripts/fetch-school-calendar.mjs`) plus the board-approved 2026-27 PDF; marked not official
- Shorter /schools/: status, "This week" (district calendar, Spartans games, school events), lead paragraph of the last four briefs' school news, the calendar, sources (about 4,900px tall on a phone, down from 32,000)
- /corrections/: policy and public log; corrected briefs and stories show a correction note
- Top menu: News dropdown (Stories, Government, Public Safety, Around Town), so the bar fits on one line

**Scouting (2026-11-07):** Pack 840 and Troop 318 removed: they don't exist (editor). Troops 51 and 1051 and Crew 6151 listed from troop-0051.trooptrack.com (editor's link): chartered to Waynesville Scouting, Wednesdays 7 p.m. at the American Legion, troop email and Facebook. The scoutmaster's name and cell number are left off (named individual)

**Lighter fonts (2026-11-07):** Newsreader self-hosted as three static cuts, 67 KB instead of 195 KB from Google Fonts; homepage first visit drops from about 242 KB to about 115 KB, and no third-party font request

**PR #117 (2026-11-07):**
- Site-wide search: directory, community, churches, resources and visit listings, exact name matches first, above brief/story results
- Tips and corrections forms: /tips/ and /corrections/submit/, linked from the footer, About, briefs and stories
- Library programs (next 45 days) and Caesar Creek programs on the events calendar automatically, with a "Sign up soon" box on /events/ and sign-up notes in the brief draft
- Owner-supplied hours lines in the directory (`hours` + `hoursChecked`)
- Info bar shows the next Village Council or school board meeting before the County Commissioners
- Directory: Past Perfect Antiques phone added (editor: cell numbers a business lists publicly on other sites are OK to publish); Jamie Gabbard – Glass House Realty (agent page, phone, 220 N. Main St.); Lucky Kat, Petal Vintage, Past Perfect Antiques, The Stetson House, Wendy's Treasures, Windmill Farm Market (Springboro); McDonald's described as fast food; Roscoe's open; Coffee Hub and Mami Fina's closed; Hammel House rooms open, restaurant reopening soon
- Visit: DORA hours (every day, noon to 10 p.m.); Corwin trailhead facilities (trail map); walking-tour link
- Community: Waynesville Lacrosse Club (grades, season, register by Nov 30 to avoid late fee); The Bridge; Progressive Women's Club confirmed active (Facebook only)
- Churches: St. Augustine Mass times; Waynesville UMC linked to its Facebook page
- Events: Town Square Days, "Step into Stars Hollow," Nov 21–22, 10 AM–7 PM
