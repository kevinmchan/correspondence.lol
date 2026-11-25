import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAR, LARGEST, POST, SMALLEST, bar, earnedOn, meadowEarned, finish, fresh, held, most, played, read, spend } from '../shared/energy.js';
import { MAX_SIZE, MIN_SIZE } from '../postmarks/game.js';

const at = (size, seed, found, status = 'playing') => ({ size, seed, found, status });

test('every post found earns at once, whether or not the board is finished', () => {
  let state = fresh();
  for (let found = 1; found <= 4; found++) {
    const now = played(state, at(7, 1, found));
    assert.deepEqual([now.gained, now.posts, now.won], [POST, 1, false], `post ${found}`);
    state = now.state;
  }
  assert.equal(held(state), 4 * POST);
  const lost = played(state, at(7, 1, 4, 'lost'));
  assert.equal(lost.gained, 0, 'running out of hearts takes nothing back, and earns nothing more');
  assert.equal(held(lost.state), 4 * POST);
});

test('finishing a board entirely earns more on top: its posts’ worth again', () => {
  const state = played(fresh(), at(7, 1, 6)).state;
  const won = played(state, at(7, 1, 7, 'won'));
  assert.deepEqual([won.posts, won.won], [1, true]);
  assert.equal(won.gained, POST + finish(7));
  assert.equal(held(won.state), most(7));
  assert.equal(finish(7), 7 * POST);
});

test('a harder board earns more: every size Postmarks makes, all of it and its finish', () => {
  assert.equal(SMALLEST, MIN_SIZE);
  assert.equal(LARGEST, MAX_SIZE);
  for (let size = MIN_SIZE + 1; size <= MAX_SIZE; size++) {
    assert.ok(most(size) > most(size - 1));
    assert.ok(finish(size) > finish(size - 1));
  }
  for (const odd of [MIN_SIZE - 1, MAX_SIZE + 1, 6.5]) {
    assert.equal(most(odd), 0);
    assert.equal(played(fresh(), at(odd, 1, 3, 'won')).gained, 0);
  }
});

test('faster earns no more, and a hint costs nothing: the rules are not told the time or the hints at all', () => {
  const quick = played(fresh(), { ...at(8, 2, 8, 'won'), ms: 1000, hints: 0 });
  const slow = played(fresh(), { ...at(8, 2, 8, 'won'), ms: 9000000, hints: 40 });
  assert.equal(quick.gained, slow.gained);
  assert.deepEqual(quick.state, slow.state);
  const source = readFileSync(new URL('../shared/energy.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /Date|performance|\bms\b|elapsed|hint|setTimeout|setInterval/);
});

test('a board earns once: played again, only posts it has not earned for, and its finish once', () => {
  const lost = played(fresh(), at(9, 77, 5, 'lost')).state;
  const again = played(lost, at(9, 77, 3));
  assert.equal(again.gained, 0, 'the same posts found again');
  assert.equal(again.state, lost);
  const further = played(lost, at(9, 77, 6));
  assert.equal(further.gained, POST, 'one further than before');
  const won = played(further.state, at(9, 77, 9, 'won')).state;
  assert.equal(held(won), most(9));
  assert.equal(played(won, at(9, 77, 9, 'won')).gained, 0, 'won again');
  assert.deepEqual(earnedOn(won, at(9, 77, 0)), { posts: 9, won: true, energy: most(9) });
  assert.equal(played(won, at(9, 78, 1)).gained, POST, 'another board of the same size');
  assert.equal(played(won, at(8, 77, 1)).gained, POST, 'the same seed at another size is another board');
});

test('it accumulates without limit and never fades', () => {
  let state = fresh();
  for (let seed = 0; seed < 1000; seed++) state = played(state, at(9, seed, 9, 'won')).state;
  assert.equal(held(state), 1000 * most(9));
  assert.ok(state.boards.length <= 400, 'only so many boards are remembered');
  assert.equal(held(read(JSON.parse(JSON.stringify(state)))), 1000 * most(9), 'and it is all there after being saved');
});

test('spending is all of a price or none of it', () => {
  const state = played(fresh(), at(5, 1, 5, 'won')).state;
  assert.deepEqual(spend(state, most(5) + 1), { state, paid: false });
  for (const bad of [0, -3, 1.5]) assert.equal(spend(state, bad).paid, false);
  const after = spend(state, 3);
  assert.equal(after.paid, true);
  assert.equal(held(after.state), most(5) - 3);
  assert.equal(after.state.earned, most(5), 'what was earned stays on record');
});

test('what was saved is made safe: anything broken is a fresh start, never a debt', () => {
  for (const bad of [null, 'x', {}, { earned: -1, spent: 0, boards: [] }, { earned: 2, spent: 3, boards: [] }, { earned: 1.5, spent: 0, boards: [] }, { earned: 1, spent: 0, boards: 'no' }]) {
    assert.deepEqual(read(bad), fresh());
  }
  const kept = { b: '6:2', p: 3, w: false };
  assert.deepEqual(read({ earned: 4, spent: 1, boards: ['5:1', kept, { b: 7, p: 1, w: true }, { b: '5:2', p: -1, w: false }] }), { earned: 4, spent: 1, boards: [kept] });
});

test('the bar is everything earned, about twenty games, and its first fill is the meadow', () => {
  const average = [5, 6, 7, 8, 9].reduce((sum, size) => sum + most(size), 0) / 5;
  assert.ok(BAR / average >= 16 && BAR / average <= 20, 'about twenty games, most of them finished');
  let state = fresh();
  assert.deepEqual(bar(state), { fill: 0, fills: 0 });
  assert.equal(meadowEarned(state), false);
  let seed = 0;
  while (state.earned < BAR - most(9)) state = played(state, at(9, seed++, 9, 'won')).state;
  assert.equal(meadowEarned(state), false);
  assert.ok(bar(state).fill > 0.9 && bar(state).fill < 1);
  state = played(state, at(9, seed++, 9, 'won')).state;
  assert.equal(meadowEarned(state), true, 'one more game fills it');
  assert.equal(bar(state).fills, 1);
  assert.equal(bar(state).fill, (state.earned - BAR) / BAR, 'and it begins again from what was left over');
  const spent = spend(state, 5).state;
  assert.deepEqual(bar(spent), bar(state), 'spending takes nothing off the bar');
  assert.equal(meadowEarned(spent), true, 'nor the meadow');
});
