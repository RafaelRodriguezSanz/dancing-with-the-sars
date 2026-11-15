import { expect, test } from '@jest/globals';
import { summarizeValidation } from '../../site/js/application/validationSummary.js';

const sample = {
  land_cover: {
    reference: 'ESA WorldCover 2021', overall_agreement: 0.898, kappa: 0.629,
    per_group: { water: { recall: 0.708, precision: 0.783 }, open: { recall: 0.967, precision: 0.927 } },
  },
  permanent_water: { reference: 'JRC GSW', iou: 0.629 },
  limits: 'agreement, not accuracy.',
};

test('summarizeValidation formats headline, groups, water and limits', () => {
  const s = summarizeValidation(sample);
  expect(s.headline).toBe('90% agreement, kappa 0.63 vs ESA WorldCover 2021');
  expect(s.groups).toEqual(['water: recall 71%, precision 78%', 'open: recall 97%, precision 93%']);
  expect(s.water).toBe('Permanent water IoU 0.63 vs JRC GSW');
  expect(s.limits).toBe('agreement, not accuracy.');
});

test('summarizeValidation returns null without land-cover results', () => {
  expect(summarizeValidation(null)).toBe(null);
  expect(summarizeValidation({})).toBe(null);
});
