import { expect, test } from '@jest/globals';
import { gibsTileUrl, gibsOpticalTileUrl } from '../../site/js/infrastructure/gibs.js';
import { cmrUrl, parseCmrResponse, CmrSceneRepository } from '../../site/js/infrastructure/cmrSceneRepository.js';
import { FallbackSceneRepository } from '../../site/js/infrastructure/fallbackSceneRepository.js';
import { SANTA_LUCIA } from '../../site/js/domain/scene.js';

const T1 = 'NISAR_L2_PR_GCOV_023_082_D_106_2005_DHDH_M_20260619T215212_20260619T215247_P05023_N_F_J_001';
const T2 = 'NISAR_L2_PR_GCOV_024_154_A_105_2005_DHDH_M_20260701T091000_20260701T091040_P05023_N_F_J_001';
const json = (entry) => ({ feed: { entry } });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('gibsTileUrl builds the WMTS template for a date', () => {
  expect(gibsTileUrl('2026-06-19')).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NISAR_L2_Geocoded_Polarimetric_Covariance/default/2026-06-19/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png');
});

test('gibsOpticalTileUrl uses the date, or the newest image for a mosaic key', () => {
  expect(gibsOpticalTileUrl('2026-10-17')).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-10-17/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg');
  expect(gibsOpticalTileUrl('latest')).toContain('/default/default/');
  expect(gibsOpticalTileUrl(null)).toContain('/default/default/');
});

test('cmrUrl includes collection and bbox', () => {
  const u = cmrUrl('NISAR_L2_GCOV_V1', SANTA_LUCIA);
  expect(u).toMatch(/short_name=NISAR_L2_GCOV_V1/);
  expect(u).toMatch(/bounding_box=-56\.75,-34\.75,-56\.05,-34\.15/);
  expect(u).toMatch(/page_size=200/);
});

test('parseCmrResponse maps entries to scenes', () => {
  const [s] = parseCmrResponse(json([{ title: T1, time_start: '2026-06-19T21:52:12.000Z' }, { title: 'no-time' }]), 'C');
  expect(s).toEqual({
    id: T1, collection: 'C', date: '2026-06-19', start: '2026-06-19T21:52:12.000Z', track: 82, direction: 'descending', footprints: [],
  });
  expect(parseCmrResponse({}, 'C')).toEqual([]);
});

test('CmrSceneRepository merges collections via injected fetch, sorted', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return url.includes('PROVISIONAL')
      ? ok(json([{ title: T2, time_start: '2026-07-01T09:10:00.000Z' }]))
      : ok(json([{ title: T1, time_start: '2026-06-19T21:52:12.000Z' }]));
  };
  const scenes = await new CmrSceneRepository(fakeFetch).findScenes(SANTA_LUCIA);
  expect(calls.length).toBe(2);
  expect(scenes.map((s) => s.date)).toEqual(['2026-06-19', '2026-07-01']);
  expect(scenes[1].direction).toBe('ascending');
});

test('CmrSceneRepository rejects on HTTP error', async () => {
  const repo = new CmrSceneRepository(async () => ({ ok: false, status: 500 }));
  await expect(repo.findScenes(SANTA_LUCIA)).rejects.toThrow(/HTTP 500/);
});

test('FallbackSceneRepository reads scenes from json', async () => {
  const body = { scenes: [{ start: '2026-07-01T00:00:00Z' }, { start: '2026-06-01T00:00:00Z' }] };
  const scenes = await new FallbackSceneRepository(async () => ok(body)).findScenes();
  expect(scenes[0].start).toBe('2026-06-01T00:00:00Z');
});

test('parseOverpass keeps closed ways and outer rings as town polygons', async () => {
  const { parseOverpass, overpassQuery } = await import('../../site/js/infrastructure/osmTowns.js');
  const sq = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0.01 }, { lat: 0.01, lon: 0 }, { lat: 0, lon: 0 }];
  const fc = parseOverpass({ elements: [
    { type: 'way', tags: { landuse: 'residential', name: 'X' }, geometry: sq },
    { type: 'way', tags: { landuse: 'retail' }, geometry: sq.slice(0, 3) }, // open: skipped
    { type: 'relation', tags: { landuse: 'industrial' }, members: [{ role: 'outer', geometry: sq }, { role: 'inner', geometry: sq }] },
  ] });
  expect(fc.features.length).toBe(2);
  expect(fc.features[0].properties.kind).toBe('town');
  expect(Math.abs(fc.features[0].properties.area_ha - 123) < 2).toBeTruthy(); // ~1.1 km a side
  expect(overpassQuery([1, 2, 3, 4])).toMatch(/\(2,1,4,3\)/);
});
