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
    this.loadingEl = document.getElementById('loading');
    this.layer = null;
  }

  showDate(date) {
    const previous = this.layer;
    this.layer = null;
    if (!date) {
      if (previous) this.map.removeLayer(previous);
      if (this.visible) this.map.removeLayer(this.visible);
      this.visible = null;
      this.setLoading(false);
      return;
    }
    const layer = L.tileLayer(gibsTileUrl(date), {
      maxNativeZoom: GIBS_MAX_NATIVE_ZOOM,
      maxZoom: 16,
      opacity: this.opacity,
      attribution: 'Imagery: NASA GIBS &mdash; NISAR GCOV (NASA-ISRO)',
    });
    let pending = 0;
    let done = 0;
    const update = () => this.setLoading(pending > 0, `Loading radar tiles from NASA GIBS... ${done}/${done + pending}`);
    layer.on('loading', () => { done = 0; update(); });
    layer.on('tileloadstart', () => { pending += 1; update(); });
    const finish = () => { pending = Math.max(0, pending - 1); done += 1; update(); };
    layer.on('tileload', finish);
    layer.on('tileerror', finish);
    layer.on('load', () => {
      pending = 0;
      this.setLoading(false);
      // Swap only when the new date is ready, so the map never flashes empty.
      if (this.visible && this.visible !== layer) this.map.removeLayer(this.visible);
      this.visible = layer;
    });
    this.layer = layer.addTo(this.map);
    // A layer that never finished loading (user switched again) is dropped now.
    if (previous && previous !== this.visible) this.map.removeLayer(previous);
  }

  setLoading(isLoading, text = '') {
    this.loadingEl.hidden = !isLoading;
    this.loadingEl.querySelector('span').textContent = text;
  }

  setOpacity(value) {
    this.opacity = value;
    if (this.layer) this.layer.setOpacity(value);
    if (this.visible) this.visible.setOpacity(value);
  }

  resetView() {
    this.map.fitBounds(this.bounds);
  }
}
