// Read sign-up requirements out of an event description, for the calendar's
// "Sign up soon" reminders. Only what the text plainly says: "No registration
// required" → not required; "registration is required", "pre-register",
// "register by", "registration ... will begin on <date>" → required, with the
// opening or deadline date when one is written out. Returns null when the text
// says nothing about registering. Never copies the sentence itself (library
// descriptions can name staff and instructors); callers get structured fields.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = new RegExp(
  `(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+)?(${MONTHS.join("|")}|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  "i"
);
const OPEN_RE = /\b(begin|begins|opens?|starts?|starting|available)\b/i;
const BY_RE = /\b(by|before|deadline|no later than|closes?|ends?)\b/i;
const NOT_REQUIRED_RE = /\bno (pre-?)?registration (is )?(required|needed|necessary)\b|\bregistration (is )?not required\b|\bno need to register\b/i;
const SIGNUP_RE = /\b(pre-?register|register|registration|sign[- ]?up|rsvp)\b/i;

// Month/day written before the event → the most recent such date on or
// before the event (registration for a January program can open in December).
function toISO(m, eventISO) {
  if (!m) return null;
  const mon = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
  const day = Number(m[2]);
  if (mon < 0 || day < 1 || day > 31) return null;
  const ev = new Date(eventISO);
  let y = ev.getUTCFullYear();
  if (Date.UTC(y, mon, day) > ev.getTime() + 86_400_000) y -= 1;
  return `${y}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const dateAfter = (s, re, eventISO) => {
  const at = s.search(re);
  return at < 0 ? null : toISO(DATE_RE.exec(s.slice(at)), eventISO);
};

export function parseSignup(text = "", eventISO) {
  // Drop the dot from abbreviated months ("Dec. 3") so it doesn't end a sentence.
  const t = String(text).replace(/\s+/g, " ").replace(/\b(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\./gi, "$1");
  if (NOT_REQUIRED_RE.test(t)) return { required: false };
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => SIGNUP_RE.test(s));
  if (!sentences.length) return null;
  const out = { required: true };
  for (const s of sentences) {
    const opens = dateAfter(s, OPEN_RE, eventISO);
    const by = dateAfter(s, BY_RE, eventISO);
    if (opens && !out.opens) out.opens = opens;
    if (by && !out.deadline && by !== opens) out.deadline = by;
    if (/\bin[- ]person\b/i.test(s)) out.inPerson = true;
    const fee = /\$(\d+(?:\.\d\d)?)(\s+(deposit|fee))?/i.exec(s);
    if (fee && !out.cost) out.cost = `$${fee[1]}${fee[3] ? " " + fee[3].toLowerCase() : ""}`;
  }
  return out;
}
