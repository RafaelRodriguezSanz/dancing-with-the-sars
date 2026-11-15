import { groupByDate } from '../domain/scene.js';
import { isCovered } from '../domain/coverage.js';
import { aoiCoverage, FULL_COVERAGE } from '../domain/footprint.js';

/**
 * Tries the live repository first, then the fallback.
 * Repositories expose `async findScenes(aoi) -> Scene[]`.
 * @returns {{entries: object[], source: 'live'|'fallback', error?: Error}}
 */
export async function listScenesForArea(liveRepo, fallbackRepo, aoi) {
  let error;
  try {
    const scenes = await liveRepo.findScenes(aoi);
    if (scenes.length > 0) return { entries: toEntries(scenes, aoi), source: 'live' };
    error = new Error('CMR returned no scenes');
  } catch (e) {
    error = e;
  }
  const scenes = await fallbackRepo.findScenes(aoi);
  return { entries: toEntries(scenes, aoi), source: 'fallback', error };
}

/**
 * One entry per date. covered = GIBS has tiles that day; aoiCoverage = share of the AOI inside
 * the scene footprints (null if unknown); usable = covered and the pass spans the whole AOI.
 */
export function toEntries(scenes, aoi) {
  return groupByDate(scenes).map(({ footprints, ...e }) => {
    const covered = isCovered(e.date);
    const share = aoi && footprints.length ? aoiCoverage(footprints, aoi.bbox) : null;
    return { ...e, covered, aoiCoverage: share, usable: covered && (share === null || share >= FULL_COVERAGE) };
  }).filter((e) => e.aoiCoverage !== 0); // passes that never touch the area (e.g. fallback for another place)
}

/**
 * Adds the mosaic of a processed area (manifest.mosaic: newest valid pixel of many passes) as the last,
 * default entry of the date list. Entries without a mosaic are returned unchanged.
 */
export function withMosaic(entries, manifest) {
  const m = manifest?.mosaic;
  if (!m) return entries;
  return [...entries, {
    date: m.key, mosaic: true, covered: true, usable: true, aoiCoverage: null, tracks: [], directions: [],
    label: `Latest mosaic (${m.dates} passes)`,
    info: `Newest radar pixel of ${m.dates} passes, ${m.first} to ${m.last}; seams show where passes meet`,
  }];
}
