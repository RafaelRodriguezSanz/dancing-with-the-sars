import { expect, test } from '@jest/globals';
import { heightAboveWater, rankSites } from '../../site/js/domain/floodRisk.js';
import { buildGraph, dryComponents, evacuationPlan, evacuationRoutes, isolatedPlaces, nearestNode } from '../../site/js/domain/routing.js';

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

test('isolatedPlaces tells connected, cut-off and flooded places apart', () => {
  // a long main road 1..6, a side road 6-7-8-9 that floods at 7, and a separate track 20-21 never joined to it
  const ways = [
    { nodes: [1, 2, 3, 4, 5, 6], coords: [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.04, 0], [0.05, 0]] },
    { nodes: [6, 7, 8, 9], coords: [[0.05, 0], [0.05, 0.01], [0.05, 0.02], [0.05, 0.03]] },
    { nodes: [20, 21], coords: [[0.2, 0.2], [0.21, 0.2]] },
  ];
  const g = buildGraph(ways);
  const blocked = ([, lat]) => lat > 0.008 && lat < 0.012; // node 7
  expect(dryComponents(g).size.size).toBe(2);
  const places = [{ name: 'main', node: 2 }, { name: 'beyond', node: 9 }, { name: 'ford', node: 7 }, { name: 'far', node: 20 }, { name: 'none', node: null }];
  const out = isolatedPlaces(g, places, blocked);
  expect(out.map((x) => x.status)).toEqual(['connected', 'cut-off', 'flooded', 'no-road', 'no-road']);
  expect(out[1].pocket).not.toBe(out[0].pocket);
  expect(isolatedPlaces(g, places, () => false).slice(0, 3).map((x) => x.status)).toEqual(['connected', 'connected', 'connected']);
});

test('evacuationRoutes gives every origin its nearest refuge avoiding flooded roads', () => {
  // the square of the evacuationPlan test (flooded at B) plus a track 20-21 that no road joins to a refuge
  const ways = [
    { nodes: [1, 2, 3], coords: [[0, 0], [0.01, 0], [0.01, 0.01]] },
    { nodes: [1, 4, 3], coords: [[0, 0], [0, 0.012], [0.01, 0.01]] },
    { nodes: [20, 21], coords: [[0.2, 0.2], [0.21, 0.2]] },
  ];
  const g = buildGraph(ways);
  const blocked = ([lon, lat]) => lon > 0.005 && lat < 0.003; // around B
  const out = evacuationRoutes(g, [{ name: 'a', node: 1 }, { name: 'b', node: 2 }, { name: 'far', node: 20 }, { name: 'none', node: null }], [{ name: 'school', node: 3 }], blocked);
  expect(out[0].site.name).toBe('school');
  expect(out[0].route).toEqual([[0, 0], [0, 0.012], [0.01, 0.01]]);
  expect(out[0].length.wet).toBe(0);
  expect(out[1].site.name).toBe('school');
  expect(out[1].route[0]).toEqual([0.01, 0]);
  expect(out[2].site).toBeNull();
  expect(out[3].site).toBeNull();
});
