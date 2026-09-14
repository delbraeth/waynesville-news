import { getCollection } from "astro:content";
import { marked } from "marked";

// Split a brief's markdown body into its H2 sections: [{ heading, body }].
function splitSections(md) {
  const out = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (cur) out.push(cur);
      cur = { heading: m[1], body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }));
}

// Is a section worth showing in a feed, or is it a "nothing to report" filler line?
function isSubstantive(md) {
  const text = md
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_>[\]()`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 25) return false;
  if (/^(no |none|nothing|there (were|are|is) no|no active|no new|no items|no reported)/i.test(text)) return false;
  return true;
}

// Build a reverse-chronological feed of the given H2 sections across every
// published (non-demo) brief. Each item carries the brief's date + id (for the
// permalink), the section heading, and the section rendered to HTML.
export async function sectionFeed(headings, { limit = 20 } = {}) {
  const want = new Set(headings.map((h) => h.toLowerCase()));
  const briefs = (await getCollection("briefs"))
    .filter((b) => b.data.published && !b.data.demo)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const items = [];
  for (const b of briefs) {
    for (const s of splitSections(b.body)) {
      if (!want.has(s.heading.toLowerCase())) continue;
      if (!isSubstantive(s.body)) continue;
      items.push({
        date: b.data.date,
        id: b.id,
        heading: s.heading,
        html: marked.parse(s.body),
      });
    }
  }
  return items.slice(0, limit);
}
