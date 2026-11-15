import { expect, test } from '@jest/globals';
import { parseGranuleTitle, groupByDate, createAreaOfInterest, createScene, SANTA_LUCIA } from '../../site/js/domain/scene.js';
import { isCovered } from '../../site/js/domain/coverage.js';

const TITLE = 'NISAR_L2_PR_GCOV_023_082_D_106_2005_DHDH_M_20260619T215212_20260619T215247_P05023_N_F_J_001';

test('parseGranuleTitle extracts track and direction', () => {
  expect(parseGranuleTitle(TITLE)).toEqual({ track: 82, direction: 'descending' });
  expect(parseGranuleTitle(TITLE.replace('_082_D_', '_154_A_')).direction).toBe('ascending');
});

test('parseGranuleTitle tolerates garbage', () => {
  expect(parseGranuleTitle('x')).toEqual({ track: null, direction: null });
  expect(parseGranuleTitle(undefined)).toEqual({ track: null, direction: null });
});

test('groupByDate dedups, merges tracks and sorts', () => {
  const mk = (start, track, direction) => createScene({ id: start + track, collection: 'c', start, track, direction });
  const entries = groupByDate([
    mk('2026-07-01T21:00:00.000Z', 82, 'descending'),
    mk('2026-06-19T21:00:00.000Z', 82, 'descending'),
    mk('2026-07-01T21:30:00.000Z', 82, 'descending'),
    mk('2026-07-01T10:00:00.000Z', 154, 'ascending'),
  ]);
  expect(entries.map((e) => e.date)).toEqual(['2026-06-19', '2026-07-01']);
  expect(entries[1].tracks).toEqual([82, 154]);
  expect(entries[1].sceneCount).toBe(3);
});

test('area of interest validates bbox and has Santa Lucia default', () => {
  expect(() => createAreaOfInterest('bad', [1, 1, 0, 2])).toThrow();
  expect(SANTA_LUCIA.bbox).toEqual([-56.75, -34.75, -56.05, -34.15]);
  expect(Math.abs(SANTA_LUCIA.center[0] + 34.45) < 1e-9).toBeTruthy();
});

test('isCovered honours range edges and gaps', () => {
  expect(isCovered('2025-10-29')).toBe(true);
  expect(isCovered('2025-10-28')).toBe(false);
  expect(isCovered('2026-03-02')).toBe(false);
  expect(isCovered('2026-04-13')).toBe(false);
  expect(isCovered('2026-11-11')).toBe(true);
  expect(isCovered('2026-11-12')).toBe(false);
});
