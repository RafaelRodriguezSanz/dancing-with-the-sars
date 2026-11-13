/** Pure domain: scenes, acquisition dates and the area of interest. */

export const DIRECTIONS = { A: 'ascending', D: 'descending' };

/** Parses a NISAR granule title ("NISAR_L2_PR_GCOV_023_082_D_...") into track and direction. */
export function parseGranuleTitle(title) {
  const parts = String(title ?? '').split('_');
  const track = Number.parseInt(parts[5], 10);
  return {
    track: Number.isFinite(track) ? track : null,
    direction: DIRECTIONS[parts[6]] ?? null,
  };
}

export function createScene({ id, collection, start, track, direction }) {
  return { id, collection, date: String(start).slice(0, 10), start, track, direction };
}

/** Groups scenes by date: one entry per date, sorted ascending. */
export function groupByDate(scenes) {
  const byDate = new Map();
  for (const s of scenes) {
    if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, tracks: [], directions: [], sceneCount: 0 });
    const e = byDate.get(s.date);
    e.sceneCount += 1;
    if (s.track != null && !e.tracks.includes(s.track)) e.tracks.push(s.track);
    if (s.direction && !e.directions.includes(s.direction)) e.directions.push(s.direction);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Rectangle in lon/lat order: [west, south, east, north]. */
export function createAreaOfInterest(name, [west, south, east, north]) {
  if (!(west < east && south < north)) throw new Error('Invalid bounding box');
  return Object.freeze({
    name,
    bbox: [west, south, east, north],
    center: [(south + north) / 2, (west + east) / 2],
  });
}

export const SANTA_LUCIA = createAreaOfInterest('Santa Lucia lower basin', [-56.75, -34.75, -56.05, -34.15]);
