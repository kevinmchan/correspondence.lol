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
