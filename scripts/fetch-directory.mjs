// Build the local business directory (src/data/directory.json) from the
// Waynesville Area Chamber of Commerce's public member directory
// (waynesvilleohio.com/directory/), merged with hand-added listings from
// src/data/directory-manual.json.
//
// What is copied, and only as the Chamber publishes it: business name,
// location, phone, website, and the Chamber's own one-paragraph description.
// What is deliberately NOT copied: contact names (private individuals),
// email addresses, hours (go stale fast), logos and images.
//
// Chamber categories are regrouped into the directory's own sections, with
// service businesses first, with churches in their own section. Government
// offices, schools and individual memberships are left out.
//
// The directory changes slowly, so this runs on demand / monthly, not daily.
// On any failure the existing directory.json is kept untouched.
import { readFile, writeFile } from "node:fs/promises";
import { checkUrl } from "./lib/link-check.mjs";

const BASE = "https://www.waynesvilleohio.com/directory/";
const OUT = new URL("../src/data/directory.json", import.meta.url);
const MANUAL = new URL("../src/data/directory-manual.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (WaynesvilleDailyBrief/1.0; waynesville.news)" };
const DELAY_MS = 1_000; // be polite: one request a second
const TOTAL_BUDGET_MS = 12 * 60_000;

// Chamber category slug prefix -> our section. Order of SECTIONS is the order
// on the page (places to eat first, then services). Anything unmapped is skipped.
export const SECTIONS = [
  { id: "food", label: "Restaurants, food & drink" },
  { id: "home", label: "Home, construction & trades" },
  { id: "auto", label: "Automotive" },
  { id: "health", label: "Health, wellness & beauty" },
  { id: "pro", label: "Professional & financial services" },
  { id: "realestate", label: "Real estate & moving" },
  { id: "tech", label: "Technology, media & printing" },
  { id: "shop", label: "Shopping & specialty retail" },
  { id: "stay", label: "Places to stay" },
  { id: "venues", label: "Event venues & party rentals" },
  { id: "fun", label: "Arts, recreation & experiences" },
  { id: "farm", label: "Farms & agriculture" },
  { id: "pets", label: "Pets & veterinary" },
  { id: "faith", label: "Churches & places of worship" },
  { id: "other", label: "Other services" },
];
const CATEGORY_MAP = [
  [/^construction/, "home"],
  [/^home-/, "home"],
  [/^automotive/, "auto"],
  [/^transportation/, "auto"],
  [/^health/, "health"],
  [/^accounting/, "pro"],
  [/^legal/, "pro"],
  [/^finance/, "pro"],
  [/^business-/, "pro"],
  [/^real-estate/, "realestate"],
  [/^computer/, "tech"],
  [/^advertising/, "tech"],
  [/^restaurants/, "food"],
  [/^shopping/, "shop"],
  [/^lodging/, "stay"],
  [/^hotels?/, "stay"],
  [/^event/, "venues"],
  [/^arts/, "fun"],
  [/^hands-on/, "fun"],
  [/^sports/, "fun"],
  [/^attractions/, "fun"],
  [/^agriculture/, "farm"],
  [/^pets/, "pets"],
  [/^religious/, "faith"],
  [/^public-utilities/, "other"],
  [/^personal/, "other"],
  [/^manufacturing/, "other"],
  [/^industrial/, "other"],
];
// Not businesses, or not a useful grouping.
const SKIP = [/^a-to-z/, /^government/, /^family/, /^non-?profit/, /^education/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&[lr]dquo;/g, '"').replace(/&lsquo;/g, "'").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// Everything here ends up in rendered HTML via Astro (escaped), but keep it clean anyway.
const clean = (s) => text(s).replace(/[<>]/g, "");

let lastFetch = 0;
async function get(url) {
  const wait = lastFetch + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

const slugOf = (url) => decodeURIComponent(url.replace(BASE, "").split("/")[0]).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sectionFor = (slug) => {
  if (SKIP.some((re) => re.test(slug))) return null;
  for (const [re, id] of CATEGORY_MAP) if (re.test(slug)) return id;
  return null;
};

// "Waynesville area" = the village and the surrounding townships/ZIPs we cover.
const LOCAL_RE = /\b(waynesville|corwin|harveysburg|oregonia|ridgeville|lytle|mount holly|crosswick|45068|45054|45065)\b/i;
export const isLocal = (loc = "") => LOCAL_RE.test(loc);

function normalizeUrl(u) {
  if (!u) return "";
  u = decode(u).trim();
  if (u.includes("@")) return ""; // an email typed into the website field — never publish it
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  try {
    const p = new URL(u);
    if (!/^https?:$/.test(p.protocol)) return "";
    return p.toString();
  } catch {
    return "";
  }
}

// Social links on hand-added listings: { facebook, instagram, tiktok, airbnb }.
// Accepts a full URL or an @handle; anything else is dropped. Only the
// platforms listed here render on the directory page.
const SOCIAL_BASE = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  airbnb: "https://www.airbnb.com/rooms/",
};
function normalizeSocial(social) {
  if (!social || typeof social !== "object") return undefined;
  const out = {};
  for (const [k, base] of Object.entries(SOCIAL_BASE)) {
    let v = (social[k] ?? "").trim();
    if (!v) continue;
    if (/^@?[A-Za-z0-9._-]+$/.test(v)) v = base + v.replace(/^@/, "");
    // Not normalizeUrl(): its email guard would reject TikTok's /@handle URLs.
    if (!/^https?:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
    try {
      const u = new URL(v);
      if (/^https?:$/.test(u.protocol) && !u.username) out[k] = u.toString();
    } catch { /* not a URL — drop it */ }
  }
  return Object.keys(out).length ? out : undefined;
}

async function main() {
  const started = Date.now();
  const home = await get(BASE);
  const catLinks = [...new Set(
    [...home.matchAll(/href="(https:\/\/www\.waynesvilleohio\.com\/directory\/[^"\/]+-\d+\/)"/g)].map((m) => m[1])
  )];
  if (catLinks.length < 5) throw new Error(`only ${catLinks.length} categories found — page layout changed?`);

  // listing id -> record
  const byId = new Map();
  const unmapped = new Set();

  for (const catUrl of catLinks) {
    const slug = slugOf(catUrl);
    const section = sectionFor(slug);
    if (!section) {
      if (!SKIP.some((re) => re.test(slug))) unmapped.add(slug);
      continue;
    }
    const catHtml = await get(catUrl);
    const subRe = new RegExp(`href="(${catUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"\\/]+-\\d+\\/)" class="sidemenu-subcategory[^"]*">([^<]+)`, "g");
    const subs = [...new Map([...catHtml.matchAll(subRe)].map((m) => [m[1], decode(m[2]).trim()])).entries()];
    const pages = subs.length ? subs : [[catUrl, ""]];

    for (const [pageUrl, subLabel] of pages) {
      if (Date.now() - started > TOTAL_BUDGET_MS) throw new Error("time budget exceeded");
      const html = pageUrl === catUrl ? catHtml : await get(pageUrl);
      const table = /<table class="tableListingTable">([\s\S]*?)<\/table>/.exec(html)?.[1] ?? "";
      for (const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
        const id = /directory\/listing\/(\d+)/.exec(row[1])?.[1];
        if (!id || cells.length < 3) continue;
        const name = clean(cells[0]);
        if (!name) continue;
        const rec = byId.get(id) ?? {
          id: `chamber-${id}`,
          name,
          location: clean(cells[1]),
          phone: clean(cells[2]),
          sections: [],
          kinds: [],
          source: `${BASE}listing/${id}`,
        };
        if (!rec.sections.includes(section)) rec.sections.push(section);
        if (subLabel && !rec.kinds.includes(subLabel)) rec.kinds.push(subLabel);
        byId.set(id, rec);
      }
    }
  }

  // Detail pages: website + the Chamber's description.
  for (const rec of byId.values()) {
    if (Date.now() - started > TOTAL_BUDGET_MS) break; // keep what we have; details are optional
    try {
      const html = await get(rec.source);
      const site = /<span class="label">Website:<\/span>[\s\S]*?<a href="([^"]+)"/.exec(html)?.[1];
      rec.website = normalizeUrl(site);
      const desc = /<div class="descriptionValue[^"]*">([\s\S]*?)<\/div>/.exec(html)?.[1];
      if (desc) {
        let d = clean(desc);
        // Never republish email addresses or phone-number-laden prose from descriptions.
        d = d.replace(/\S+@\S+\.\S+/g, "")
          .replace(/\b(e?fax|ph(one)?|tel|cell)\s*[:#]?\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b/gi, "")
          .replace(/\s{2,}/g, " ").replace(/^[\s,.;:-]+/, "").trim();
        if (d.length > 280) d = d.slice(0, 277).replace(/\s+\S*$/, "") + "…";
        rec.about = d;
      }
    } catch {
      /* listing page failed — keep the row-level fields */
    }
  }

  const chamber = [...byId.values()].map((r) => ({ ...r, local: isLocal(r.location), from: "chamber" }));
  if (chamber.length < 20) throw new Error(`only ${chamber.length} Chamber listings parsed — refusing to overwrite`);
  await writeMerged(chamber);
  if (unmapped.size) console.log(`directory: unmapped Chamber categories skipped: ${[...unmapped].join(", ")}`);
}

// "Smith's Plumbing, LLC" and "Smiths Plumbing" are the same business.
const nameKey = (n = "") =>
  n.toLowerCase().replace(/&/g, "and").replace(/\b(llc|inc|co|corp|ltd|the)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

// Names in directory-manual.json "exclude" (closed, moved away, or asked to be
// removed) are dropped from the Chamber data too, so a full refresh can't
// bring them back.
async function loadExcludes() {
  try {
    const ex = JSON.parse(await readFile(MANUAL, "utf8")).exclude ?? [];
    return new Set(ex.map((e) => nameKey(typeof e === "string" ? e : e.name)).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function loadManual() {
  let raw = [];
  try {
    raw = JSON.parse(await readFile(MANUAL, "utf8")).items ?? [];
  } catch {
    return [];
  }
  const out = [];
  for (const m of raw) {
    if (!m?.name) continue;
    const sections = (m.sections ?? []).filter((id) => SECTION_IDS.has(id));
    if (!sections.length) {
      console.log(`directory: manual listing "${m.name}" has no valid section — skipped`);
      continue;
    }
    out.push({
      id: m.id || `manual-${nameKey(m.name)}`,
      name: clean(m.name),
      location: clean(m.location ?? ""),
      phone: clean(m.phone ?? ""),
      sections,
      kinds: (m.kinds ?? []).map(clean).filter(Boolean),
      source: m.source ?? "",
      website: normalizeUrl(m.website ?? ""),
      ...(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((m.email ?? "").trim()) ? { email: m.email.trim() } : {}),
      social: normalizeSocial(m.social),
      about: clean(m.about ?? ""),
      ...ownerHours(m),
      local: m.local ?? isLocal(m.location),
      from: "manual",
    });
  }
  return out;
}

// Hours are only published when the business owner supplied them (editor,
// 2026-11-07): "hours" is one plain-text line and "hoursChecked" the date the
// owner gave or confirmed it. Without that date the line is dropped, so hours
// scraped from listing sites can't slip in. Works on manual listings and on
// "recategorize" entries (for Chamber listings).
function ownerHours(m) {
  const hours = clean(m?.hours ?? "");
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(m?.hoursChecked ?? "") ? m.hoursChecked : "";
  if (hours && !checked) console.log(`directory: "${m.name}" has hours but no hoursChecked date — hours left off`);
  return hours && checked ? { hours, hoursChecked: checked } : {};
}

// A listing whose website no longer exists keeps the listing but loses the
// link: readers shouldn't be sent to a dead domain. Only clear-cut failures
// count — the domain doesn't resolve, or the site answers 404/410. Bot blocks
// (403, 429, timeouts) are left alone, since the site is there for a browser.
async function dropDeadWebsites(items) {
  const dead = [];
  let i = 0;
  const check = async (it) => {
    if (!it.website) return;
    const { result, detail } = await checkUrl(it.website);
    if (result === "dead") { dead.push(`${it.name} (${it.website}: ${detail})`); it.website = ""; }
  };
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < items.length) await check(items[i++]); }));
  if (dead.length) console.log(`directory: removed ${dead.length} dead website link(s): ${dead.join("; ")}`);
}

// Some Chamber descriptions open with "Additional Contact: <person> <phone>".
// We don't publish contact people, so cut that lead-in back to where the
// business description starts; if no clear start is found, drop the text.
export function stripContactNames(about = "", name = "") {
  if (!/^\s*additional contacts?:/i.test(about)) return about;
  const first = (name.match(/[A-Za-z']+/) || [""])[0];
  const starts = [" The ", " At ", " Our ", " We ", " Comprehensive "];
  if (first.length > 2) starts.push(` ${first} `);
  const idx = starts.map((w) => about.indexOf(w)).filter((n) => n >= 0);
  return idx.length ? about.slice(Math.min(...idx) + 1).trim() : "";
}

// directory-manual.json "recategorize": [{ name, sections }] moves a listing
// (usually a Chamber one) to different sections without retyping the listing.
async function loadRecategorize() {
  try {
    const m = JSON.parse(await readFile(MANUAL, "utf8"));
    // Each entry may fix sections, kinds (the tags shown under the name) and/or
    // about, for a Chamber listing whose categories or description are wrong.
    return new Map((m.recategorize ?? [])
      .filter((r) => r?.name && (Array.isArray(r.sections) || Array.isArray(r.kinds) || typeof r.about === "string" || typeof r.phone === "string" || r.group || r.hours))
      .map((r) => [nameKey(r.name), r]));
  } catch { return new Map(); }
}

async function writeMerged(chamber) {
  const manual = await loadManual();
  const excluded = await loadExcludes();
  const keys = new Set(manual.map((m) => nameKey(m.name)));
  const recat = await loadRecategorize();
  const items = [...manual, ...chamber.filter((c) => !keys.has(nameKey(c.name)))]
    .filter((i) => !excluded.has(nameKey(i.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const it of items) {
    it.about = stripContactNames(it.about, it.name);
    const fix = recat.get(nameKey(it.name));
    if (fix?.sections) it.sections = fix.sections.filter((id) => SECTIONS.some((s) => s.id === id));
    if (fix?.kinds) it.kinds = fix.kinds;
    if (typeof fix?.about === "string") it.about = fix.about;
    if (fix?.group) it.group = fix.group;
    if (typeof fix?.phone === "string") it.phone = fix.phone;
    if (fix?.hours) Object.assign(it, ownerHours(fix));
  }
  await dropDeadWebsites(items);
  await writeFile(
    OUT,
    JSON.stringify({
      _note: "Local business directory. Built by scripts/fetch-directory.mjs from the Waynesville Area Chamber of Commerce's public member directory (name, location, phone, website, and the Chamber's description, as published) plus hand-added listings in directory-manual.json. Contact names, emails and hours are deliberately not copied from the Chamber; an hours line appears only when the owner supplied it (hours + hoursChecked in directory-manual.json). Do not edit by hand — edit directory-manual.json and re-run `npm run refresh:directory` (or `npm run refresh:directory -- --manual-only` to merge manual edits without re-reading the Chamber site).",
      updated: new Date().toISOString(),
      sections: SECTIONS,
      items,
    }, null, 2) + "\n"
  );
  const local = items.filter((i) => i.local).length;
  console.log(`directory.json: ${items.length} listing(s) (${local} in the Waynesville area; ${manual.length} manual)`);
}

// --manual-only: re-merge directory-manual.json into the existing file,
// reusing the Chamber listings already there. Seconds instead of minutes.
async function manualOnly() {
  const current = JSON.parse(await readFile(OUT, "utf8"));
  const chamber = (current.items ?? []).filter((i) => i.from === "chamber");
  if (chamber.length < 20) throw new Error("existing directory.json has too few Chamber listings — run a full refresh");
  await writeMerged(chamber);
}

(process.argv.includes("--manual-only") ? manualOnly() : main()).catch((e) => {
  console.error(`directory refresh failed, keeping existing directory.json: ${e.message}`);
  process.exit(0);
});
