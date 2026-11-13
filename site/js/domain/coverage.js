/** GIBS time coverage for the NISAR GCOV layer (from WMTS capabilities, 2026-11-13). */
export const GIBS_COVERAGE = [
  ['2025-10-29', '2026-03-01'],
  ['2026-03-04', '2026-03-29'],
  ['2026-04-01', '2026-04-12'],
  ['2026-04-14', '2026-07-27'],
  ['2026-08-10', '2026-11-11'],
];

/**
 * Observed 2026-11-13 by eye on the GIBS tiles over Santa Lucia: only track 82 (descending) renders
 * as a clean image; track 60 (ascending) tiles are noise/blank on every date, and these two track-82
 * dates are broken too. This is a GIBS rendering problem (provisional data), not an app bug.
 */
export const GIBS_RELIABLE_TRACKS = [82];
export const GIBS_BROKEN_DATES = ['2026-07-01', '2026-07-25'];

/** True if at least one of the day's tracks renders cleanly in GIBS and the date is not known-broken. */
export function rendersCleanly(date, tracks = []) {
  return !GIBS_BROKEN_DATES.includes(date) && tracks.some((t) => GIBS_RELIABLE_TRACKS.includes(t));
}

/** ISO dates (YYYY-MM-DD) compare correctly as strings. */
export function isCovered(date, ranges = GIBS_COVERAGE) {
  return ranges.some(([from, to]) => date >= from && date <= to);
}
