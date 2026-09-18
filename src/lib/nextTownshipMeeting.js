// Compute the next Wayne Township Trustees meeting at build time. Trustees
// meet the 1st and 3rd Tuesday of each month at 7:00 PM ET, per the
// township's posted minutes/agendas schedule. Same fixed-label approach as
// nextMeeting.js (Warren County Commissioners) — good enough for a display
// label, not meant to handle rare rescheduled/canceled meetings.

// Hours to ADD to an Eastern wall-clock hour to get UTC: 4 under EDT, 5 under
// EST. Derived from the zone itself rather than hardcoded, so the DST
// transition needs no code change.
function etOffsetHours(year, monthIndex, day) {
  const probe = new Date(Date.UTC(year, monthIndex, day, 17, 0, 0));
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "longOffset",
  }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 5;
  const hrs = Number(m[2]) + Number(m[3]) / 60;
  return m[1] === "-" ? hrs : -hrs;
}

function firstAndThirdTuesdays(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  const dow = d.getUTCDay();
  const firstTuesday = 1 + ((2 - dow + 7) % 7);
  return [firstTuesday, firstTuesday + 14];
}

export function nextTownshipMeeting(now = new Date()) {
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();

  for (let i = 0; i < 3; i++) { // this month, then up to 2 more if needed
    const days = firstAndThirdTuesdays(year, month);
    for (const day of days) {
      // 7:00 PM Eastern. The old hardcoded 23:00 UTC is 7 PM only under EDT;
      // under EST (from Nov 1 2026) 7 PM ET is 00:00 UTC the NEXT day, so a
      // build between 6 and 7 PM on a meeting night rolled the meeting forward
      // and told residents the next one was two weeks away while it was about
      // to start. Derive the offset actually in effect on that date.
      const target = new Date(Date.UTC(year, month, day, 19 + etOffsetHours(year, month, day), 0, 0));
      if (target.getTime() > now.getTime()) {
        // Label in Eastern, not UTC: under EST the 7 PM instant is 00:00 UTC
        // the following day, so a UTC label printed the wrong weekday and date.
        const label = target.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
        });
        return {
          body: 'Wayne Township Trustees',
          when: target.toISOString(),
          whenLabel: `${label} · 7:00 PM`,
          location: '6050 N. Clarksville Rd., Waynesville',
          source: 'https://www.waynetownship.us/minutes-agendas/agendas-2026/',
        };
      }
    }
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  // Should never happen, but keep a safe fallback rather than throwing.
  return {
    body: 'Wayne Township Trustees',
    when: now.toISOString(),
    whenLabel: '1st & 3rd Tue · 7:00 PM',
    location: '6050 N. Clarksville Rd., Waynesville',
    source: 'https://www.waynetownship.us/minutes-agendas/agendas-2026/',
  };
}
