// Feature-story graphic for each published story flagged `feature: true`:
// /cards/feature/<story id>.png (see renderFeatureCard in src/lib/brief-card.js).
import { getPublishedStories } from "../../../lib/stories.js";
import { renderFeatureCard } from "../../../lib/brief-card.js";

export async function getStaticPaths() {
  const stories = (await getPublishedStories()).filter((s) => s.data.feature && !s.data.breaking);
  return stories.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export async function GET({ props }) {
  const png = await renderFeatureCard(props.entry);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
}
