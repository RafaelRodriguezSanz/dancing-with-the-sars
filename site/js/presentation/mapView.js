/* Only place (with controls) that touches the Leaflet global `L`. */
import { gibsTileUrl, GIBS_MAX_NATIVE_ZOOM } from '../infrastructure/gibs.js';
import { classifyTile } from '../domain/tileQuality.js';

const MAX_TRIES = 3;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('tile failed'));
    img.src = url;
  });
}

/** Tile layer that draws only real imagery: GIBS noise tiles (no-data areas) are left transparent. */
function createFilteredLayer(template, options) {
  const Filtered = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;
      const url = L.Util.template(template, { z: coords.z, x: coords.x, y: coords.y });
      (async () => {
        let img = null;
        for (let i = 0; i < MAX_TRIES && !img; i += 1) {
          try { img = await loadImage(url); } catch { /* retry: GIBS sometimes answers HTTP 500 */ }
        }
        if (!img) return done(new Error('tile failed'), tile);
        const ctx = tile.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 256, 256);
        if (classifyTile(ctx.getImageData(0, 0, 256, 256).data) === 'corrupt') ctx.clearRect(0, 0, 256, 256);
        return done(null, tile);
      })();
      return tile;
    },
  });
  return new Filtered(options);
}

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
    const layer = createFilteredLayer(gibsTileUrl(date), {
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
