/**
 * Towns and cities from OpenStreetMap (landuse areas), fetched in the browser from the Overpass API for any
 * box: nothing is stored in the repo. Pure query/parse helpers plus a small cached repository.
 * Data © OpenStreetMap contributors, ODbL.
 */
export const OVERPASS_URLS = [ // tried in order: the public servers are often busy (502/504)
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const LANDUSE = 'residential|commercial|industrial|retail';

/** Overpass QL for built-up landuse ways and multipolygons in bbox [w,s,e,n], with their geometry. */
export function overpassQuery([w, s, e, n]) {
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:30];(way["landuse"~"^(${LANDUSE})$"](${b});relation["landuse"~"^(${LANDUSE})$"](${b}););out geom;`;
}

/** Approximate area of a lon/lat ring in hectares (equirectangular, fine at town scale). */
export function ringHectares(ring) {
  const lat0 = (ring.reduce((a, p) => a + p[1], 0) / ring.length) * Math.PI / 180;
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  }
  return Math.abs(sum) / 2 / 1e4;
}

const closed = (g) => g.length >= 4 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;
const toRing = (g) => g.map((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);

/** Overpass JSON -> GeoJSON polygons with properties {kind, landuse, name?, area_ha, why}. Closed rings only. */
export function parseOverpass(json, kind = 'town') {
  const features = [];
  const add = (ring, tags) => {
    features.push({
      type: 'Feature',
      properties: {
        kind, landuse: tags.landuse, ...(tags.name ? { name: tags.name } : {}),
        area_ha: Math.round(ringHectares(ring) * 10) / 10,
        why: `OpenStreetMap landuse=${tags.landuse}${tags.name ? ` (${tags.name})` : ''}.`,
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  };
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    if (el.type === 'way' && el.geometry && closed(el.geometry)) add(toRing(el.geometry), tags);
    if (el.type === 'relation') {
      for (const m of el.members ?? []) if (m.role === 'outer' && m.geometry && closed(m.geometry)) add(toRing(m.geometry), tags);
    }
  }
  return { type: 'FeatureCollection', features };
}

export class OsmTownRepository {
  constructor(fetchFn, urls = OVERPASS_URLS) {
    this.fetch = fetchFn;
    this.urls = urls;
    this.cache = new Map(); // bbox -> Promise<FeatureCollection>
  }

  /** Town polygons in bbox; rejects on network/server errors (the caller decides how to degrade). */
  towns(bbox) {
    const key = bbox.join(',');
    if (!this.cache.has(key)) {
      const p = this.firstOk(`?data=${encodeURIComponent(overpassQuery(bbox))}`).then((j) => parseOverpass(j));
      p.catch(() => this.cache.delete(key)); // let a later call retry
      this.cache.set(key, p);
    }
    return this.cache.get(key);
  }

  /** JSON from the first server that answers OK. */
  async firstOk(query) {
    let err;
    for (const url of this.urls) {
      try {
        const r = await this.fetch(url + query);
        if (r.ok) return await r.json();
        err = new Error(`Overpass HTTP ${r.status}`);
      } catch (e) { err = e; }
    }
    throw err;
  }
}
