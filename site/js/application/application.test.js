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
  { date: 'a', covered: true }, { date: 'b', covered: false },
  { date: 'c', covered: true }, { date: 'd', covered: false },
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
