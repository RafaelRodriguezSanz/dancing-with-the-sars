/** Composition root: the only place that wires concrete classes. */
import { SANTA_LUCIA } from './domain/scene.js';
import { listScenesForArea } from './application/listScenes.js';
import { pickDefaultDate } from './application/selectDate.js';
import { CmrSceneRepository } from './infrastructure/cmrSceneRepository.js';
import { FallbackSceneRepository } from './infrastructure/fallbackSceneRepository.js';
import { MapView } from './presentation/mapView.js';
import { Controls } from './presentation/controls.js';
import { LayerPanel } from './presentation/layerPanel.js';
import { LayerState } from './application/layerState.js';
import { LAYERS } from './layers/index.js';
import nisarCalibrated, { CALIBRATED_DIR, HIRES_DATES, VIEW, imageUrl } from './layers/nisarCalibrated.js';
import { AreaSelector } from './presentation/areaSelector.js';
import { EvolutionPanel } from './presentation/evolutionPanel.js';
import { evolutionSeries } from './application/evolution.js';
import { LAND_COVER_CLASSES } from './domain/landCover.js';
import { areaFromCorners, areaFromHash, areaToHash } from './domain/area.js';

const fetchFn = (...args) => fetch(...args);
let area = areaFromHash(location.hash) ?? SANTA_LUCIA;
const map = new MapView('map', area);
const state = new LayerState(LAYERS, ['nisar-calibrated']);
let currentDate = null;
let gibsCovered = false;
const refresh = (layer) => {
  const needsDate = layer.usesDate && (!currentDate || (layer.needsGibsCoverage && !gibsCovered));
  if (state.isActive(layer.id) && !needsDate) map.show(layer, layer.usesDate ? currentDate : null);
  else map.hide(layer.id);
};
const controls = new Controls(document, {
  onDate: (d, covered) => { currentDate = d; gibsCovered = covered; LAYERS.filter((l) => l.usesDate).forEach(refresh); },
  onOpacity: (v) => map.setOpacity(v),
  onReset: () => map.resetView(),
});

map.onLayerStatus = (layer, date, ok) => {
  if (!ok) controls.setStatus(`${layer.title}: no processed image for ${date}. Try another date or the GIBS layer.`);
};
map.order = LAYERS.map((l) => l.id); // drawing order, bottom -> top
map.classFilter = (id) => state.enabledClasses(id);
map.onAlertDate = (d) => controls.select(d);
document.getElementById('steady').addEventListener('change', (ev) => { VIEW.steady = ev.target.checked; refresh(nisarCalibrated); });
new LayerPanel(document.getElementById('side-panel'), LAYERS, state, {
  onLayer: (layer, on) => { state.toggle(layer.id, on); refresh(layer); },
  onClass: (layer, value, on) => { state.toggleClass(layer.id, value, on); map.repaint(layer.id); },
});
LAYERS.filter((l) => !l.usesDate).forEach(refresh);

const live = new CmrSceneRepository(fetchFn);
const fallback = new FallbackSceneRepository(fetchFn);
const areaInfo = document.getElementById('area-info');
let request = 0;

async function loadArea(aoi) {
  const mine = ++request; // ignore answers for an area the user already replaced
  area = aoi;
  history.replaceState(null, '', aoi === SANTA_LUCIA ? location.pathname : areaToHash(aoi));
  const [w, s, e, n] = aoi.bbox;
  areaInfo.textContent = `${aoi.name}: ${w}, ${s} to ${e}, ${n}`;
  map.setArea(aoi);
  controls.setStatus('Loading scene list for this area from NASA CMR...');
  try {
    const { entries, source } = await listScenesForArea(live, fallback, aoi);
    if (mine !== request) return;
    controls.setEntries(entries, pickDefaultDate(entries));
    const usable = entries.filter((x) => x.usable).length;
    controls.setStatus(entries.length === 0
      ? 'No NISAR passes found for this area.'
      : source === 'live'
        ? `Scene list: live from NASA CMR (${entries.length} dates, ${usable} full passes with tiles).`
        : `Scene list: bundled fallback snapshot, CMR unavailable (${entries.length} dates, ${usable} full passes with tiles).`);
  } catch (e) {
    if (mine === request) controls.setStatus(`Could not load scene list: ${e.message}`);
  }
}

new AreaSelector(map, document, {
  onArea: (c1, c2) => loadArea(areaFromCorners(c1, c2)),
  onError: (e) => controls.setStatus(e.message),
});
// High-resolution dates are optional: without the index every date simply stays at 80 m.
const hires = await fetchFn(`${CALIBRATED_DIR}/tiles/index.json`).then((r) => (r.ok ? r.json() : { dates: [] })).catch(() => ({ dates: [] }));
for (const d of hires.dates) HIRES_DATES.add(d);
controls.badge = (date) => (HIRES_DATES.has(date) ? ' · high-res' : ''); // zoom in on these dates for 16 m
LAYERS.forEach(refresh);

// Evolution: play the processed dates and chart what the current view contains on each one.
const evolution = new EvolutionPanel(document.getElementById('evolution-panel'), {
  onDate: (d, ms) => map.withFade(ms, () => controls.select(d)), // the fade lasts as long as the frame: no hard cuts
});
document.getElementById('evolution').addEventListener('click', async () => {
  const manifest = await fetchFn(`${CALIBRATED_DIR}/manifest.json`).then((r) => r.json()).catch(() => null);
  if (!manifest) { controls.setStatus('No processed dates for this area.'); return; }
  const listed = new Set(controls.entries.map((e) => e.date));
  const dates = Object.keys(manifest.scenes).filter((d) => listed.has(d) && !manifest.scenes[d].suspect).sort(); // suspect = calibration outlier
  controls.setStatus(`Reading ${dates.length} dates for this view...`);
  const rows = await evolutionSeries({
    dates, view: map.viewBox(), box: manifest.bbox, classes: LAND_COVER_CLASSES, stretch: manifest.stretch,
    urls: { classes: (d) => `${CALIBRATED_DIR}/${d}_classes.png`, image: imageUrl }, // steady view: means without the pass zig-zag
    loadPixels: (url) => map.loadPixels(url),
  });
  const series = [
    ...LAND_COVER_CLASSES.map((c) => ({ label: c.label, color: `rgb(${c.color.join(',')})`, unit: '%', values: rows.map((r) => r.shares.get(c.value)) })),
    { label: 'Mean HV (vegetation volume)', color: '#7fdc7f', unit: 'dB', values: rows.map((r) => r.hv) },
    { label: 'Mean HH (surface, moisture)', color: '#ff8a80', unit: 'dB', values: rows.map((r) => r.hh) },
  ];
  controls.setStatus(`Evolution of the view: ${dates.length} dates, 80 m products. Click a line to jump to a date.`);
  evolution.open(rows, series, VIEW.steady
    ? 'Time runs at real pace: one second is about 4 days. Steady colours: the viewing-angle difference between orbit passes is removed.'
    : 'Time runs at real pace: one second is about 4 days. Dates from three orbit passes alternate; their viewing angles cause part of the zig-zag.');
});
await loadArea(area);
