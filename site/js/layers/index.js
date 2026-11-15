/** Layer registry: one import + one array entry per change type. All are products derived from the real
 * NISAR images (listed under "NISAR radar"); the raw backscatter views (nisarCalibrated.js, nisarGcov.js)
 * are kept as modules but not offered in the menu. */
import landCover from './landCover.js';
import alerts from './alerts.js';
import builtUp from './builtUp.js';
import wind from './wind.js';

export const LAYERS = [landCover, builtUp, alerts, wind];
export const LAYERS_HEADING = 'NISAR radar';
