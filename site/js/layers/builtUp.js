import { defineLayer } from '../domain/layer.js';
import { SANTA_LUCIA } from '../domain/scene.js';
import { DATA } from './nisarCalibrated.js';
import { OsmTownRepository } from '../infrastructure/osmTowns.js';

/** Two sources, switched separately in the side panel. `fill` = fill opacity, so towns cover the land cover below. */
export const BUILT_UP_KINDS = [
  { value: 2, kind: 'town', label: 'Towns and cities (OpenStreetMap)', color: [235, 80, 80], fill: 0.5,
    rule: 'Residential, commercial, industrial or retail land mapped in OpenStreetMap.',
    caveat: 'As complete as the local OpenStreetMap mapping; not from the radar.' },
  { value: 1, kind: 'built-up', label: 'Built-up seen by the radar (NISAR)', color: [255, 140, 60],
    rule: 'Very bright HH, far above HV, on the median of all dates (median HH > -4 dB, HH - HV > 7 dB): walls and ground bounce the radar straight back.',
    caveat: 'Small or leafy towns of low houses are missed at 80 m (OpenStreetMap covers them); metal sheds and greenhouses are caught. Roads are too narrow to see at 80 m (the basemap shows them).' },
];

const osm = new OsmTownRepository((...a) => fetch(...a));
const EMPTY = { type: 'FeatureCollection', features: [] };

/** Merges OpenStreetMap towns (any area, live) with the NISAR built-up mask of the processed area. Either may be missing. */
async function loadBuiltUp(date, bbox) {
  const [towns, radar] = await Promise.all([
    osm.towns(bbox).catch(() => EMPTY),
    fetch(`${DATA.dir}/builtup.json`).then((r) => (r.ok ? r.json() : EMPTY)).catch(() => EMPTY),
  ]);
  return { type: 'FeatureCollection', features: [...towns.features, ...radar.features] };
}

export default defineLayer({
  id: 'built-up',
  title: 'Built-up areas',
  description: 'Towns from OpenStreetMap combined with buildings found by the radar, kept apart from woodland (both return a strong signal). Click one for details.',
  caveat: 'Radar part from 80 m pixels: clusters under 2.5 ha are dropped. OpenStreetMap is loaded live for the selected area.',
  region: { name: 'Santa Lucía, Uruguay', bbox: SANTA_LUCIA.bbox },
  classes: BUILT_UP_KINDS,
  tiers: [{
    id: 'built-up', label: 'OpenStreetMap + NISAR built-up', kind: 'geojson',
    url: () => `${DATA.dir}/builtup.json`, // part of the map's cache key; load() reads it together with the towns
    load: loadBuiltUp,
    attribution: 'Towns © OpenStreetMap contributors (ODbL); built-up derived from NISAR GCOV (NASA-ISRO)',
  }],
});
