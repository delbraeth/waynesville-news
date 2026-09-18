// Pre-build guard: refuse to build (and therefore to deploy) if any brief
// marked `published: true` still contains draft scaffolding — a TODO
// placeholder or the `<!-- UNPUBLISHED -->` instruction comment. The
// publish pipeline is fully automated with no human review step, so this
// turns the failure mode "placeholder text goes live on waynesville.news"
// into "the build fails and nothing deploys."
import { readFile, readdir } from "node:fs/promises";
import { briefProblems } from "./lib/brief-gate.mjs";

const dir = new URL("../src/content/briefs/", import.meta.url);
const problems = [];

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
  const text = await readFile(new URL(file, dir), "utf8");
  problems.push(...briefProblems(text, file));
}

if (problems.length) {
  console.error("check-briefs FAILED — draft scaffolding in published brief(s):");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check-briefs OK: no draft scaffolding in published briefs");
