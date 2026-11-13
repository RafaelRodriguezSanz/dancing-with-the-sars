import { defineLayer } from '../domain/layer.js';
import { SANTA_LUCIA } from '../domain/scene.js';

/** Real NISAR GCOV values, cut offline from the Earthdata granules by scripts/nisar_subset.py. */
export const CALIBRATED_DIR = 'data/nisar/santa-lucia';
/** Dates with high-resolution tiles (frequency A); filled at start-up from tiles/index.json. */
export const HIRES_DATES = new Set();
export const HIRES_MIN_ZOOM = 10; // map zoom (MapLibre); closer than this, the 80 m picture is too coarse
/** Display options. steady: use <date>_steady.webp, where each orbit pass is brought to the median of all
 * passes, so dates seen from different angles do not flicker (scripts/nisar_subset.py, steady_view). */
export const VIEW = { steady: true };
export const imageUrl = (date) => `${CALIBRATED_DIR}/${date}${VIEW.steady ? '_steady' : ''}.webp`;

export default defineLayer({
  id: 'nisar-calibrated',
  title: 'NISAR radar, calibrated (Santa Lucía)',
  description: 'Real NISAR L-band backscatter cut from the NASA Earthdata granules: red = HH, green = HV (vegetation volume), blue = HH minus HV. Fixed dB scale, so dates are comparable.',
  caveat: 'Pre-processed for the Santa Lucía box only; 80 m from afar, 16 m when zoomed in where available. Steady colours apply to the 80 m picture; the 16 m tiles show the raw pass.',
  usesDate: true,
  region: { name: 'Santa Lucía, Uruguay', bbox: SANTA_LUCIA.bbox },
  legend: [
    { color: '#c8ff3c', label: 'Strong HV: forest, riparian woods' },
    { color: '#202a20', label: 'Dark: open water, smooth surfaces' },
    { color: '#d080ff', label: 'Magenta: strong HH, low HV (bare or tilled soil, built-up)' },
  ],
  tiers: [{
    id: 'gcov-b', label: 'NISAR GCOV 80 m', kind: 'image',
    url: imageUrl,
    bbox: [-56.75, -34.75, -56.05, -34.15],
    attribution: 'NISAR GCOV (NASA-ISRO), NASA Earthdata / ASF DAAC',
  }, {
    id: 'gcov-a', label: 'NISAR GCOV 16 m', kind: 'tiles', minZoom: HIRES_MIN_ZOOM,
    url: (date) => `${CALIBRATED_DIR}/tiles/${date}/rgb/{z}/{x}/{y}.webp`,
    available: (date) => HIRES_DATES.has(date), minNativeZoom: 10, maxNativeZoom: 13,
    attribution: 'NISAR GCOV (NASA-ISRO), NASA Earthdata / ASF DAAC',
  }],
});
