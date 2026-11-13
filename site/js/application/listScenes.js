import { groupByDate } from '../domain/scene.js';
import { isCovered, rendersCleanly } from '../domain/coverage.js';
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
    const covered = isCovered(e.date) && rendersCleanly(e.date, e.tracks);
    const share = aoi && footprints.length ? aoiCoverage(footprints, aoi.bbox) : null;
    return { ...e, covered, aoiCoverage: share, usable: covered && (share === null || share >= FULL_COVERAGE) };
  });
}
