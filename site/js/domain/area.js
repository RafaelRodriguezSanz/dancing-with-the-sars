/** User-selected area of interest: validation and URL-hash round trip. Pure. */
import { createAreaOfInterest } from './scene.js';

/** Largest side (degrees) a selection may have, so CMR queries and tile loads stay small. */
export const MAX_AREA_SPAN_DEG = 2;

const round = (v) => Math.round(v * 1e4) / 1e4;

/** Builds an AOI from any two corners; throws with a user-readable message if invalid or too big. */
export function areaFromCorners([lon1, lat1], [lon2, lat2], name = 'Selected area') {
  const w = round(Math.max(-180, Math.min(lon1, lon2)));
  const e = round(Math.min(180, Math.max(lon1, lon2)));
  const s = round(Math.max(-85, Math.min(lat1, lat2)));
  const n = round(Math.min(85, Math.max(lat1, lat2)));
  if (!(e > w && n > s)) throw new Error('The selected area is empty.');
  if (e - w > MAX_AREA_SPAN_DEG || n - s > MAX_AREA_SPAN_DEG) {
    throw new Error(`Area too large: keep each side under ${MAX_AREA_SPAN_DEG}° (about ${MAX_AREA_SPAN_DEG * 111} km).`);
  }
  return createAreaOfInterest(name, [w, s, e, n]);
}

export function areaToHash(aoi) {
  return `#bbox=${aoi.bbox.join(',')}`;
}

/** Returns an AOI from "#bbox=w,s,e,n", or null if absent/invalid. */
export function areaFromHash(hash) {
  const m = /bbox=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/.exec(String(hash ?? ''));
  if (!m) return null;
  const [w, s, e, n] = m.slice(1).map(Number);
  try { return areaFromCorners([w, s], [e, n]); } catch { return null; }
}
