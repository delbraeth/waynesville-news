// Drop Facebook posts that only promote events which have already happened.
//
// The FB bridges return the latest posts regardless of what they announce, so
// a "Hydroplane Races are this weekend" post kept appearing in the brief days
// after the races. A post is treated as past when it mentions at least one
// date and EVERY date it mentions is before today (ET). Posts with no dates
// (general news) or with any date today or later are kept.

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

// Calendar day in Eastern time as a UTC-midnight Date, so comparisons are by day.
const etDay = (d) => {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// A month/day with no year belongs to the year that puts it nearest the post.
function withYear(month, day, posted, year) {
  if (year) return new Date(Date.UTC(year < 100 ? 2000 + year : year, month, day));
  const y = posted.getUTCFullYear();
  const cands = [y - 1, y, y + 1].map((yy) => new Date(Date.UTC(yy, month, day)));
  return cands.reduce((a, b) => (Math.abs(b - posted) < Math.abs(a - posted) ? b : a));
}

export function mentionedDates(text, postedAt) {
  const posted = etDay(postedAt);
  const t = text.toLowerCase();
  const out = [];

  // "Oct. 2", "October 2 and 3", "October 1 - 31", "Oct 2, 2026"
  const monthRe = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*(?:-|–|—|to|through|and|&)\s*(\d{1,2})(?!\d))?(?:,?\s+(\d{4}))?/g;
  for (const m of t.matchAll(monthRe)) {
    const month = MONTHS[m[1]];
    const year = m[4] ? Number(m[4]) : undefined;
    for (const d of [m[2], m[3]]) {
      const day = Number(d);
      if (d && day >= 1 && day <= 31) out.push(withYear(month, day, posted, year));
    }
  }

  // "10/3/26", "10/3"
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g)) {
    const month = Number(m[1]) - 1, day = Number(m[2]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      out.push(withYear(month, day, posted, m[3] ? Number(m[3]) : undefined));
    }
  }

  // Relative phrases, anchored to the day the post went up.
  if (/\b(today|tonight)\b/.test(t)) out.push(posted);
  if (/\btomorrow\b/.test(t)) out.push(addDays(posted, 1));
  if (/\bthis weekend\b/.test(t)) out.push(addDays(posted, (7 - posted.getUTCDay()) % 7)); // that Sunday
  for (const m of t.matchAll(/\bthis (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
    out.push(addDays(posted, (WEEKDAYS[m[1]] - posted.getUTCDay() + 7) % 7));
  }
  return out;
}

// Look-back wording from a page recapping an event that just ended ("Our event
// was moving… shout out of THANKS…"). Such posts name no dates, so the date
// test above can't see they're over. Kept deliberately narrow: only phrasing
// that is unambiguously retrospective, and only applied when the post also
// names no date today or later.
const RECAP = [
  /\b(?:event|program|night|weekend|day)\s+(?:was|were)\s+(?:moving|eye[- ]opening|amazing|wonderful|fantastic|a (?:great|huge) success)\b/,
  /\bshout[- ]out of thanks\b/,
  /\bwe will do this event again\b/,
  /\bthank(?:s| you) to everyone who (?:came|joined|attended|participated|helped)\b/,
];

export function isPastEventPost(post, now = new Date()) {
  const postedAt = new Date(post.date);
  if (Number.isNaN(postedAt.getTime())) return false;
  const text = `${post.title ?? ""} ${post.excerpt ?? ""}`;
  const dates = mentionedDates(text, postedAt);
  if (!dates.length) {
    const t = text.toLowerCase().replace(/[’‘]/g, "'");
    return RECAP.some((re) => re.test(t));
  }
  const today = etDay(now);
  return dates.every((d) => d < today);
}

export const dropPastEventPosts = (posts, now = new Date()) => posts.filter((p) => !isPastEventPost(p, now));
