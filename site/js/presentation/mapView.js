/** Only place (with controls/layerPanel) that touches the Leaflet global `L`. */
import { tierForZoom } from '../domain/layer.js';

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
    this.slots = new Map(); // layer id -> { layer, date, key, visible, pending }
    this.busy = new Map(); // layer id -> progress text
    // Quality upgrade: when zoom crosses a tier threshold, swap that layer's source.
    this.map.on('zoomend', () => { for (const s of this.slots.values()) this.show(s.layer, s.date); });
  }

  /** Show (or refresh) a layer. Fetches only the visible viewport tiles of the tier for the current zoom. */
  show(layer, date) {
    const tier = tierForZoom(layer, this.map.getZoom());
    const key = `${tier.id}|${date ?? ''}`;
    const slot = this.slots.get(layer.id) ?? { layer, visible: null, pending: null, key: null };
    slot.layer = layer; slot.date = date;
    this.slots.set(layer.id, slot);
    if (slot.key === key) return;
    slot.key = key;
    if (slot.pending) { this.map.removeLayer(slot.pending); slot.pending = null; }
    const tl = L.tileLayer(tier.url(date), {
      maxNativeZoom: tier.maxNativeZoom, maxZoom: 16, opacity: this.opacity, attribution: tier.attribution,
    });
    let pending = 0; let done = 0;
    const update = () => this.setBusy(layer.id, pending > 0 ? `${layer.title} [${tier.label}] ${done}/${done + pending}` : null);
    tl.on('loading', () => { done = 0; update(); });
    tl.on('tileloadstart', () => { pending += 1; update(); });
    const finish = () => { pending = Math.max(0, pending - 1); done += 1; update(); };
    tl.on('tileload', finish);
    tl.on('tileerror', finish);
    tl.on('load', () => {
      pending = 0; update();
      // Swap only when the new source is ready, so the map never flashes empty.
      if (slot.visible && slot.visible !== tl) this.map.removeLayer(slot.visible);
      slot.visible = tl; slot.pending = null;
    });
    slot.pending = tl.addTo(this.map);
  }

  hide(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    for (const l of [slot.visible, slot.pending]) if (l) this.map.removeLayer(l);
    this.slots.delete(id);
    this.setBusy(id, null);
  }

  setBusy(id, text) {
    if (text) this.busy.set(id, text); else this.busy.delete(id);
    this.loadingEl.hidden = this.busy.size === 0;
    this.loadingEl.querySelector('span').textContent = [...this.busy.values()].join(' · ') || '';
  }

  setOpacity(value) {
    this.opacity = value;
    for (const s of this.slots.values()) for (const l of [s.visible, s.pending]) if (l) l.setOpacity(value);
  }

  resetView() { this.map.fitBounds(this.bounds); }
}
