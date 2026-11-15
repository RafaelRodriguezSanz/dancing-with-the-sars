/**
 * Flood scenario on a terrain grid, pure functions (no DOM). The grid is a row-major Float32Array of elevations.
 *
 * Height above water (HAND-like): every cell gets the water level of the nearest water cell, reached by a
 * breadth-first walk from all water cells at once; its height above water is its elevation minus that level.
 * A river that rises `rise` metres covers the cells whose height above water is <= rise. This "bathtub" view
 * ignores levees, drains and flow timing: it shows which ground is low next to water, not a forecast.
 */
export const SAFE_MARGIN_M = 2; // a refuge must stay dry this much above the scenario level

/** Height above the nearest water cell for each cell (NaN where no water was reachable or no elevation). */
export function heightAboveWater(elev, water, width, height) {
  const n = width * height;
  const level = new Float32Array(n).fill(NaN);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (water[i] && Number.isFinite(elev[i])) { level[i] = elev[i]; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const near = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const j of near) {
      if (j < 0 || j >= n || !Number.isNaN(level[j]) || !Number.isFinite(elev[j])) continue;
      level[j] = level[i];
      queue[tail++] = j;
    }
  }
  const hand = new Float32Array(n);
  for (let i = 0; i < n; i++) hand[i] = elev[i] - level[i];
  return hand;
}

/** True where a river `rise` metres above its usual level would reach. */
export const isFlooded = (hand, rise) => Number.isFinite(hand) && hand <= rise;

/**
 * Sorts candidate refuges for a scenario. Each site is {name, type, lon, lat, hand}; returns them with
 * status 'safe' (dry with SAFE_MARGIN_M to spare), 'at-risk' (dry, but within the margin) or 'flooded'.
 */
export function rankSites(sites, rise) {
  return sites.map((s) => {
    const status = !Number.isFinite(s.hand) ? 'unknown'
      : s.hand <= rise ? 'flooded'
        : s.hand <= rise + SAFE_MARGIN_M ? 'at-risk' : 'safe';
    return { ...s, status };
  });
}
