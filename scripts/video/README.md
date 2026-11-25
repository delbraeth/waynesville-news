# Daily video brief

Turns each day's recorded Daily Brief MP3 into an animated 1080p video for
YouTube. The **Daily video brief** Action (`.github/workflows/daily-video.yml`)
runs after **Daily audio brief** succeeds. It stores the MP4 and a thumbnail on
Cloudflare R2 at `https://audio.waynesville.news/video/<date>.mp4` (and
`.jpg`), using the same bucket and secrets as the daily audio, and also
attaches them to the run as a 14-day download, `video-<date>`. The editor
uploads the video to YouTube by hand. Nothing here posts anywhere public or
commits anything.

To render a day by hand: Actions → Daily video brief → Run workflow, with a date.

## How a video is made (`make-video.mjs`)
1. **Audio:** the day's MP3 from `src/data/audio-index.json`.
2. **Script:** `make-audio.mjs --script-only`, the same code path the
   recording used, so the words match what was read.
3. **Timing:** `timings.py` transcribes the MP3 with faster-whisper (base.en,
   CPU) only to learn when each word is spoken, then aligns the script's own
   words to those times. Captions always use the script's spelling.
4. **Slides:** `slides.mjs`, one slide per script paragraph:
   - open (greeting + day bite), weather (tiles from `weather.json`)
   - lead stories, each matched to the brief lead it shares the most words with
   - schools, local government, roads, around town, filled from those brief sections
   - sponsor (`supporters.json`), house spot, flagged stories, sign-off
   - anything unmatched shows the paragraph's own first sentence
   Every fact on screen comes from the brief or a data file. Lines appear
   as the narrator reaches them; captions highlight each word.
5. **Maps** (`maps.mjs`): a slide whose text names a place in `places.json`
   gets a map with pins; the roads slide draws ODOT's live work-zone outline
   from the OHGO feed. Tiles are OpenStreetMap, cached in `tiles/` (and in the
   Action's cache) so repeat renders don't download them again. Every map
   shows "© OpenStreetMap contributors".
6. **Render:** Playwright steps through `frame.html` at 30 fps and pipes the
   frames into ffmpeg with the audio. About 6 minutes for a 3-minute episode.

## Quality gate
Before rendering, `make-video.mjs` checks that the slides match the narration
and stops (exit 1, nothing attached or stored on R2) if any check fails. The
reasons are listed in the run's summary. It fails when:
- a forecast paragraph has no weather slide, or the slide's high isn't the
  number spoken
- a brief lead never gets its slide, or a lead slide sits over a paragraph
  that isn't the one about it
- a story or section slide shares fewer than 3 words with what's said over it
- a line on screen is cut off at an initial ("The Mary L.")
- under 80% of the script's words were found in the recording (the slides
  would drift from the audio)

Leads are paired with script paragraphs by best word overlap across the whole
script, so a weather recap or schools roundup can't take a lead from the
paragraph about it. Paragraphs that open "In schools", "In local government",
"On the roads", "Around town" or "Looking ahead" are always that section.

## Rules built in
- The Spartan helmet (`spartans-helmet.svg`, designed by the editor) appears
  only on sports lead stories, small, beside the kicker. Never in the
  masthead, intro, sign-off or on other slides.
- No photos yet: the editor's photo library is in `video-prototype/photos/`
  with its rules in `index.json`; wiring it in is a later step.

## Adding a place
Add an entry to `places.json` (`id`, `label`, `match` strings, `lat`, `lon`).
Check the coordinates on a map first. A match followed by Road, Pike, Street
and the like is ignored ("Harveysburg Road" is a road, not the village).

## Run locally
Needs ffmpeg, Python with `faster-whisper`, and the `playwright` package with
Chromium.
```
node scripts/video/make-video.mjs --date 2026-11-23 --out video-out
node scripts/video/make-video.mjs --date 2026-11-23 --out video-out --stills 10,45,90
```
