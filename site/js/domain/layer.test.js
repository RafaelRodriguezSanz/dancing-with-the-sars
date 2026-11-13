import test from 'node:test';
import assert from 'node:assert/strict';
import { defineLayer, tierForZoom } from './layer.js';
import { LayerState } from '../application/layerState.js';
import { LAYERS } from '../layers/index.js';

const base = { id: 'x', title: 't', description: 'd', caveat: 'c', region: { name: 'r', bbox: [0, 0, 1, 1] } };
const tier = (id, minZoom) => ({ id, minZoom, url: () => `u/${id}` });

test('defineLayer validates required fields and tiers', () => {
  assert.throws(() => defineLayer({ ...base, tiers: [] }), /at least one tier/);
  assert.throws(() => defineLayer({ id: 'x' }), /missing/);
  assert.equal(defineLayer({ ...base, tiers: [tier('a')] }).usesDate, false);
});

test('tierForZoom upgrades with zoom, tier 0 is the floor', () => {
  const l = defineLayer({ ...base, tiers: [tier('a'), tier('b', 10), tier('c', 12)] });
  assert.equal(tierForZoom(l, 5).id, 'a');
  assert.equal(tierForZoom(l, 10).id, 'b');
  assert.equal(tierForZoom(l, 14).id, 'c');
});

test('LayerState toggles only known layers', () => {
  const s = new LayerState(LAYERS, ['nisar-gcov', 'nope']);
  assert.deepEqual(s.activeLayers().map((l) => l.id), ['nisar-gcov']);
  s.toggle('nisar-gcov');
  assert.equal(s.isActive('nisar-gcov'), false);
  assert.throws(() => s.toggle('nope'), /unknown/);
});

test('every registered layer has unique id', () => {
  assert.equal(new Set(LAYERS.map((l) => l.id)).size, LAYERS.length);
});
