import { defineLayer } from '../domain/layer.js';
import { SANTA_LUCIA } from '../domain/scene.js';
import { CALIBRATED_DIR } from './nisarCalibrated.js';

/** One kind only; `value` lets the side panel switch it like the alert kinds. */
export const BUILT_UP_KINDS = [
  { value: 1, kind: 'built-up', label: 'Built-up (towns, large sheds)', color: [255, 140, 60],
    rule: 'Very bright HH, far above HV, on the median of all dates (median HH > -4 dB, HH - HV > 7 dB): walls and ground bounce the radar straight back.',
    caveat: 'Towns full of trees look like woodland and are missed; metal sheds and greenhouses are caught. Roads are too narrow to see at 80 m (the basemap shows them).' },
];

/** Built-up areas from the whole NISAR time series (scripts/nisar_subset.py, built_up), the same for every date. */
export default defineLayer({
  id: 'built-up',
  title: 'Built-up areas',
  description: 'Towns and large buildings found by the radar, kept apart from woodland (both return a strong signal). Click one for the values.',
  caveat: 'From 80 m pixels: villages under 2.5 ha are dropped. Land cover leaves these areas blank.',
  region: { name: 'Santa Lucía, Uruguay', bbox: SANTA_LUCIA.bbox },
  classes: BUILT_UP_KINDS,
  tiers: [{
    id: 'built-up', label: 'NISAR built-up', kind: 'geojson',
    url: () => `${CALIBRATED_DIR}/builtup.json`,
    attribution: 'Built-up areas derived from NISAR GCOV (NASA-ISRO)',
  }],
});
