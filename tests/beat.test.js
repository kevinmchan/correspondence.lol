import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, isEmpty } from '../jam/beat.js';

test('a beat comes back out of its code as it went in', () => {
  const beat = { tempo: 2, notes: [[0, 7, 55], [], [13, 14, 15, 16], [6, 34, 48, 20, 21]] };
  const code = encode(beat);
  assert.match(code, /^[A-Za-z0-9_-]{39}$/, 'safe in an address, and short');
  const back = decode(code);
  assert.equal(back.tempo, 2);
  assert.deepEqual(back.notes, beat.notes.map((tiles) => [...tiles].sort((a, b) => a - b)));
  assert.equal(encode(back), code);
  // every tile of every instrument, and none
  const full = { tempo: 3, notes: [0, 1, 2, 3].map(() => Array.from({ length: 56 }, (_, i) => i)) };
  assert.deepEqual(decode(encode(full)), full);
  assert.equal(isEmpty(decode(encode({ tempo: 0, notes: [[], [], [], []] }))), true);
  assert.equal(isEmpty(beat), false);
});

test('what is not a beat is not taken for one', () => {
  const good = encode({ tempo: 1, notes: [[1], [2], [3], [4]] });
  for (const bad of [null, undefined, '', 'hello', good.slice(1), `${good}A`, good.replace(/^./, 'z'), `${good.slice(0, 20)}!${good.slice(21)}`, 42]) {
    assert.equal(decode(bad), null, String(bad));
  }
  assert.equal(decode(encode({ tempo: 9, notes: [[], [], [], []] })), null, 'a tempo there is not');
  assert.deepEqual(encode({ tempo: 0, notes: [[-1, 56, 3.5, 'x', 2], [], [], []] }), encode({ tempo: 0, notes: [[2], [], [], []] }), 'tiles off the board are dropped');
});

test('a beat with parts for the sounds beside the instruments is written the long way, and one without as it always was', () => {
  const beat = { tempo: 1, notes: [[0, 7], [], [13], [6, 48], [], [3, 55], [], [20]] };
  const code = encode(beat);
  assert.match(code, /^[A-Za-z0-9_-]{76}$/);
  assert.deepEqual(decode(code), beat);
  assert.equal(encode(decode(code)), code);
  // the same four instruments and nothing beside them: the short code, as before
  const short = encode({ tempo: 1, notes: [[0, 7], [], [13], [6, 48], [], [], [], []] });
  assert.equal(short, encode({ tempo: 1, notes: [[0, 7], [], [13], [6, 48]] }));
  assert.equal(short.length, 39);
  assert.equal(decode(short).notes.length, 4);
  // not a beat: the long way with nothing in the last four, cut short, or of a kind there is not
  const padded = encode({ tempo: 1, notes: [[0], [], [], [], [], [], [], [1]] }).slice(0, 67) + 'AAAAAAAAA';
  assert.equal(decode(padded), null);
  assert.equal(decode(code.slice(1)), null);
  assert.equal(decode(`M${code.slice(1)}`), null);
  assert.equal(isEmpty(beat), false);
});
