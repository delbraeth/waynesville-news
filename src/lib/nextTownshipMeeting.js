// Compute the next Wayne Township Trustees meeting at build time. Trustees
// meet the 1st and 3rd Tuesday of each month at 7:00 PM ET, per the
// township's posted minutes/agendas schedule. Same fixed-label approach as
// nextMeeting.js (Warren County Commissioners) — good enough for a display
// label, not meant to handle rare rescheduled/canceled meetings.

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
      // 23:00 UTC ≈ 7:00 PM Eastern (EDT). Good enough for a display label.
      const target = new Date(Date.UTC(year, month, day, 23, 0, 0));
      if (target.getTime() > now.getTime()) {
        const label = target.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
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
