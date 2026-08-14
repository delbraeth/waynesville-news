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
