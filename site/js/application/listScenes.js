import { groupByDate } from '../domain/scene.js';
import { isCovered } from '../domain/coverage.js';
import { aoiCoverage, FULL_COVERAGE } from '../domain/footprint.js';

/**
 * Tries the live repository first, then the fallback.
 * Repositories expose `async findScenes(aoi) -> Scene[]`.
 * @returns {{entries: object[], source: 'live'|'fallback', error?: Error}}
 */
export async function listScenesForArea(liveRepo, fallbackRepo, aoi, quality = {}) {
  let error;
  try {
    const scenes = await liveRepo.findScenes(aoi);
    if (scenes.length > 0) return { entries: toEntries(scenes, aoi, quality), source: 'live' };
    error = new Error('CMR returned no scenes');
  } catch (e) {
    error = e;
  }
  const scenes = await fallbackRepo.findScenes(aoi);
  return { entries: toEntries(scenes, aoi, quality), source: 'fallback', error };
}

/**
 * One entry per date. covered = GIBS has tiles that day; aoiCoverage = share of the AOI inside the
 * scene footprints (null if unknown); clean = no corrupt/missing GIBS tile over the AOI according to
 * the probe (null if the date was not probed); usable = covered, full pass and not known-corrupt.
 * quality: { [date]: { valid, corrupt, empty, missing } }
 */
export function toEntries(scenes, aoi, quality = {}) {
  return groupByDate(scenes).map(({ footprints, ...e }) => {
    const covered = isCovered(e.date);
    const share = aoi && footprints.length ? aoiCoverage(footprints, aoi.bbox) : null;
    const q = quality[e.date];
    const clean = q ? q.corrupt === 0 && q.missing === 0 : null;
    return {
      ...e, covered, aoiCoverage: share, clean,
      usable: covered && (share === null || share >= FULL_COVERAGE) && clean !== false,
    };
  });
}
