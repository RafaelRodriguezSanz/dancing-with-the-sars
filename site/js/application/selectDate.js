/** Latest usable date (tiles + full pass), else latest with tiles, else latest overall, or null. */
export function pickDefaultDate(entries) {
  const usable = entries.filter((e) => e.usable);
  const covered = entries.filter((e) => e.covered);
  const pool = usable.length ? usable : covered.length ? covered : entries;
  return pool.length ? pool[pool.length - 1].date : null;
}

/**
 * Neighbouring date in the list. direction: +1 or -1.
 * Dates that are not usable (no tiles or partial pass) are skipped unless includeUncovered is true. Returns null at the ends.
 */
export function stepDate(entries, current, direction, includeUncovered = false) {
  const idx = entries.findIndex((e) => e.date === current);
  if (idx < 0) return null;
  for (let i = idx + direction; i >= 0 && i < entries.length; i += direction) {
    if (includeUncovered || entries[i].usable) return entries[i].date;
  }
  return null;
}
