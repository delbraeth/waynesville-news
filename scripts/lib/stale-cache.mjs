// Shared failure-path policy for the daily source fetchers.
//
// Every fetcher used to end with the same catch block: if the source is down,
// keep whatever was fetched last and exit 0. That is fine for a day. It is not
// fine indefinitely — an unbounded "keep the last good copy" turns a source
// outage into quietly publishing something untrue, because the brief goes on
// presenting stale data with the same confident wording as fresh data, and
// nobody finds out.
//
// That is exactly what happened to obituaries: stubbsconner.com went behind a
// Cloudflare challenge on ~Sep 7 2026, the fetcher republished its Sep 7 cache
// for ten days, and a Sep 2 obituary ran in fourteen consecutive briefs under a
// "past 7 days" heading while three actual deaths went unreported.
//
// So each source now declares how long its cache may outlive the source. Past
// that ceiling the data is dropped and the section disappears from the brief,
// which is the honest failure: better an absent section than a wrong one.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

// How long each source's cache may survive an outage, in days. Roughly: the
// tighter the recency a section claims, the tighter the ceiling. Forward-dated
// event lists self-expire as their dates pass, so they tolerate more; minutes
// are historical by nature and barely decay at all.
export const CEILINGS = {
  obituaries: 2,        // "past 7 days"; highest harm if wrong or missing
  "suggested-headlines": 2, // today's news
  sports: 2,            // results and upcoming games move daily
  "prosecutor-press": 3, // "released in the past week"
  "fb-schools": 3,      // recent district posts
  "library-events": 7,  // dated, forward-looking
  "shops-events": 7,    // dated, forward-looking
  "township-agendas": 10, // agendas post irregularly
  "village-minutes": 21,  // historical record; slow-moving by design
};

/**
 * Decide what to do with a cached data file when the live fetch has failed.
 *
 * @param {URL}      out           Path to the JSON data file.
 * @param {string}   label         Source key; also used for CEILINGS lookup.
 * @param {Function} writeEmpty    async (note) => void — writes this source's
 *                                 own "empty" shape with the supplied note.
 * @param {number}  [maxStaleDays] Override the table above.
 * @returns {Promise<"missing"|"expired"|"kept">}
 */
export async function keepOrExpire({ out, label, writeEmpty, maxStaleDays }) {
  const ceiling = maxStaleDays ?? CEILINGS[label] ?? 3;

  if (!existsSync(out)) {
    await writeEmpty(`${label} fetch failed and no cache exists; empty.`);
    return "missing";
  }

  let cached;
  try {
    cached = JSON.parse(await readFile(out, "utf8"));
  } catch {
    await writeEmpty(`${label} fetch failed and the cache was unreadable; empty.`);
    console.error(`${label.toUpperCase()}: cache unreadable — publishing empty`);
    return "expired";
  }

  const updated = new Date(cached?.updated ?? 0);
  const ageDays = (Date.now() - updated.getTime()) / 86400000;
  const known = isFinite(ageDays) && !isNaN(updated.getTime()) && updated.getTime() > 0;

  if (!known || ageDays > ceiling) {
    const since = known ? updated.toISOString().slice(0, 10) : "an unknown date";
    await writeEmpty(
      `${label} source unreachable since ${since}; cached data passed the ` +
        `${ceiling}-day staleness ceiling and was dropped rather than republished stale.`
    );
    console.error(
      `${label.toUpperCase()} STALE: last good fetch ${known ? `${ageDays.toFixed(1)} days ago` : "unknown"} ` +
        `(ceiling ${ceiling}d) — cache dropped; this section will be omitted from the brief. ` +
        `Anything published by the source since then is NOT being reported. Fix the source.`
    );
    return "expired";
  }

  console.error(
    `${label}: source down; keeping cache from ${ageDays.toFixed(1)}d ago (ceiling ${ceiling}d)`
  );
  return "kept";
}
