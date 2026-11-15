import { expect, test } from '@jest/globals';
import { heightAboveWater, rankSites } from '../../site/js/domain/floodRisk.js';
import { buildGraph, evacuationPlan, nearestNode } from '../../site/js/domain/routing.js';

test('heightAboveWater measures from the nearest water level', () => {
  // one row: water at 10 m on the left, ground rising to the right
  const elev = Float32Array.from([10, 11, 13, 20]);
  const hand = heightAboveWater(elev, Uint8Array.from([1, 0, 0, 0]), 4, 1);
  expect([...hand]).toEqual([0, 1, 3, 10]);
});

test('rankSites marks flooded, at-risk and safe refuges', () => {
  const s = rankSites([{ hand: 1 }, { hand: 4 }, { hand: 9 }, { hand: NaN }], 2).map((x) => x.status);
  expect(s).toEqual(['flooded', 'at-risk', 'safe', 'unknown']);
});

test('evacuationPlan detours around a flooded road', () => {
  // square A-B-C-D: the short way A-B-C is flooded at B, the dry way is A-D-C
  const ways = [
    { nodes: [1, 2, 3], coords: [[0, 0], [0.01, 0], [0.01, 0.01]] },
    { nodes: [1, 4, 3], coords: [[0, 0], [0, 0.012], [0.01, 0.01]] },
  ];
  const g = buildGraph(ways);
  const blocked = ([lon, lat]) => lon > 0.005 && lat < 0.003; // around B
  const plan = evacuationPlan(g, nearestNode(g, [0, 0]), [{ name: 'school', node: 3 }], blocked);
  expect(plan.route.length).toBe(3);
  expect(plan.route[1]).toEqual([0, 0.012]);
  expect(plan.length.wet).toBe(0);
  expect(plan.usualLength.wet > 0).toBeTruthy();
});
