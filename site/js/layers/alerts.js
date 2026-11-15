import { defineLayer } from '../domain/layer.js';
import { URUGUAY } from '../domain/scene.js';
import { DATA } from './nisarCalibrated.js';

/** Alert kinds: `value` filters them in the side panel, `kind` matches the property in alerts.json. */
export const ALERT_KINDS = [
  { value: 1, kind: 'flood', label: 'Flood candidate', color: [120, 95, 255],
    rule: 'Much darker than usual (HH >= 3 dB below its pass median, HH < -17, HV < -23 dB) within 1 km of permanent water.',
    caveat: 'Very dry, smooth bare soil can look like water: check rainfall for that date.' },
  { value: 2, kind: 'vegetation-loss', label: 'Vegetation loss candidate', color: [255, 60, 60],
    rule: 'Woody (HV > -14 dB) and HV dropped >= 4 dB, lasting over the next 4 dates.',
    caveat: 'Also triggered by harvest of tall crops or by soil drying; check an optical image.' },
  { value: 3, kind: 'crop-growth', label: 'Crop growth candidate', color: [190, 255, 60],
    rule: 'Low HV (< -18 dB) that rose >= 4 dB and stayed high: crops or pasture growing.',
    caveat: 'Wetter soil also raises HV a little; growth shows as a steady rise.' },
];

/** Change alerts computed offline from the NISAR time series (scripts/nisar_alerts.py). */
export default defineLayer({
  id: 'alerts',
  title: 'Change alerts',
  description: 'Patches where the radar changed in a way that matches a flood, vegetation loss or crop growth. Click one for the evidence.',
  caveat: 'Candidates from simple rules, not confirmed events.',
  region: { name: 'Uruguay', bbox: URUGUAY.bbox },
  classes: ALERT_KINDS,
  tiers: [{
    id: 'alerts', label: 'NISAR change alerts', kind: 'geojson',
    url: () => `${DATA.dir}/alerts.json`,
    attribution: 'Alerts derived from NISAR GCOV (NASA-ISRO)',
  }],
});
