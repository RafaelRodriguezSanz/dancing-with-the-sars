import test from 'node:test';
import assert from 'node:assert/strict';
import { LAND_COVER_CLASSES, paintClasses } from './landCover.js';
import { LayerState } from '../application/layerState.js';
import { LAYERS } from '../layers/index.js';

const px = (...values) => new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]));

test('paintClasses colours enabled classes and hides the rest', () => {
  const out = paintClasses(px(0, 1, 2), new Set([1]));
  assert.deepEqual([...out.slice(0, 4)], [0, 0, 0, 0]); // no data
  assert.deepEqual([...out.slice(4, 8)], [...LAND_COVER_CLASSES.find((c) => c.value === 1).color, 255]);
  assert.equal(out[11], 0); // class 2 switched off
});

test('class values are unique and non-zero', () => {
  const values = LAND_COVER_CLASSES.map((c) => c.value);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((v) => v > 0));
});

test('LayerState keeps per-layer class filters, all on by default', () => {
  const s = new LayerState(LAYERS, ['land-cover']);
  assert.equal(s.enabledClasses('land-cover').size, LAND_COVER_CLASSES.length);
  s.toggleClass('land-cover', 1, false);
  assert.equal(s.enabledClasses('land-cover').has(1), false);
  assert.equal(s.enabledClasses('nisar-gcov'), null);
});
