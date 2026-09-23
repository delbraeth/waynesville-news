// Poll a URL until it returns HTTP 200, or give up. Used by the daily run to
// confirm Cloudflare has actually deployed today's brief before the newsletter
// goes out — the email is the one step that can't be undone, so it waits for
// proof of a live page rather than for a push that merely succeeded.
//
//   node scripts/verify-live.mjs <url> [maxSeconds=420] [intervalSeconds=15]
//
// Exit 0 on 200, exit 1 on timeout or on any final non-200. Also requires the
// page body to contain a marker (2nd arg after seconds) when one is given, so
// a cached 200 for an older page can't pass as today's.
const [url, maxArg = "420", intervalArg = "15", marker = ""] = process.argv.slice(2);
if (!url) { console.error("usage: verify-live.mjs <url> [maxSeconds] [intervalSeconds] [bodyMarker]"); process.exit(2); }
const max = Number(maxArg), interval = Number(intervalArg);
const t0 = Date.now();
let last = "n/a";
while ((Date.now() - t0) / 1000 < max) {
  try {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`, {
      redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "Cache-Control": "no-cache" },
    });
    last = String(r.status);
    if (r.status === 200) {
      if (!marker) { console.log(`verify-live: ${url} -> 200`); process.exit(0); }
      const body = await r.text();
      if (body.includes(marker)) { console.log(`verify-live: ${url} -> 200 with marker`); process.exit(0); }
      last = "200 (marker missing — stale page?)";
    }
  } catch (e) { last = e.name === "TimeoutError" ? "timeout" : e.message; }
  console.log(`verify-live: ${url} -> ${last}; retrying in ${interval}s`);
  await new Promise((r) => setTimeout(r, interval * 1000));
}
console.error(`verify-live: gave up after ${max}s — last result: ${last}`);
process.exit(1);
