/**
 * "El Niño flood response" panel: for the current view, which ground a river rise would cover, which public
 * buildings stay dry as refuges, which named places may be cut off by road, and a road route to the nearest
 * dry refuge that avoids flooded streets.
 * Everything runs in the browser from open sources: terrain (NASA SRTM), water seen by NISAR in the selected
 * date, rivers, roads and buildings from OpenStreetMap, rain forecast from Open-Meteo.
 * A planning aid built on simple assumptions, not an official evacuation plan.
 */
import { heightAboveWater, isFlooded, rankSites, SAFE_MARGIN_M } from '../domain/floodRisk.js';
import { buildGraph, evacuationPlan, isolatedPlaces, nearestNode } from '../domain/routing.js';
import { latToY, loadTerrain, lonToX, TERRAIN_ATTRIBUTION, xToLon, yToLat } from '../infrastructure/terrain.js';
import { rainForecast } from '../infrastructure/rainForecast.js';

const MAX_SPAN = 0.3; // degrees: a city or a stretch of river; roads of a bigger view are too many for Overpass
const MAX_GRID = 1600; // cells per side drawn from the precomputed grid (country view is downsampled to this)
const PLACE_COLOR = { 'cut-off': '#ff4fd8', flooded: '#ff5a5a', connected: '#e8eefc' };
const STATUS_COLOR = { safe: '#3ddc84', 'at-risk': '#ffc94d', flooded: '#ff5a5a', unknown: '#9aa4b2' };
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const point = (p, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: p } });
const line = (coords, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });

export class FloodPanel {
  /**
   * nisarWater() -> {url, bbox} of the class image of the selected date (water = 1 or 5), or null.
   * dataDirs(view) -> folders to try, the selected area first, then precomputed areas holding the view; the first
   * with flood_hand.png / flood_sites.json (scripts/flood_precompute.py) answers views too big for the detailed analysis.
   */
  constructor(doc, map, osm, fetchFn, { nisarWater, dataDirs, areaBox }) {
    this.areaBox = areaBox; // () -> [w, s, e, n] of the selected area
    this.dataDirs = dataDirs;
    this.map = map;
    this.osm = osm;
    this.fetch = fetchFn;
    this.nisarWater = nisarWater;
    this.el = {
      run: doc.getElementById('flood-run'), rise: doc.getElementById('flood-rise'), riseOut: doc.getElementById('flood-rise-value'),
      pick: doc.getElementById('flood-pick'), info: doc.getElementById('flood-info'), rain: doc.getElementById('flood-rain'),
      clear: doc.getElementById('flood-clear'),
    };
    this.scene = null;
    this.origin = null;
    this.runLabel = this.el.run.textContent;
    this.el.run.addEventListener('click', () => this.run());
    this.el.rise.addEventListener('input', () => this.render());
    this.el.pick.addEventListener('click', () => this.pick());
    this.el.clear.addEventListener('click', () => this.clear());
  }

  get rise() { return Number(this.el.rise.value); }

  say(text) { this.el.info.textContent = text; }

  /** Spinner in the panel and on the map while the analysis runs; busy(null) ends it. */
  busy(text) {
    this.map.setBusy('flood', text);
    this.el.run.textContent = text ? 'Analyzing...' : this.runLabel;
    if (!text) return;
    this.el.info.replaceChildren(Object.assign(document.createElement('i'), { className: 'spinner' }), ` ${text}`);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // let the browser paint it
  }

  async run() {
    // The selected area is what gets analyzed, wherever the map is looking. Roads need a small box, so a small
    // selected area is analyzed whole in detail; inside a big one, zooming in to a town analyzes that town.
    const big = ([w0, s0, e0, n0]) => e0 - w0 > MAX_SPAN || n0 - s0 > MAX_SPAN;
    const selected = this.areaBox?.() ?? null;
    let view = this.map.viewBox();
    if (selected && !big(selected)) view = selected;
    else if (big(view)) { this.runPrecomputed(selected ?? view); return; }
    const [w, s, e, n] = view;
    this.el.run.disabled = true;
    let ok = false;
    try {
      await this.busy('Reading terrain (SRTM), rivers, roads and public buildings (OpenStreetMap)...');
      const [terrain, osm, rain, nisar] = await Promise.all([
        loadTerrain(view), this.osm.evacuation(view), rainForecast(this.fetch, (w + e) / 2, (s + n) / 2), this.loadNisarWater(),
      ]);
      await this.busy('Computing which ground each river rise would cover...');
      const water = this.waterMask(terrain, osm.water, nisar);
      const hand = heightAboveWater(terrain.elev, water, terrain.width, terrain.height);
      const sites = osm.sites.map((x) => ({ ...x, hand: hand[terrain.index(x.lon, x.lat)] }));
      const graph = buildGraph(osm.roads);
      const places = (osm.places ?? []).map((x) => ({ ...x, node: nearestNode(graph, [x.lon, x.lat], 800) }));
      this.scene = { terrain, hand, sites, places, graph, nodes: new Map(), nisar: Boolean(nisar) };
      this.showRain(rain);
      this.el.rise.disabled = false;
      this.el.pick.disabled = false;
      this.el.clear.hidden = false;
      ok = true;
    } catch (err) {
      this.busy(null);
      this.say(`Could not read the data for this view (${err.message}). OpenStreetMap servers are often busy: try again in a minute.`);
    } finally {
      this.busy(null);
      this.el.run.disabled = false;
    }
    if (ok) this.render();
  }

  /** Big view: flooded ground and refuges from the precomputed grid of the area; no roads, so no routes. */
  async runPrecomputed(view) {
    this.el.run.disabled = true;
    let ok = false;
    try {
      await this.busy('Reading the precomputed flood map...');
      let dir = null;
      let meta = null;
      for (const d of this.dataDirs(view)) { // an area analyzed before the flood step existed falls back to a ready one
        meta = await this.fetch(`${d}/flood_hand.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (meta) { dir = d; break; }
      }
      const sites = dir ? await this.fetch(`${dir}/flood_sites.json`).then((r) => (r.ok ? r.json() : { sites: [] })).catch(() => ({ sites: [] })) : null;
      if (!meta) {
        this.say('No precomputed flood map for this area. Zoom in to a town or a stretch of river (about 30 km across or less), then press the button again.');
        return;
      }
      const pixels = await this.map.loadPixels(`${dir}/flood_hand.png`);
      const terrain = cropGrid(meta, pixels, view);
      if (!terrain) { this.say('This area is outside the precomputed flood map.'); return; }
      const [w, s, e, n] = view;
      const inView = sites.sites.filter((x) => x.lon >= w && x.lon <= e && x.lat >= s && x.lat <= n)
        .map((x) => ({ ...x, hand: x.hand ?? NaN }));
      const rain = await rainForecast(this.fetch, (w + e) / 2, (s + n) / 2).catch(() => null);
      this.origin = null;
      this.map.setOverlay('flood-route', null);
      this.map.setOverlay('flood-places', null);
      this.scene = { terrain, hand: terrain.hand, sites: inView, graph: null, precomputed: true };
      this.showRain(rain);
      this.el.rise.disabled = false;
      this.el.pick.disabled = true;
      this.el.clear.hidden = false;
      ok = true;
    } catch (err) {
      this.say(`Could not read the precomputed flood map (${err.message}).`);
    } finally {
      this.busy(null);
      this.el.run.disabled = false;
    }
    if (ok) this.render();
  }

  showRain(rain) {
    this.el.rain.textContent = rain
      ? `Rain forecast here, next 7 days: ${rain.total} mm (Open-Meteo). Wettest day: ${rain.days.reduce((a, d) => (d.mm > a.mm ? d : a)).date}.`
      : '';
  }

  async loadNisarWater() {
    const src = this.nisarWater();
    if (!src) return null;
    try { return { ...src, pixels: await this.map.loadPixels(src.url) }; } catch { return null; }
  }

  /** Water cells: OSM rivers and lakes, the sea (elevation <= 0) and water seen by NISAR on the selected date. */
  waterMask(terrain, osmWater, nisar) {
    const { width, height, toPixel, toLonLat, elev } = terrain;
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const trace = (ring) => { ctx.beginPath(); ring.forEach((p, i) => { const [x, y] = toPixel(...p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); };
    osmWater.polygons.forEach((r) => { trace(r); ctx.fill(); });
    osmWater.lines.forEach((r) => { trace(r); ctx.stroke(); });
    const px = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] > 0 || elev[i] <= 0 ? 1 : 0;
    if (nisar) {
      const { pixels, bbox: [bw, bs, be, bn] } = nisar;
      for (let r = 0; r < height; r += 1) {
        const lat = toLonLat(0, r + 0.5)[1];
        const row = Math.floor(((bn - lat) / (bn - bs)) * pixels.height);
        if (row < 0 || row >= pixels.height) continue;
        for (let col = 0; col < width; col += 1) {
          const lon = toLonLat(col + 0.5, 0)[0];
          const k = Math.floor(((lon - bw) / (be - bw)) * pixels.width);
          if (k < 0 || k >= pixels.width) continue;
          const v = pixels.data[(row * pixels.width + k) * 4];
          if (v === 1 || v === 5) mask[r * width + col] = 1;
        }
      }
    }
    return mask;
  }

  render() {
    const sc = this.scene;
    if (!sc) return;
    const rise = this.rise;
    this.el.riseOut.textContent = `${rise.toFixed(1)} m`;
    const { width, height, corners } = sc.terrain;
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(width, height);
    for (let i = 0; i < sc.hand.length; i++) {
      const h = sc.hand[i];
      if (!Number.isFinite(h)) continue;
      if (h <= rise) { // flooded: darker with depth
        const depth = Math.min(1, (rise - h) / 3);
        img.data.set([40, 140 - depth * 60, 255, 120 + depth * 110], i * 4);
      } else if (h <= rise + SAFE_MARGIN_M) {
        img.data.set([255, 210, 80, 60], i * 4); // within the safety margin
      }
    }
    ctx.putImageData(img, 0, 0);
    this.map.setOverlay('flood-extent', { image: { url: c.toDataURL(), corners } });
    const ranked = rankSites(sc.sites, rise);
    this.map.setOverlay('flood-sites', {
      geojson: { type: 'FeatureCollection', features: ranked.map((x) => point([x.lon, x.lat], { name: x.name, type: x.type, status: x.status, hand: x.hand })) },
      attribution: `${TERRAIN_ATTRIBUTION}; refuges and roads © OpenStreetMap contributors`,
      layers: [{ type: 'circle', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],
        'circle-color': ['match', ['get', 'status'], ...Object.entries(STATUS_COLOR).flat(), '#fff'],
        'circle-stroke-color': '#0b1630', 'circle-stroke-width': 1.5,
      } }],
      popup: (p) => this.sitePopup(p),
    });
    const safe = ranked.filter((x) => x.status === 'safe').length;
    const wet = ranked.filter((x) => x.status === 'flooded').length;
    const share = Math.round((sc.hand.filter((h) => isFlooded(h, rise)).length / sc.hand.length) * 100);
    this.say(`River ${rise.toFixed(1)} m above its usual level: about ${share}% of the analyzed area under water (blue). `
      + `${safe} of ${ranked.length} public buildings stay dry with ${SAFE_MARGIN_M} m to spare (green), ${wet} flooded (red). `
      + (sc.precomputed
        ? 'Precomputed for the whole area (~130 m cells, rivers wider than ~30 m). Zoom in to a town (about 30 km across or less) and press the button again for streams, roads and evacuation routes.'
        : `Water seeds: OpenStreetMap rivers${sc.nisar ? ' + water seen by NISAR on the selected date' : ''}.`)
      + (sc.graph ? this.renderPlaces() : ''));
    if (this.origin && sc.graph) this.plan();
  }

  /**
   * Named places the scenario may cut off by road: draws them and returns the sentence for the panel.
   * Road points over the usual water (bridges, culverts) are not tested, so nothing is cut at the usual level;
   * a crossing closes when the ground next to it floods.
   */
  renderPlaces() {
    const sc = this.scene;
    const rise = this.rise;
    const roadFlooded = ([lon, lat]) => { const h = sc.hand[sc.terrain.index(lon, lat)]; return h > 0 && isFlooded(h, rise); };
    const places = isolatedPlaces(sc.graph, sc.places, roadFlooded).filter((x) => x.status !== 'no-road');
    const cut = places.filter((x) => x.status === 'cut-off');
    if (cut.length) { // dry public buildings inside each cut-off pocket
      const safe = rankSites(sc.sites, rise).filter((x) => x.status === 'safe');
      const pockets = isolatedPlaces(sc.graph, safe.map((x) => ({ node: this.siteNode(x) })), roadFlooded).map((x) => x.pocket);
      cut.forEach((x) => { x.refuges = pockets.filter((k) => k === x.pocket).length; });
    }
    this.map.setOverlay('flood-places', {
      geojson: { type: 'FeatureCollection', features: places.map((x) => point([x.lon, x.lat], { name: x.name, type: x.type, status: x.status, refuges: x.refuges ?? -1 })) },
      layers: [{ type: 'circle', paint: {
        'circle-radius': ['match', ['get', 'status'], 'connected', 4, 9],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': ['match', ['get', 'status'], ...Object.entries(PLACE_COLOR).flat(), '#fff'],
        'circle-stroke-width': ['match', ['get', 'status'], 'connected', 1.5, 3.5],
      } }],
      popup: (p) => this.placePopup(p),
    });
    if (!places.length) return '';
    const names = (list) => { const n = list.map((x) => x.name); return n.length > 8 ? `${n.slice(0, 8).join(', ')} and ${n.length - 8} more` : n.join(', '); };
    const under = places.filter((x) => x.status === 'flooded');
    const noRefuge = cut.filter((x) => x.refuges === 0);
    return ` Places that may be cut off by road (pink rings): ${cut.length ? names(cut) : 'none'}.`
      + (noRefuge.length ? ` With no dry public building inside: ${names(noRefuge)}.` : '')
      + (under.length ? ` With the road at the place under water (red rings): ${names(under)}.` : '')
      + ' Candidates to check: bridges and embankments are not in the terrain model.';
  }

  siteNode(x) {
    const sc = this.scene;
    const key = `${x.lon},${x.lat}`;
    if (!sc.nodes.has(key)) sc.nodes.set(key, nearestNode(sc.graph, [x.lon, x.lat], 300));
    return sc.nodes.get(key);
  }

  placePopup(p) {
    const div = document.createElement('div');
    const status = {
      'cut-off': 'May be cut off: in this scenario no dry road joins it to the largest dry road network of this view.',
      flooded: 'The road at this place is under water in this scenario.',
      connected: 'Still joined by dry roads to the largest dry road network of this view.',
    }[p.status];
    div.innerHTML = '<div class="pop-head"><b></b></div><div class="pop-meta"></div><div></div><div class="pop-caveat">A candidate from a simple model: bridges and embankments are not in the terrain data. Check with SINAE / the departmental Cecoed.</div>';
    div.querySelector('b').textContent = p.name;
    div.querySelector('.pop-meta').textContent = `OpenStreetMap place (${p.type})`;
    div.children[2].textContent = status + (Number(p.refuges) >= 0 ? ` Dry public buildings it can still reach: ${p.refuges}.` : '');
    return div;
  }

  sitePopup(p) {
    const div = document.createElement('div');
    const h = Number(p.hand);
    const status = { safe: 'Stays dry: candidate refuge', 'at-risk': 'Dry but close to the water level', flooded: 'Under water in this scenario', unknown: 'No terrain data' }[p.status];
    div.innerHTML = '<div class="pop-head"><b></b></div><div class="pop-meta"></div><div></div><div class="pop-caveat">Check with SINAE / the departmental Cecoed whether it is an official shelter.</div>';
    div.querySelector('b').textContent = p.name;
    div.querySelector('.pop-meta').textContent = `${p.type} · ${Number.isFinite(h) ? `${h.toFixed(1)} m above the nearest water` : ''}`;
    div.children[2].textContent = status;
    return div;
  }

  async pick() {
    this.say('Click on the map where people need to leave from.');
    this.origin = await this.map.pickPoint();
    this.plan();
  }

  plan() {
    const sc = this.scene;
    const rise = this.rise;
    const { terrain, hand, graph } = sc;
    const blocked = ([lon, lat]) => isFlooded(hand[terrain.index(lon, lat)], rise);
    const origin = nearestNode(graph, this.origin, 1500);
    if (origin === null) { this.say('No road near that point. Pick a point closer to a street.'); return; }
    const node = (x) => this.siteNode(x);
    const safe = rankSites(sc.sites, rise).filter((x) => x.status === 'safe').map((x) => ({ ...x, node: node(x) })).filter((x) => x.node !== null);
    const plan = evacuationPlan(graph, origin, safe, blocked);
    const from = point(this.origin, { role: 'origin' });
    if (!plan) {
      this.map.setOverlay('flood-route', { geojson: { type: 'FeatureCollection', features: [from] }, layers: ROUTE_LAYERS });
      this.say('No dry public building reachable by road from here in this scenario: move to higher ground and follow SINAE instructions.');
      return;
    }
    // The road route runs between road nodes: join it to the clicked point and to the refuge itself, and ring the refuge.
    const dest = [plan.site.lon, plan.site.lat];
    const features = [
      from, line(plan.route, { role: 'route' }),
      line([this.origin, plan.route[0]], { role: 'link' }), line([plan.route[plan.route.length - 1], dest], { role: 'link' }),
      point(dest, { role: 'dest' }),
    ];
    const cut = plan.usualLength.wet > 0 && plan.usual.length > 1;
    if (cut) features.push(line(plan.usual, { role: 'usual' }));
    this.map.setOverlay('flood-route', { geojson: { type: 'FeatureCollection', features }, layers: ROUTE_LAYERS });
    const wet = plan.length.wet > 0 ? ` Warning: ${km(plan.length.wet)} of it is already under water: leave before the river peaks.` : '';
    this.say(`Nearest dry refuge: ${plan.site.name} (${plan.site.type}), ${km(plan.length.total)} by road (green, ringed on the map).`
      + (cut ? ` The usual shortest way (${km(plan.usualLength.total)}, red dashes) crosses ${km(plan.usualLength.wet)} of flooded road; the green route avoids it.` : ' The usual way is dry.')
      + wet);
  }

  clear() {
    this.scene = null;
    this.origin = null;
    ['flood-extent', 'flood-sites', 'flood-route', 'flood-places'].forEach((id) => this.map.setOverlay(id, null));
    this.el.rise.disabled = true;
    this.el.pick.disabled = true;
    this.el.clear.hidden = true;
    this.el.rain.textContent = '';
    this.say('');
  }
}

/**
 * Window of the precomputed height grid (decimetres in the red channel, 255 = no data) covering view, every
 * `step` cells so no side exceeds MAX_GRID. Returns a terrain-like object with hand, or null outside the grid.
 */
function cropGrid(meta, pixels, [w, s, e, n]) {
  const { zoom: z, tx0, ty0, width, height } = meta;
  const col = (lon) => (lonToX(lon, z) - tx0) * 256;
  const row = (lat) => (latToY(lat, z) - ty0) * 256;
  const c0 = Math.max(0, Math.floor(col(w)));
  const c1 = Math.min(width, Math.ceil(col(e)));
  const r0 = Math.max(0, Math.floor(row(n)));
  const r1 = Math.min(height, Math.ceil(row(s)));
  if (c1 <= c0 || r1 <= r0) return null;
  const step = Math.max(1, Math.ceil(Math.max(c1 - c0, r1 - r0) / MAX_GRID));
  const gw = Math.ceil((c1 - c0) / step);
  const gh = Math.ceil((r1 - r0) / step);
  const hand = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      const v = pixels.data[((r0 + r * step) * pixels.width + c0 + c * step) * 4];
      hand[r * gw + c] = v === 255 ? NaN : v / 10;
    }
  }
  const lonLat = (c, r) => [xToLon((tx0 * 256 + c0 + c * step) / 256, z), yToLat((ty0 * 256 + r0 + r * step) / 256, z)];
  const index = (lon, lat) => {
    const c = Math.floor((col(lon) - c0) / step);
    const r = Math.floor((row(lat) - r0) / step);
    return c >= 0 && c < gw && r >= 0 && r < gh ? r * gw + c : -1;
  };
  return { hand, width: gw, height: gh, index, corners: [lonLat(0, 0), lonLat(gw, 0), lonLat(gw, gh), lonLat(0, gh)] };
}

const ROUTE_LAYERS = [
  { type: 'line', filter: ['==', ['get', 'role'], 'usual'], paint: { 'line-color': '#ff5a5a', 'line-width': 3, 'line-dasharray': [2, 2] } },
  { type: 'line', filter: ['==', ['get', 'role'], 'route'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3ddc84', 'line-width': 5 } },
  { type: 'line', filter: ['==', ['get', 'role'], 'link'], paint: { 'line-color': '#3ddc84', 'line-width': 3, 'line-dasharray': [1, 1.5] } },
  { type: 'circle', filter: ['==', ['get', 'role'], 'dest'], paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#3ddc84', 'circle-stroke-width': 3 } },
  { type: 'circle', filter: ['==', ['get', 'role'], 'origin'], paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-color': '#ff9a3c', 'circle-stroke-width': 3 } },
];
