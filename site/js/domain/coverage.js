/** GIBS time coverage for the NISAR GCOV layer (from WMTS capabilities, 2026-11-13). */
export const GIBS_COVERAGE = [
  ['2025-10-29', '2026-03-01'],
  ['2026-03-04', '2026-03-29'],
  ['2026-04-01', '2026-04-12'],
  ['2026-04-14', '2026-07-27'],
  ['2026-08-10', '2026-11-11'],
];

/** ISO dates (YYYY-MM-DD) compare correctly as strings. */
export function isCovered(date, ranges = GIBS_COVERAGE) {
  return ranges.some(([from, to]) => date >= from && date <= to);
}
