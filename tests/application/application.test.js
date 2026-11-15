import { expect, test } from '@jest/globals';
import { listScenesForArea } from '../../site/js/application/listScenes.js';
import { pickDefaultDate, stepDate } from '../../site/js/application/selectDate.js';
import { SANTA_LUCIA } from '../../site/js/domain/scene.js';

const scene = (date, track = 82) => ({ id: date, collection: 'c', date, start: `${date}T10:00:00.000Z`, track, direction: 'descending' });
const repo = (scenes) => ({ findScenes: async () => scenes });
const failing = { findScenes: async () => { throw new Error('boom'); } };

test('uses live repository when it returns scenes', async () => {
  const r = await listScenesForArea(repo([scene('2026-06-19')]), repo([scene('2026-01-01')]), SANTA_LUCIA);
  expect(r.source).toBe('live');
  expect(r.entries[0].date).toBe('2026-06-19');
  expect(r.entries[0].covered).toBe(true);
});

test('falls back on failure or empty result', async () => {
  const fb = repo([scene('2026-03-02')]);
  for (const live of [failing, repo([])]) {
    const r = await listScenesForArea(live, fb, SANTA_LUCIA);
    expect(r.source).toBe('fallback');
    expect(r.entries[0].covered).toBe(false);
    expect(r.error).toBeTruthy();
  }
});

const entries = [
  { date: 'a', covered: true, usable: true }, { date: 'b', covered: false, usable: false },
  { date: 'c', covered: true, usable: true }, { date: 'd', covered: false, usable: false },
];

test('pickDefaultDate prefers latest covered date', () => {
  expect(pickDefaultDate(entries)).toBe('c');
  expect(pickDefaultDate([{ date: 'x', covered: false }])).toBe('x');
  expect(pickDefaultDate([])).toBe(null);
});

test('stepDate skips uncovered dates unless asked', () => {
  expect(stepDate(entries, 'a', 1)).toBe('c');
  expect(stepDate(entries, 'a', 1, true)).toBe('b');
  expect(stepDate(entries, 'c', -1)).toBe('a');
  expect(stepDate(entries, 'c', 1)).toBe(null);
  expect(stepDate(entries, 'zzz', 1)).toBe(null);
});

test('pickDefaultDate prefers a full pass over a later partial one', () => {
  const list = [{ date: 'a', covered: true, usable: true }, { date: 'b', covered: true, usable: false }];
  expect(pickDefaultDate(list)).toBe('a');
  expect(pickDefaultDate([{ date: 'b', covered: true, usable: false }])).toBe('b');
});

test('toEntries flags partial passes over the AOI', async () => {
  const { toEntries } = await import('../../site/js/application/listScenes.js');
  const aoi = { bbox: [0, 0, 1, 1] };
  const full = [[-1, -1], [2, -1], [2, 2], [-1, 2]];
  const half = [[0.5, -1], [2, -1], [2, 2], [0.5, 2]];
  const [e1, e2] = toEntries([
    { date: '2026-10-01', start: '2026-10-01T00:00:00Z', footprints: [full] },
    { date: '2026-10-02', start: '2026-10-02T00:00:00Z', footprints: [half] },
  ], aoi);
  expect(e1.usable).toBe(true);
  expect(e2.usable).toBe(false);
  expect(Math.abs(e2.aoiCoverage - 0.52) < 0.05).toBeTruthy();
});

test('toEntries drops passes that do not touch the area', async () => {
  const { toEntries } = await import('../../site/js/application/listScenes.js');
  const far = [[10, 10], [11, 10], [11, 11], [10, 11]];
  expect(toEntries([{ date: '2026-10-01', start: '2026-10-01T00:00:00Z', footprints: [far] }], { bbox: [0, 0, 1, 1] }).length).toBe(0);
});
