# Waynesville News — notes for Claude

Astro site for https://waynesville.news. Cloudflare deploys `main` on every push.

## Merging (editor's standing instruction, 2026-11-16)
- **Simple additions: merge straight away.** Work on a `claude/` branch, run `npm run build`, open the PR, then mark it ready and merge it yourself, and check the change on the live site. This covers events, directory listings, Community organizations, resource entries, new audio opener lines (`src/data/day-bites.json`: `fixed` dates and `pool` lines, true and sourced), and small fact fixes to them.
- **Open a PR and wait for the editor** for anything else: code or layout changes, edits to a published brief or story, anything that posts outward (Facebook breaking news, newsletter), and deleting content.
- The scheduled daily-brief routine has its own rules (push only to `claude/daily`). This section doesn't change them.

## Where things go
- **Events:** `src/data/events.json`. Notes are written for readers, with no process notes. Add `"local": true` for a Waynesville event held elsewhere. For sign-ups, use `"registrationUrl"` plus `"signup": {"required": true}`.
- **Flyers and graphics:** convert to WebP with metadata stripped (`convert in -strip -quality 80 public/images/events/<date>-<slug>.webp`), then point the event's `source` at it.
- **Businesses:** edit `src/data/directory-manual.json`, then run `npm run refresh:directory -- --manual-only`. Never hand-edit `directory.json`. Show hours only when the owner confirmed them (`hours` + `hoursChecked`).
- **Clubs and nonprofits:** `src/data/organizations.json`. **Hotlines and services:** `src/data/resources.json`.
- **Audio opener lines:** `src/data/day-bites.json`. `fixed` holds MM-DD lines and `pool` holds everyday lines, optionally `{"text", "months"}`. Preview with `node scripts/day-bite.mjs <date> <days>`.
- **Breaking news to Facebook:** a story in `src/content/stories/` with `breaking: true` and `breakingAt`. See DEPLOY.md §6.

## Always
- Facts only, each one verified on the organization's own page or a source the editor sends. Never invent details.
- Never name private individuals or children. Use only public organizational contacts.
