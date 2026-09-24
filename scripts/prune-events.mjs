// Drop dated events more than PAST_GRACE_DAYS days in the past from
// src/data/events.json. Evergreen entries and entries without a dateISO are
// always kept, as is anything whose endISO (multi-day events) is within the
// window. Recently past events stay in the file for a few days so they
// can still be referenced (recaps, "last weekend's ..."), but the site itself
// only renders events from today forward.
//
// Dates are compared as Eastern calendar dates, so an event on Sep 20 is
// "4 days old" all day on Sep 24 and is dropped starting Sep 25.
import { readFile, writeFile } from "node:fs/promises";

const PAST_GRACE_DAYS = 4;

const root = new URL("..", import.meta.url);
const path = new URL("src/data/events.json", root);

// en-CA formats as YYYY-MM-DD.
const etDate = (d) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(d);

const today = etDate(new Date());
const cutoffDate = new Date(`${today}T12:00:00Z`);
cutoffDate.setUTCDate(cutoffDate.getUTCDate() - PAST_GRACE_DAYS);
const cutoff = cutoffDate.toISOString().slice(0, 10);

const data = JSON.parse(await readFile(path, "utf8"));
const dropped = [];
data.items = data.items.filter((e) => {
  if (e.evergreen || !e.dateISO) return true;
  // Multi-day events carry an endISO; they age from their last day, so a
  // running event is never dropped.
  if (etDate(new Date(e.endISO ?? e.dateISO)) >= cutoff) return true;
  dropped.push(e);
  return false;
});

if (dropped.length) {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  for (const e of dropped) console.log(`dropped: ${e.dateISO.slice(0, 10)} ${e.title}`);
}
console.log(`prune-events: ${dropped.length} dropped (older than ${cutoff}), ${data.items.length} kept`);
