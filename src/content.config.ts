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

export const collections = { briefs };
