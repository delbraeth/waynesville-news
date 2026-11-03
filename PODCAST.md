# Podcast: the Daily Brief audio feed

**Feed URL:** https://waynesville.news/podcast.xml
**Cover art:** https://waynesville.news/podcast-cover.png (3000×3000 PNG; source `scripts/podcast-cover.html`)
**Owner email in the feed:** editor@waynesville.news

## How it works

- The "Daily audio brief" workflow records each published brief and adds it to
  `src/data/audio-index.json` (`url`, `seconds`, `bytes`, `chars`, `model`, `recorded`).
- `src/pages/podcast.xml.js` builds one episode per entry whose brief is published
  (not demo), newest first. Title = brief title. Show notes = dek, then "Read by an AI
  voice. Full edition with sources: <brief URL>". The guid is
  `waynesville-news-daily-brief-<date>` and **must never change**: apps use it to tell
  episodes apart. Changing it re-delivers every episode to every subscriber.
- Enclosure length comes from `bytes` in the index. Older entries have no `bytes`, so it
  falls back to the file size in `public/` and then to an HTTP HEAD (for R2 URLs).
- To pull a bad episode, remove its entry from `audio-index.json` (as the index's note says).
  Apple and Spotify drop it on their next feed refresh.

## Before you submit

1. Make sure the feed is live: open https://waynesville.news/podcast.xml in a browser and
   check it lists at least one episode.
2. Open the episode's MP3 link from the feed and make sure it plays. **Apple and Spotify
   both reject an episode whose audio returns 404.**
3. Make sure the audio host honors byte-range requests (Apple requires it, and apps use it
   to seek). This should print `HTTP/2 206` and a `content-range` line:

   ```bash
   curl -sS -D - -o /dev/null -H "Range: bytes=0-1" https://waynesville.news/audio/2026-11-03.mp3 | grep -i -E "^HTTP|content-range"
   ```

   On 2026-11-03 the site returned `200` with the whole file instead: Cloudflare served the
   MP3 from cache without honoring the range. Fix that before submitting to Apple. The
   simplest fix is to set the `R2_*` secrets so the daily-audio workflow puts MP3s in R2
   behind a custom domain (for example audio.waynesville.news), which serves ranges. Then
   move the existing MP3s there and update their `url`s.
4. Make sure editor@waynesville.news receives mail. Spotify sends a verification code
   there, and Apple uses it for contact.
5. Optional: run https://podba.se/validate/?url=https://waynesville.news/podcast.xml for a
   second opinion before submitting.

## Apple Podcasts (Podcasts Connect)

1. Go to https://podcastsconnect.apple.com and sign in with the Apple Account that should
   own the show. Use one the newsroom controls long-term, not a personal one you might lose.
2. First time only: accept the agreements Apple shows.
3. Click **+** (top left), then **New Show**.
4. Choose **Add a show with an RSS feed**, paste `https://waynesville.news/podcast.xml`,
   and click **Add**. Apple reads the title, art, category, and episodes from the feed.
5. On the show's **Information** page, check the details Apple pulled in. Fill in anything
   Apple asks for that isn't in the feed:
   - **Contact email:** editor@waynesville.news
   - **Content rights:** the show is your own original material (the scripts are your
     briefs). Answer accordingly.
   - If Apple asks about AI-generated or synthetic voice content, say **yes**. The audio is
     read by an ElevenLabs AI voice. The feed and every episode's show notes already say so.
6. **Availability:** leave all countries/regions on unless you have a reason not to.
7. Click **Publish** (or **Submit for Review**). Review usually takes from a day to several
   days. Apple emails editor@waynesville.news when the show is approved or if it's rejected
   with a reason.
8. Once it's approved, copy the show's Apple Podcasts link (Podcasts Connect, show page,
   **Apple Podcasts** link) for the site and newsletter.

## Spotify (Spotify for Creators)

1. Go to https://creators.spotify.com and log in with the Spotify account that should own
   the show (or create one).
2. Choose the option for a podcast that's **already hosted elsewhere** (wording is currently
   along the lines of "Find an existing show" / "I have a podcast"). Do **not** pick "start
   a new podcast", because that would host the audio on Spotify instead of using this feed.
3. Paste `https://waynesville.news/podcast.xml` and continue.
4. Spotify emails an **8-digit code** to the feed's owner email, editor@waynesville.news.
   Enter it to prove you own the feed.
5. Confirm the show details: category **News**, language **English**. If you're asked
   whether the content is AI-generated or uses a synthetic voice, answer **yes**.
6. Review and **Submit**. Spotify usually lists the show within a few hours, sometimes
   longer.
7. Copy the show's Spotify link from the Creators dashboard for the site and newsletter.

## After both are live

- New episodes appear on their own. Both platforms re-read the feed periodically, typically
  within hours of the daily commit and deploy. Nothing to do per episode.
- Consider adding "Listen on Apple Podcasts / Spotify" links next to the RSS link on
  `/about/` and in the brief's Listen box once you have the show URLs.
- Optional anti-hijack step once both are approved: change `podcast:locked` in
  `src/pages/podcast.xml.js` from `no` to `yes`. Hosts that honor it will then refuse to
  import the feed without the owner email confirming. Leave it `no` until both submissions
  are done.
- Don't change the feed URL. If it ever has to move, keep a permanent redirect from the old
  URL and add `<itunes:new-feed-url>`.
