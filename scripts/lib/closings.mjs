// Shared test for "is this school post about today's schedule changing?"
//
// Used on Wayne Local's district-news listing (scripts/fetch-closings.mjs) and
// on the district's Facebook posts (scripts/draft-brief.mjs), so a delay or
// closing is lifted to the top of the brief whichever channel posts it first.
//
// Deliberately narrow: a false alarm at the top of the brief ("schools
// closed!") does more harm than a miss, which still shows in the Schools
// section. Board meetings that are "cancelled" are not schedule changes.
const SCHEDULE = /\b(2|two)[- ]hour delay\b|\bdelay(ed)? (start|opening)\b|\bschools? (are|is|will be) closed\b|\b(wls|wayne local|schools?|district|all buildings)\b[^.!?]{0,30}\b(closed|on a (2|two)[- ]hour delay)\b|\bclosed (today|tomorrow|on (mon|tues|wednes|thurs|fri|satur|sun)day)\b|\bno school\b|\bearly (dismissal|release)\b|\bcalamity day\b|\b(remote|virtual|e-?learning|blizzard bag) (learning )?day\b|\bschool closing\b|\bclosings?\b.*\b(weather|snow|ice)\b|\b(weather|snow|ice)\b.*\b(closed|closing|delay)\b/i;
const NOT_SCHEDULE = /\b(board|special) meeting\b|\bbudget hearing\b/i;

export const isScheduleChange = (text = "") => SCHEDULE.test(text) && !NOT_SCHEDULE.test(text);

// Posts older than this aren't about this morning. A delay is usually posted
// the evening before or before 6 AM, so 36 hours covers both.
export const CLOSING_WINDOW_HOURS = 36;
