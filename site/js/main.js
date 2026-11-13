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
import { AreaSelector } from './presentation/areaSelector.js';
import { areaFromCorners, areaFromHash, areaToHash } from './domain/area.js';

const fetchFn = (...args) => fetch(...args);
let area = areaFromHash(location.hash) ?? SANTA_LUCIA;
const map = new MapView('map', area);
const state = new LayerState(LAYERS, ['nisar-gcov']);
let currentDate = null;
const refresh = (layer) => {
  const needsDate = layer.usesDate && !currentDate;
  if (state.isActive(layer.id) && !needsDate) map.show(layer, layer.usesDate ? currentDate : null);
  else map.hide(layer.id);
};
const controls = new Controls(document, {
  onDate: (d) => { currentDate = d; LAYERS.filter((l) => l.usesDate).forEach(refresh); },
  onOpacity: (v) => map.setOpacity(v),
  onReset: () => map.resetView(),
});

new LayerPanel(document.getElementById('layers'), LAYERS, state, (layer, on) => { state.toggle(layer.id, on); refresh(layer); });
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
await loadArea(area);
