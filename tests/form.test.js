import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, STEPS } from '../jam/beat.js';
import { randomBeat } from '../jam/make.js';
import { CHORDS, PROGRESSIONS, arrange, plain, where } from '../jam/form.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const setsOf = (beat) => beat.notes.map((tiles) => new Set(tiles));
const said = (shape) => JSON.stringify([shape.chord, shape.key, shape.level, shape.pad, shape.sets.map((set) => [...set].sort((a, b) => a - b))]);
const rowsAt = (set, row) => [...set].filter((tile) => tile % ROWS === row);
// a loop with every instrument in it: a tune, keys, a bass that moves, and drums with kick, snare and hats
const full = [
  new Set([0 * ROWS + 6, 2 * ROWS + 5, 4 * ROWS + 4, 5 * ROWS + 3, 7 * ROWS + 5]),
  new Set([0 * ROWS + 4, 3 * ROWS + 2]),
  new Set([0 * ROWS + 6, 3 * ROWS + 4, 4 * ROWS + 6, 6 * ROWS + 3]),
  new Set([0 * ROWS + 6, 4 * ROWS + 6, 7 * ROWS + 6, 2 * ROWS + 4, 6 * ROWS + 4, ...[0, 1, 2, 3, 4, 5, 6, 7].map((step) => step * ROWS + 2)]),
];

test('a bar knows where it is in every loop it is part of', () => {
  assert.deepEqual(where(0), [0, 0, 0, 0]);
  assert.deepEqual(where(7), [3, 1, 0, 0], 'the last bar of the second phrase');
  assert.deepEqual(where(16 + 4 + 2), [2, 1, 1, 0]);
  assert.deepEqual(where(64), [0, 0, 0, 1], 'the second movement');
  assert.deepEqual(where(256), [0, 0, 0, 0, 1], 'and what is longer than a piece');
  assert.deepEqual(where(4 ** 6 + 3), [3, 0, 0, 0, 0, 0, 1]);
});

test('it begins as it is written, and what is played is always a bar of the board', () => {
  const first = arrange(full, 0);
  assert.equal(first.chord, 0);
  assert.equal(first.key, 0);
  assert.deepEqual(first.sets.map((set) => [...set].sort()), full.map((set) => [...set].sort()), 'the first bar is the loop itself');
  const random = seeded(4);
  for (let i = 0; i < 60; i++) {
    const sets = setsOf(randomBeat(random));
    for (const bar of [0, 1, 3, 5, 11, 15, 19, 33, 47, 63, 64, 200, 255, 256, 1000, 4 ** 6 + 5, 4 ** 9]) {
      const shape = arrange(sets, bar);
      assert.equal(said(shape), said(arrange(sets, bar)), 'the same loop at the same bar is the same');
      assert.ok(CHORDS[shape.chord], `chord ${shape.chord}`);
      assert.ok(shape.key >= -5 && shape.key <= 6, `the key has wandered off: ${shape.key} at bar ${bar}`);
      for (const [index, set] of shape.sets.entries()) {
        for (const tile of set) assert.ok(Number.isInteger(tile) && tile >= 0 && tile < STEPS * ROWS, `tile ${tile}`);
        assert.ok(shape.level[index] >= 0 && shape.level[index] <= 1.15);
        if (index < 3) assert.ok(set.size <= sets[index].size, 'nothing is added to a tune');
      }
    }
  }
});

test('the bar in its phrase: the tune is said, answered, said again and turned round', () => {
  const [a, answer, again, turn] = [0, 1, 2, 3].map((bar) => arrange(full, bar).sets[0]);
  assert.deepEqual([...again].sort(), [...a].sort(), 'said again');
  const half = (set, second) => [...set].filter((tile) => (Math.floor(tile / ROWS) >= STEPS / 2) === second).sort((x, y) => x - y);
  assert.deepEqual(half(answer, false), half(a, false), 'the answer begins as the tune did');
  assert.deepEqual(half(answer, true), half(a, true).map((tile) => tile - 1), 'and ends a step higher');
  assert.deepEqual(half(turn, false), half(a, false));
  assert.deepEqual(half(turn, true), half(a, true).map((tile) => (STEPS + STEPS / 2 - 1 - Math.floor(tile / ROWS)) * ROWS + (tile % ROWS)).sort((x, y) => x - y), 'the second half backwards');
  assert.deepEqual([0, 1, 2, 3].map((bar) => arrange(full, bar).chord), PROGRESSIONS[0]);
});

test('the phrase in its section: lighter, then the keys answering, then a build with a fill', () => {
  const lighter = arrange(full, 4);
  assert.deepEqual(rowsAt(lighter.sets[3], 6).map((tile) => Math.floor(tile / ROWS)), [0], 'the kick only on the one');
  assert.equal(rowsAt(lighter.sets[3], 2).length, 4, 'half the hats');
  assert.ok(lighter.level[3] < 1 && lighter.level[1] < lighter.level[0]);
  const answering = arrange(full, 8);
  assert.deepEqual([...answering.sets[1]].sort((x, y) => x - y), [...full[1]].map((tile) => ((Math.floor(tile / ROWS) + 4) % 8) * ROWS + (tile % ROWS)).sort((x, y) => x - y));
  const fill = arrange(full, 15);
  assert.ok(fill.sets[3].has(6 * ROWS + 4) && fill.sets[3].has(7 * ROWS + 4) && fill.sets[3].has(5 * ROWS + 5), 'a fill ends the section');
  assert.equal(arrange(full, 14).sets[3].size, full[3].size, 'and only its last bar');
  const noDrums = [full[0], full[1], full[2], new Set()];
  assert.equal(arrange(noDrums, 15).sets[3].size, 0, 'a loop without drums is not given any');
});

test('the section in its movement: the chords in another order, the bass on the beats, a phrase of rest', () => {
  for (const section of [0, 1, 2, 3]) assert.deepEqual([0, 1, 2, 3].map((bar) => arrange(full, section * 16 + bar).chord), PROGRESSIONS[section]);
  for (const order of PROGRESSIONS) assert.deepEqual([...order].sort(), [0, 1, 2, 3], 'all four chords, each once');
  assert.deepEqual([...arrange(full, 16).sets[2]].map((tile) => Math.floor(tile / ROWS)).sort(), [0, 4]);
  for (const bar of [32, 33, 34, 35]) {
    const rest = arrange(full, bar);
    assert.equal(rest.sets[2].size, 0, 'the bass rests');
    assert.equal([...rest.sets[3]].filter((tile) => tile % ROWS > 2).length, 0, 'no kick, no snare');
    assert.ok(rest.sets[3].size > 0, 'the hats go on');
    assert.ok(rest.pad > 1, 'and the chord is held up under it');
  }
  assert.ok(rowsAt(arrange(full, 36).sets[3], 6).length > 0, 'and then it comes back');
});

test('the movement, the piece, and every loop longer: the key moves, and comes home', () => {
  assert.deepEqual([0, 63, 64, 127, 128, 192].map((bar) => arrange(full, bar).key), [0, 0, 2, 2, -3, 5]);
  assert.equal(arrange(full, 256).key, -2, 'the second piece is somewhere else again');
  assert.equal(arrange(full, 1024).key, 2);
  assert.equal(arrange(full, 4096).key, -2);
  assert.equal(new Set(Array.from({ length: 64 }, (_, i) => arrange(full, i * 64).key)).size >= 6, true, 'it goes on finding new keys');
});

test('loops within loops: no phrase, section, movement or piece is the one before it', () => {
  const stretch = (from, bars) => Array.from({ length: bars }, (_, i) => said(arrange(full, from + i))).join('|');
  for (const bars of [4, 16, 64, 256, 1024]) assert.notEqual(stretch(0, bars), stretch(bars, bars), `${bars} bars come round the same`);
  const random = seeded(8);
  for (let i = 0; i < 20; i++) {
    const sets = setsOf(randomBeat(random));
    const distinct = new Set(Array.from({ length: 256 }, (_, bar) => said(arrange(sets, bar)))).size;
    const asWritten = new Set(Array.from({ length: 256 }, (_, bar) => said(plain(sets, bar)))).size;
    assert.equal(asWritten, 4, 'as it is written, a loop has four bars to its name');
    assert.ok(distinct >= 60, `only ${distinct} different bars in 256`);
  }
});

test('it is still the same loop: most of what is written is played, most of the time', () => {
  const random = seeded(15);
  for (let i = 0; i < 30; i++) {
    const sets = setsOf(randomBeat(random));
    let [tune, kicked, kicks, notes, written] = [0, 0, 0, 0, 0];
    for (let bar = 0; bar < 256; bar++) {
      const shape = arrange(sets, bar);
      if ([...shape.sets[0]].sort().join() === [...sets[0]].sort().join()) tune += 1;
      if (rowsAt(sets[3], 6).length) { kicks += 1; if (rowsAt(shape.sets[3], 6).length) kicked += 1; }
      notes += shape.sets.reduce((sum, set) => sum + set.size, 0);
      written += sets.reduce((sum, set) => sum + set.size, 0);
    }
    assert.ok(tune >= 128, `the tune was as written in only ${tune} bars of 256`);
    if (kicks) assert.ok(kicked / kicks >= 0.9, 'the kick is gone too often');
    assert.ok(notes / written > 0.8 && notes / written < 1.1, `it is ${Math.round((notes / written) * 100)}% as busy as written`);
  }
});
