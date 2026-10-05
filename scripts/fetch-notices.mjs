// Official notices from the Village of Waynesville and Wayne Township:
// water main breaks, flushing, public hearings, road closures, hiring.
//
// - Village: https://www.villageofwaynesville.org/news/ (proprietary CMS, no
//   RSS — the listing HTML is parsed; newest first).
// - Township: WordPress REST API on waynetwpwarrencooh.gov.
//
// Both post only a few times a month, so the window is generous. Titles and
// synopses are the issuing government's own words, reproduced verbatim
// (entities decoded, tags stripped, trimmed to length) — never paraphrased.
import { writeFile } from "node:fs/promises";
import { keepOrExpire } from "./lib/stale-cache.mjs";

const OUT = new URL("../src/data/notices.json", import.meta.url);
const UA = { "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news)" };
const VILLAGE_URL = "https://www.villageofwaynesville.org/news/";
const TOWNSHIP_URL = "https://waynetwpwarrencooh.gov/wp-json/wp/v2/posts?per_page=10&_fields=id,date,link,title,excerpt";
const LOOKBACK_DAYS = 14;

const decode = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;| /g, " ").replace(/&hellip;|&#8230;/g, "…")
    .replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;|&#0?39;|&apos;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&lt;|&gt;|[<>]/g, "")
    .replace(/\s*\[…\]\s*$/, "…")
    .replace(/\s+/g, " ").trim();
const clip = (s, n = 400) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);
// Strip tracking params so links are stable across runs.
const cleanLink = (u) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => k.startsWith("utm_")).forEach((k) => x.searchParams.delete(k)); return x.toString(); } catch { return u; } };

const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cutoff = new Date(Date.parse(`${todayET}T12:00:00Z`) - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

async function getText(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

async function fetchVillage() {
  const html = await getText(VILLAGE_URL);
  const re = /class="anchBlogTitle" href="([^"]+)">([^<]+)<\/a>[\s\S]*?divBlogDateDetail-date">([^<]+)<[\s\S]*?blog-synopsis[^>]*>([\s\S]*?)<\/div>/g;
  const rows = [...html.matchAll(re)];
  // The page always lists past posts; zero rows means the markup changed.
  if (rows.length === 0) throw new Error("village news markup not found — parse failed, not a quiet month");
  return rows
    .map(([, href, title, dateText, synopsis]) => {
      const m = dateText.trim().toUpperCase().match(/^([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
      const dateISO = m && MONTHS[m[1]] ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
      return { source: "village", issuer: "Village of Waynesville", title: decode(title), dateISO, summary: clip(decode(synopsis)), link: cleanLink(href) };
    })
    .filter((i) => i.dateISO && i.dateISO >= cutoff);
}

async function fetchTownship() {
  const posts = JSON.parse(await getText(TOWNSHIP_URL));
  if (!Array.isArray(posts)) throw new Error("township posts response was not a list");
  return posts
    .map((p) => ({
      source: "township",
      issuer: "Wayne Township",
      title: decode(p.title?.rendered),
      dateISO: String(p.date ?? "").slice(0, 10),
      summary: clip(decode(p.excerpt?.rendered)),
      link: cleanLink(p.link),
    }))
    .filter((i) => i.dateISO >= cutoff);
}

const write = (data, note) =>
  writeFile(OUT, JSON.stringify({ _note: note, updated: new Date().toISOString(), ...data }, null, 2) + "\n");

async function main() {
  const [village, township] = await Promise.allSettled([fetchVillage(), fetchTownship()]);
  if (village.status === "rejected") console.error("notices: village failed:", village.reason.message);
  if (township.status === "rejected") console.error("notices: township failed:", township.reason.message);
  if (village.status === "rejected" && township.status === "rejected") throw new Error("both notice sources failed");

  const items = [...(village.value ?? []), ...(township.value ?? [])].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  await write(
    { items, sources: { village: village.status === "fulfilled" ? VILLAGE_URL : "FAILED", township: township.status === "fulfilled" ? "https://waynetwpwarrencooh.gov/" : "FAILED" } },
    `Village of Waynesville and Wayne Township notices posted in the past ${LOOKBACK_DAYS} days. Titles and synopses verbatim from each government's own site.`,
  );
  console.log(`notices.json: ${village.value?.length ?? "failed"} village, ${township.value?.length ?? "failed"} township notice(s) in the past ${LOOKBACK_DAYS} days`);
}

main().catch(async (e) => {
  console.error("notices refresh failed:", e.message);
  await keepOrExpire({ out: OUT, label: "notices", writeEmpty: async (note) => { await write({ items: [] }, note); } });
  process.exit(0); // don't fail the workflow
});
