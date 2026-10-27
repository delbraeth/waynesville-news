// Decide whether the newsletter workflow should try to send today's edition,
// and hand it what verify-live needs. Writes key=value lines to $GITHUB_OUTPUT
// (or stdout when run by hand):
//
//   send=true|false   false when there's nothing to do (no brief, unpublished,
//                     demo, or already sent) so the workflow skips the
//                     8-minute live check entirely
//   date=YYYY-MM-DD   today in Eastern time (same rule as send-newsletter.mjs)
//   url=...           the brief's public page
//   marker=...        a fragment of the headline that appears verbatim in the
//                     page HTML, so a cached older page can't pass as today's
//
// The real gates (publish gate, Buttondown duplicate check) stay in
// send-newsletter.mjs; this only avoids pointless waiting.
import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const iso = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const out = { send: "false", date: iso, url: `https://waynesville.news/briefs/${iso}/`, marker: "" };

async function decide() {
  const path = new URL(`src/content/briefs/${iso}.md`, root);
  if (!existsSync(path)) return `no brief for ${iso}`;
  const raw = await readFile(path, "utf8");
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
  const get = (k) => (new RegExp(`^${k}:\\s*(.*)$`, "m").exec(head)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  if (get("published") !== "true") return "brief is not published";
  if (get("demo") === "true") return "demo brief";
  try {
    const st = JSON.parse(await readFile(new URL("src/data/newsletter-sent.json", root), "utf8"));
    if (st.lastSent === iso) return `${iso} already sent`;
  } catch { /* no record yet */ }

  // Astro HTML-escapes & < > " ' in the title, so use the longest stretch of
  // the headline free of those characters as the marker.
  const title = get("title");
  out.marker = title.split(/[&<>"']/).map((s) => s.trim()).sort((a, b) => b.length - a.length)[0] ?? "";
  out.send = "true";
  return `ready to send "${title}"`;
}

const reason = await decide();
console.log(`newsletter-preflight: ${reason}`);
const lines = Object.entries(out).map(([k, v]) => `${k}=${v.replace(/\r?\n/g, " ")}`).join("\n") + "\n";
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, lines);
else process.stdout.write(lines);
