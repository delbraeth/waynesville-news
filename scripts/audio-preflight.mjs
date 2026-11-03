// Decide whether the daily-audio workflow should record today's brief.
// Writes GitHub Actions outputs: go (true/false), date (YYYY-MM-DD, America/New_York).
// Never fails the run for "nothing to do" — only prints why.
import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const out = async (k, v) => process.env.GITHUB_OUTPUT && appendFile(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

const date = process.env.DATE || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
await out("date", date);

const cfg = JSON.parse(await readFile(new URL("src/data/audio.json", ROOT), "utf8"));
const index = JSON.parse(await readFile(new URL("src/data/audio-index.json", ROOT), "utf8"));
const brief = new URL(`src/content/briefs/${date}.md`, ROOT);

let why = "";
if (!cfg.enabled) why = "audio.json enabled is false";
else if (!existsSync(brief)) why = `no brief for ${date}`;
else if (!/^published:\s*true/m.test(await readFile(brief, "utf8"))) why = `brief for ${date} is not published`;
else if (index.items?.[date] && !process.env.FORCE) why = `audio for ${date} already recorded`;

await out("go", why ? "false" : "true");
console.log(why ? `audio: skip — ${why}` : `audio: recording ${date}`);
