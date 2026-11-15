// Breaking-news graphic for each published story flagged `breaking: true`:
// /cards/breaking/<story id>.png (see renderBreakingCard in src/lib/brief-card.js).
import { getPublishedStories } from "../../../lib/stories.js";
import { renderBreakingCard } from "../../../lib/brief-card.js";

export async function getStaticPaths() {
  const stories = (await getPublishedStories()).filter((s) => s.data.breaking);
  return stories.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export async function GET({ props }) {
  const png = await renderBreakingCard(props.entry);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
}
