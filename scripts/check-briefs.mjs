// Pre-build guard: refuse to build (and therefore to deploy) if any brief
// marked `published: true` still contains draft scaffolding — a TODO
// placeholder or the `<!-- UNPUBLISHED -->` instruction comment. The
// publish pipeline is fully automated with no human review step, so this
// turns the failure mode "placeholder text goes live on waynesville.news"
// into "the build fails and nothing deploys."
import { readFile, readdir } from "node:fs/promises";

const dir = new URL("../src/content/briefs/", import.meta.url);
const problems = [];

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
  const text = await readFile(new URL(file, dir), "utf8");
  // Only frontmatter `published: true` counts — the instruction comment in
  // unpublished drafts mentions the literal string "published: true", so
  // check the frontmatter block only (between the first pair of --- lines).
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  if (!/^published:\s*true\s*$/m.test(fm)) continue;

  if (/\bTODO\b/.test(text)) problems.push(`${file}: contains a TODO placeholder`);
  if (text.includes("<!--")) problems.push(`${file}: contains an HTML comment (draft instructions?)`);
}

if (problems.length) {
  console.error("check-briefs FAILED — draft scaffolding in published brief(s):");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check-briefs OK: no draft scaffolding in published briefs");
