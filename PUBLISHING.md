# Publishing a brief — no terminal needed

Everything happens on **github.com** (works on your phone too). Cloudflare
redeploys automatically within ~1 minute of any commit. No unzip, no pull, no push.

## Each publishing day
As of 2026-08-20, the daily brief is **auto-published** by the scheduled Cowork
task (per Cap'n's explicit decision): the automation fills the draft's TODOs
from verified source data, flips `published: true`, verifies the build, and
pushes. The weekday GitHub Action still creates a `published: false` scaffold
as a fallback. To publish or fix one manually:

1. On github.com, open the repo → `src/content/briefs/` → today's file.
2. Click the ✏️ **pencil** (Edit this file).
3. Fill each `TODO` with a real, sourced item (use the links in the file). Set the
   `title` and `dek`. Delete the `<!-- ... -->` instructions block.
4. Change `published: false` to **`published: true`**.
5. Click **Commit changes** (leave "Commit directly to the main branch" selected).

Live in about a minute. A pre-build guard (`scripts/check-briefs.mjs`) fails the
build if a published brief still contains a `TODO` or the instructions comment.

## Rules that keep us trustworthy
- Every claim sourced and linked. Summarize briefly in your own words; original-source headlines may be quoted verbatim with attribution. Never reproduce article body text.
- Verify names, dates, and that links resolve.
- Public safety: Prosecutor's-office releases are republished with verbatim titles
  and a link to the official release — **including pre-conviction items that name
  the accused** (Cap'n's explicit decision, 2026-08-20/21, overriding the earlier
  "never name un-convicted arrestees" rule). Charges are allegations, not
  convictions; never editorialize beyond the official release, and always link it.

## Other quick actions (all on github.com)
- **Unpublish:** edit the file, set `published: false`, commit.
- **Fix a typo after publishing:** edit the file, commit — redeploys automatically.
- **Start from scratch:** create a new file `src/content/briefs/YYYY-MM-DD.md`, paste the
  frontmatter (`title`, `date`, `dek`, `demo: false`, `published: true`) and your Markdown.

## Manual draft (optional)
Prefer to generate a draft yourself instead of waiting for the morning job? Run
`npm run draft` locally — it writes the same hidden file. Not required.
