import test from 'node:test';
import assert from 'node:assert/strict';
import { areaDir } from './nisarCalibrated.js';

// Same names as area_slug() in scripts/nisar_subset.py: the site finds what the server wrote.
test('areaDir: named box and any other box', () => {
  assert.equal(areaDir([-56.75, -34.75, -56.05, -34.15]), 'data/nisar/santa-lucia');
  assert.equal(areaDir([-58.5, -34.9, -58.2, -34.5]), 'data/nisar/aoi_-58.5000_-34.9000_-58.2000_-34.5000');
});
