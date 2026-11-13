/**
 * Only place that touches the MapLibre global `maplibregl`. A 3D globe that zooms continuously;
 * each layer holds all its tiers at once (by zoom range), and a new date fades in over the old one.
 */
import { tierZoomRanges } from '../domain/layer.js';
import { paintClasses } from '../domain/landCover.js';

const FADE_MS = 700;
const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const PROTOCOL = 'sarclasses'; // class tiles recoloured in the browser: sarclasses://<layer id>|<version>|<tile url>
const STYLE = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'sky-color': '#0b1630', 'horizon-color': '#2c5a8c', 'fog-color': '#0b1630', 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] },
  sources: {
    bluemarble: { type: 'raster', tiles: [GIBS_BASE], tileSize: 256, maxzoom: 8, attribution: 'Blue Marble: NASA GIBS' },
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
    aoi: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'space', type: 'background', paint: { 'background-color': '#04060c' } },
    { id: 'bluemarble', type: 'raster', source: 'bluemarble', paint: { 'raster-saturation': -0.2 } },
    { // street map fades in when close, darkened (inverted) to match the theme
      id: 'osm', type: 'raster', source: 'osm', minzoom: 6,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8, 0.9], 'raster-brightness-min': 0.92, 'raster-brightness-max': 0.08, 'raster-hue-rotate': 180, 'raster-saturation': -0.5, 'raster-contrast': 0.1 },
    },
    { id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#ff9a3c', 'line-width': 2, 'line-dasharray': [3, 2] } },
  ],
};

const abs = (url) => (/^[a-z]+:/i.test(url) ? url : location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + url);
const box = ([w, s, e, n]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });

export class MapView {
  constructor(elementId, aoi) {
    this.opacity = 0.8;
    this.order = []; // layer ids bottom -> top, set by the composition root
    this.loadingEl = document.getElementById('loading');
    this.fadeMs = FADE_MS; // cross-fade length; Evolution sets it per frame (withFade) so the fade fills the gap between dates
    this.slots = new Map(); // layer id -> { layer, date, key, group, kind }
    this.busy = new Map(); // layer id -> progress text
    this.classFilter = () => new Set(); // set by the composition root: layer id -> visible class values
    this.seq = 0;
    this.version = new Map(); // layer id -> class tile repaint counter
    this.registerClassProtocol();
    const [w, s, e, n] = aoi.bbox;
    this.map = new maplibregl.Map({
      container: elementId, style: STYLE, center: [(w + e) / 2, (s + n) / 2 - 8], zoom: 1.3,
      attributionControl: { compact: true }, maxPitch: 70,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.addControl(new maplibregl.GlobeControl(), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl(), 'bottom-right');
    this.ready = new Promise((res) => this.map.once('load', res));
    this.map.on('error', (ev) => this.onSourceError(ev));
    this.first = true;
    this.setArea(aoi);
  }

  /** New area of interest: outline it, fly to it, and reload active layers clipped to it. */
  async setArea(aoi) {
    this.bbox = aoi.bbox;
    await this.ready;
    this.map.getSource('aoi').setData(box(aoi.bbox));
    const [w, s, e, n] = aoi.bbox;
    this.map.fitBounds([[w, s], [e, n]], { padding: 60, duration: this.first ? 3500 : 1500, essential: true });
    this.first = false;
    for (const slot of this.slots.values()) { slot.key = null; this.show(slot.layer, slot.date); }
  }

  resetView() { const [w, s, e, n] = this.bbox; this.map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 1200 }); }

  /** Current view as [w, s, e, n]. */
  viewBox() {
    const b = this.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  /** Run fn (which shows layers) with a different cross-fade length. */
  withFade(ms, fn) {
    this.fadeMs = ms;
    try { fn(); } finally { this.fadeMs = FADE_MS; }
  }

  /** Show a layer for a date. The new date is loaded underneath, then cross-faded over the old one. */
  async show(layer, date) {
    const fadeMs = this.fadeMs; // read before any await: callers set it just around their call
    await this.ready;
    const ranges = tierZoomRanges(layer, date);
    const key = `${date ?? ''}|${this.bbox}|${ranges.map((r) => r.tier.url?.(date)).join(' ')}`; // the URL changes with display options
    const slot = this.slots.get(layer.id) ?? { layer, key: null, group: null };
    slot.layer = layer; slot.date = date;
    this.slots.set(layer.id, slot);
    if (slot.key === key) return;
    slot.key = key;
    if (ranges[0].tier.kind === 'geojson') { this.showGeoJson(slot, ranges[0].tier, date); return; }
    if (slot.pending) this.removeGroup(slot.pending); // a newer date replaces one still loading
    const group = { id: `${layer.id}::${this.seq += 1}`, parts: [], failed: false };
    slot.pending = group;
    this.setBusy(layer.id, `${layer.title}`);
    for (const r of ranges) await this.addPart(slot, group, r, date);
    if (slot.pending !== group) return;
    await this.loaded(group);
    if (slot.pending !== group) return;
    slot.pending = null;
    this.setBusy(layer.id, null);
    if (layer.usesDate && date) this.onLayerStatus?.(layer, date, !group.failed);
    const fade = { duration: fadeMs, delay: 0 };
    for (const p of group.parts) {
      this.map.setPaintProperty(p.lid, 'raster-opacity-transition', fade);
      this.map.setPaintProperty(p.lid, 'raster-opacity', this.opacity);
    }
    const old = slot.group;
    slot.group = group;
    if (old) {
      for (const p of old.parts) {
        if (!this.map.getLayer(p.lid)) continue;
        this.map.setPaintProperty(p.lid, 'raster-opacity-transition', fade);
        this.map.setPaintProperty(p.lid, 'raster-opacity', 0);
      }
      setTimeout(() => this.removeGroup(old), fade.duration + 50);
    }
  }

  async addPart(slot, group, { tier, minzoom, maxzoom }, date) {
    const { layer } = slot;
    const sid = `${group.id}::${tier.id}`;
    const part = { sid, lid: sid, tier, minzoom, maxzoom };
    const [w, s, e, n] = tier.bbox ?? this.bbox;
    const corners = [[w, n], [e, n], [e, s], [w, s]];
    if (tier.kind === 'image') {
      this.map.addSource(sid, { type: 'image', url: abs(tier.url(date)), coordinates: corners });
    } else if (tier.kind === 'classes') {
      try { part.raster = await this.loadPixels(tier.url(date)); } catch { group.failed = true; return; }
      if (slot.pending !== group) return;
      part.blob = await this.paintBlob(layer, part.raster);
      this.map.addSource(sid, { type: 'image', url: part.blob, coordinates: corners });
    } else {
      const url = abs(tier.url(date));
      part.template = url;
      const tiles = [tier.kind === 'classTiles' ? this.classTileUrl(layer.id, url) : url];
      this.map.addSource(sid, {
        type: 'raster', tiles, tileSize: 256, minzoom: tier.minNativeZoom ?? 0, maxzoom: tier.maxNativeZoom ?? 22,
        bounds: this.bbox, attribution: tier.attribution,
      });
    }
    const crisp = tier.kind === 'classes' || tier.kind === 'classTiles';
    this.map.addLayer({
      id: part.lid, type: 'raster', source: sid, minzoom, maxzoom,
      paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: FADE_MS, delay: 0 }, 'raster-fade-duration': 250, 'raster-resampling': crisp ? 'nearest' : 'linear' },
    }, this.beforeId(layer.id));
    group.parts.push(part);
  }

  /** Waits until the group's sources have what the current view needs (or gives up after a while). */
  loaded(group) {
    const inView = (p) => { const z = this.map.getZoom(); return z >= p.minzoom && z < p.maxzoom; };
    const done = () => group.parts.every((p) => !inView(p) || !this.map.getSource(p.sid) || this.map.isSourceLoaded(p.sid));
    return new Promise((res) => {
      if (done()) { res(); return; }
      const check = () => { if (done()) { stop(); res(); } };
      const stop = () => { this.map.off('sourcedata', check); this.map.off('idle', check); clearTimeout(t); };
      const t = setTimeout(() => { stop(); res(); }, 6000);
      this.map.on('sourcedata', check);
      this.map.on('idle', check);
    });
  }

  onSourceError(ev) {
    const sid = ev.sourceId;
    if (!sid) return;
    for (const slot of this.slots.values()) {
      for (const g of [slot.pending, slot.group]) {
        const part = g?.parts.find((p) => p.sid === sid);
        if (part && part.tier.kind === 'image') g.failed = true;
      }
    }
  }

  /** Our raster layers go below the outlines, in the order of the layer list. */
  beforeId(layerId) {
    const mine = this.order.indexOf(layerId);
    for (const id of this.order.slice(mine + 1)) {
      const slot = this.slots.get(id);
      const lid = (slot?.group ?? slot?.pending)?.parts[0]?.lid;
      if (lid && this.map.getLayer(lid)) return lid;
    }
    return 'aoi-line';
  }

  removeGroup(group) {
    if (!group) return;
    for (const p of group.parts) {
      if (this.map.getLayer(p.lid)) this.map.removeLayer(p.lid);
      if (this.map.getSource(p.sid)) this.map.removeSource(p.sid);
      if (p.blob) URL.revokeObjectURL(p.blob);
    }
    group.parts = [];
  }

  hide(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    this.slots.delete(id);
    this.setBusy(id, null);
    this.ready.then(() => {
      this.removeGroup(slot.pending);
      this.removeGroup(slot.group);
      if (slot.vector) for (const lid of slot.vector) if (this.map.getLayer(lid)) this.map.removeLayer(lid);
      if (slot.vector && this.map.getSource(id)) this.map.removeSource(id);
      this.popup?.remove();
    });
  }

  setOpacity(value) {
    this.opacity = value;
    for (const s of this.slots.values()) for (const p of s.group?.parts ?? []) this.map.setPaintProperty(p.lid, 'raster-opacity', value);
  }

  /** Recolour a class layer after its class filter changed: nothing is downloaded again. */
  async repaint(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    if (slot.vector) { this.map.setFilter(`${id}-fill`, this.kindFilter(slot.layer)); this.map.setFilter(`${id}-line`, this.kindFilter(slot.layer)); return; }
    this.version.set(id, (this.version.get(id) ?? 0) + 1);
    for (const p of slot.group?.parts ?? []) {
      const src = this.map.getSource(p.sid);
      if (p.raster) {
        const old = p.blob;
        p.blob = await this.paintBlob(slot.layer, p.raster);
        src.updateImage({ url: p.blob });
        URL.revokeObjectURL(old);
      } else if (p.tier.kind === 'classTiles') src.setTiles([this.classTileUrl(id, p.template)]);
    }
  }

  // --- class rasters, recoloured locally ---

  async loadPixels(url) {
    this.rasterCache ??= new Map();
    if (!this.rasterCache.has(url)) {
      const img = new Image();
      img.src = url;
      this.rasterCache.set(url, img.decode().then(() => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      }).catch((e) => { this.rasterCache.delete(url); throw e; }));
    }
    return this.rasterCache.get(url);
  }

  paintCanvas(layer, raster) {
    const c = document.createElement('canvas');
    c.width = raster.width; c.height = raster.height;
    const rgba = paintClasses(raster.data, this.classFilter(layer.id), layer.classes);
    c.getContext('2d').putImageData(new ImageData(rgba, raster.width, raster.height), 0, 0);
    return c;
  }

  paintBlob(layer, raster) {
    return new Promise((res) => this.paintCanvas(layer, raster).toBlob((b) => res(URL.createObjectURL(b)), 'image/png'));
  }

  classTileUrl(layerId, template) { return `${PROTOCOL}://${layerId}|${this.version.get(layerId) ?? 0}|${template}`; }

  registerClassProtocol() {
    if (MapView.registered) return;
    MapView.registered = true;
    maplibregl.addProtocol(PROTOCOL, async (params) => {
      const [layerId, , url] = params.url.slice(PROTOCOL.length + 3).split('|');
      const slot = this.slots.get(layerId);
      let canvas;
      try { canvas = this.paintCanvas(slot.layer, await this.loadPixels(url)); } catch {
        canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1; // outside the data: empty tile
      }
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      return { data: await blob.arrayBuffer() };
    });
  }

  // --- vector alerts ---

  kindFilter(layer) {
    const on = this.classFilter(layer.id);
    return ['in', ['get', 'kind'], ['literal', layer.classes.filter((c) => on.has(c.value)).map((c) => c.kind)]];
  }

  async showGeoJson(slot, tier, date) {
    const { layer } = slot;
    const id = layer.id;
    this.setBusy(id, layer.title);
    let fc = null;
    try { fc = await fetch(tier.url(date)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))); } catch { fc = null; }
    this.setBusy(id, null);
    if (!fc || this.slots.get(id) !== slot) return;
    const color = ['match', ['get', 'kind'], ...layer.classes.flatMap((c) => [c.kind, `rgb(${c.color.join(',')})`]), '#fff'];
    if (this.map.getSource(id)) { this.map.getSource(id).setData(fc); return; }
    this.map.addSource(id, { type: 'geojson', data: fc, attribution: tier.attribution });
    this.map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, filter: this.kindFilter(layer), paint: { 'fill-color': color, 'fill-opacity': 0.28 } });
    this.map.addLayer({ id: `${id}-line`, type: 'line', source: id, filter: this.kindFilter(layer), paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 3], 'line-blur': 0.4 } });
    slot.vector = [`${id}-fill`, `${id}-line`];
    const byKind = new Map(layer.classes.map((c) => [c.kind, c]));
    this.map.on('mouseenter', `${id}-fill`, () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', `${id}-fill`, () => { this.map.getCanvas().style.cursor = ''; });
    this.map.on('click', `${id}-fill`, (ev) => {
      const f = ev.features[0];
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ maxWidth: '300px', className: 'alert-popup' })
        .setLngLat(ev.lngLat).setDOMContent(this.alertPopup(f.properties, byKind.get(f.properties.kind))).addTo(this.map);
    });
  }

  alertPopup(p, kind) {
    const div = document.createElement('div');
    const db = Object.entries(p).filter(([k]) => k.endsWith('_db')).map(([k, v]) => `${k.replace(/_db$/, '').replace(/_/g, ' ')}: ${v} dB`);
    const head = document.createElement('div');
    head.className = 'pop-head';
    head.innerHTML = `<i class="swatch" style="background:rgb(${kind.color.join(',')})"></i><b></b>`;
    head.querySelector('b').textContent = kind.label;
    const line = (text, cls) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
    const why = p.why ?? kind.rule;
    div.append(head, line(p.date ? `${p.date} · ${p.area_ha} ha` : `${p.area_ha} ha`, 'pop-meta'), line(why, ''), line(db.join(' · '), 'pop-db'), line(kind.caveat, 'pop-caveat'));
    if (p.date) { // alerts belong to a date; built-up areas hold for all of them
      const go = document.createElement('button');
      go.textContent = `Show ${p.date}`;
      go.addEventListener('click', () => this.onAlertDate?.(p.date));
      div.append(go);
    }
    return div;
  }

  // --- drawing an area (used by AreaSelector, which stays library-free) ---

  /** Element to put full-map overlays in (the map's own container). */
  overlayParent() { return this.map.getContainer(); }

  lngLatAt(clientX, clientY) {
    const r = this.map.getContainer().getBoundingClientRect();
    const p = this.map.unproject([clientX - r.left, clientY - r.top]);
    return [p.lng, p.lat];
  }

  setBusy(id, text) {
    if (text) this.busy.set(id, text); else this.busy.delete(id);
    this.loadingEl.hidden = this.busy.size === 0;
    this.loadingEl.querySelector('span').textContent = [...this.busy.values()].join(' · ') || '';
  }
}
