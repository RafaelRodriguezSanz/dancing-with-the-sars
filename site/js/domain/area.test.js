import test from 'node:test';
import assert from 'node:assert/strict';
import { areaFromCorners, areaFromHash, areaToHash, MAX_AREA_SPAN_DEG } from './area.js';

test('areaFromCorners orders corners and rounds', () => {
  const a = areaFromCorners([-56.05, -34.15], [-56.750001, -34.75]);
  assert.deepEqual(a.bbox, [-56.75, -34.75, -56.05, -34.15]);
});

test('areaFromCorners rejects empty and oversized areas', () => {
  assert.throws(() => areaFromCorners([1, 1], [1, 2]), /empty/);
  assert.throws(() => areaFromCorners([0, 0], [MAX_AREA_SPAN_DEG + 0.1, 1]), /too large/);
});

test('hash round trip, invalid hash gives null', () => {
  const a = areaFromCorners([-57, -35], [-56, -34]);
  assert.deepEqual(areaFromHash(areaToHash(a)).bbox, a.bbox);
  assert.equal(areaFromHash('#nothing'), null);
  assert.equal(areaFromHash('#bbox=0,0,50,50'), null);
});
