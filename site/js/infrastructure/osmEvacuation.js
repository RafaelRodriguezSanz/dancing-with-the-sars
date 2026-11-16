/**
 * Roads, possible refuges, named places and water from OpenStreetMap for one view, fetched live from the Overpass API.
 * Data © OpenStreetMap contributors, ODbL.
 */
import { OsmTownRepository } from './osmTowns.js';

const ROADS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const AMENITY = 'school|college|university|hospital|clinic|community_centre|social_facility|shelter|townhall|fire_station|police|place_of_worship';
const LEISURE = 'sports_centre|stadium|sports_hall';
const PLACES = 'city|town|village|hamlet|suburb|neighbourhood|quarter';

export function evacuationQuery([w, s, e, n]) {
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];
way["highway"~"^(${ROADS})$"](${b});out geom qt;
(nwr["amenity"~"^(${AMENITY})$"](${b});nwr["leisure"~"^(${LEISURE})$"](${b});node["emergency"="assembly_point"](${b}););out center tags qt;
node["place"~"^(${PLACES})$"]["name"](${b});out qt;
(way["waterway"~"^(river|stream|canal)$"](${b});way["natural"="water"](${b});relation["natural"="water"](${b});way["waterway"="riverbank"](${b}););out geom qt;`;
}

const coords = (g) => g.map((p) => [p.lon, p.lat]);
const LABEL = {
  school: 'School', college: 'College', university: 'University', hospital: 'Hospital', clinic: 'Clinic',
  community_centre: 'Community centre', social_facility: 'Social facility', shelter: 'Shelter', townhall: 'Town hall',
  fire_station: 'Fire station', police: 'Police', place_of_worship: 'Place of worship', sports_centre: 'Sports centre',
  stadium: 'Stadium', sports_hall: 'Sports hall', assembly_point: 'Assembly point',
};

/** Overpass JSON -> {roads: [{nodes, coords}], sites: [{name, type, lon, lat}], places: [{name, type, lon, lat}], water: {lines, polygons}}. */
export function parseEvacuation(json) {
  const roads = [];
  const sites = [];
  const places = [];
  const water = { lines: [], polygons: [] };
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {};
    if (el.type === 'way' && t.highway && el.geometry) {
      roads.push({ id: el.id, highway: t.highway, nodes: el.nodes, coords: coords(el.geometry) });
    } else if (el.type === 'node' && t.place && t.name && Number.isFinite(el.lon)) {
      places.push({ name: t.name, type: t.place, lon: el.lon, lat: el.lat });
    } else if (t.amenity || t.leisure || t.emergency) {
      const p = el.type === 'node' ? el : el.center;
      if (!p) continue;
      const kind = t.emergency === 'assembly_point' ? 'assembly_point' : (t.amenity ?? t.leisure);
      sites.push({ name: t.name ?? LABEL[kind] ?? kind, type: LABEL[kind] ?? kind, lon: p.lon, lat: p.lat });
    } else if (el.type === 'way' && el.geometry) {
      (t.waterway && t.waterway !== 'riverbank' ? water.lines : water.polygons).push(coords(el.geometry));
    } else if (el.type === 'relation') {
      for (const m of el.members ?? []) if (m.role === 'outer' && m.geometry) water.polygons.push(coords(m.geometry));
    }
  }
  return { roads, sites, places, water };
}

/** Saved answers for the area the site opens on, so it does not wait on the busy public servers. */
export const SNAPSHOTS = { '-56.22,-34.94,-56.08,-34.84': 'data/osm/montevideo_centre.json' };

export class OsmEvacuationRepository extends OsmTownRepository {
  /** Roads, refuges and water in bbox; rejects on network or server errors. */
  async evacuation(bbox) {
    const key = `evac:${bbox.join(',')}`;
    if (!this.cache.has(key)) {
      const live = () => this.firstOk(`?data=${encodeURIComponent(evacuationQuery(bbox))}`).then(parseEvacuation);
      const saved = SNAPSHOTS[bbox.join(',')];
      const p = saved
        ? this.fetch(saved).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(live)
        : live();
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return this.cache.get(key);
  }
}
