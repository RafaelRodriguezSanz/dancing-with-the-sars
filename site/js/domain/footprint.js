/** Pure domain: scene footprints and how much of the area of interest they cover. */

/** Minimum share of the area of interest a date must cover to be a "full pass". */
export const FULL_COVERAGE = 0.95;

/** CMR polygon string "lat lon lat lon ..." -> ring of [lon, lat]. */
export function parseCmrPolygon(text) {
  const n = String(text ?? '').trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) ring.push([n[i + 1], n[i]]);
  }
  return ring;
}

/** Ray-casting point-in-polygon; ring is [[lon, lat], ...]. */
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Share (0..1) of the bbox [w, s, e, n] covered by the union of the rings,
 * estimated on a regular grid of samples x samples points.
 */
export function aoiCoverage(rings, [w, s, e, n], samples = 25) {
  if (!rings || rings.length === 0) return 0;
  let hit = 0;
  for (let i = 0; i < samples; i += 1) {
    for (let j = 0; j < samples; j += 1) {
      const p = [w + ((i + 0.5) * (e - w)) / samples, s + ((j + 0.5) * (n - s)) / samples];
      if (rings.some((r) => pointInRing(p, r))) hit += 1;
    }
  }
  return hit / (samples * samples);
}
