import { getCollection } from "astro:content";

// The site is in "demo mode" until the first real (non-demo) brief is published.
// In demo mode we show the sample brief + placeholder homepage sections + the
// DEMO banner. The moment a real brief goes live, all of that scaffolding drops
// away automatically and the demo brief stops appearing in listings.
export async function getPublicBriefs() {
  const published = (await getCollection("briefs")).filter((b) => b.data.published);
  const real = published.filter((b) => !b.data.demo);
  const isDemoMode = real.length === 0;
  const briefs = (isDemoMode ? published : real).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  return { briefs, isDemoMode };
}

// The archive lists only recent editions. Older brief pages still build, so
// links in past newsletter emails keep working; they just drop off the list.
export const ARCHIVE_DAYS = 14;
export function recentBriefs(briefs, days = ARCHIVE_DAYS, now = new Date()) {
  // Today in Eastern time (en-CA formats as YYYY-MM-DD), as UTC midnight to
  // match how brief dates are parsed from frontmatter.
  const today = new Date(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now));
  const cutoff = today.getTime() - days * 86400000;
  return briefs.filter((b) => b.data.date.getTime() > cutoff);
}
