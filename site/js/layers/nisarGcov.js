import { defineLayer } from '../domain/layer.js';
import { gibsTileUrl, GIBS_MAX_NATIVE_ZOOM } from '../infrastructure/gibs.js';
import { SANTA_LUCIA } from '../domain/scene.js';

export default defineLayer({
  id: 'nisar-gcov',
  title: 'NISAR radar backscatter (false colour)',
  description: 'L-band radar over the area; the base image the change layers are read against.',
  caveat: 'False-colour GIBS visualisation, not calibrated values. Some dates render as noise.',
  usesDate: true,
  region: { name: 'Santa Lucía, Uruguay', bbox: SANTA_LUCIA.bbox },
  legend: [],
  tiers: [{
    id: 'gibs', label: 'NASA GIBS tiles', kind: 'tiles',
    url: gibsTileUrl, maxNativeZoom: GIBS_MAX_NATIVE_ZOOM,
    attribution: 'Imagery: NASA GIBS &mdash; NISAR GCOV (NASA-ISRO)',
  }],
});
