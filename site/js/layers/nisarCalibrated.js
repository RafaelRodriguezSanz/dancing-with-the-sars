import { defineLayer } from '../domain/layer.js';
import { MONTEVIDEO, SANTA_LUCIA, URUGUAY } from '../domain/scene.js';

/** Real NISAR GCOV values, cut from the Earthdata granules by scripts/nisar_subset.py (or on demand by
 * scripts/serve.py). One folder per area; DATA.dir follows the selected area (setCalibratedArea). */
const NAMED = [['santa-lucia', SANTA_LUCIA.bbox], ['montevideo', MONTEVIDEO.bbox], ['uruguay', URUGUAY.bbox]];
/** Folder of a box; must match area_slug() in scripts/nisar_subset.py. */
export function areaDir(bbox) {
  const named = NAMED.find(([, b]) => b.every((v, i) => Math.abs(v - bbox[i]) < 5e-5));
  return `data/nisar/${named ? named[0] : `aoi_${bbox.map((v) => v.toFixed(4)).join('_')}`}`;
}
/** Precomputed folders whose box holds the whole view, smallest first: fallbacks for products an area lacks. */
export function precomputedDirs(view) {
  const [w, s, e, n] = view;
  const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
  return NAMED.filter(([, b]) => w >= b[0] && s >= b[1] && e <= b[2] && n <= b[3])
    .sort((a, b) => area(a[1]) - area(b[1])).map(([slug]) => `data/nisar/${slug}`);
}
export const DATA = { dir: areaDir(SANTA_LUCIA.bbox) };
export function setCalibratedArea(bbox) { DATA.dir = areaDir(bbox); HIRES_DATES.clear(); }
/** Dates with high-resolution tiles (frequency A); filled at start-up from tiles/index.json. */
export const HIRES_DATES = new Set();
export const HIRES_MIN_ZOOM = 10; // map zoom (MapLibre); closer than this, the 80 m picture is too coarse
/** Display options. steady: use <date>_steady.webp, where each orbit pass is brought to the median of all
 * passes, so dates seen from different angles do not flicker (scripts/nisar_subset.py, steady_view). */
export const VIEW = { steady: true };
export const imageUrl = (date) => `${DATA.dir}/${date}${VIEW.steady ? '_steady' : ''}.webp`;

export default defineLayer({
  id: 'nisar-calibrated',
  title: 'NISAR radar, calibrated',
  description: 'Real NISAR L-band backscatter cut from the NASA Earthdata granules: red = HH, green = HV (vegetation volume), blue = HH minus HV. Fixed dB scale, so dates are comparable.',
  caveat: 'Ready for Santa Lucía; any other area must be analyzed first (Analyze area, local server with an Earthdata token). 80 m from afar, 16 m when zoomed in where available. Steady colours apply to the 80 m picture; the 16 m tiles show the raw pass.',
  usesDate: true,
  region: { name: 'Uruguay', bbox: URUGUAY.bbox },
  legend: [
    { color: '#c8ff3c', label: 'Strong HV: forest, riparian woods' },
    { color: '#202a20', label: 'Dark: open water, smooth surfaces' },
    { color: '#d080ff', label: 'Magenta: strong HH, low HV (bare or tilled soil, built-up)' },
  ],
  tiers: [{
    id: 'gcov-b', label: 'NISAR GCOV 80 m', kind: 'image',
    url: imageUrl,
    bbox: 'area', // each area is processed for exactly its own box
    attribution: 'NISAR GCOV (NASA-ISRO), NASA Earthdata / ASF DAAC',
  }, {
    id: 'gcov-a', label: 'NISAR GCOV 16 m', kind: 'tiles', minZoom: HIRES_MIN_ZOOM,
    url: (date) => `${DATA.dir}/tiles/${date}/rgb/{z}/{x}/{y}.webp`,
    available: (date) => HIRES_DATES.has(date), minNativeZoom: 10, maxNativeZoom: 13,
    attribution: 'NISAR GCOV (NASA-ISRO), NASA Earthdata / ASF DAAC',
  }],
});
