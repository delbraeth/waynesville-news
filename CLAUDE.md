# Waynesville News — notes for Claude

Astro site for https://waynesville.news. Cloudflare deploys `main` on every push.

## Merging (editor's standing instruction, 2026-11-16)
- **Simple additions: merge straight away.** Work on a `claude/` branch, run `npm run build`, open the PR, then mark it ready and merge it yourself, and check the change on the live site. This covers events, directory listings, Community organizations, resource entries, new audio opener lines (`src/data/day-bites.json`: `fixed` dates and `pool` lines, true and sourced), and small fact fixes to them.
- **Open a PR and wait for the editor** for anything else: code or layout changes, edits to a published brief or story, anything that posts outward (Facebook breaking news, newsletter), and deleting content.
- The scheduled daily-brief routine has its own rules (push only to `claude/daily`). This section doesn't change them.

## Editor's note for one edition
- **Friday, Nov. 27, 2026 brief (editor, 2026-11-27):** the three lead items must include the All-Village Spartan Send-Off (buses leave Waynesville High School at 3:45 p.m. for the state semifinal against Ironton) and the Holiday Lights guide (/holiday-lights/). The audio script's lead paragraphs follow the same leads. No editor graphic in that day's video. Facts still come from the sources as usual. Ignore this note on any other date.

## Where things go
- **Events:** `src/data/events.json`. Notes are written for readers, with no process notes. Add `"local": true` for a Waynesville event held elsewhere. For sign-ups, use `"registrationUrl"` plus `"signup": {"required": true}`.
- **Flyers and graphics:** convert to WebP with metadata stripped (`convert in -strip -quality 80 public/images/events/<date>-<slug>.webp`), then point the event's `source` at it.
- **Businesses:** edit `src/data/directory-manual.json`, then run `npm run refresh:directory -- --manual-only`. Never hand-edit `directory.json`. Show hours only when the owner confirmed them (`hours` + `hoursChecked`).
- **Clubs and nonprofits:** `src/data/organizations.json`. **Hotlines and services:** `src/data/resources.json`.
- **Reader holiday photos:** `src/data/holiday-photos.json`, shown on /holiday-lights/photos/. Add a photo only when the editor sends it as approved. Rules are in the file's `_note`: ZIP 45068, the submitter's own home or business, family-appropriate, no faces or readable house numbers, and never a street or address (a town or neighborhood like Corwin or Lytle is fine, in `place`). A home photo may carry the submitter's own short greeting ("Happy holidays from the Smiths"). Convert with `convert in -strip -auto-orient -resize 1600x1600\> -quality 80 public/images/holiday-photos/<YYYY>-<slug>.webp`.
- **Christmas Eve services:** an optional `christmasEve` on the church in `src/data/churches.json` (format in its `_note`). Shown on /holiday-lights/christmas-eve/ and the church's entry; the tab appears once one church has this year's services.
- **Audio opener lines:** `src/data/day-bites.json`. `fixed` holds MM-DD lines and `pool` holds everyday lines, optionally `{"text", "months"}`. Preview with `node scripts/day-bite.mjs <date> <days>`.
- **Breaking news to Facebook:** a story in `src/content/stories/` with `breaking: true` and `breakingAt`. See DEPLOY.md §6.
- **Feature stories to Facebook** (previews, profiles, anything not urgent): `feature: true` (optional `featureAt`) instead of `breaking`, for a dark "Feature" graphic and no "BREAKING" caption. See DEPLOY.md §6.

## Daily audio script (`src/content/audio/<date>.txt`)
The video makes one slide per paragraph and shows the brief's own text while the script is read, so the two have to match.
- **One paragraph per topic, in this order:** opening, weather, the three lead items in the brief's order, schools, local government, roads (when there's road news), events or around town, then the sign-off.
- **Cue each paragraph:** the weather paragraph opens with the forecast ("It's a mostly sunny start, with a high near 50"). The first lead opens "Our top story:". Section paragraphs open "In schools,", "In local government,", "On the roads," and "Looking ahead," or "Around town,".
- **Leads match the brief:** each lead paragraph covers the same facts as its lead item, and nothing more. Put a fact in both or in neither; for example, don't tuck the forecast into an unrelated lead. A story that takes more than about four spoken sentences needs a lead item of three or more sentences, so its slide doesn't sit half empty.
- **Length is a guide, not a limit:** about 2½–3 minutes (roughly 2,400–3,000 characters). Quality comes first: say what the day needs, clearly. `make-audio` hard-caps the whole episode at `maxChars` in `src/data/audio.json`.
- **Write for the ear:** no links, parentheses, abbreviations or bracketed tags. Pauses between paragraphs are added automatically (`paragraphPause` in `src/data/audio.json`).
- **Check before calling it done:** after the audio and video are made, listen and look. If the video gate stops a render, fix the script or brief and say what happened.

## Always
- Quality first. A run that finished isn't done: read, watch or listen to what goes out (brief, email, audio, video) and fix it, or hold it and say why, before calling it done. Say plainly what you couldn't test.
- Facts only, each one verified on the organization's own page or a source the editor sends. Never invent details.
- Never name private individuals or children. Use only public organizational contacts.
