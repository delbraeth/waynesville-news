// The single definition of "this brief is not fit to publish".
//
// It used to live in two places that disagreed: check-briefs.mjs (which gates
// the BUILD) tested /\bTODO\b/ over the whole file, while send-newsletter.mjs
// (which gates the EMAIL) tested /TODO\s+—/ over the body only. Anything that
// tripped one but not the other — a TODO in the title, "TODO: confirm", the
// instruction comment (whose text is "fill each TODO with...", no em dash) —
// emailed subscribers an edition whose web page never deployed, so the
// "read this on the web" link 404'd. One list, both callers.

/**
 * @param {string} raw      Full file contents, frontmatter included.
 * @param {string} filename e.g. "2026-09-18.md"
 * @returns {string[]}      Human-readable problems; empty means publishable.
 */
export function briefProblems(raw, filename) {
  const problems = [];

  // Tolerate CRLF: the old LF-only pattern failed to match a CRLF file, which
  // made check-briefs skip it entirely — a published brief full of raw
  // scaffolding was never validated at all.
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!fm) return [`${filename}: no parseable frontmatter`];
  const [, head, body] = fm;

  const field = (k) => {
    const m = new RegExp(`^${k}:\\s*(.*)$`, "m").exec(head);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };

  if (!/^published:\s*true\s*$/m.test(head)) return []; // not published; not our problem

  if (/\bTODO\b/i.test(raw)) problems.push(`${filename}: contains a TODO placeholder`);
  if (raw.includes("<!--")) problems.push(`${filename}: contains an HTML comment (draft instructions?)`);

  const title = field("title");
  if (!title) problems.push(`${filename}: has no title`);
  if (/\bTODO\b/i.test(title)) problems.push(`${filename}: title is still a placeholder`);

  // An automation that dies after writing frontmatter leaves a valid-looking
  // file with nothing in it. That used to pass both gates and get emailed.
  if (body.replace(/<!--[\s\S]*?-->/g, "").trim().length < 200) {
    problems.push(`${filename}: body is empty or too short to be a real edition`);
  }

  // A missing URL renders as "](undefined)" — a 404 under an authoritative label.
  if (/\]\(\s*(undefined|null)?\s*\)/.test(body)) {
    problems.push(`${filename}: contains a broken or empty link`);
  }

  // One mistyped date pins a future-dated brief to the top of the homepage,
  // the archive and the RSS feed indefinitely.
  // Filenames are the edition date, optionally suffixed (e.g. "-demo").
  const stem = (/^(\d{4}-\d{2}-\d{2})/.exec(filename) ?? [])[1] ?? "";
  const date = field("date");
  if (date && stem && date !== stem) {
    problems.push(`${filename}: frontmatter date (${date}) does not match the filename`);
  }

  return problems;
}
