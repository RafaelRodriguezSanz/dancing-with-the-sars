import { defineLayer } from '../domain/layer.js';
import { LAND_COVER_CLASSES } from '../domain/landCover.js';
import { SANTA_LUCIA } from '../domain/scene.js';
import { DATA, HIRES_DATES, HIRES_MIN_ZOOM } from './nisarCalibrated.js';

/** Land cover per date, classified offline from the calibrated NISAR values (scripts/nisar_subset.py). */
export default defineLayer({
  id: 'land-cover',
  title: 'Land cover from radar',
  description: 'Each pixel classed from NISAR HH/HV with simple, explainable thresholds. Switch classes on and off below. Towns are left blank here: see Built-up areas.',
  caveat: 'Rule-based, not a trained model; 80 m pixels from afar, 16 m when zoomed in (dates processed in high resolution); only areas processed with NISAR (Santa Lucía comes ready).',
  usesDate: true,
  region: { name: 'Santa Lucía, Uruguay', bbox: SANTA_LUCIA.bbox },
  classes: LAND_COVER_CLASSES,
  tiers: [{
    id: 'classes-80m', label: 'NISAR classes 80 m', kind: 'classes',
    url: (date) => `${DATA.dir}/${date}_classes.png`,
    bbox: 'area', // the image covers exactly the selected (processed) area
    attribution: 'Classes derived from NISAR GCOV (NASA-ISRO)',
  }, {
    id: 'classes-16m', label: 'NISAR classes 16 m', kind: 'classTiles', minZoom: HIRES_MIN_ZOOM,
    url: (date) => `${DATA.dir}/tiles/${date}/cls/{z}/{x}/{y}.png`,
    available: (date) => HIRES_DATES.has(date), minNativeZoom: 10, maxNativeZoom: 13,
    attribution: 'Classes derived from NISAR GCOV (NASA-ISRO)',
  }],
});
