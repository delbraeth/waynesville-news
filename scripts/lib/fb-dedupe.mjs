// Collapse Facebook posts that carry the same message.
//
// A page often publishes one announcement several ways — a text post, a reel,
// a longer post that bundles it with another note — and rss.app emits each as
// its own item with its own link and slightly different text. Comparing links
// can't catch that, so compare words instead: two posts are the same message
// when the shorter one's words are almost all present in the other. The fullest
// version survives, at the position of the first one seen (feeds are newest
// first, so that keeps the freshest slot).

const MIN_WORDS = 8; // below this, overlap is too easy to hit by accident
const THRESHOLD = 0.8; // share of the shorter post's words found in the other

const wordsOf = (p) =>
  new Set(
    `${p.title ?? ""} ${p.excerpt ?? ""}`
      .toLowerCase()
      .replace(/['’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );

const sameMessage = (a, b) => {
  if (a.size < MIN_WORDS || b.size < MIN_WORDS) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size) >= THRESHOLD;
};

export function dedupePosts(posts) {
  const kept = []; // { post, words }
  for (const post of posts) {
    const words = wordsOf(post);
    const dup = kept.find((k) => k.post.link === post.link || sameMessage(k.words, words));
    if (!dup) {
      kept.push({ post, words });
    } else if (words.size > dup.words.size) {
      dup.post = post;
      dup.words = words;
    }
  }
  return kept.map((k) => k.post);
}
