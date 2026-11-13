import { groupByDate } from '../domain/scene.js';
import { isCovered } from '../domain/coverage.js';

/**
 * Tries the live repository first, then the fallback.
 * Repositories expose `async findScenes(aoi) -> Scene[]`.
 * @returns {{entries: object[], source: 'live'|'fallback', error?: Error}}
 */
export async function listScenesForArea(liveRepo, fallbackRepo, aoi) {
  let error;
  try {
    const scenes = await liveRepo.findScenes(aoi);
    if (scenes.length > 0) return { entries: toEntries(scenes), source: 'live' };
    error = new Error('CMR returned no scenes');
  } catch (e) {
    error = e;
  }
  const scenes = await fallbackRepo.findScenes(aoi);
  return { entries: toEntries(scenes), source: 'fallback', error };
}

export function toEntries(scenes) {
  return groupByDate(scenes).map((e) => ({ ...e, covered: isCovered(e.date) }));
}
