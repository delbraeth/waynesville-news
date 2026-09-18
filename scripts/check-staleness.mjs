// Report how fresh every data source is, so an outage is visible the day it
// starts rather than weeks later.
//
// The staleness ceilings in scripts/lib/stale-cache.mjs stop stale data from
// being *published*, but silence is still silence: a section quietly vanishing
// from the brief looks much like a slow news day. This prints the age of every
// source against its ceiling so the daily run surfaces it.
//
// Always exits 0 — a dead source must never block publishing the brief.
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { CEILINGS } from "./lib/stale-cache.mjs";

const DATA = new URL("../src/data/", import.meta.url);

const files = (await readdir(DATA)).filter((f) => f.endsWith(".json")).sort();
const rows = [];

for (const f of files) {
  const label = f.replace(/\.json$/, "");
  const ceiling = CEILINGS[label];
  let d;
  try {
    d = JSON.parse(await readFile(new URL(f, DATA), "utf8"));
  } catch {
    rows.push({ label, age: null, ceiling, state: "UNREADABLE", count: "-" });
    continue;
  }
  const count = Array.isArray(d?.items) ? d.items.length
    : Array.isArray(d?.results) ? `${d.results.length}+${d.upcoming?.length ?? 0}`
    : d?.item ? 1 : "-";
  // lastGoodUpdated survives the expiry rewrite; `updated` does not.
  const u = d?.lastGoodUpdated ? new Date(d.lastGoodUpdated) : d?.updated ? new Date(d.updated) : null;
  if (!u || isNaN(u)) {
    rows.push({ label, age: null, ceiling, state: ceiling ? "NO TIMESTAMP" : "static", count });
    continue;
  }
  const age = (Date.now() - u.getTime()) / 86400000;
  let state = "ok";
  if (ceiling != null) {
    if (d?.sourceDownSince || age > ceiling) state = "EXPIRED";
    else if (age > ceiling * 0.7) state = "aging";
    // A ceiling-bearing source that parsed fine but produced nothing is not
    // self-evidently healthy — it looks identical to a silently broken scrape.
    else if (count === 0) state = "empty?";
  }
  rows.push({ label, age, ceiling, state, count });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("source", 22)}${pad("age", 9)}${pad("ceiling", 9)}${pad("items", 8)}state`);
for (const r of rows) {
  console.log(
    pad(r.label, 22) +
      pad(r.age == null ? "-" : `${r.age.toFixed(1)}d`, 9) +
      pad(r.ceiling == null ? "-" : `${r.ceiling}d`, 9) +
      pad(r.count, 8) +
      r.state
  );
}

const bad = rows.filter((r) => ["EXPIRED", "UNREADABLE", "NO TIMESTAMP"].includes(r.state));
const aging = rows.filter((r) => r.state === "aging");
console.log("");
if (bad.length) {
  console.log(`ATTENTION: ${bad.length} source(s) past their ceiling or unreadable — ` +
    `${bad.map((r) => r.label).join(", ")}. Those sections are being omitted from the brief.`);
}
if (aging.length) {
  console.log(`Watch: ${aging.map((r) => `${r.label} (${r.age.toFixed(1)}d)`).join(", ")} approaching the ceiling.`);
}
if (!bad.length && !aging.length) console.log("All sources fresh.");
