import { expect, test } from '@jest/globals';
import { LAND_COVER_CLASSES, paintClasses } from '../../site/js/domain/landCover.js';
import { LayerState } from '../../site/js/application/layerState.js';
import { LAYERS } from '../../site/js/layers/index.js';

const px = (...values) => new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]));

test('paintClasses colours enabled classes and hides the rest', () => {
  const out = paintClasses(px(0, 1, 2), new Set([1]));
  expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 0]); // no data
  const c1 = LAND_COVER_CLASSES.find((c) => c.value === 1);
  expect([...out.slice(4, 8)]).toEqual([...c1.color, Math.round(255 * (c1.alpha ?? 1))]);
  expect(out[11]).toBe(0); // class 2 switched off
});

test('class values are unique and non-zero', () => {
  const values = LAND_COVER_CLASSES.map((c) => c.value);
  expect(new Set(values).size).toBe(values.length);
  expect(values.every((v) => v > 0)).toBeTruthy();
});

test('LayerState keeps per-layer class filters, all on by default', () => {
  const s = new LayerState(LAYERS, ['land-cover']);
  expect(s.enabledClasses('land-cover').size).toBe(LAND_COVER_CLASSES.length);
  s.toggleClass('land-cover', 1, false);
  expect(s.enabledClasses('land-cover').has(1)).toBe(false);
  expect(s.enabledClasses('nope')).toBe(null);
});
