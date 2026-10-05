// Trim a published brief's Markdown body down to an email-friendly edition.
//
// The web page keeps everything; the inbox gets the readable core. This only
// removes or shortens material — it never adds or rewrites facts:
//   - "Check:" source lists (bare URLs meant for editors)
//   - "Source:" lines
//   - "From … on Facebook" post dumps (the narrative already covers them)
//   - JV results and fixtures (varsity only)
//   - any bullet list longer than MAX_ITEMS, capped with a link to the full
//     section on the web (sports results keep the most recent, which the
//     brief lists last)
// Each section's heading id matches the anchor Astro gives it on the site.
const MAX_ITEMS = 4;

const slug = (s) =>
  s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function formatForEmail(md, webUrl) {
  const out = [];
  let anchor = "";
  let skipping = null; // "check" | "facebook"
  let items = [];
  let keepLatest = false;

  const flushList = () => {
    const hidden = items.length - MAX_ITEMS;
    if (hidden > 0) {
      const link = `[see the full list](${webUrl}#${anchor})`;
      if (keepLatest) out.push(`- *${hidden} earlier — ${link}*`, ...items.slice(-MAX_ITEMS));
      else out.push(...items.slice(0, MAX_ITEMS), `- *…and ${hidden} more — ${link}*`);
    } else {
      out.push(...items);
    }
    items = [];
  };

  for (const line of md.split("\n")) {
    const isItem = /^- /.test(line);
    const isIndentedItem = /^\s+- /.test(line);

    // Leaving a skipped block: an indented "Check:" list ends at the first
    // non-indented line; a Facebook block ends at the next bold label,
    // heading, or non-list paragraph.
    if (skipping === "check" && !isIndentedItem) skipping = null;
    if (skipping === "facebook" && !isItem && line.trim() !== "") skipping = null;
    if (skipping) continue;

    if (!isItem) flushList();

    const h = /^## (.+)$/.exec(line);
    if (h) anchor = slug(h[1]);
    if (!isItem && line.trim() !== "") keepLatest = /^\*\*Results\*\*/.test(line);

    if (/^\*\*From .+ on Facebook\*\*/.test(line)) { skipping = "facebook"; continue; }
    if (/^Source:/.test(line)) continue;
    if (/^Check:\s*$/.test(line)) { skipping = "check"; continue; }
    if (/\sCheck:\s*$/.test(line)) {
      out.push(line.replace(/\s*Check:\s*$/, ""));
      skipping = "check";
      continue;
    }

    if (isItem) {
      if (/\(JV\)/.test(line)) continue;
      items.push(line);
      continue;
    }
    out.push(line);
  }
  flushList();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
