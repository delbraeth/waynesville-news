// Daily header graphic for a brief: a 1200x630 PNG (the Open Graph / Facebook
// link-preview size) with the masthead and edition date, the headline, an
// "Inside today" list of the three lead items (falls back to the dek), and
// today's weather line. Built at deploy time by src/pages/cards/[slug].png.js
// and used as the brief page's og:image and in the Facebook feed (/facebook.xml).
//
// satori lays out the text and turns it into SVG paths, then resvg rasterizes it,
// so no system fonts or browser are needed on the build machine. Fonts are read
// from src/assets/card-fonts relative to the project root (the build's cwd),
// because this module is bundled into dist/ before it runs.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const COLORS = {
  paper: "#fbf9f5",
  ink: "#1a1712",
  inkSoft: "#4a433a",
  muted: "#6b6255",
  rule: "#e5ddce",
  accent: "#9e2b25",
  chip: "#efe9dd",
};

let fontsPromise;
function loadFonts() {
  fontsPromise ??= Promise.all(
    [
      ["newsreader-latin-400-normal.woff", 400, "normal"],
      ["newsreader-latin-600-normal.woff", 600, "normal"],
      ["newsreader-latin-400-italic.woff", 400, "italic"],
    ].map(async ([file, weight, style]) => ({
      name: "Newsreader",
      data: await readFile(join(process.cwd(), "src/assets/card-fonts", file)),
      weight,
      style,
    })),
  );
  return fontsPromise;
}

// Minimal hyperscript for satori's React-element-shaped input.
const h = (type, style, ...children) => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined) },
});

// "**Today:** 47°F, Partly Sunny (high 47° / low 34°)" -> "47° · Partly Sunny · High 47° / Low 34°".
export function weatherLine(body = "") {
  const m = body.match(/\*\*Today:\*\*\s*([^\n]+)/);
  if (!m) return "";
  return m[1]
    .replace(/°F/g, "°")
    .replace(/^(\d+°),\s*/, "$1 · ")
    .replace(/\s*\(high ([^/]+?)\s*\/\s*low ([^)]+)\)/, " · High $1 / Low $2")
    .replace(/\s+/g, " ")
    .trim();
}

// The bold lead-in of each numbered item under "## This morning in Waynesville":
// '1. **Fantasy Festival downtown, 11 a.m. to 8 p.m.** The free...' -> 'Fantasy Festival downtown, 11 a.m. to 8 p.m.'
export function leadItems(body = "") {
  const sec = body.split(/^## This morning in Waynesville\s*$/m)[1];
  if (!sec) return [];
  const block = sec.split(/^## /m)[0];
  return [...block.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)]
    .map((m) => m[1].trim().replace(/(?<!\b[a-z]\.[a-z])[.:]$/i, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
});

function clip(s = "", max) {
  s = String(s).trim();
  if (s.length <= max) return s;
  return s.slice(0, s.lastIndexOf(" ", max - 1)).replace(/[,;:—-]+$/, "") + "…";
}

// Sized for a phone feed, where Facebook shows the card ~400–500px wide (about
// 40% scale): the smallest text here (30px) still reads at ~12px on screen.
function headlineSize(title, withList) {
  const n = title.length;
  if (withList) return n <= 50 ? 70 : n <= 80 ? 62 : 54;
  return n <= 45 ? 80 : n <= 70 ? 70 : n <= 95 ? 60 : 52;
}

export function cardTree({ title, dek, date, weather, leads = [] }) {
  const headline = clip(title, 110);
  const withList = leads.length >= 2;
  return h(
    "div",
    { width: CARD_WIDTH, height: CARD_HEIGHT, flexDirection: "column", backgroundColor: COLORS.paper, fontFamily: "Newsreader", color: COLORS.ink },
    // Masthead band: brand on the left, the edition date on the right, so the
    // body can go straight to the news.
    h(
      "div",
      { backgroundColor: COLORS.accent, color: "#fff", padding: "22px 60px", justifyContent: "space-between", alignItems: "center" },
      h("div", { fontSize: 36, fontWeight: 600, letterSpacing: 0.5 }, "Waynesville Daily Brief"),
      h("div", { fontSize: 30 }, dateFmt.format(date)),
    ),
    // Body
    h(
      "div",
      { flexDirection: "column", flexGrow: 1, padding: withList ? "30px 60px 0" : "44px 60px 0" },
      h("div", { fontSize: headlineSize(headline, withList), fontWeight: 600, lineHeight: 1.06, letterSpacing: -0.5 }, headline),
      withList
        ? h(
            "div",
            { flexDirection: "column", marginTop: 22, paddingTop: 16, borderTop: `3px solid ${COLORS.accent}`, width: "100%" },
            h("div", { fontSize: 24, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: COLORS.accent, marginBottom: 6 }, "Inside today"),
            leads.map((t, i) =>
              h(
                "div",
                { alignItems: "baseline", fontSize: 36, lineHeight: 1.36, color: COLORS.inkSoft },
                h("div", { color: COLORS.accent, fontWeight: 600, width: 40, flexShrink: 0 }, String(i + 1)),
                h("div", { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 1030 }, clip(t, 54)),
              ),
            ),
          )
        : dek
          ? h("div", { fontSize: 32, fontStyle: "italic", color: COLORS.inkSoft, lineHeight: 1.3, marginTop: 24 }, clip(dek, 200))
          : null,
    ),
    // Footer
    h(
      "div",
      { borderTop: `2px solid ${COLORS.rule}`, margin: "0 60px", padding: "16px 0 24px", justifyContent: "space-between", alignItems: "center", fontSize: 30, color: COLORS.muted },
      weather
        ? h("div", { backgroundColor: COLORS.chip, color: COLORS.ink, borderRadius: 8, padding: "6px 16px" }, weather)
        : h("div", {}, "Waynesville, Ohio"),
      h("div", { fontWeight: 600, color: COLORS.accent }, "waynesville.news"),
    ),
  );
}

const cache = new Map();

// brief: an astro:content entry from the briefs collection.
export function renderBriefCard(brief) {
  if (!cache.has(brief.id)) {
    cache.set(
      brief.id,
      (async () => {
        const svg = await satori(
          cardTree({
            title: brief.data.title, dek: brief.data.dek, date: brief.data.date,
            weather: weatherLine(brief.body), leads: leadItems(brief.body),
          }),
          { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: await loadFonts() },
        );
        return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
      })(),
    );
  }
  return cache.get(brief.id);
}

export const cardPath = (id) => `/cards/${id}.png`;

// Breaking-news graphic for a story flagged `breaking: true`: same size and
// fonts as the daily card, with a red "Breaking news" band, the time it broke,
// the headline and the dek. Used in /facebook.xml and as the story's og:image.
const timeFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
});
export const breakingTime = (story) => story.data.breakingAt ?? story.data.date;

// Keep "7 p.m." / "10 a.m." together on one line.
const keepTimes = (s = "") => String(s).replace(/(\d) (a\.m\.|p\.m\.)/g, "$1\u00a0$2");

export function breakingCardTree({ title, dek, when }) {
  return storyCardTree({ title, dek, when, label: "Breaking news", band: "#c0201a", dot: true });
}

// Shared layout for story graphics (breaking and feature): a colored band with a
// label and a time or date, then the headline and dek.
function storyCardTree({ title, dek, when, label, band, dot }) {
  title = keepTimes(title);
  dek = dek && keepTimes(dek);
  const headline = clip(title, 110);
  const n = headline.length;
  const size = n <= 40 ? 84 : n <= 65 ? 74 : n <= 90 ? 64 : 56;
  return h(
    "div",
    { width: CARD_WIDTH, height: CARD_HEIGHT, flexDirection: "column", backgroundColor: COLORS.paper, fontFamily: "Newsreader", color: COLORS.ink },
    h(
      "div",
      { backgroundColor: band, color: "#fff", padding: "20px 60px", justifyContent: "space-between", alignItems: "center" },
      h(
        "div",
        { alignItems: "center", fontSize: 44, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase" },
        dot ? h("div", { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", marginRight: 18 }) : null,
        label,
      ),
      h("div", { fontSize: 30 }, when),
    ),
    h(
      "div",
      { flexDirection: "column", flexGrow: 1, padding: "40px 60px 0" },
      h("div", { fontSize: size, fontWeight: 600, lineHeight: 1.06, letterSpacing: -0.5 }, headline),
      dek
        ? h("div", { fontSize: 34, color: COLORS.inkSoft, lineHeight: 1.3, marginTop: 26, paddingTop: 20, borderTop: `3px solid ${dot ? band : COLORS.accent}`, width: "100%" }, clip(dek, 170))
        : null,
    ),
    h(
      "div",
      { borderTop: `2px solid ${COLORS.rule}`, margin: "0 60px", padding: "16px 0 24px", justifyContent: "space-between", alignItems: "center", fontSize: 30, color: COLORS.muted },
      h("div", { fontWeight: 600, color: COLORS.ink }, "Waynesville News"),
      h("div", { fontWeight: 600, color: COLORS.accent }, "waynesville.news"),
    ),
  );
}

const breakingCache = new Map();
// story: an astro:content entry from the stories collection.
export function renderBreakingCard(story) {
  if (!breakingCache.has(story.id)) {
    breakingCache.set(
      story.id,
      (async () => {
        const svg = await satori(
          breakingCardTree({ title: story.data.title, dek: story.data.dek, when: timeFmt.format(breakingTime(story)) }),
          { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: await loadFonts() },
        );
        return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
      })(),
    );
  }
  return breakingCache.get(story.id);
}

export const breakingCardPath = (id) => `/cards/breaking/${id}.png`;

// Feature-story graphic for a story flagged `feature: true` (a preview, profile
// or other non-urgent story the editor wants on Facebook): same layout as the
// breaking card, but with a dark "Feature" band (plus the story's section, if
// any), no alert dot, and the date instead of a time.
const featureDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York",
});
export const featureTime = (story) => story.data.featureAt ?? story.data.date;
// A bare `date` (YYYY-MM-DD) is midnight UTC, so show it in UTC to keep the day.
const featureDateLabel = (story) =>
  story.data.featureAt
    ? featureDateFmt.format(story.data.featureAt)
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(story.data.date);

export function featureCardTree({ title, dek, when, section }) {
  return storyCardTree({ title, dek, when, label: section ? `Feature · ${section}` : "Feature", band: COLORS.ink, dot: false });
}

const featureCache = new Map();
export function renderFeatureCard(story) {
  if (!featureCache.has(story.id)) {
    featureCache.set(
      story.id,
      (async () => {
        const svg = await satori(
          featureCardTree({ title: story.data.title, dek: story.data.dek, section: story.data.section, when: featureDateLabel(story) }),
          { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: await loadFonts() },
        );
        return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
      })(),
    );
  }
  return featureCache.get(story.id);
}

export const featureCardPath = (id) => `/cards/feature/${id}.png`;
