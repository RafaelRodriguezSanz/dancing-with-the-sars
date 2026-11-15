import { expect, test } from '@jest/globals';
import { defineLayer, tierZoomRanges } from '../../site/js/domain/layer.js';
import { LayerState } from '../../site/js/application/layerState.js';
import { LAYERS } from '../../site/js/layers/index.js';

const base = { id: 'x', title: 't', description: 'd', caveat: 'c', region: { name: 'r', bbox: [0, 0, 1, 1] } };
const tier = (id, minZoom) => ({ id, minZoom, url: () => `u/${id}` });

test('defineLayer validates required fields and tiers', () => {
  expect(() => defineLayer({ ...base, tiers: [] })).toThrow(/at least one tier/);
  expect(() => defineLayer({ id: 'x' })).toThrow(/missing/);
  expect(defineLayer({ ...base, tiers: [tier('a')] }).usesDate).toBe(false);
});

test('tierZoomRanges splits the zoom range between usable tiers', () => {
  const l = defineLayer({ ...base, tiers: [tier('a'), tier('b', 10), { ...tier('c', 12), available: (d) => d === 'x' }] });
  const ranges = (d) => tierZoomRanges(l, d).map((r) => [r.tier.id, r.minzoom, r.maxzoom]);
  expect(ranges('x')).toEqual([['a', 0, 10], ['b', 10, 12], ['c', 12, 24]]);
  expect(ranges('y')).toEqual([['a', 0, 10], ['b', 10, 24]]);
});

test('LayerState toggles only known layers', () => {
  const s = new LayerState(LAYERS, ['built-up', 'nope']);
  expect(s.activeLayers().map((l) => l.id)).toEqual(['built-up']);
  s.toggle('built-up');
  expect(s.isActive('built-up')).toBe(false);
  expect(() => s.toggle('nope')).toThrow(/unknown/);
});

test('every registered layer has unique id', () => {
  expect(new Set(LAYERS.map((l) => l.id)).size).toBe(LAYERS.length);
});

test('image tiers must declare their bbox', () => {
  expect(() => defineLayer({ ...base, tiers: [{ id: 'i', kind: 'image', url: () => 'x' }] })).toThrow(/bbox/);
  expect(defineLayer({ ...base, tiers: [{ id: 'i', kind: 'image', url: () => 'x', bbox: [0, 0, 1, 1] }] })).toBeTruthy();
});
