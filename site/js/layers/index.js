/** Layer registry: one import + one array entry per change type. */
import nisarCalibrated from './nisarCalibrated.js';
import nisarGcov from './nisarGcov.js';
import landCover from './landCover.js';
import alerts from './alerts.js';
import builtUp from './builtUp.js';

export const LAYERS = [nisarCalibrated, landCover, builtUp, alerts, nisarGcov];
