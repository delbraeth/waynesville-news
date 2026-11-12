// MaxPreps sometimes lists two games for the same team at the same time
// (e.g. Boys Basketball, Varsity, Nov 18 at 6 PM vs. Little Miami AND vs.
// Cedarville), usually a preseason multi-team scrimmage. Listing them as two
// separate games reads as a conflict, so merge them into one line with a note.
const levelLabel = (g) => (g.level && g.level !== "Varsity" ? `${g.level} ` : "");

export function mergeSameSlotGames(games) {
  const out = [];
  const bySlot = new Map();
  for (const g of games) {
    const key = `${g.dateISO}|${g.sport}|${g.level ?? ""}`;
    const prev = bySlot.get(key);
    if (prev) {
      prev.opponents.push(g.opponent);
      prev.scrimmage = prev.scrimmage || g.scrimmage;
      continue;
    }
    const merged = { ...g, opponents: [g.opponent] };
    bySlot.set(key, merged);
    out.push(merged);
  }
  return out;
}

const joinNames = (a) => (a.length <= 2 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);

export function gameLabel(g) {
  const opps = g.opponents ?? [g.opponent];
  return `${levelLabel(g)}${g.sport}${g.scrimmage ? " scrimmage" : ""}: ${g.isHome ? "vs." : "at"} ${joinNames(opps)}`;
}

// Show the "may be a scrimmage" hedge only when the school hasn't told us.
export const needsSlotNote = (g) => (g.opponents?.length ?? 1) > 1 && !g.scrimmage;

export const SAME_SLOT_NOTE = "MaxPreps lists these at the same time; it may be a multi-team scrimmage. Confirm with the school.";
