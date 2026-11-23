import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions } from '../postmarks/game.js';
import { PLACES, apart, read, ruledOut, warmth } from '../penny/places.js';

// The places Penny walks you through are made by hand, so they are checked by
// machine: that each is a fair piece of the game, and that what she can tell
// about it (the rules, and her ear) is always enough to go on.

const postsOf = (place) => place.posts;
// districts numbered 0..n-1, as the game's own solver wants them
const districts = (place) => {
  const seen = [...new Set(place.regions)];
  return place.regions.map((region) => seen.indexOf(region));
};

test('every place has one post in each colour, row and column, none touching', () => {
  for (const [i, place] of PLACES.entries()) {
    const { n, regions } = place;
    const posts = postsOf(place);
    assert.equal(posts.length, n, `place ${i + 1}: a post a row`);
    assert.equal(new Set(posts.map((p) => regions[p])).size, n, `place ${i + 1}: colours`);
    assert.equal(new Set(posts.map((p) => Math.floor(p / n))).size, n, `place ${i + 1}: rows`);
    assert.equal(new Set(posts.map((p) => p % n)).size, n, `place ${i + 1}: columns`);
    for (const a of posts) for (const b of posts) if (a !== b) assert.ok(apart(a, b, n) > 1, `place ${i + 1}: ${a} and ${b} touch`);
  }
});

test('a place played by all the rules has only one answer', () => {
  for (const [i, place] of PLACES.entries()) {
    if (!place.rules.includes('touch')) continue; // earlier places leave rules out on purpose
    assert.equal(countSolutions(place.n, districts(place)), 1, `place ${i + 1}`);
  }
});

test('each place has one more rule than the last, and her ear only gets worse', () => {
  const rules = PLACES.map((place) => place.rules.length);
  assert.deepEqual(rules, [0, 1, 2, 3, 3]);
  assert.ok(PLACES.at(-1).marks, 'the last place is the one with crosses');
  for (let i = 2; i < PLACES.length; i++) assert.ok(PLACES[i].ear <= PLACES[i - 1].ear, `place ${i + 1}`);
});

test('ruledOut: a colour, a row and column, the ring of neighbours', () => {
  const place = PLACES[3];
  const { n, regions } = place;
  assert.deepEqual(ruledOut('line', 5, 4, regions).sort((a, b) => a - b), [1, 4, 6, 7, 9, 13]);
  assert.deepEqual(ruledOut('touch', 5, 4, regions).sort((a, b) => a - b), [0, 1, 2, 4, 6, 8, 9, 10]);
  assert.deepEqual(ruledOut('touch', 0, 4, regions).sort((a, b) => a - b), [1, 4, 5]);
  const colour = ruledOut('colour', 1, n, regions);
  assert.ok(colour.every((cell) => regions[cell] === regions[1]) && !colour.includes(1));
});

test('what the rules make sure is always true, and never rules out a post', () => {
  for (const [i, place] of PLACES.entries()) {
    const posts = postsOf(place);
    // every order the posts could be found in
    const orders = (left) => (left.length ? left.flatMap((p) => orders(left.filter((q) => q !== p)).map((rest) => [p, ...rest])) : [[]]);
    for (const order of orders(posts)) {
      for (let found = 0; found <= order.length; found++) {
        const squares = read(place, order.slice(0, found));
        squares.forEach((square, cell) => {
          if (square.is === 'sure') assert.ok(posts.includes(cell), `place ${i + 1}: sure of ${cell}, which has no post`);
          if (square.is === 'out') assert.ok(!posts.includes(cell), `place ${i + 1}: ruled out ${cell}, which has a post`);
          if (square.is === 'out') assert.ok(ruledOut(square.rule, square.post, place.n, place.regions).includes(cell), `place ${i + 1}: the reason given for ${cell}`);
        });
      }
    }
  }
});

test('she is never left with nothing to go on', () => {
  // At every point, either the rules make some square sure, or a finger on a
  // post makes her hear it: there is always a post she can lead you to.
  for (const [i, place] of PLACES.entries()) {
    const found = [];
    while (found.length < place.posts.length) {
      const squares = read(place, found);
      const sure = squares.findIndex((square) => square.is === 'sure');
      const next = sure >= 0 ? sure : place.posts.find((post) => !found.includes(post));
      assert.equal(warmth(place, found, next), 1, `place ${i + 1}: a finger on ${next}`);
      found.push(next);
    }
  }
});

test('her ear: full on a post, less a square or two off, nothing past its reach or for a post already found', () => {
  const far = PLACES[1]; // hears two squares off
  assert.equal(warmth(far, [], 1), 1);
  assert.equal(warmth(far, [], 0), 0.55);
  assert.equal(warmth(far, [1, 7, 8], 12), 0.28); // two off from 14
  assert.equal(warmth(far, [1, 7, 8, 14], 14), 0);
  const near = PLACES[4]; // only with a finger on it
  assert.equal(warmth(near, [], 2), 1);
  assert.equal(warmth(near, [], 3), 0);
});
