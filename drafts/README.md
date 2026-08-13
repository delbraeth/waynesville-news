# Drafts — the daily editorial workflow

Files in this folder are **not published** — they live outside `src/content/briefs/`,
so the site build ignores them. This is your review queue.

## Publishing day, start to finish

1. **Generate today's draft:**
   ```bash
   npm run draft
   ```
   This auto-fills the scaffolding — today's weather, this week's real events, and the
   next government meeting — and leaves `TODO` slots for the reported items, each with
   the source links to check underneath.

2. **Report & write.** Open `drafts/YYYY-MM-DD.md`. Fill each `TODO` with a real item.
   Rules that keep us trustworthy:
   - Every claim sourced and linked. Summarize briefly; never republish someone's article.
   - Verify names, dates, and that links resolve.
   - Public safety: presumption of innocence — do **not** name un-convicted arrestees.
   - Set the `title` and `dek`.

3. **Publish** — move the file into the content collection and push:
   ```bash
   git mv drafts/YYYY-MM-DD.md src/content/briefs/YYYY-MM-DD.md
   git add -A && git commit -m "Brief: YYYY-MM-DD" && git push
   ```
   Cloudflare redeploys in ~1 minute. Done.

## Notes
- The scaffolding (weather, events, next meeting) is deterministic — no AI writes news
  here. You are the editor; the machine just removes the tedium.
- Want a fresh draft waiting each weekday morning? The GitHub Action can be extended to
  run `npm run draft` and commit into `drafts/` on a schedule — then you just `git pull`,
  edit, and publish. (Not enabled by default to avoid repo churn.)
