import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Each daily brief is a Markdown file in src/content/briefs/.
// `published: false` = hidden from the site (a draft). Flip it to true to go live.
const briefs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/briefs" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    dek: z.string().optional(),
    demo: z.boolean().default(false),
    published: z.boolean().default(false),
  }),
});

// Standalone articles (src/content/stories/YYYY-MM-DD-slug.md): explainers,
// features, follow-ups that outgrow a brief item. Same publish gate as briefs
// (scripts/check-briefs.mjs): published: false = hidden draft.
const stories = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/stories" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    dek: z.string().optional(),
    section: z.string().optional(),          // e.g. "Local government" — shown as the kicker
    byline: z.string().default("Waynesville Daily Brief"),
    image: z.string().optional(),            // path under /public, e.g. /images/stories/x.png
    imageAlt: z.string().optional(),
    imageCredit: z.string().optional(),
    published: z.boolean().default(false),
  }),
});

export const collections = { briefs, stories };
