import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTile } from './tileQuality.js';

const fill = (n, px) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => px[i % 4]);

test('colourful opaque pixels are valid', () => assert.equal(classifyTile(fill(100, [40, 160, 30, 255])), 'valid'));
test('fully transparent is empty', () => assert.equal(classifyTile(fill(100, [0, 0, 0, 0])), 'empty'));
test('opaque grey noise is corrupt', () => assert.equal(classifyTile(fill(100, [120, 120, 120, 255])), 'corrupt'));
test('semi-transparent speckle is corrupt', () => assert.equal(classifyTile(fill(100, [90, 200, 10, 120])), 'corrupt'));
test('zero-length input is empty', () => assert.equal(classifyTile(new Uint8ClampedArray(0)), 'empty'));
