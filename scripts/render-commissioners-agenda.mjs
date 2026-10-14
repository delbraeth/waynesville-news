// Render page 1 of the NEXT Warren County Commissioners meeting's agenda as a
// PNG, so the daily Claude run can read the agenda summary and mention it in
// the brief's Local government section.
//
// Why an image: the county posts scanned PDFs with no text layer (see
// fetch-commissioners.mjs), so there is nothing to extract. Page 1 is a
// one-page summary of the session — times, "For Consideration" items, public
// hearings, executive sessions. The remaining pages are resolutions and
// attachments and are not rendered.
//
// Only agendas dated today or later (Eastern) are rendered. That previews the
// upcoming meeting once the county posts it, and stops on its own after the
// meeting day, so no "already summarized" state is needed.
//
// Output goes to the OS temp dir, never the repo. Prints one line per page:
//   AGENDA <YYYY-MM-DD> <label|-> <png path> <pdf url>
// or "NO AGENDA ..." when there is nothing to read. Always exits 0.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const DATA = new URL("../src/data/commissioners.json", import.meta.url);
const OUT_DIR = join(tmpdir(), "commissioners-agenda");

const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

async function main() {
  let items = [];
  try {
    items = JSON.parse(await readFile(DATA, "utf8")).items ?? [];
  } catch {
    console.log("NO AGENDA: commissioners.json missing or unreadable — run refresh:commissioners first");
    return;
  }

  // Items are newest first; pick the earliest meeting date on or after today.
  const upcoming = items
    .filter((i) => i.dateISO.slice(0, 10) >= todayET && i.agendas?.length)
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))[0];
  if (!upcoming) {
    console.log(`NO AGENDA: nothing posted yet for a meeting on or after ${todayET}`);
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const day = upcoming.dateISO.slice(0, 10);

  for (const [n, doc] of upcoming.agendas.entries()) {
    try {
      const res = await fetch(doc.link, {
        headers: { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pdf = join(OUT_DIR, `agenda-${day}-${n + 1}.pdf`);
      await writeFile(pdf, Buffer.from(await res.arrayBuffer()));
      const prefix = join(OUT_DIR, `agenda-${day}-${n + 1}`);
      // -singlefile: write <prefix>.png with no page-number suffix.
      await run("pdftoppm", ["-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", pdf, prefix]);
      console.log(`AGENDA ${day} ${doc.label ?? "-"} ${prefix}.png ${doc.link}`);
    } catch (e) {
      const why = e.code === "ENOENT" ? "pdftoppm not installed" : e.message;
      console.log(`NO AGENDA: ${day} ${doc.label ?? ""} could not be rendered (${why}) — ${doc.link}`);
    }
  }
}

main().catch((e) => console.log(`NO AGENDA: ${e.message}`));
