import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR } from '../shared/energy.js';
import { REELS, reelAt, reelsFor } from '../shared/reels.js';

test('a reel comes into the feed in the middle of a bar: the first halfway along the first', () => {
  assert.equal(reelAt(0), BAR / 2);
  assert.equal(reelAt(1), BAR + BAR / 2);
  assert.deepEqual(reelsFor(0), []);
  assert.deepEqual(reelsFor(reelAt(0) - 1), [], 'not before the middle');
  assert.deepEqual(reelsFor(reelAt(0)), [REELS[0]]);
});

test('a reel shared with you is in your feed whatever the energy, and only reels there are count', () => {
  assert.deepEqual(reelsFor(0, [REELS[0]]), [REELS[0]]);
  assert.deepEqual(reelsFor(0, ['no such reel']), []);
});

import { decodeWords, encodeWords } from '../shared/reels.js';

test('a made reel’s words go in its link and come back out, and nothing else does', () => {
  const words = { 'the hook': 'Ça va? Ünïcödé “quotes” / and 🙏', 'the reveal': '  spaced  ', empty: '' };
  const code = encodeWords(words);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'safe in an address');
  assert.deepEqual(decodeWords(code, ['the hook', 'the reveal']), { 'the hook': 'Ça va? Ünïcödé “quotes” / and 🙏', 'the reveal': 'spaced' });
  assert.deepEqual(decodeWords(code, ['the hook']), { 'the hook': 'Ça va? Ünïcödé “quotes” / and 🙏' }, 'only the entries the reel has');
  assert.deepEqual(decodeWords('not a code!', ['the hook']), {});
  assert.deepEqual(decodeWords(encodeWords({}), ['the hook']), {});
});
