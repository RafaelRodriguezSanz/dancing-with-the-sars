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

const fetchFn = (...args) => fetch(...args);
const map = new MapView('map', SANTA_LUCIA);
const state = new LayerState(LAYERS, ['nisar-gcov']);
let currentDate = null;
const refresh = (layer) => (state.isActive(layer.id) ? map.show(layer, layer.usesDate ? currentDate : null) : map.hide(layer.id));
const controls = new Controls(document, {
  onDate: (d) => { currentDate = d; LAYERS.filter((l) => l.usesDate).forEach(refresh); },
  onOpacity: (v) => map.setOpacity(v),
  onReset: () => map.resetView(),
});

new LayerPanel(document.getElementById('layers'), LAYERS, state, (layer, on) => { state.toggle(layer.id, on); refresh(layer); });
LAYERS.filter((l) => !l.usesDate).forEach(refresh);

controls.setStatus('Loading scene list from NASA CMR...');
try {
  const { entries, source } = await listScenesForArea(
    new CmrSceneRepository(fetchFn),
    new FallbackSceneRepository(fetchFn),
    SANTA_LUCIA,
  );
  controls.setEntries(entries, pickDefaultDate(entries));
  const usable = entries.filter((e) => e.usable).length;
  controls.setStatus(source === 'live'
    ? `Scene list: live from NASA CMR (${entries.length} dates, ${usable} full passes with tiles).`
    : `Scene list: bundled fallback snapshot, CMR unavailable (${entries.length} dates, ${usable} full passes with tiles).`);
} catch (e) {
  controls.setStatus(`Could not load scene list: ${e.message}`);
}
