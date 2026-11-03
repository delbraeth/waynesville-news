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
const script = cap(await buildScript(date), cfg.maxChars);

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

const res = await fetch(`${API}/text-to-speech/${cfg.voiceId}?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
  body: JSON.stringify({ text: script, model_id: process.env.ELEVENLABS_MODEL || cfg.modelId, ...(cfg.voiceSettings ? { voice_settings: cfg.voiceSettings } : {}) }),
});
if (!res.ok) { console.error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
await writeFile(out, buf);
await writeFile(out.replace(/\.mp3$/, ".txt"), script + "\n");
console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB, ${script.length} characters, date ${date})`);
