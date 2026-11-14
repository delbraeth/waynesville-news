// One header graphic per published brief: /cards/<YYYY-MM-DD>.png (see src/lib/brief-card.js).
import { getPublicBriefs } from "../../lib/briefs.js";
import { renderBriefCard } from "../../lib/brief-card.js";

export async function getStaticPaths() {
  const { briefs } = await getPublicBriefs();
  return briefs.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export async function GET({ props }) {
  const png = await renderBriefCard(props.entry);
  return new Response(png, { headers: { "Content-Type": "image/png" } });
}
