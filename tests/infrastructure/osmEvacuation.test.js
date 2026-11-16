import { expect, test } from '@jest/globals';
import { OsmEvacuationRepository, SNAPSHOTS } from '../../site/js/infrastructure/osmEvacuation.js';
import { MONTEVIDEO_CITY } from '../../site/js/domain/scene.js';

const reply = (ok, body) => Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) });

test('the area the site opens on has a saved road snapshot', () => {
  expect(SNAPSHOTS[MONTEVIDEO_CITY.bbox.join(',')]).toBeDefined();
});

test('a saved snapshot is read without asking Overpass', async () => {
  const asked = [];
  const repo = new OsmEvacuationRepository((url) => { asked.push(url); return reply(true, { roads: [1], sites: [], places: [], water: {} }); }, ['https://overpass.test/api']);
  const osm = await repo.evacuation(MONTEVIDEO_CITY.bbox);
  expect(osm.roads).toEqual([1]);
  expect(asked).toEqual([SNAPSHOTS[MONTEVIDEO_CITY.bbox.join(',')]]);
});

test('a missing snapshot falls back to Overpass', async () => {
  const asked = [];
  const repo = new OsmEvacuationRepository((url) => { asked.push(url); return url.startsWith('data/') ? reply(false) : reply(true, { elements: [] }); }, ['https://overpass.test/api']);
  const osm = await repo.evacuation(MONTEVIDEO_CITY.bbox);
  expect(osm.roads).toEqual([]);
  expect(asked[1]).toMatch(/^https:\/\/overpass\.test\/api\?data=/);
});
