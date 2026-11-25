import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LARGEST, SMALLEST, finished, fresh, held, read, spend, worth } from '../shared/energy.js';
import { MAX_SIZE, MIN_SIZE } from '../postmarks/game.js';

const won = (size, seed) => ({ size, seed, status: 'won' });

test('a harder board earns more: every size Postmarks makes, each worth more than the one below', () => {
  assert.equal(SMALLEST, MIN_SIZE);
  assert.equal(LARGEST, MAX_SIZE);
  for (let size = MIN_SIZE; size <= MAX_SIZE; size++) assert.equal(worth(size), size - MIN_SIZE + 1);
  assert.equal(worth(MIN_SIZE - 1), 0);
  assert.equal(worth(MAX_SIZE + 1), 0);
  assert.equal(worth(6.5), 0);
});

test('a game won earns; a game lost, or still being played, earns nothing', () => {
  assert.equal(finished(fresh(), won(7, 1)).gained, 3);
  assert.equal(finished(fresh(), { size: 7, seed: 1, status: 'lost' }).gained, 0);
  assert.equal(finished(fresh(), { size: 7, seed: 1, status: 'playing' }).gained, 0);
  assert.equal(finished(fresh(), null).gained, 0);
});

test('faster earns no more, and a hint costs nothing: the rules are not told the time or the hints at all', () => {
  const quick = finished(fresh(), { ...won(8, 2), ms: 1000, hints: 0 });
  const slow = finished(fresh(), { ...won(8, 2), ms: 9000000, hints: 40 });
  assert.equal(quick.gained, slow.gained);
  assert.deepEqual(quick.state, slow.state);
  // and nothing in the file reads a clock or a count of hints
  const source = readFileSync(new URL('../shared/energy.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /Date|performance|\bms\b|elapsed|hint|setTimeout|setInterval/);
});

test('a board earns once: solved again, it is play for its own sake', () => {
  const once = finished(fresh(), won(9, 77));
  assert.equal(once.gained, 5);
  const again = finished(once.state, won(9, 77));
  assert.equal(again.gained, 0);
  assert.equal(again.state, once.state);
  assert.equal(finished(once.state, won(9, 78)).gained, 5, 'another board of the same size');
  assert.equal(finished(once.state, won(8, 77)).gained, 4, 'the same seed at another size is another board');
});

test('it accumulates without limit and never fades', () => {
  let state = fresh();
  for (let seed = 0; seed < 1000; seed++) state = finished(state, won(9, seed)).state;
  assert.equal(held(state), 5000);
  assert.ok(state.boards.length <= 400, 'only so many boards are remembered');
  assert.equal(held(read(JSON.parse(JSON.stringify(state)))), 5000, 'and it is all there after being saved');
});

test('spending is all of a price or none of it', () => {
  const state = finished(fresh(), won(9, 1)).state;
  assert.deepEqual(spend(state, 6), { state, paid: false });
  assert.equal(spend(state, 0).paid, false);
  assert.equal(spend(state, -3).paid, false);
  assert.equal(spend(state, 1.5).paid, false);
  const after = spend(state, 3);
  assert.equal(after.paid, true);
  assert.equal(held(after.state), 2);
  assert.equal(after.state.earned, 5, 'what was earned stays on record');
});

test('what was saved is made safe: anything broken is a fresh start, never a debt', () => {
  for (const bad of [null, 'x', {}, { earned: -1, spent: 0, boards: [] }, { earned: 2, spent: 3, boards: [] }, { earned: 1.5, spent: 0, boards: [] }, { earned: 1, spent: 0, boards: 'no' }]) {
    assert.deepEqual(read(bad), fresh());
  }
  assert.deepEqual(read({ earned: 4, spent: 1, boards: ['5:1', 7, '6:2'] }), { earned: 4, spent: 1, boards: ['5:1', '6:2'] });
});
