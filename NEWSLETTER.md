# Daily email — activation

The site emails each morning's edition to subscribers via **Buttondown**. The
daily task sends it through Buttondown's API the moment the brief is published —
so the email *is* the brief, delivered on time, with no per-edition work.

Why the API instead of Buttondown's RSS-to-email: RSS-to-email is a **+$9/month
add-on**; the API is on every plan (free up to 100 subscribers) and gives exact
timing and the full brief body. There is nothing to poll and nothing to click.

## 1. Create the account
Sign up free at https://buttondown.com and pick a username (e.g. `waynesville`).
Under **Settings**, set the newsletter name and the "from" name.

## 2. Turn on the subscribe box
Edit `src/data/site.json` → `"username": "REPLACE_ME"` → your Buttondown username,
commit, push. The live site's subscribe box switches from "coming soon" to live.

## 3. Wire the daily send
In Buttondown → **Settings → API**, copy your API key. Then in the daily task:
- provide it as the environment variable `BUTTONDOWN_API_KEY` (exactly like the
  GitHub token — it lives in the task, never in the repo), and
- add `npm run newsletter:send` as the **last** step, after the push, so links in
  the email point at a live page.

That's it. Each morning: brief publishes → pushes → emails subscribers.

## Safety rails (built into `scripts/send-newsletter.mjs`)
- Sends **only** a brief that is `published: true`, not `demo`, and has no
  unfilled `TODO —` placeholders. Drafts can never email anyone.
- **Never double-sends.** Before sending it checks Buttondown for an email with
  the same subject (works across fresh clones and same-day re-runs), with a local
  record as fallback.
- **Never breaks the workflow.** Any API or network error just logs and exits 0.
- Site-relative links are rewritten to absolute URLs so they work in an inbox,
  and every email ends with a "read on the web" link.

## Later
- A custom sending domain (e.g. `editor@waynesville.news`) needs the email DNS
  records — Buttondown → Settings → Sending domain — once mail is set up.
- Past 100 subscribers, Buttondown bills per active subscriber; the send script
  needs no changes as the list grows.
