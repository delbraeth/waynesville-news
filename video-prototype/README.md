# Daily Brief video prototype (not wired into any workflow)

Hand-run prototype that turns a Daily Brief MP3 into an animated 1080p video
for YouTube: slides that build as each sentence is read, word-highlighted
captions, a voice waveform and progress bar, and maps where a story has a
place. It was built from the 2026-11-23 episode for audience feedback; nothing
here runs automatically, and nothing uploads anywhere.

## Pieces
- `frame.html` — the 1920×1080 page. `render(t)` draws the frame for time t.
  The slide content (SEGS) is hand-written for 2026-11-23; the daily version
  would generate it from the brief's weather data, lead items and sections.
- `render.cjs` — steps through the episode at 30 fps with Playwright, pipes
  JPEG frames into ffmpeg with the audio. About 5 minutes for a 3-minute
  episode. Env: `AUDIO` (mp3), `F32` (16 kHz mono float32 of the same audio,
  for the waveform), `SENT` (sentence/word timings), `DUR` (seconds), `OUT`.
- `asr.py` + `align.py` — word timings: faster-whisper transcribes the MP3,
  then the script's own words are aligned to it (captions always use the
  script's spelling). In production, ElevenLabs' text-to-speech
  "with-timestamps" endpoint returns exact character timings instead, so this
  step goes away.
- `maps.mjs` — builds the map cards from `data/`: OpenStreetMap tiles
  (cached in `tiles/`, so re-renders don't download them again), pins
  geocoded with Nominatim (`data/geo.json`), the driving route to Teays
  Valley HS from OSRM (`data/route.json`), and ODOT's own work-zone outline
  for the S.R. 73 project from the OHGO feed (`data/sr73.json`). Every map
  shows "© OpenStreetMap contributors", which the ODbL licence requires.
  For daily use, keep reusing cached tiles or use a tile provider's free
  tier rather than pulling from tile.openstreetmap.org each morning.

## Re-render the 2026-11-23 sample
```
ffmpeg -i ep.mp3 -ac 1 -ar 16000 -f f32le ep.f32
AUDIO=ep.mp3 F32=ep.f32 DUR=186.64 OUT=sample.mp4 node render.cjs
```
The sample's audio is the 2026-11-23 episode with the Cassidy Travel spot
replaced by the generic "support Waynesville News" house spot, taken from the
2026-11-10 episode (Alyson's voice; the editor approved mixing narrators).
