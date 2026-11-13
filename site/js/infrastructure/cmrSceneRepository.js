import { createScene, parseGranuleTitle } from '../domain/scene.js';
import { parseCmrPolygon } from '../domain/footprint.js';

export const CMR_COLLECTIONS = ['NISAR_L2_GCOV_PROVISIONAL_V1', 'NISAR_L2_GCOV_V1'];
const CMR_BASE = 'https://cmr.earthdata.nasa.gov/search/granules.json';

export function cmrUrl(collection, aoi) {
  const params = new URLSearchParams({
    short_name: collection,
    bounding_box: aoi.bbox.join(','),
    page_size: '200',
    sort_key: 'start_date',
  });
  // keep commas readable in the bounding box
  return `${CMR_BASE}?${params.toString().replace(/%2C/g, ',')}`;
}

export function parseCmrResponse(json, collection) {
  const entries = json?.feed?.entry ?? [];
  return entries
    .filter((e) => e.time_start)
    .map((e) => createScene({
      id: e.title,
      collection,
      start: e.time_start,
      ...parseGranuleTitle(e.title),
      footprints: (e.polygons ?? []).map((p) => parseCmrPolygon(p[0])).filter((r) => r.length >= 3),
    }));
}

export class CmrSceneRepository {
  constructor(fetchFn, collections = CMR_COLLECTIONS) {
    this.fetch = fetchFn;
    this.collections = collections;
  }

  async findScenes(aoi) {
    const lists = await Promise.all(this.collections.map(async (c) => {
      const res = await this.fetch(cmrUrl(c, aoi));
      if (!res.ok) throw new Error(`CMR HTTP ${res.status}`);
      return parseCmrResponse(await res.json(), c);
    }));
    return lists.flat().sort((a, b) => a.start.localeCompare(b.start));
  }
}
