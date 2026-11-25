// Renders the day's Daily Brief episode as an animated 1080p video.
//
//   node scripts/video/make-video.mjs [--date YYYY-MM-DD] [--out DIR] [--stills 10,40,90]
//
// Steps: find the recorded MP3 in audio-index.json and download it; rebuild the
// exact spoken script with make-audio --script-only; get word timings
// (timings.py, faster-whisper); build the slides from the brief and data
// (slides.mjs); step through the episode with Playwright and pipe frames into
// ffmpeg. Writes <out>/waynesville-brief-<date>.mp4 plus slides.json and a
// thumbnail. Uploads nothing and changes nothing in the repo except new
// cached map tiles in scripts/video/tiles.
//
// Needs: ffmpeg, Python with faster-whisper, and the playwright package with
// Chromium. Exits 0 with "SKIP:" when there is no recording for the date.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSlides } from "./slides.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const date = arg("--date") || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const outDir = path.resolve(arg("--out") || path.join(ROOT, "video-out"));
const FPS = Number(process.env.FPS || 30);
fs.mkdirSync(outDir, { recursive: true });
const work = fs.mkdtempSync(path.join(outDir, ".work-"));

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/audio-index.json"), "utf8"));
const rec = index.items?.[date];
if (!rec?.url) { console.log(`SKIP: no recording listed for ${date}`); process.exit(0); }
if (!fs.existsSync(path.join(ROOT, `src/content/briefs/${date}.md`))) { console.log(`SKIP: no brief for ${date}`); process.exit(0); }

// 1. audio
const url = rec.url.startsWith("http") ? rec.url : `https://waynesville.news${rec.url}`;
const mp3 = path.join(work, "episode.mp3");
const res = await fetch(url);
if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString().trim());
console.log(`audio: ${url} (${duration.toFixed(1)}s)`);

// 2. the exact script that was read (same code path the recording used)
const raw = execFileSync("node", [path.join(ROOT, "scripts/make-audio.mjs"), "--script-only", "--date", date], { cwd: ROOT }).toString();
const script = raw
  .replace(/\n\[\d+ characters, date [\d-]+\]\s*$/, "")
  .split("\n")
  .filter((l) => !/^(day bite|house spot|podcast|sponsor|warning):/.test(l))
  .join("\n")
  .trim();
fs.writeFileSync(path.join(work, "script.txt"), script + "\n");

// 3. word timings
const timingsPath = path.join(work, "timings.json");
execFileSync(process.env.PYTHON || "python3", [path.join(HERE, "timings.py"), mp3, path.join(work, "script.txt"), timingsPath], { stdio: "inherit" });
const sents = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
const paras = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

// 4. slides
const tilesDir = path.join(HERE, "tiles");
const { segs, mast, problems } = await buildSlides({ root: ROOT, date, paras, sents, tilesDir });
console.log("slides: " + segs.map((s) => s.kind).join(", "));

// Quality gate: don't render a video whose slides or timing don't match the
// narration. The Action fails here, so nothing is attached or stored.
const meta = JSON.parse(fs.readFileSync(timingsPath + ".meta.json", "utf8"));
const matched = meta.total ? meta.matched / meta.total : 0;
if (matched < 0.8) problems.push(`only ${Math.round(matched * 100)}% of the script's words were found in the recording; slides would drift from the audio`);
if (problems.length) {
  const msg = `Video for ${date} NOT rendered — it would not match the narration:\n` + problems.map((x) => `- ${x}`).join("\n");
  console.error(msg);
  for (const x of problems) console.log(`::error::${x}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${msg.split("\n")[0]}\n\n${problems.map((x) => `- ${x}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`quality gate passed (${Math.round(matched * 100)}% of words aligned)`);
fs.writeFileSync(path.join(outDir, `slides-${date}.json`), JSON.stringify(segs.map(({ kind, from }) => ({ kind, from })), null, 1));

// 5. page: the template plus links to fonts, tiles and the helmet mark
const page = path.join(work, "page");
fs.mkdirSync(page);
fs.copyFileSync(path.join(HERE, "frame.html"), path.join(page, "frame.html"));
fs.copyFileSync(path.join(HERE, "spartans-helmet.svg"), path.join(page, "spartans-helmet.svg"));
fs.symlinkSync(path.join(ROOT, "public/fonts"), path.join(page, "fonts"));
fs.symlinkSync(tilesDir, path.join(page, "tiles"));
fs.writeFileSync(path.join(page, "slides.js"), `window.SEGS=${JSON.stringify(segs)};window.MAST=${JSON.stringify(mast)};`);

// loudness per frame for the waveform
const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
const a = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
const per = 16000 / FPS, amp = [];
for (let i = 0; i * per < a.length; i++) {
  let s = 0; const o = Math.floor(i * per);
  for (let j = 0; j < per && o + j < a.length; j++) s += a[o + j] ** 2;
  amp.push(Math.sqrt(s / per));
}
const p95 = [...amp].sort((x, y) => x - y)[Math.floor(amp.length * 0.95)] || 1;
const ampN = amp.map((v) => Math.pow(v / p95, 0.8));

// 6. render
const { chromium } = require("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await tab.goto("file://" + path.join(page, "frame.html"));
await tab.evaluate(() => document.fonts.ready);
await tab.evaluate(([s, am, f, d]) => window.setup(s, am, f, d), [sents, ampN, FPS, duration]);

const stills = arg("--stills");
if (stills) {
  for (const t of stills.split(",").map(Number)) {
    await tab.evaluate((t) => window.render(t), t);
    await tab.screenshot({ path: path.join(outDir, `still-${date}-${t}.png`) });
  }
  await browser.close();
  console.log(`stills written to ${outDir}`);
  process.exit(0);
}

// thumbnail: the top story's slide once it has built
const lead = segs.find((s) => s.kind === "lead");
const leadSent = lead ? sents[lead.from] : null;
await tab.evaluate((t) => window.render(t), leadSent ? Math.min(leadSent.end + 4, duration - 1) : 12);
await tab.screenshot({ path: path.join(outDir, `thumbnail-${date}.jpg`), type: "jpeg", quality: 90 });

const out = path.join(outDir, `waynesville-brief-${date}.mp4`);
const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-i", mp3,
  "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out],
  { stdio: ["pipe", "inherit", "inherit"] });
const N = Math.ceil(duration * FPS), t0 = Date.now();
for (let i = 0; i < N; i++) {
  await tab.evaluate((t) => window.render(t), i / FPS);
  const img = await tab.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 900 === 0) console.log(`frame ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
