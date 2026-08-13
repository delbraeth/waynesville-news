// Compute the next Warren County Commissioners meeting at build time.
// Commissioners meet most Tuesdays at 9:00 AM ET. Uses a fixed label — the
// point is to never show a date that has already passed on the live site.

export function nextCommissionersMeeting(now = new Date()) {
  const d = new Date(now.getTime());
  const TUESDAY = 2;
  let add = (TUESDAY - d.getUTCDay() + 7) % 7; // days until next Tuesday (0 = today)
  // If it's already Tuesday afternoon (past ~1pm ET / 17:00 UTC), the 9am
  // meeting is over — roll to next week.
  if (add === 0 && d.getUTCHours() >= 17) add = 7;

  // 13:00 UTC ≈ 9:00 AM Eastern (EDT). Good enough for a display label.
  const target = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add, 13, 0, 0
  ));
  const label = target.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

  return {
    body: 'Warren County Commissioners',
    when: target.toISOString(),
    whenLabel: `${label} · 9:00 AM`,
    location: '406 Justice Dr, Lebanon',
    source: 'https://commissioners.warrencountyohio.gov/News/AgendaMinutes/Index',
  };
}
