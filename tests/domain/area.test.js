import { expect, test } from '@jest/globals';
import { areaFromCorners, areaFromHash, areaToHash, MAX_AREA_SPAN_DEG } from '../../site/js/domain/area.js';

test('areaFromCorners orders corners and rounds', () => {
  const a = areaFromCorners([-56.05, -34.15], [-56.750001, -34.75]);
  expect(a.bbox).toEqual([-56.75, -34.75, -56.05, -34.15]);
});

test('areaFromCorners rejects empty and oversized areas', () => {
  expect(() => areaFromCorners([1, 1], [1, 2])).toThrow(/empty/);
  expect(() => areaFromCorners([0, 0], [MAX_AREA_SPAN_DEG + 0.1, 1])).toThrow(/too large/);
});

test('hash round trip, invalid hash gives null', () => {
  const a = areaFromCorners([-57, -35], [-56, -34]);
  expect(areaFromHash(areaToHash(a)).bbox).toEqual(a.bbox);
  expect(areaFromHash('#nothing')).toBe(null);
  expect(areaFromHash('#bbox=0,0,50,50')).toBe(null);
});
