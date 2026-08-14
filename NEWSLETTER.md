# Email newsletter — one-time activation

The subscribe box is already built and wired for **Buttondown** (free up to 100
subscribers — plenty to start). It stays a "coming soon" placeholder until you flip it on:

## 1. Create the account + set your username
1. Sign up free at https://buttondown.com and choose a username (e.g. `waynesville`).
2. On github.com, edit `src/data/site.json` → change `"username": "REPLACE_ME"` to your
   Buttondown username → Commit. The live site's subscribe box turns on automatically.

## 2. Auto-send every brief (no per-edition work)
In Buttondown → **Settings → Automations → RSS-to-email**, point it at:

    https://waynesville.news/rss.xml

Buttondown watches your feed and emails subscribers automatically whenever you publish a
new brief. You never hit "send."

## Notes
- Emails go out from your Buttondown address until you set a custom sending domain
  (Buttondown → Settings), which needs the email DNS records you'll add when you set up
  `editor@waynesville.news`.
- The RSS feed only includes **published** briefs, so drafts never email anyone.
