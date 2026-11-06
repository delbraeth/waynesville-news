// Monthly upkeep check for the resource center (/resources/, data in
// src/data/resources.json) and the church directory (/churches/, data in
// src/data/churches.json) and community organizations (/community/, data in
// src/data/organizations.json). Read-only: it changes nothing, it reports.
//
//  - Dead links: every link, links[].url and source URL is tested with the
//    same rule the directory uses (scripts/lib/link-check.mjs): dead only when
//    the domain is gone or the page answers 404/410.
//  - Stale entries: entries whose `verified` date is older than STALE_DAYS
//    need a human to re-check them against the office's own page.
//
// Exits 1 when anything needs attention, so the monthly GitHub Action shows a
// red X and GitHub emails the repo owner. Links that couldn't be checked
// (blocked, timed out) are listed but don't fail the run.
//
//   npm run check:resources            # report
//   npm run check:resources -- --days 60
import { readFile, appendFile } from "node:fs/promises";
import { checkUrl } from "./lib/link-check.mjs";

const FILE = new URL("../src/data/resources.json", import.meta.url);
const argDays = process.argv.indexOf("--days");
const STALE_DAYS = argDays > 0 ? Number(process.argv[argDays + 1]) : 90;

const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const ageDays = (iso) => Math.floor((Date.parse(`${todayET}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86400000);

const CHURCHES = new URL("../src/data/churches.json", import.meta.url);
const data = JSON.parse(await readFile(FILE, "utf8"));
const churches = JSON.parse(await readFile(CHURCHES, "utf8"));
const visit = JSON.parse(await readFile(new URL("../src/data/visit.json", import.meta.url), "utf8"));
const orgs = JSON.parse(await readFile(new URL("../src/data/organizations.json", import.meta.url), "utf8"));
const entries = [
  ...(data.sections ?? []).flatMap((s) => (s.items ?? []).map((it) => ({ ...it, section: s.title }))),
  // Church directory (/churches/): website plus each source URL.
  ...(churches.items ?? []).map((c) => ({ ...c, section: "Churches", link: c.website, source: undefined, links: (c.source ?? []).map((url) => ({ url })) })),
  // Visiting Waynesville (/visit/): website, outside links and sources.
  ...(visit.sections ?? []).flatMap((s) => (s.items ?? []).map((it) => ({ ...it, section: `Visit: ${s.title}`, link: it.website, source: undefined,
    links: [...(it.links ?? []).map((l) => l.url).filter((u) => /^https?:/.test(u)), ...(it.source ?? [])].map((url) => ({ url })) }))),
  // Community organizations (/community/): website, Facebook and sources.
  ...(orgs.items ?? []).map((o) => ({ ...o, section: "Community organizations", link: o.website, source: undefined, links: [o.facebook, ...(o.source ?? [])].filter(Boolean).map((url) => ({ url })) })),
];

// url -> the entries that use it (one fetch per distinct URL)
const uses = new Map();
for (const e of entries) {
  const urls = [e.link, e.source, ...(e.links ?? []).map((l) => l.url)].filter(Boolean);
  for (const u of new Set(urls)) uses.set(u, [...(uses.get(u) ?? []), e.name]);
}

const results = [];
const queue = [...uses.keys()];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const url = queue.shift();
    // Small-town sites can be slow: allow 30s, and retry once before calling it unknown.
    let r = await checkUrl(url, { timeoutMs: 30_000 });
    if (r.result === "unknown") r = await checkUrl(url, { timeoutMs: 30_000 });
    results.push({ url, used: uses.get(url), ...r });
  }
}));

const dead = results.filter((r) => r.result === "dead");
const unknown = results.filter((r) => r.result === "unknown");
const stale = entries.filter((e) => !e.verified || ageDays(e.verified) > STALE_DAYS);

const lines = [`## Resource center check (${todayET})`, ""];
lines.push(`${entries.length} entries, ${uses.size} distinct links: ${results.filter((r) => r.result === "ok").length} ok, ${dead.length} dead, ${unknown.length} couldn't be checked, ${results.filter((r) => r.result === "skipped").length} skipped.`, "");
if (dead.length) {
  lines.push("### Dead links — fix in src/data/resources.json", "");
  for (const r of dead) lines.push(`- ${r.url} (${r.detail}) — used by: ${r.used.join("; ")}`);
  lines.push("");
}
if (stale.length) {
  lines.push(`### Not verified in the last ${STALE_DAYS} days — re-check against the source and update \`verified\``, "");
  for (const e of stale) lines.push(`- ${e.name} (${e.section}) — ${e.verified ? `verified ${e.verified}, ${ageDays(e.verified)} day${ageDays(e.verified) === 1 ? "" : "s"} ago` : "no verified date"}${e.source || e.link ? ` — ${e.source || e.link}` : ""}`);
  lines.push("");
}
if (unknown.length) {
  lines.push("### Couldn't check (blocked or timed out; open in a browser if it keeps showing up)", "");
  for (const r of unknown) lines.push(`- ${r.url} (${r.detail})`);
  lines.push("");
}
if (!dead.length && !stale.length) lines.push("Nothing needs attention.");

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report + "\n");
process.exit(dead.length || stale.length ? 1 : 0);
