import { expect, test } from '@jest/globals';
import { areaDir } from '../../site/js/layers/nisarCalibrated.js';

// Same names as area_slug() in scripts/nisar_subset.py: the site finds what the server wrote.
test('areaDir: named box and any other box', () => {
  expect(areaDir([-56.75, -34.75, -56.05, -34.15])).toBe('data/nisar/santa-lucia');
  expect(areaDir([-58.5, -34.9, -58.2, -34.5])).toBe('data/nisar/aoi_-58.5000_-34.9000_-58.2000_-34.5000');
});
