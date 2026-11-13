/** Composition root: the only place that wires concrete classes. */
import { SANTA_LUCIA } from './domain/scene.js';
import { listScenesForArea } from './application/listScenes.js';
import { pickDefaultDate } from './application/selectDate.js';
import { CmrSceneRepository } from './infrastructure/cmrSceneRepository.js';
import { FallbackSceneRepository } from './infrastructure/fallbackSceneRepository.js';
import { MapView } from './presentation/mapView.js';
import { Controls } from './presentation/controls.js';

const fetchFn = (...args) => fetch(...args);
const map = new MapView('map', SANTA_LUCIA);
const controls = new Controls(document, {
  onDate: (d) => map.showDate(d),
  onOpacity: (v) => map.setOpacity(v),
  onReset: () => map.resetView(),
});

controls.setStatus('Loading scene list from NASA CMR...');
try {
  const { entries, source } = await listScenesForArea(
    new CmrSceneRepository(fetchFn),
    new FallbackSceneRepository(fetchFn),
    SANTA_LUCIA,
  );
  controls.setEntries(entries, pickDefaultDate(entries));
  const covered = entries.filter((e) => e.covered).length;
  controls.setStatus(source === 'live'
    ? `Scene list: live from NASA CMR (${entries.length} dates, ${covered} with GIBS tiles).`
    : `Scene list: bundled fallback snapshot, CMR unavailable (${entries.length} dates, ${covered} with GIBS tiles).`);
} catch (e) {
  controls.setStatus(`Could not load scene list: ${e.message}`);
}
