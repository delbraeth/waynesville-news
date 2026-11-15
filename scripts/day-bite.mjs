// Daily info bite for the audio brief: one or two short sentences read right
// after "Good morning, Waynesville! It's <day>." See src/data/day-bites.json
// for the fixed-date lines and the order things are picked in.
//
//   node scripts/day-bite.mjs [YYYY-MM-DD] [days]   print the bites for a range
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../src/data/day-bites.json", import.meta.url), "utf8"));

// Waynesville, Ohio (same point the weather uses).
const LAT = 39.5287, LON = -84.0891, TZ = "America/New_York";

const utcNoon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);

// nth weekday (0 = Sunday) of a month; n = -1 for the last one.
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = utcNoon(y, m, 1);
    return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = utcNoon(y, m + 1, 0);
  return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
}

// Western Easter (anonymous Gregorian algorithm).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcNoon(y, month, day);
}

const thanksgiving = (y) => nthWeekday(y, 11, 4, 4);

function ruleHolidays(y) {
  const tg = thanksgiving(y);
  const dstStart = nthWeekday(y, 3, 0, 2), dstEnd = nthWeekday(y, 11, 0, 1);
  const electionDay = addDays(nthWeekday(y, 11, 1, 1), 1); // Tuesday after the first Monday
  return new Map([
    [iso(nthWeekday(y, 1, 1, 3)), "Today is Martin Luther King Jr. Day."],
    [iso(nthWeekday(y, 2, 1, 3)), "Today is Presidents' Day."],
    [iso(addDays(dstStart, -1)), "Don't forget: clocks spring forward an hour tonight. You'll lose an hour of sleep, but gain some evening daylight."],
    [iso(dstStart), "Clocks sprang forward overnight, so if the oven clock looks wrong, that's why."],
    [iso(addDays(easter(y), -2)), "Today is Good Friday."],
    [iso(easter(y)), "Happy Easter, Waynesville!"],
    [iso(nthWeekday(y, 5, 0, 2)), "Happy Mother's Day to all the moms out there!"],
    [iso(nthWeekday(y, 5, 1, -1)), "Today is Memorial Day, honoring the men and women who died serving our country."],
    [iso(nthWeekday(y, 6, 5, 1)), "It's National Donut Day. You have our permission."],
    [iso(nthWeekday(y, 6, 0, 3)), "Happy Father's Day to all the dads out there!"],
    [iso(nthWeekday(y, 7, 0, 3)), "It's National Ice Cream Day, the best kind of holiday."],
    [iso(nthWeekday(y, 9, 1, 1)), "Happy Labor Day! Enjoy the long weekend."],
    [iso(nthWeekday(y, 10, 1, 2)), "Today is Columbus Day and Indigenous Peoples' Day."],
    [iso(addDays(dstEnd, -1)), "Reminder: clocks fall back an hour tonight. Enjoy the extra hour of sleep."],
    [iso(dstEnd), "Clocks fell back overnight, so you may have gotten an extra hour of sleep."],
    [iso(electionDay), "It's Election Day in Ohio. Polls are open from 6:30 a.m. to 7:30 p.m."],
    [iso(addDays(tg, -1)), "Safe travels to everyone heading somewhere for Thanksgiving tomorrow."],
    [iso(tg), "Happy Thanksgiving, Waynesville! We're thankful for every one of you."],
    [iso(addDays(tg, 1)), "It's Black Friday. If you're shopping, think local first."],
    [iso(addDays(tg, 2)), "It's Small Business Saturday, a great day to shop Waynesville's stores."],
    [iso(addDays(tg, 5)), "It's Giving Tuesday, a day to support the local causes you care about."],
  ]);
}

function countdown(dt) {
  const y = dt.getUTCFullYear();
  const xmas = utcNoon(y, 12, 25), tg = thanksgiving(y);
  const toXmas = daysBetween(dt, xmas), toTg = daysBetween(dt, tg);
  if (dt > addDays(tg, 0) && toXmas >= 2) return `And Christmas is only ${toXmas} days away.`;
  if (toXmas === 1) return "";
  if (toTg >= 2 && toTg <= 7) return `Thanksgiving is ${toTg} days away.`;
  return "";
}

// Sunrise and sunset: NOAA's solar calculator equations (Julian-century form),
// iterated once at each event, so times are good to about a minute.
function solarEvent(dt, rising) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const midnightUtc = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  const calc = (minutesUtc) => {
    const jd = (midnightUtc + minutesUtc * 60000) / 86400000 + 2440587.5;
    const T = (jd - 2451545) / 36525;
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * rad) * 0.000289;
    const omega = 125.04 - 1934.136 * T;
    const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * rad);
    const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
    const yv = Math.tan((eps / 2) * rad) ** 2;
    const eqt = 4 * deg * (yv * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * yv * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * yv * yv * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
    const ha = deg * Math.acos(Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl));
    return 720 - 4 * (LON + (rising ? ha : -ha)) - eqt;
  };
  let t = calc(720);
  t = calc(t);
  return new Date(midnightUtc + t * 60000);
}
function sunTimes(dt) {
  const rise = solarEvent(dt, true), set = solarEvent(dt, false);
  return { rise, set, daylightMin: (set - rise) / 60000 };
}

const clock = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(" AM", " a.m.").replace(" PM", " p.m.");

function sunBite(dt) {
  const { rise, set, daylightMin } = sunTimes(dt);
  const total = Math.round(daylightMin), h = Math.floor(total / 60), m = total % 60;
  const mins = m === 0 ? "" : ` and ${m} minute${m === 1 ? "" : "s"}`;
  return `The sun rises at ${clock(rise)} and sets at ${clock(set)}, for ${h} hours${mins} of daylight.`;
}

export function dayBite(date) {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = utcNoon(y, mo, d);
  let fixed = data.fixed?.[date.slice(5)];
  if (Array.isArray(fixed)) fixed = fixed[y % fixed.length];
  const main = ruleHolidays(y).get(date) || fixed || "";
  const count = countdown(dt);
  if (main) return [main, count].filter(Boolean).join(" ");
  if (count) return count.replace(/^And /, "");
  return sunBite(dt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const start = process.argv[2] || new Date().toISOString().slice(0, 10);
  const n = Number(process.argv[3] || 1);
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const day = iso(addDays(utcNoon(y, m, d), i));
    console.log(`${day}  ${dayBite(day)}`);
  }
}
