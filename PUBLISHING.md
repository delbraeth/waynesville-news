# Publishing a brief — no terminal needed

Everything happens on **github.com** (works on your phone too). Cloudflare
redeploys automatically within ~1 minute of any commit. No unzip, no pull, no push.

## Each publishing day
A hidden draft is created automatically every weekday morning at
`src/content/briefs/YYYY-MM-DD.md` (`published: false`, so it's not live yet).

1. On github.com, open the repo → `src/content/briefs/` → today's file.
2. Click the ✏️ **pencil** (Edit this file).
3. Fill each `TODO` with a real, sourced item (use the links in the file). Set the
   `title` and `dek`. Delete the `<!-- ... -->` instructions block.
4. Change `published: false` to **`published: true`**.
5. Click **Commit changes** (leave "Commit directly to the main branch" selected).

Live in about a minute.

## Rules that keep us trustworthy
- Every claim sourced and linked. Summarize briefly; link the **original** source; never republish.
- Verify names, dates, and that links resolve.
- Public safety: presumption of innocence — do not name un-convicted arrestees.

## Other quick actions (all on github.com)
- **Unpublish:** edit the file, set `published: false`, commit.
- **Fix a typo after publishing:** edit the file, commit — redeploys automatically.
- **Start from scratch:** create a new file `src/content/briefs/YYYY-MM-DD.md`, paste the
  frontmatter (`title`, `date`, `dek`, `demo: false`, `published: true`) and your Markdown.

## Manual draft (optional)
Prefer to generate a draft yourself instead of waiting for the morning job? Run
`npm run draft` locally — it writes the same hidden file. Not required.
