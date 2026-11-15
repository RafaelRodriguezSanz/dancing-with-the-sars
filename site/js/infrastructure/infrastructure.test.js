import test from 'node:test';
import assert from 'node:assert/strict';
import { gibsTileUrl } from './gibs.js';
import { cmrUrl, parseCmrResponse, CmrSceneRepository } from './cmrSceneRepository.js';
import { FallbackSceneRepository } from './fallbackSceneRepository.js';
import { SANTA_LUCIA } from '../domain/scene.js';

const T1 = 'NISAR_L2_PR_GCOV_023_082_D_106_2005_DHDH_M_20260619T215212_20260619T215247_P05023_N_F_J_001';
const T2 = 'NISAR_L2_PR_GCOV_024_154_A_105_2005_DHDH_M_20260701T091000_20260701T091040_P05023_N_F_J_001';
const json = (entry) => ({ feed: { entry } });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('gibsTileUrl builds the WMTS template for a date', () => {
  assert.equal(
    gibsTileUrl('2026-06-19'),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NISAR_L2_Geocoded_Polarimetric_Covariance/default/2026-06-19/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png',
  );
});

test('cmrUrl includes collection and bbox', () => {
  const u = cmrUrl('NISAR_L2_GCOV_V1', SANTA_LUCIA);
  assert.match(u, /short_name=NISAR_L2_GCOV_V1/);
  assert.match(u, /bounding_box=-56\.75,-34\.75,-56\.05,-34\.15/);
  assert.match(u, /page_size=200/);
});

test('parseCmrResponse maps entries to scenes', () => {
  const [s] = parseCmrResponse(json([{ title: T1, time_start: '2026-06-19T21:52:12.000Z' }, { title: 'no-time' }]), 'C');
  assert.deepEqual(s, {
    id: T1, collection: 'C', date: '2026-06-19', start: '2026-06-19T21:52:12.000Z', track: 82, direction: 'descending', footprints: [],
  });
  assert.deepEqual(parseCmrResponse({}, 'C'), []);
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
  assert.equal(calls.length, 2);
  assert.deepEqual(scenes.map((s) => s.date), ['2026-06-19', '2026-07-01']);
  assert.equal(scenes[1].direction, 'ascending');
});

test('CmrSceneRepository rejects on HTTP error', async () => {
  const repo = new CmrSceneRepository(async () => ({ ok: false, status: 500 }));
  await assert.rejects(repo.findScenes(SANTA_LUCIA), /HTTP 500/);
});

test('FallbackSceneRepository reads scenes from json', async () => {
  const body = { scenes: [{ start: '2026-07-01T00:00:00Z' }, { start: '2026-06-01T00:00:00Z' }] };
  const scenes = await new FallbackSceneRepository(async () => ok(body)).findScenes();
  assert.equal(scenes[0].start, '2026-06-01T00:00:00Z');
});
