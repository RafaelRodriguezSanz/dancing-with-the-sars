/**
 * Only place that touches the MapLibre global `maplibregl`. A 3D globe that zooms continuously;
 * each layer holds all its tiers at once (by zoom range), and a new date fades in over the old one.
 */
import { tierZoomRanges } from '../domain/layer.js';
import { paintClasses } from '../domain/landCover.js';

const FADE_MS = 700;
const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const PROTOCOL = 'sarclasses'; // class tiles recoloured in the browser: sarclasses://<layer id>|<version>|<tile url>
const START_KM = 1000; // width of the view the start-up flight begins from
/** Map zoom (512 px tiles) at which the window shows `km` across at latitude `lat`. */
const zoomForWidth = (km, lat) => Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180) * window.innerWidth) / (512 * km * 1000));

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
    { id: 'bluemarble', type: 'raster', source: 'bluemarble', paint: { 'raster-saturation': -0.6, 'raster-brightness-max': 0.55 } }, // dimmed so the neon classes stand out
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
    this.quiet = false; // true during the start-up card: one loader at a time
    this.fadeMs = FADE_MS; // cross-fade length; Evolution sets it per frame (withFade) so the fade fills the gap between dates
    this.slots = new Map(); // layer id -> { layer, date, key, group, kind }
    this.busy = new Map(); // layer id -> progress text
    this.classFilter = () => new Set(); // set by the composition root: layer id -> visible class values
    this.seq = 0;
    this.version = new Map(); // layer id -> class tile repaint counter
    this.registerClassProtocol();
    const [w, s, e, n] = aoi.bbox;
    this.map = new maplibregl.Map({
      container: elementId, style: STYLE, center: [(w + e) / 2, (s + n) / 2], zoom: zoomForWidth(START_KM, (s + n) / 2), // about 1000 km across; the intro flight comes in from here
      attributionControl: { compact: true }, maxPitch: 70,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.addControl(new maplibregl.GlobeControl(), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl(), 'bottom-right');
    this.ready = new Promise((res) => this.map.once('load', res));
    this.map.on('error', (ev) => this.onSourceError(ev));
    this.setArea(aoi);
  }

  /** New area of interest: outline it, fly to it, and reload active layers clipped to it. */
  async setArea(aoi) {
    this.bbox = aoi.dataBbox ?? aoi.bbox; // where the area's products sit
    this.area = aoi;
    await this.ready;
    this.map.getSource('aoi').setData(box(aoi.bbox));
    const [w, s, e, n] = aoi.bbox;
    for (const slot of this.slots.values()) { slot.key = null; this.show(slot.layer, slot.date); }
    if (!this.introFlown) {
      // Start-up (the area is set twice: by the constructor and by main.js): every call waits for the intro to
      // fade (this.intro, a promise), then a single "Go to area" flight starts from START_KM out.
      await this.intro;
      if (this.introFlown || this.area !== aoi) return; // already flown, or another area was picked meanwhile
      this.introFlown = true;
      this.resetView({ duration: 4500 }); // same flight as "Go to area", from START_KM out, with a fixed length
      return;
    }
    this.map.fitBounds([[w, s], [e, n]], { padding: this.freePadding(), duration: 1500, essential: true });
  }

  /** Smooth flight back to the area: zooms out, glides and zooms in; the length follows the distance.
   * `essential` keeps it animated even with the system "reduce motion" setting (MapLibre would jump otherwise). */
  resetView(timing = { speed: 0.9, maxDuration: 4500 }) {
    // Note: a flight longer than maxDuration jumps instantly in MapLibre, so the intro passes a fixed duration.
    const [w, s, e, n] = this.area.bbox;
    this.map.fitBounds([[w, s], [e, n]], { padding: this.freePadding(), curve: 1.5, ...timing, essential: true,
      easing: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) });
  }

  /** Map padding that keeps a fitted area clear of the floating cards (search bar on top, info card on the left,
   * layers on the right; on a phone they sit above and below). Falls back to a plain margin if too little is left. */
  freePadding(margin = 14) {
    const box = this.map.getContainer().getBoundingClientRect();
    const rect = (sel) => { const el = document.querySelector(sel); const r = el?.getBoundingClientRect(); return r?.width ? r : null; };
    const pad = { top: margin, bottom: margin, left: margin, right: margin };
    const search = rect('.search-wrap'); // search bar, ready-area chips and search message
    if (search) pad.top = search.bottom - box.top + margin;
    const progress = rect('.process-card'); // bottom centre while an area is analyzed; keep room for it even before it shows
    if (!progress) pad.bottom = 96;
    else if (progress.top - box.top > box.height / 2) pad.bottom = box.bottom - progress.top + margin;
    else pad.top = Math.max(pad.top, progress.bottom - box.top + margin); // phone: it sits under the search bar
    for (const r of [rect('.topbar'), rect('.right-col')].filter(Boolean)) {
      const narrow = r.width < box.width * 0.45; // a side card; a wide one is a top or bottom band
      if (narrow && r.left - box.left < box.width / 2) pad.left = Math.max(pad.left, r.right - box.left + margin);
      else if (narrow) pad.right = Math.max(pad.right, box.right - r.left + margin);
      else if (r.top - box.top < box.height / 2) pad.top = Math.max(pad.top, r.bottom - box.top + margin);
      else pad.bottom = Math.max(pad.bottom, box.bottom - r.top + margin);
    }
    const roomy = box.width - pad.left - pad.right > 160 && box.height - pad.top - pad.bottom > 160;
    return roomy ? pad : 40;
  }

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
    if (ranges[0].tier.kind === 'custom') { this.showCustom(slot, ranges[0].tier, date, key); return; }
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
    const [w, s, e, n] = Array.isArray(tier.bbox) ? tier.bbox : this.bbox; // 'area': the selected area
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
    this.map.addLayer({
      id: part.lid, type: 'raster', source: sid, minzoom, maxzoom,
      paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: FADE_MS, delay: 0 }, 'raster-fade-duration': 250, 'raster-resampling': 'linear' }, // linear also for classes: soft edges instead of hard pixel blocks
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
      slot.custom?.remove();
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

  /** Layer that draws itself (e.g. animated wind): tier.mount() returns an object with remove(). */
  async showCustom(slot, tier, date, key) {
    const id = slot.layer.id;
    this.setBusy(id, slot.layer.title);
    await this.ready;
    let view = null;
    try { view = await tier.mount(this, date, this.bbox); } catch (err) { console.warn(`${id}:`, err.message); }
    if (this.slots.get(id) !== slot || slot.key !== key) { view?.remove(); return; } // hidden or replaced meanwhile
    this.setBusy(id, null);
    slot.custom?.remove();
    slot.custom = view;
  }

  async showGeoJson(slot, tier, date) {
    const { layer } = slot;
    const id = layer.id;
    this.setBusy(id, layer.title);
    let fc = null;
    try {
      fc = tier.load ? await tier.load(date, this.bbox) // several sources merged by the layer
        : await fetch(tier.url(date)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
    } catch { fc = null; }
    this.setBusy(id, null);
    if (!fc || this.slots.get(id) !== slot) return;
    const color = ['match', ['get', 'kind'], ...layer.classes.flatMap((c) => [c.kind, `rgb(${c.color.join(',')})`]), '#fff'];
    if (this.map.getSource(id)) { this.map.getSource(id).setData(fc); return; }
    this.map.addSource(id, { type: 'geojson', data: fc, attribution: tier.attribution });
    this.map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, filter: this.kindFilter(layer), paint: { 'fill-color': color, 'fill-opacity': ['match', ['get', 'kind'], ...layer.classes.flatMap((c) => [c.kind, c.fill ?? 0.28]), 0.28] } });
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
    div.append(head, line(p.date ? `${p.date} · ${p.area_ha} ha` : `${p.area_ha} ha`, 'pop-meta'), line(why, ''));
    if (p.rain) div.append(line(p.rain, ''));
    if (db.length) div.append(line(db.join(' · '), 'pop-db'));
    div.append(line(kind.caveat, 'pop-caveat'));
    if (p.date) { // alerts belong to a date; built-up areas hold for all of them
      const go = document.createElement('button');
      go.textContent = `Show ${p.date}`;
      go.addEventListener('click', () => this.onAlertDate?.(p.date));
      div.append(go);
    }
    return div;
  }

  // --- flood response overlays (FloodPanel) ---

  /**
   * Own overlay on top of everything: {image: {url, corners}} or {geojson, layers: [{type, paint, layout?, filter?}]};
   * null removes it. Re-setting the same id swaps the data in place.
   */
  async setOverlay(id, spec) {
    await this.ready;
    const ids = this.overlays?.get(id) ?? [];
    this.overlays ??= new Map();
    if (!spec) {
      ids.forEach((l) => this.map.getLayer(l) && this.map.removeLayer(l));
      if (this.map.getSource(id)) this.map.removeSource(id);
      this.overlays.delete(id);
      return;
    }
    const src = this.map.getSource(id);
    if (src && spec.image) { src.updateImage({ url: spec.image.url, coordinates: spec.image.corners }); return; }
    if (src && spec.geojson) { src.setData(spec.geojson); return; }
    if (spec.image) {
      this.map.addSource(id, { type: 'image', url: spec.image.url, coordinates: spec.image.corners });
      this.map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } });
      this.overlays.set(id, [id]);
      return;
    }
    // MapLibre rejects attribution: undefined, so only pass it when there is one.
    this.map.addSource(id, { type: 'geojson', data: spec.geojson, ...(spec.attribution ? { attribution: spec.attribution } : {}) });
    const lids = spec.layers.map((l, i) => { const lid = `${id}-${i}`; this.map.addLayer({ id: lid, source: id, ...l }); return lid; });
    this.overlays.set(id, lids);
    if (spec.popup) {
      lids.forEach((lid) => {
        this.map.on('mouseenter', lid, () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', lid, () => { this.map.getCanvas().style.cursor = ''; });
        this.map.on('click', lid, (ev) => {
          this.popup?.remove();
          this.popup = new maplibregl.Popup({ maxWidth: '280px', className: 'alert-popup' })
            .setLngLat(ev.lngLat).setDOMContent(spec.popup(ev.features[0].properties)).addTo(this.map);
        });
      });
    }
  }

  /** Resolves with the [lon, lat] of the next click on the map (crosshair cursor meanwhile). */
  pickPoint() {
    const canvas = this.map.getCanvas();
    canvas.style.cursor = 'crosshair';
    return new Promise((resolve) => this.map.once('click', (ev) => { canvas.style.cursor = ''; resolve([ev.lngLat.lng, ev.lngLat.lat]); }));
  }

  // --- drawing an area (used by AreaSelector, which stays library-free) ---

  /** Element to put full-map overlays in (the map's own container). */
  overlayParent() { return this.map.getContainer(); }

  lngLatAt(clientX, clientY) {
    const r = this.map.getContainer().getBoundingClientRect();
    const p = this.map.unproject([clientX - r.left, clientY - r.top]);
    return [p.lng, p.lat];
  }

  /** Radar-scan animation over bbox while it is being loaded or processed; null removes it. Follows the map as it
   * moves. It has no text: the start-up card or the analysis card next to it already says what happens and how far. */
  setScanning(bbox) {
    if (!bbox) {
      if (this.scan) { this.map.off('move', this.scan.place); this.scan.el.remove(); this.scan = null; }
      return;
    }
    if (!this.scan) {
      const el = document.createElement('div');
      el.className = 'radar-scan';
      el.innerHTML = '<div class="radar-sweep"></div><div class="radar-track"></div>';
      this.map.getContainer().append(el);
      const place = () => {
        const [w, s, e, n] = this.scan.bbox;
        const a = this.map.project([w, n]);
        const b = this.map.project([e, s]);
        Object.assign(el.style, { left: `${Math.min(a.x, b.x)}px`, top: `${Math.min(a.y, b.y)}px`,
          width: `${Math.abs(b.x - a.x)}px`, height: `${Math.abs(b.y - a.y)}px` });
      };
      this.scan = { el, place, bbox };
      this.map.on('move', place);
    }
    this.scan.bbox = bbox;
    this.scan.place();
  }

  /** Loading pill listing what is still loading. Kept hidden while `quiet` (the start-up card covers it). */
  setBusy(id, text) {
    if (text) this.busy.set(id, text); else this.busy.delete(id);
    this.loadingEl.hidden = this.quiet || this.busy.size === 0;
    this.loadingEl.querySelector('span').textContent = [...this.busy.values()].join(' · ') || '';
  }
}
