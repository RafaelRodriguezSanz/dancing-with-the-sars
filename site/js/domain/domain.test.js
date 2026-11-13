import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGranuleTitle, groupByDate, createAreaOfInterest, createScene, SANTA_LUCIA } from './scene.js';
import { isCovered } from './coverage.js';

const TITLE = 'NISAR_L2_PR_GCOV_023_082_D_106_2005_DHDH_M_20260619T215212_20260619T215247_P05023_N_F_J_001';

test('parseGranuleTitle extracts track and direction', () => {
  assert.deepEqual(parseGranuleTitle(TITLE), { track: 82, direction: 'descending' });
  assert.equal(parseGranuleTitle(TITLE.replace('_082_D_', '_154_A_')).direction, 'ascending');
});

test('parseGranuleTitle tolerates garbage', () => {
  assert.deepEqual(parseGranuleTitle('x'), { track: null, direction: null });
  assert.deepEqual(parseGranuleTitle(undefined), { track: null, direction: null });
});

test('groupByDate dedups, merges tracks and sorts', () => {
  const mk = (start, track, direction) => createScene({ id: start + track, collection: 'c', start, track, direction });
  const entries = groupByDate([
    mk('2026-07-01T21:00:00.000Z', 82, 'descending'),
    mk('2026-06-19T21:00:00.000Z', 82, 'descending'),
    mk('2026-07-01T21:30:00.000Z', 82, 'descending'),
    mk('2026-07-01T10:00:00.000Z', 154, 'ascending'),
  ]);
  assert.deepEqual(entries.map((e) => e.date), ['2026-06-19', '2026-07-01']);
  assert.deepEqual(entries[1].tracks, [82, 154]);
  assert.equal(entries[1].sceneCount, 3);
});

test('area of interest validates bbox and has Santa Lucia default', () => {
  assert.throws(() => createAreaOfInterest('bad', [1, 1, 0, 2]));
  assert.deepEqual(SANTA_LUCIA.bbox, [-56.75, -34.75, -56.05, -34.15]);
  assert.ok(Math.abs(SANTA_LUCIA.center[0] + 34.45) < 1e-9);
});

test('isCovered honours range edges and gaps', () => {
  assert.equal(isCovered('2025-10-29'), true);
  assert.equal(isCovered('2025-10-28'), false);
  assert.equal(isCovered('2026-03-02'), false);
  assert.equal(isCovered('2026-04-13'), false);
  assert.equal(isCovered('2026-11-11'), true);
  assert.equal(isCovered('2026-11-12'), false);
});
