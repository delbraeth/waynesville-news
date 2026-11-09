// Turn a brief into a short spoken script and (optionally) an MP3 via ElevenLabs.
//
//   node scripts/make-audio.mjs --script-only [--date YYYY-MM-DD]   print the script, no API call
//   node scripts/make-audio.mjs --out audio.mp3 [--date YYYY-MM-DD]  synthesize to a file
//
// The script is either src/content/audio/<date>.txt (written by the daily run,
// when present) or, failing that, built from the brief: a greeting, the
// weather line, and the "This morning in Waynesville" lead items, stripped of
// links and markdown and written out for the ear. Either way it is hard-capped
// at maxChars (src/data/audio.json) at a sentence boundary so a long day can't
// overrun the monthly credit plan.
//
// Requires ELEVENLABS_API_KEY in the environment for synthesis. Exits 0 with a
// "SKIP:" line (no file written) when credits are too low, so callers can treat
// a skipped day as non-fatal; exits non-zero on real errors.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const cfg = JSON.parse(await readFile(new URL("src/data/audio.json", ROOT), "utf8"));
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

async function latestPublishedBrief() {
  const dir = new URL("src/content/briefs/", ROOT);
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
  for (const f of files) {
    const t = await readFile(new URL(f, dir), "utf8");
    if (/^published:\s*true/m.test(t)) return f.replace(/\.md$/, "");
  }
  throw new Error("no published brief found");
}

// Markdown -> plain sentences a voice can read.
export function forTheEar(s) {
  return s
    // *([source](url) · [other](url))* and ([post](url)) — source credits, not speech
    .replace(/\*?\(\s*\[[^\]]*\]\([^)]*\)(?:\s*[·,]\s*\[[^\]]*\]\([^)]*\))*\s*\)\*?/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")             // [text](url) -> text
    .replace(/[*_`#>]/g, "")
    .replace(/\bS\.R\.\s*/g, "State Route ")
    .replace(/\bU\.S\.\s*(\d)/g, "U.S. Route $1")
    .replace(/\bN\.\s/g, "North ").replace(/\bS\.\s(?=[A-Z])/g, "South ")
    .replace(/\b(St|Rd|Ave)\.(?=\s+[A-Z])/g, (_, w) => ({ St: "Street", Rd: "Road", Ave: "Avenue" })[w] + ".")
    .replace(/\bSt\.(?=\s|,|$)/g, "Street").replace(/\bRd\.(?=\s|,|$)/g, "Road").replace(/\bAve\.(?=\s|,|$)/g, "Avenue")
    .replace(/(\d)–(\d)/g, "$1 to $2")
    .replace(/\s&\s/g, " and ")
    .replace(/°F?/g, " degrees")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function section(md, heading) {
  const m = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(md);
  return m ? m[1] : "";
}

async function buildScript(date) {
  const custom = new URL(`src/content/audio/${date}.txt`, ROOT);
  if (existsSync(custom)) return (await readFile(custom, "utf8")).trim();

  const md = await readFile(new URL(`src/content/briefs/${date}.md`, ROOT), "utf8");
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const parts = [`Good morning, Waynesville. It's ${day}, and this is the Daily Brief from Waynesville News.`];

  const today = /\*\*Today:\*\*\s*([^\n]+)/.exec(section(md, "Weather"))?.[1];
  if (today) {
    const m = /(\d+)°F,\s*([^(]+)\(high (\d+)° \/ low (\d+)°\)/.exec(today);
    parts.push(m ? `Today's forecast: ${m[2].trim().toLowerCase().replace(/^chance /, "a chance of ")}, with a high of ${m[3]} and a low tonight of ${m[4]}.` : forTheEar(`The weather: ${today}.`));
  }

  const leads = section(md, "This morning in Waynesville")
    .split(/\n(?=\d+\.\s)/).map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  for (const l of leads) parts.push(forTheEar(l));

  // The editor-written narrative paragraph of a section (skips the auto-built
  // lists, sub-headings and source lines that follow it).
  const narrative = (name) => (section(md, name).split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(\*\*|-|\d+\.|Source:|Next up:|Latest posted|Also next up:|<!--)/.test(p)) || "");
  const schools = narrative("Schools");
  if (schools) parts.push("In the schools: " + forTheEar(schools));
  const town = narrative("Around town");
  if (town) parts.push("Around town: " + forTheEar(town));

  parts.push("That's your brief. Read the full edition, with links to every source, at waynesville dot news.");
  return parts.join("\n\n");
}

// Trim to maxChars at the last sentence end, keeping the sign-off.
export function cap(text, max) {
  if (text.length <= max) return text;
  const signoff = text.slice(text.lastIndexOf("\n\n") + 2);
  const room = max - signoff.length - 2;
  const body = text.slice(0, text.lastIndexOf("\n\n")).slice(0, room);
  const cut = Math.max(body.lastIndexOf(". "), body.lastIndexOf(".\n"));
  return (cut > 0 ? body.slice(0, cut + 1) : body).trim() + "\n\n" + signoff;
}

const date = arg("--date") || (await latestPublishedBrief());

// Stories flagged for the podcast (frontmatter `podcast:` in
// src/content/stories/*.md). `podcast: true` = the next episode recorded on or
// within 7 days after the story's date, once; `podcast: "YYYY-MM-DD"` = that
// day's episode. Read as podcastText if set, otherwise "title. dek". Room is
// reserved for them under maxChars, like the sponsor tag, so the cap trims
// the rest of the script instead.
const fm = (t) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(t); if (!m) return {};
  const o = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line); if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
    else if (v === "true" || v === "false") v = v === "true";
    o[kv[1]] = v;
  }
  return o;
};
export async function flaggedStories(date, index) {
  const dir = new URL("src/content/stories/", ROOT);
  if (!existsSync(dir)) return [];
  const usedElsewhere = new Set(Object.entries(index.items ?? {})
    .filter(([d]) => d !== date).flatMap(([, v]) => v.stories ?? []));
  const days = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000;
  const out = [];
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".md")).sort()) {
    const slug = f.replace(/\.md$/, "");
    const d = fm(await readFile(new URL(f, dir), "utf8"));
    if (d.published !== true || !d.podcast) continue;
    const sdate = String(d.date ?? slug.slice(0, 10)).slice(0, 10);
    const ok = typeof d.podcast === "string"
      ? d.podcast === date
      : days(sdate, date) >= 0 && days(sdate, date) <= 7 && !usedElsewhere.has(slug);
    if (!ok) continue;
    const text = d.podcastText || [d.title, d.dek].filter(Boolean).map((x) => String(x).replace(/\.?\s*$/, ".")).join(" ");
    out.push({ slug, text: forTheEar(text) });
  }
  return out;
}
const audioIndex = JSON.parse(await readFile(new URL("src/data/audio-index.json", ROOT), "utf8"));
const stories = await flaggedStories(date, audioIndex);
const storiesText = stories.length
  ? (stories.length === 1 ? "Also from Waynesville News: " : "Also from Waynesville News today. ") + stories.map((s) => s.text).join(" ") + " The full stor" + (stories.length === 1 ? "y is" : "ies are") + " at waynesville dot news."
  : "";
// Voice rotation: audio.json "voices" is a list of { id, name?, voiceSettings? }
// taken in turn one per day, counted from "voiceRotationStart" (that date gets
// the first voice). Each voice uses its own voiceSettings or the top-level
// ones. No list = the single top-level voiceId every day.
export function pickVoice(cfg, date) {
  const list = (cfg.voices ?? []).filter((v) => v?.id);
  const pick = list.length
    ? list[((Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${cfg.voiceRotationStart || "2026-01-01"}T12:00:00Z`)) / 86400000) % list.length) + list.length) % list.length]
    : { id: cfg.voiceId, name: cfg.voiceName };
  return { id: pick.id, name: pick.name || "", settings: pick.voiceSettings || cfg.voiceSettings };
}

// Audio sponsor tag: supporters.json items with an "audio" object
// ({ line, start?, end? }). Each sponsor gets at most one spot a week; with
// fewer than seven sponsors their spots are spread across the week (and the
// weekday each gets moves week to week), and the house promo from audio.json
// fills the other days. Seven or more sponsors simply take turns daily. The tag
// goes right before the sign-off, always phrased "supported by", and room for
// it is reserved under maxChars.
export function pickSponsor(supporters, date) {
  const ok = (supporters.items ?? []).filter((s) => {
    const a = s?.audio;
    if (!s?.name || !a?.line) return false;
    if (a.start && date < a.start) return false;
    if (a.end && date > a.end) return false;
    if (a.line.length > 220) { console.log(`sponsor ${s.name}: audio line over 220 characters, skipped`); return false; }
    return true;
  });
  const n = ok.length;
  if (!n) return null;
  // Day 0 = Monday 1970-01-05, so weeks run Monday-Sunday.
  const day = Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse("1970-01-05T12:00:00Z")) / 86400000);
  if (n >= 7) return ok[((day % n) + n) % n];
  const week = Math.floor(day / 7), dow = ((day % 7) + 7) % 7;
  const shift = ((week % 7) + 7) % 7;            // move each week's spots by a day
  for (let k = 0; k < n; k++) {
    if ((Math.floor((k * 7) / n) + shift) % 7 === dow) return ok[(k + week) % n];
  }
  return null;
}
const supporters = JSON.parse(await readFile(new URL("src/data/supporters.json", ROOT), "utf8"));
const sponsor = pickSponsor(supporters, date);
const sponsorText = sponsor
  ? forTheEar(`Today's Daily Brief is supported by ${sponsor.name}, ${sponsor.audio.line.replace(/\.?\s*$/, ".")} Learn more at waynesville dot news slash supporters.`)
  : forTheEar(cfg.housePromo || "");
const reserved = (sponsorText ? sponsorText.length + 2 : 0) + (storiesText ? storiesText.length + 2 : 0);
if (reserved > cfg.maxChars - 600) console.log(`warning: flagged stories and sponsor take ${reserved} of ${cfg.maxChars} characters`);
let script = cap(await buildScript(date), cfg.maxChars - reserved);
if (storiesText) {
  const i = script.lastIndexOf("\n\n");
  script = script.slice(0, i) + "\n\n" + storiesText + script.slice(i);
  console.log(`podcast: flagged stories included: ${stories.map((s) => s.slug).join(", ")}`);
}
if (sponsorText) {
  const i = script.lastIndexOf("\n\n");
  script = script.slice(0, i) + "\n\n" + sponsorText + script.slice(i);
}
if (/\bTODO\b/.test(script)) { console.error("script still contains TODO — refusing to record"); process.exit(1); }

if (args.includes("--script-only")) {
  console.log(script);
  console.log(`\n[${script.length} characters, date ${date}]`);
  process.exit(0);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("ELEVENLABS_API_KEY is not set"); process.exit(1); }
const out = arg("--out") || `audio-${date}.mp3`;
console.log(`model: ${process.env.ELEVENLABS_MODEL || cfg.modelId}`);
const API = "https://api.elevenlabs.io/v1";

// Credit check. Needs the key's "user read" permission; if the key can't read
// the subscription, warn and carry on rather than block the audio.
try {
  const r = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": key } });
  if (r.ok) {
    const s = await r.json();
    const left = (s.character_limit ?? 0) - (s.character_count ?? 0);
    console.log(`credits: ${left} left of ${s.character_limit}`);
    if (left < cfg.minCreditsLeft) { console.log(`SKIP: only ${left} credits left (minimum ${cfg.minCreditsLeft})`); process.exit(0); }
  } else {
    console.log(`credits: couldn't read subscription (HTTP ${r.status}); continuing`);
  }
} catch (e) { console.log(`credits: check failed (${e.message}); continuing`); }

const tts = (v) => fetch(`${API}/text-to-speech/${v.id}?output_format=${cfg.outputFormat || "mp3_44100_128"}`, {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
  body: JSON.stringify({ text: script, model_id: process.env.ELEVENLABS_MODEL || cfg.modelId, ...(v.settings ? { voice_settings: v.settings } : {}) }),
});
let voice = pickVoice(cfg, date);
console.log(`voice: ${voice.name || voice.id}`);
let res = await tts(voice);
// A rotation voice that fails (e.g. a library voice that was removed) falls
// back to the default voice for the day instead of skipping the episode.
if (!res.ok && voice.id !== cfg.voiceId && res.status !== 401 && res.status !== 429) {
  console.log(`voice ${voice.name || voice.id}: ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 200)} — falling back to the default voice`);
  voice = { id: cfg.voiceId, name: cfg.voiceName || "default", settings: cfg.voiceSettings };
  res = await tts(voice);
}
if (!res.ok) { console.error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
let buf = Buffer.from(await res.arrayBuffer());

// Wrap the voice in the show's intro and outro music: intro (last second faded),
// a short pause, the voice, a pause, then the outro. Re-encoded mono at the
// configured bitrate. If ffmpeg or either file is missing, keep the bare voice.
const introPath = cfg.intro && new URL(cfg.intro, ROOT);
const outroPath = cfg.outro && new URL(cfg.outro, ROOT);
if (introPath && outroPath && existsSync(introPath) && existsSync(outroPath)) {
  const { execFileSync } = await import("node:child_process");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "brief-"));
  const vPath = join(dir, "voice.mp3"), mixPath = join(dir, "mix.mp3");
  await writeFile(vPath, buf);
  const kbpsOut = /_(\d+)$/.exec(cfg.outputFormat || "mp3_44100_128")?.[1] || "64";
  try {
    const introSecs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", introPath.pathname]).toString().trim()) || 6;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error",
      "-i", introPath.pathname, "-i", vPath, "-i", outroPath.pathname,
      "-filter_complex",
      `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=out:st=${Math.max(0, introSecs - 1).toFixed(2)}:d=1[i];` +
      "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=400|400[v];" +
      "[2:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=400|400[o];" +
      "[i][v][o]concat=n=3:v=0:a=1[a]",
      "-map", "[a]", "-ac", "1", "-b:a", `${kbpsOut}k`, mixPath]);
    buf = await readFile(mixPath);
    console.log("mixed with intro and outro");
  } catch (e) {
    console.log(`intro/outro mix failed (${e.message.split("\n")[0]}); keeping the voice only`);
  }
}
await writeFile(out, buf);
await writeFile(out.replace(/\.mp3$/, ".txt"), script + "\n");
const kbps = Number(/_(\d+)$/.exec(cfg.outputFormat || "mp3_44100_128")?.[1] || 128);
const seconds = Math.round((buf.length * 8) / (kbps * 1000));
const meta = { date, chars: script.length, bytes: buf.length, seconds, model: process.env.ELEVENLABS_MODEL || cfg.modelId, voice: voice.name || voice.id, ...(sponsor ? { sponsor: sponsor.name } : {}), ...(stories.length ? { stories: stories.map((s) => s.slug) } : {}) };
await writeFile(out.replace(/\.mp3$/, ".json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB, ~${seconds}s, ${script.length} characters, date ${date})`);
