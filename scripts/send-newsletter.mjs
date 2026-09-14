// Send today's published brief to subscribers via the Buttondown API.
//
// Runs as the LAST step of the daily workflow, after the brief is published
// and pushed (so links in the email resolve to a live page). The brief is
// already Markdown; Buttondown renders it. Never sends a draft, a demo, or an
// unfilled scaffold, and never sends the same edition twice.
//
// Requires BUTTONDOWN_API_KEY in the environment — set it in the daily task
// alongside the GitHub token. It is never read from, or written to, the repo.
// Fail-safe: any error logs and exits 0 so the workflow never fails on email.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const SITE = "https://waynesville.news";
const API = "https://api.buttondown.com/v1/emails";
const STATE = new URL("src/data/newsletter-sent.json", root);

const key = process.env.BUTTONDOWN_API_KEY;
const headers = { Authorization: `Token ${key}`, "Content-Type": "application/json" };

async function main() {
  if (!key) { console.log("newsletter: BUTTONDOWN_API_KEY not set — skipping send"); return; }

  // Today's brief, dated in Eastern time (same rule as draft-brief.mjs).
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const path = new URL(`src/content/briefs/${iso}.md`, root);
  if (!existsSync(path)) { console.log(`newsletter: no brief for ${iso} — nothing to send`); return; }

  const raw = await readFile(path, "utf8");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!fm) { console.log("newsletter: brief has no front-matter — skipping"); return; }
  const [, head, bodyRaw] = fm;
  const get = (k) => {
    const m = new RegExp(`^${k}:\\s*(.*)$`, "m").exec(head);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  const title = get("title");
  const dek = get("dek");

  // Hard gates — the email must only ever carry a real, finished, public edition.
  if (get("published") !== "true") { console.log("newsletter: brief is not published — skipping"); return; }
  if (get("demo") === "true") { console.log("newsletter: demo brief — skipping"); return; }
  if (/TODO\s+—/.test(bodyRaw)) { console.log("newsletter: brief still has TODO placeholders — skipping"); return; }
  if (!title) { console.log("newsletter: brief has no title — skipping"); return; }

  // Idempotency, checked against Buttondown itself (survives fresh clones and
  // same-day re-runs): skip if an email with this exact subject already exists.
  const list = await fetch(`${API}?page_size=50`, { headers });
  if (list.ok) {
    const data = await list.json();
    const existing = (data.results ?? []).find((e) => (e.subject ?? "").trim() === title.trim());
    if (existing) { console.log(`newsletter: "${title}" already sent (${existing.status}) — skipping`); return; }
  } else {
    console.log(`newsletter: could not list existing emails (HTTP ${list.status}) — proceeding with local check only`);
    try {
      const st = JSON.parse(await readFile(STATE, "utf8"));
      if (st.lastSent === iso) { console.log(`newsletter: ${iso} already sent per local state — skipping`); return; }
    } catch { /* no state yet */ }
  }

  // Prepare the Markdown for email: strip editor comments, make site-relative
  // links absolute so they work in an inbox, add a web-version footer.
  const webUrl = `${SITE}/briefs/${iso}/`;
  const md = bodyRaw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\]\(\//g, `](${SITE}/`)
    .trim();
  const emailBody = [
    dek ? `*${dek}*\n` : "",
    md,
    "",
    "---",
    `[Read this edition on the web](${webUrl}) · [Waynesville Daily Brief](${SITE})`,
  ].join("\n");

  const res = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify({ subject: title, body: emailBody, status: "about_to_send" }),
  });
  if (!res.ok) {
    console.error(`newsletter: Buttondown API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }

  await writeFile(STATE, JSON.stringify({ lastSent: iso, sentAt: new Date().toISOString(), subject: title }, null, 2) + "\n");
  console.log(`newsletter: sent "${title}" to subscribers`);
}

main().catch((e) => {
  console.error("newsletter send failed:", e.message);
}).finally(() => process.exit(0)); // never fail the workflow over email
