/* Only place (with controls) that touches the Leaflet global `L`. */
import { gibsTileUrl, GIBS_MAX_NATIVE_ZOOM } from '../infrastructure/gibs.js';

export class MapView {
  constructor(elementId, aoi) {
    const [w, s, e, n] = aoi.bbox;
    this.bounds = [[s, w], [n, e]];
    this.map = L.map(elementId, { zoomControl: true }).fitBounds(this.bounds);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.rectangle(this.bounds, { color: '#ff6600', weight: 2, fill: false, interactive: false }).addTo(this.map);
    this.opacity = 0.8;
    this.layer = null;
  }

  showDate(date) {
    if (this.layer) this.map.removeLayer(this.layer);
    this.layer = null;
    if (!date) return;
    this.layer = L.tileLayer(gibsTileUrl(date), {
      maxNativeZoom: GIBS_MAX_NATIVE_ZOOM,
      maxZoom: 16,
      opacity: this.opacity,
      attribution: 'Imagery: NASA GIBS &mdash; NISAR GCOV (NASA-ISRO)',
    }).addTo(this.map);
  }

  setOpacity(value) {
    this.opacity = value;
    if (this.layer) this.layer.setOpacity(value);
  }

  resetView() {
    this.map.fitBounds(this.bounds);
  }
}
