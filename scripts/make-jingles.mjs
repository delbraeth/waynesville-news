// Generate intro/outro options for the audio brief with ElevenLabs music
// (falling back to sound effects), plus a demo of each pair wrapped around a
// recorded brief. Run by the "Make audio jingles" workflow; writes to --out.
//
//   ELEVENLABS_API_KEY=... node scripts/make-jingles.mjs --out dir [--voice public/audio/2026-11-03.mp3]
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const out = arg("--out") || "jingles";
const voice = arg("--voice");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("ELEVENLABS_API_KEY is not set"); process.exit(1); }
await mkdir(out, { recursive: true });
const API = "https://api.elevenlabs.io/v1";

const STYLES = {
  a: "warm acoustic guitar and light piano, small-town Midwest morning, gentle and optimistic",
  b: "bright folk banjo and acoustic guitar, friendly hometown morning radio, cheerful",
  c: "soft modern news theme, warm piano, light percussion and a gentle swell, calm and trustworthy",
};
const PIECES = {
  intro: { seconds: 6, words: "short instrumental intro jingle for a local morning news podcast that builds and ends on a clean, inviting note ready for a voice to start" },
  outro: { seconds: 5, words: "short instrumental outro sting for a local morning news podcast that resolves to a satisfying final chord and fades" },
};

async function music(prompt, seconds) {
  const r = await fetch(`${API}/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ prompt, music_length_ms: seconds * 1000 }),
  });
  if (!r.ok) throw new Error(`music HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}
async function sfx(prompt, seconds) {
  const r = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }),
  });
  if (!r.ok) throw new Error(`sound-generation HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

const made = [];
for (const [id, style] of Object.entries(STYLES)) {
  for (const [piece, p] of Object.entries(PIECES)) {
    const prompt = `${p.words}; ${style}; no vocals, no spoken words`;
    let buf, via;
    try { buf = await music(prompt, p.seconds); via = "music"; }
    catch (e) {
      console.log(`${piece}-${id}: ${e.message}; trying sound effects`);
      buf = await sfx(prompt, p.seconds); via = "sound-effects";
    }
    const file = `${out}/${piece}-${id}.mp3`;
    await writeFile(file, buf);
    console.log(`wrote ${file} via ${via} (${(buf.length / 1024).toFixed(0)} KB)`);
    made.push({ id, piece, file, via, prompt });
  }
}
await writeFile(`${out}/prompts.json`, JSON.stringify(made, null, 2) + "\n");

// Demo each style around a real recording: intro, 0.4 s gap, voice, gap, outro.
if (voice && existsSync(voice)) {
  for (const id of Object.keys(STYLES)) {
    const demo = `${out}/demo-${id}.mp3`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error",
      "-i", `${out}/intro-${id}.mp3`, "-i", voice, "-i", `${out}/outro-${id}.mp3`,
      "-filter_complex",
      "[0:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=out:st=5:d=1[i];" +
      "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=400|400[v];" +
      "[2:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=400|400[o];" +
      "[i][v][o]concat=n=3:v=0:a=1[a]",
      "-map", "[a]", "-b:a", "96k", demo]);
    console.log(`wrote ${demo}`);
  }
}
