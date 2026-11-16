import { defineLayer } from '../domain/layer.js';
import { gibsOpticalTileUrl, GIBS_OPTICAL_MAX_NATIVE_ZOOM } from '../infrastructure/gibs.js';
import { URUGUAY } from '../domain/scene.js';

/** What an optical satellite saw on the day of the radar pass: on rainy days it is mostly cloud, which is the case for radar. */
export default defineLayer({
  id: 'optical',
  title: 'Optical satellite, same day (compare)',
  description: 'True-colour image from the VIIRS optical sensor on the day of the radar pass. Switch it on over a rainy date: clouds hide the ground that the radar still maps.',
  caveat: 'About 250 m per pixel, taken in the early afternoon, not at the radar pass time. The country mosaic shows the newest optical image.',
  usesDate: true,
  startsOff: true,
  region: { name: 'Uruguay', bbox: URUGUAY.bbox },
  legend: [],
  tiers: [{
    id: 'gibs-optical', label: 'NASA GIBS tiles', kind: 'tiles',
    url: gibsOpticalTileUrl, maxNativeZoom: GIBS_OPTICAL_MAX_NATIVE_ZOOM,
    attribution: 'Optical imagery: NASA GIBS &mdash; VIIRS (Suomi NPP)',
  }],
});
