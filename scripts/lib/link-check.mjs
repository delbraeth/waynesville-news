// Shared dead-link test, used by the directory refresh (dropDeadWebsites) and
// the resource center check. A link is "dead" only on clear evidence: the
// domain no longer resolves, or the server answers 404/410. Timeouts, blocks
// (403, bot challenges) and other errors are "unknown" — never treated as dead.
import { lookup } from "node:dns/promises";

// ohiodnr.gov answers servers with a fake 404 (verified 2026-11-01: the same
// pages load fine in a browser), so never judge it by status code.
export const FAKE_404_HOSTS = ["ohiodnr.gov"];

const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };

/** @returns {Promise<{ result: "ok" | "dead" | "unknown" | "skipped", detail: string }>} */
export async function checkUrl(url, { timeoutMs = 15_000 } = {}) {
  let host;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { result: "skipped", detail: `${u.protocol} link` };
    host = u.hostname;
  } catch { return { result: "unknown", detail: "not a valid URL" }; }
  if (FAKE_404_HOSTS.some((h) => host === h || host.endsWith("." + h))) return { result: "skipped", detail: `${host} can't be checked by status` };
  try { await lookup(host); } catch (e) {
    return e.code === "ENOTFOUND" ? { result: "dead", detail: "domain gone" } : { result: "unknown", detail: `DNS ${e.code}` };
  }
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (r.status === 404 || r.status === 410) return { result: "dead", detail: String(r.status) };
    return r.ok ? { result: "ok", detail: String(r.status) } : { result: "unknown", detail: `HTTP ${r.status}` };
  } catch (e) {
    return { result: "unknown", detail: e.name === "TimeoutError" ? "timed out" : e.message };
  }
}
