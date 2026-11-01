import { getCollection } from "astro:content";

// Published stories, newest first.
export async function getPublishedStories() {
  return (await getCollection("stories"))
    .filter((s) => s.data.published)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const storyHref = (s) => `/stories/${s.id}/`;
