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
    byline: z.string().default("Waynesville News"),
    image: z.string().optional(),            // path under /public, e.g. /images/stories/x.png
    imageAlt: z.string().optional(),
    imageCredit: z.string().optional(),
    published: z.boolean().default(false),
    // Podcast flag: true = read this story in the next daily episode (within a
    // week of its date); "YYYY-MM-DD" = read it in that day's episode. The
    // episode reads podcastText if given, otherwise the title and dek.
    podcast: z.union([z.boolean(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    podcastText: z.string().optional(),
    // Breaking news: true = also post this story to Facebook right away, as a
    // new item in /facebook.xml with a red "Breaking news" graphic
    // (/cards/breaking/<id>.png). breakingAt is the exact time it broke (ISO
    // with ET offset, e.g. 2026-11-15T11:50:00-05:00); it is the item's
    // pubDate and the time on the graphic. Defaults to `date`.
    breaking: z.boolean().default(false),
    breakingAt: z.coerce.date().optional(),
    // Feature story: true = also post this story to Facebook, as a new item in
    // /facebook.xml with a dark "Feature" graphic (/cards/feature/<id>.png) and
    // a plain caption (no "BREAKING"). For previews, profiles and other stories
    // that aren't urgent. featureAt (ISO with ET offset) is the item's pubDate;
    // defaults to `date`. Use breaking or feature, not both.
    feature: z.boolean().default(false),
    featureAt: z.coerce.date().optional(),
  }),
});

export const collections = { briefs, stories };
