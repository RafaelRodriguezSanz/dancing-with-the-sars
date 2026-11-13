import test from 'node:test';
import assert from 'node:assert/strict';
import { listScenesForArea } from './listScenes.js';
import { pickDefaultDate, stepDate } from './selectDate.js';
import { SANTA_LUCIA } from '../domain/scene.js';

const scene = (date, track = 82) => ({ id: date, collection: 'c', date, start: `${date}T10:00:00.000Z`, track, direction: 'descending' });
const repo = (scenes) => ({ findScenes: async () => scenes });
const failing = { findScenes: async () => { throw new Error('boom'); } };

test('uses live repository when it returns scenes', async () => {
  const r = await listScenesForArea(repo([scene('2026-06-19')]), repo([scene('2026-01-01')]), SANTA_LUCIA);
  assert.equal(r.source, 'live');
  assert.equal(r.entries[0].date, '2026-06-19');
  assert.equal(r.entries[0].covered, true);
});

test('falls back on failure or empty result', async () => {
  const fb = repo([scene('2026-03-02')]);
  for (const live of [failing, repo([])]) {
    const r = await listScenesForArea(live, fb, SANTA_LUCIA);
    assert.equal(r.source, 'fallback');
    assert.equal(r.entries[0].covered, false);
    assert.ok(r.error);
  }
});

const entries = [
  { date: 'a', covered: true, usable: true }, { date: 'b', covered: false, usable: false },
  { date: 'c', covered: true, usable: true }, { date: 'd', covered: false, usable: false },
];

test('pickDefaultDate prefers latest covered date', () => {
  assert.equal(pickDefaultDate(entries), 'c');
  assert.equal(pickDefaultDate([{ date: 'x', covered: false }]), 'x');
  assert.equal(pickDefaultDate([]), null);
});

test('stepDate skips uncovered dates unless asked', () => {
  assert.equal(stepDate(entries, 'a', 1), 'c');
  assert.equal(stepDate(entries, 'a', 1, true), 'b');
  assert.equal(stepDate(entries, 'c', -1), 'a');
  assert.equal(stepDate(entries, 'c', 1), null);
  assert.equal(stepDate(entries, 'zzz', 1), null);
});

test('pickDefaultDate prefers a full pass over a later partial one', () => {
  const list = [{ date: 'a', covered: true, usable: true }, { date: 'b', covered: true, usable: false }];
  assert.equal(pickDefaultDate(list), 'a');
  assert.equal(pickDefaultDate([{ date: 'b', covered: true, usable: false }]), 'b');
});

test('toEntries flags partial passes over the AOI', async () => {
  const { toEntries } = await import('./listScenes.js');
  const aoi = { bbox: [0, 0, 1, 1] };
  const full = [[-1, -1], [2, -1], [2, 2], [-1, 2]];
  const half = [[0.5, -1], [2, -1], [2, 2], [0.5, 2]];
  const [e1, e2] = toEntries([
    { date: '2026-10-01', start: '2026-10-01T00:00:00Z', track: 82, footprints: [full] },
    { date: '2026-10-02', start: '2026-10-02T00:00:00Z', track: 82, footprints: [half] },
  ], aoi);
  assert.equal(e1.usable, true);
  assert.equal(e2.usable, false);
  assert.ok(Math.abs(e2.aoiCoverage - 0.52) < 0.05);
});

test('probe quality marks dates with corrupt GIBS tiles as not usable', async () => {
  const { toEntries } = await import('./listScenes.js');
  const ring = [[-1, -1], [2, -1], [2, 2], [-1, 2]];
  const mk = (date) => ({ date, start: `${date}T00:00:00Z`, track: 82, footprints: [ring] });
  const quality = {
    '2026-09-10': { valid: 9, corrupt: 0, empty: 0, missing: 0 },
    '2026-09-11': { valid: 7, corrupt: 2, empty: 0, missing: 0 },
  };
  const [a, b, c] = toEntries([mk('2026-09-10'), mk('2026-09-11'), mk('2026-09-12')], { bbox: [0, 0, 1, 1] }, quality);
  assert.deepEqual([a.clean, a.usable], [true, true]);
  assert.deepEqual([b.clean, b.usable], [false, false]);
  assert.deepEqual([c.clean, c.usable], [null, true]); // not probed: allowed, unknown
});
