import { expect, test } from '@jest/globals';
import { parseCmrPolygon, pointInRing, aoiCoverage } from '../../site/js/domain/footprint.js';

test('parseCmrPolygon turns "lat lon" pairs into [lon, lat]', () => {
  expect(parseCmrPolygon('-33.7 -56.3 -35.8 -56.8 -36.2 -54.0')).toEqual([[-56.3, -33.7], [-56.8, -35.8], [-54.0, -36.2]]);
  expect(parseCmrPolygon('')).toEqual([]);
});

test('pointInRing', () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  expect(pointInRing([0.5, 0.5], sq)).toBe(true);
  expect(pointInRing([1.5, 0.5], sq)).toBe(false);
});

test('aoiCoverage uses the union of footprints', () => {
  const left = [[-1, -1], [0.5, -1], [0.5, 2], [-1, 2]];
  const right = [[0.5, -1], [2, -1], [2, 2], [0.5, 2]];
  expect(aoiCoverage([left, right], [0, 0, 1, 1], 10)).toBe(1);
  expect(aoiCoverage([left], [0, 0, 1, 1], 10)).toBe(0.5);
  expect(aoiCoverage([], [0, 0, 1, 1])).toBe(0);
});

test('real granule 154D (2026-10-22) covers part of Santa Lucia', () => {
  const ring = parseCmrPolygon('-33.7305 -56.36781 -35.86339 -56.87445 -36.25659 -54.09823 -34.1265 -53.67021 -33.7305 -56.36781');
  const share = aoiCoverage([ring], [-56.75, -34.75, -56.05, -34.15]);
  expect(share > 0 && share < 1).toBeTruthy();
});
