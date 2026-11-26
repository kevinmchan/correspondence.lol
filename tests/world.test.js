import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../penny/places.js';
import { all } from '../penny/beyond.js';
import { LANDMARKS, LEFT, NIGHT, RIGHT, ROOMS_MOST, WIDE, extent, mailAbout, pieces, roomAt, roomsShown, standing, startOf, step, streetsFor, takenBy } from '../penny/world.js';

// The world round the places is set out by hand, on squares, so it is checked
// by machine: that nothing stands on anything else, that all of it is on the
// map, and that the mail going about keeps to the streets.

const rooms = (n) => Array.from({ length: n }, (_, i) => ({ id: `room-${i}`, name: `Room ${i}` }));
const full = () => standing({ rooms: rooms(40), night: true });

test('nothing in the world stands on anything else, with every room it shows and the night found', () => {
  const things = full();
  const squares = things.reduce((sum, thing) => sum + thing.w * thing.h, 0);
  assert.equal(takenBy(things).size, squares, 'two things share a square');
  assert.equal(roomsShown(rooms(40)).length, ROOMS_MOST);
  assert.equal(new Set(Array.from({ length: ROOMS_MOST }, (_, i) => roomAt(i).join())).size, ROOMS_MOST);
});

test('everything that can be pressed is on the map: eleven squares wide, and nothing past its sides', () => {
  assert.equal(WIDE, 11);
  for (const thing of full()) {
    assert.ok(thing.at[0] >= LEFT && thing.at[0] + thing.w - 1 <= RIGHT, `${thing.id} is off the side of the map`);
  }
  const range = extent(full());
  for (const thing of full()) assert.ok(thing.at[1] > range.low && thing.at[1] + thing.h < range.high + 1, `${thing.id}: there is ground beyond it`);
});

test('every landmark, and the night, leads somewhere, and is big enough to press: two squares each way at least', () => {
  for (const site of [...LANDMARKS, NIGHT, ...roomsShown(rooms(3))]) {
    assert.ok(site.w >= 2 && site.h >= 2, site.id);
    if (site.to) assert.match(site.to, /^\/(\?|jam\/)/);
  }
});

test('a piece of the sound lies beside the portal of the place that gave it up, once it has been heard', () => {
  assert.deepEqual(pieces(0), []);
  assert.deepEqual(pieces(1).map((piece) => piece.id), ['piece 1']);
  assert.equal(pieces(3).length, 3);
  assert.equal(pieces(4).length, 3, 'the first five give up three');
  const taken = takenBy(full());
  for (const piece of pieces(3)) assert.equal(taken.has(piece.at.join()), false, `${piece.id} lies on something`);
});

test('the mail going about is the mail that was found: one for each ordinary post of a place walked', () => {
  assert.deepEqual(mailAbout(), []);
  assert.equal(mailAbout({ walkedFirst: 1 }).length, 1, 'the first place has one post');
  // each place after the first keeps one post back: a piece of the sound, or Dot
  assert.equal(mailAbout({ walkedFirst: PLACES.length }).length, 1 + 3 * 4);
  assert.equal(mailAbout({ walkedFirst: PLACES.length, walkedBeyond: ['west'] }).length, 13 + 5);
  assert.equal(mailAbout({ walkedFirst: PLACES.length, walkedBeyond: all().map((place) => place.id) }).length, 13 + 15);
  const ids = mailAbout({ walkedFirst: PLACES.length, walkedBeyond: ['west', 'east', 'north'] }).map((one) => one.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('they keep to the streets: never on a place or in a building, never two on a square, a step at a time', () => {
  const things = full();
  const taken = takenBy(things);
  const range = extent(things);
  const letters = [];
  for (const one of mailAbout({ walkedFirst: PLACES.length, walkedBeyond: ['west', 'east', 'north'] })) {
    const streets = streetsFor(one, taken, range);
    assert.ok(streets.length > 3, `${one.id} has nowhere to go`);
    for (const square of streets) assert.equal(taken.has(square.join()), false);
    const at = startOf(one, streets, letters.map((other) => other.at));
    assert.ok(at, `${one.id} has nowhere to stand`);
    letters.push({ ...one, streets, at });
  }
  assert.equal(new Set(letters.map((one) => one.at.join())).size, letters.length, 'two begin on one square');
  // a long walk, by a fixed dice
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let moved = 0;
  for (let turn = 0; turn < 3000; turn++) {
    const one = letters[Math.floor(random() * letters.length)];
    const next = step(one.at, one.streets, letters.filter((other) => other !== one).map((other) => other.at), random());
    assert.ok(Math.abs(next[0] - one.at[0]) + Math.abs(next[1] - one.at[1]) <= 1, 'more than a step');
    assert.equal(taken.has(next.join()), false);
    if (next !== one.at) moved += 1;
    one.at = next;
    assert.equal(new Set(letters.map((each) => each.at.join())).size, letters.length, 'two on one square');
  }
  assert.ok(moved > 1500, 'they hardly move');
  // boxed in: it stays where it is
  assert.deepEqual(step([0, 0], [[0, 0]], [], 0.5), [0, 0]);
});
