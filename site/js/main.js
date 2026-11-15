/** Composition root: the only place that wires concrete classes. */
import { MONTEVIDEO, SANTA_LUCIA, URUGUAY } from './domain/scene.js';
import { listScenesForArea, withMosaic } from './application/listScenes.js';
import { pickDefaultDate } from './application/selectDate.js';
import { CmrSceneRepository } from './infrastructure/cmrSceneRepository.js';
import { FallbackSceneRepository } from './infrastructure/fallbackSceneRepository.js';
import { MapView } from './presentation/mapView.js';
import { Controls } from './presentation/controls.js';
import { LayerPanel } from './presentation/layerPanel.js';
import { LayerState } from './application/layerState.js';
import { LAYERS, LAYERS_HEADING } from './layers/index.js';
import { DATA, HIRES_DATES, VIEW, imageUrl, precomputedDirs, setCalibratedArea } from './layers/nisarCalibrated.js';
import { ProcessingApi } from './infrastructure/processingApi.js';
import { ProcessPanel } from './presentation/processPanel.js';
import { ValidationRepository } from './infrastructure/validationRepository.js';
import { ValidationPanel } from './presentation/validationPanel.js';
import { summarizeValidation } from './application/validationSummary.js';
import { AreaSelector } from './presentation/areaSelector.js';
import { BootScreen } from './presentation/bootScreen.js';
import { EvolutionPanel } from './presentation/evolutionPanel.js';
import { evolutionSeries } from './application/evolution.js';
import { LAND_COVER_CLASSES } from './domain/landCover.js';
import { areaFromCorners, areaFromHash, areaToHash, MAX_AREA_SPAN_DEG } from './domain/area.js';
import { findPlace } from './infrastructure/placeSearch.js';
import { FloodPanel } from './presentation/floodPanel.js';
import { OsmEvacuationRepository } from './infrastructure/osmEvacuation.js';
import { ReadmeViewer } from './presentation/readmeViewer.js';

const fetchFn = (...args) => fetch(...args);
let area = areaFromHash(location.hash) ?? SANTA_LUCIA;
const map = new MapView('map', area);
const boot = new BootScreen(document, map, area.bbox, `Scanning ${area === SANTA_LUCIA ? 'the Santa Lucía basin' : 'the area'} with NISAR`);
const state = new LayerState(LAYERS, LAYERS.map((l) => l.id));
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
  if (layer.id === 'land-cover') boot.done(ok ? 'Land cover ready' : 'Ready');
  if (!ok) controls.setStatus(`${layer.title}: no processed image for ${date}. Try another date.`);
};
map.order = LAYERS.map((l) => l.id); // drawing order, bottom -> top
map.classFilter = (id) => state.enabledClasses(id);
map.onAlertDate = (d) => controls.select(d);
document.getElementById('steady').addEventListener('change', (ev) => { VIEW.steady = ev.target.checked; }); // used by the evolution chart
new LayerPanel(document.getElementById('side-panel'), LAYERS, state, {
  heading: LAYERS_HEADING,
  onLayer: (layer, on) => { state.toggle(layer.id, on); refresh(layer); },
  onClass: (layer, value, on) => { state.toggleClass(layer.id, value, on); map.repaint(layer.id); },
});
LAYERS.filter((l) => !l.usesDate).forEach(refresh);

const live = new CmrSceneRepository(fetchFn);
const fallback = new FallbackSceneRepository(fetchFn);
const areaInfo = document.getElementById('area-info');
let request = 0;
const validations = new ValidationRepository(fetchFn);
const validationPanel = new ValidationPanel(document);
const CALIBRATED_LAYERS = LAYERS; // all read DATA.dir

/** Point the calibrated layers at the selected area's folder and reload them (also after processing). */
async function loadCalibrated(aoi) {
  setCalibratedArea(aoi.bbox);
  const dir = DATA.dir;
  const [manifest, hires, validation] = await Promise.all([
    fetchFn(`${dir}/manifest.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // High-resolution dates are optional: without the index every date simply stays at 80 m.
    fetchFn(`${dir}/tiles/index.json`).then((r) => (r.ok ? r.json() : { dates: [] })).catch(() => ({ dates: [] })),
    validations.load(dir),
  ]);
  if (dir !== DATA.dir) return; // another area was selected meanwhile
  validationPanel.show(summarizeValidation(validation));
  for (const d of hires.dates) HIRES_DATES.add(d);
  CALIBRATED_LAYERS.forEach((l) => { map.hide(l.id); refresh(l); });
  processPanel.setArea(aoi.bbox, Boolean(manifest));
  return manifest;
}
const processPanel = new ProcessPanel(document, new ProcessingApi(fetchFn), {
  onScan: (bbox, progress) => { if (!boot.active) map.setScanning(bbox, progress); },
  onDone: () => loadCalibrated(area).then(() => controls.setStatus('NISAR products ready for this area. Pick a date to see them.')),
});

async function loadArea(aoi) {
  const mine = ++request; // ignore answers for an area the user already replaced
  area = aoi;
  history.replaceState(null, '', aoi === SANTA_LUCIA ? location.pathname : areaToHash(aoi));
  const [w, s, e, n] = aoi.bbox;
  areaInfo.textContent = `${aoi.name}: ${w}, ${s} to ${e}, ${n}`;
  map.setArea(aoi);
  const calibrated = loadCalibrated(aoi);
  controls.setStatus('Loading scene list for this area from NASA CMR...');
  boot.step(0.25, 'Radar products and NISAR passes from NASA CMR...');
  try {
    const listed = await listScenesForArea(live, fallback, aoi);
    const manifest = await calibrated;
    if (mine !== request) return;
    const { source } = listed;
    const entries = withMosaic(listed.entries, manifest);
    boot.step(0.6, manifest?.mosaic ? `Drawing land cover from ${manifest.mosaic.dates} radar passes...` : 'Drawing land cover...');
    const scenes = manifest?.scenes ?? {};
    controls.quality = (d) => (!scenes[d] || scenes[d].suspect ? 'none' : HIRES_DATES.has(d) ? 'best' : 'data');
    controls.setEntries(entries, manifest?.mosaic ? manifest.mosaic.key : pickDefaultDate(entries));
    const usable = entries.filter((x) => x.usable).length;
    controls.setStatus(entries.length === 0
      ? 'No NISAR passes found for this area.'
      : source === 'live'
        ? `Scene list: live from NASA CMR (${entries.length} dates, ${usable} full passes with tiles).`
        : `Scene list: bundled fallback snapshot, CMR unavailable (${entries.length} dates, ${usable} full passes with tiles).`);
  } catch (e) {
    if (mine === request) controls.setStatus(`Could not load scene list: ${e.message}`);
    boot.done();
  }
  setTimeout(() => boot.done(), 20000); // never leave the start screen up if a layer hangs
}

new AreaSelector(map, document, {
  onArea: (c1, c2) => loadArea(areaFromCorners(c1, c2)),
  onError: (e) => controls.setStatus(e.message),
});

// Find a country or region by name; analyzing it needs the local server (see About > Other countries).
const searchMsg = document.getElementById('search-msg');
// Areas precomputed on the public site: one click, no server needed.
const READY = { 'santa-lucia': SANTA_LUCIA, montevideo: MONTEVIDEO, uruguay: URUGUAY };
for (const b of document.querySelectorAll('[data-area]')) {
  b.addEventListener('click', () => { searchMsg.textContent = ''; loadArea(READY[b.dataset.area]); });
}
document.getElementById('place-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const query = document.getElementById('place').value.trim();
  if (!query) return;
  searchMsg.textContent = `Looking for ${query}...`;
  try {
    const hit = await findPlace(fetchFn, query);
    if (!hit) { searchMsg.textContent = `Nothing found for "${query}".`; return; }
    const [w, s, e, n] = hit.bbox;
    if (e - w > MAX_AREA_SPAN_DEG || n - s > MAX_AREA_SPAN_DEG) {
      searchMsg.textContent = `${hit.name} is larger than ${MAX_AREA_SPAN_DEG}° per side: draw a part of it instead.`;
      map.map.fitBounds([[w, s], [e, n]], { padding: map.freePadding() });
      return;
    }
    searchMsg.textContent = '';
    await loadArea(areaFromCorners([w, s], [e, n], hit.name));
  } catch (e) { searchMsg.textContent = `Search failed: ${e.message}`; }
});
controls.badge = (date) => (HIRES_DATES.has(date) ? ' · high-res' : ''); // zoom in on these dates for 16 m

// Evolution: play the processed dates and chart what the current view contains on each one.
const evolution = new EvolutionPanel(document.getElementById('evolution-panel'), {
  onDate: (d, ms) => map.withFade(ms, () => controls.select(d)), // the fade lasts as long as the frame: no hard cuts
});
document.getElementById('evolution').addEventListener('click', async () => {
  const manifest = await fetchFn(`${DATA.dir}/manifest.json`).then((r) => r.json()).catch(() => null);
  if (!manifest) { controls.setStatus('No processed dates for this area.'); return; }
  const listed = new Set(controls.entries.map((e) => e.date));
  const dates = Object.keys(manifest.scenes).filter((d) => listed.has(d) && !manifest.scenes[d].suspect).sort(); // suspect = calibration outlier
  controls.setStatus(`Reading ${dates.length} dates for this view...`);
  const rows = await evolutionSeries({
    dates, view: map.viewBox(), box: manifest.bbox, classes: LAND_COVER_CLASSES, stretch: manifest.stretch,
    urls: { classes: (d) => `${DATA.dir}/${d}_classes.png`, image: imageUrl }, // steady view: means without the pass zig-zag
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
// El Niño flood response: flood scenario, dry refuges and evacuation routes for the current view.
const flood = new FloodPanel(document, map, new OsmEvacuationRepository(fetchFn), fetchFn, {
  nisarWater: () => (currentDate ? { url: `${DATA.dir}/${currentDate}_classes.png`, bbox: area.bbox } : null),
  dataDirs: (view) => [...new Set([DATA.dir, ...precomputedDirs(view)])],
});
// The main "El Niño floods" button opens the card and analyzes the view in one click; closing clears the map.
const floodCard = document.getElementById('flood');
const floodBtn = document.getElementById('flood-open');
const showFlood = (on) => { floodCard.hidden = !on; floodBtn.classList.toggle('on', on); floodBtn.setAttribute('aria-expanded', String(on)); };
floodBtn.addEventListener('click', () => {
  if (!floodCard.hidden) { flood.clear(); showFlood(false); return; }
  showFlood(true);
  flood.run();
});
document.getElementById('flood-close').addEventListener('click', () => { flood.clear(); showFlood(false); });
new ReadmeViewer(document, fetchFn);
await loadArea(area);
