import test from 'node:test';
import assert from 'node:assert/strict';
import { defineLayer, tierZoomRanges } from './layer.js';
import { LayerState } from '../application/layerState.js';
import { LAYERS } from '../layers/index.js';

const base = { id: 'x', title: 't', description: 'd', caveat: 'c', region: { name: 'r', bbox: [0, 0, 1, 1] } };
const tier = (id, minZoom) => ({ id, minZoom, url: () => `u/${id}` });

test('defineLayer validates required fields and tiers', () => {
  assert.throws(() => defineLayer({ ...base, tiers: [] }), /at least one tier/);
  assert.throws(() => defineLayer({ id: 'x' }), /missing/);
  assert.equal(defineLayer({ ...base, tiers: [tier('a')] }).usesDate, false);
});

test('tierZoomRanges splits the zoom range between usable tiers', () => {
  const l = defineLayer({ ...base, tiers: [tier('a'), tier('b', 10), { ...tier('c', 12), available: (d) => d === 'x' }] });
  const ranges = (d) => tierZoomRanges(l, d).map((r) => [r.tier.id, r.minzoom, r.maxzoom]);
  assert.deepEqual(ranges('x'), [['a', 0, 10], ['b', 10, 12], ['c', 12, 24]]);
  assert.deepEqual(ranges('y'), [['a', 0, 10], ['b', 10, 24]]);
});

test('LayerState toggles only known layers', () => {
  const s = new LayerState(LAYERS, ['built-up', 'nope']);
  assert.deepEqual(s.activeLayers().map((l) => l.id), ['built-up']);
  s.toggle('built-up');
  assert.equal(s.isActive('built-up'), false);
  assert.throws(() => s.toggle('nope'), /unknown/);
});

test('every registered layer has unique id', () => {
  assert.equal(new Set(LAYERS.map((l) => l.id)).size, LAYERS.length);
});

test('image tiers must declare their bbox', () => {
  assert.throws(() => defineLayer({ ...base, tiers: [{ id: 'i', kind: 'image', url: () => 'x' }] }), /bbox/);
  assert.ok(defineLayer({ ...base, tiers: [{ id: 'i', kind: 'image', url: () => 'x', bbox: [0, 0, 1, 1] }] }));
});
