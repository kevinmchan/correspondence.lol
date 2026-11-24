import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions } from '../postmarks/game.js';
import { PLACES, apart, hear, mailIn, read, ruledOut, vouch } from '../penny/places.js';

// The places Penny walks you through are made by hand, so they are checked by
// machine: that each is a fair piece of the game, that what it can tell about
// it is never false, and that between its head and its ear there is always
// something to go on, without it ever being given the answer.

// districts numbered 0..n-1, as the game's own solver wants them
const districts = (place) => {
  const seen = [...new Set(place.regions)];
  return place.regions.map((region) => seen.indexOf(region));
};
// every order a list could be taken in
const orders = (left) => (left.length ? left.flatMap((p) => orders(left.filter((q) => q !== p)).map((rest) => [p, ...rest])) : [[]]);
const where = (squares, is) => squares.map((square, cell) => (square.is === is ? cell : -1)).filter((cell) => cell >= 0);

test('every place has one post in each colour, row and column, none touching', () => {
  for (const [i, place] of PLACES.entries()) {
    const { n, regions, posts } = place;
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

test('every place is played by all the rules, shows one of them, and has fewer posts it can hear', () => {
  assert.deepEqual(PLACES.map((place) => place.rules.length), [0, 3, 3, 3, 3], 'all the rules, but for the one square of the first');
  assert.deepEqual(PLACES.map((place) => place.shows ?? null), [null, 'colour', 'line', 'touch', null], 'one rule shown at a time');
  assert.ok(PLACES.at(-1).marks, 'in the last place a slide crosses too');
  assert.deepEqual(PLACES.map((place) => Boolean(place.crosses)), [false, true, true, true, true], 'a tap crosses from the second place on');
  const quiet = PLACES.map((place) => place.posts.length - place.loud.length);
  assert.deepEqual(quiet, [0, 1, 2, 3, 4], 'one more quiet post each place');
  for (const [i, place] of PLACES.entries()) assert.ok(place.loud.every((post) => place.posts.includes(post)), `place ${i + 1}: what is loud is a post`);
});

test('ruledOut: a colour, a row and column, the ring of neighbours', () => {
  const { n, regions } = PLACES[3];
  assert.deepEqual(ruledOut('line', 5, 4, regions).sort((a, b) => a - b), [1, 4, 6, 7, 9, 13]);
  assert.deepEqual(ruledOut('touch', 5, 4, regions).sort((a, b) => a - b), [0, 1, 2, 4, 6, 8, 9, 10]);
  assert.deepEqual(ruledOut('touch', 0, 4, regions).sort((a, b) => a - b), [1, 4, 5]);
  const colour = ruledOut('colour', 1, n, regions);
  assert.ok(colour.every((cell) => regions[cell] === regions[1]) && !colour.includes(1));
});

test('what its head tells it is never false', () => {
  for (const [i, place] of PLACES.entries()) {
    for (const order of orders(place.posts)) {
      for (let found = 0; found <= order.length; found++) {
        const squares = read(place, order.slice(0, found));
        assert.equal(squares.stuck.length, 0, `place ${i + 1}: nothing is ever left with nowhere`);
        squares.forEach((square, cell) => {
          const post = place.posts.includes(cell);
          if (square.is === 'sure') assert.ok(post, `place ${i + 1}: sure of ${cell}, which has no post`);
          if (square.is === 'out' || square.is === 'room') assert.ok(!post, `place ${i + 1}: ${cell} called ${square.is}, and it has a post`);
          if (square.is === 'out') assert.ok(ruledOut(square.rule, square.post, place.n, place.regions).includes(cell), `place ${i + 1}: the reason given for ${cell}`);
        });
      }
    }
  }
});

test('in the places with an ear, there is always a post it can lead you to', () => {
  // Whatever has been found, in whatever order: either the rules make some
  // square sure, or some post not yet found is loud.
  for (const [i, place] of PLACES.slice(0, 4).entries()) {
    for (const order of orders(place.posts)) {
      for (let found = 0; found < order.length; found++) {
        const have = order.slice(0, found);
        const sure = where(read(place, have), 'sure');
        const loud = place.loud.filter((post) => !have.includes(post));
        assert.ok(sure.length + loud.length > 0, `place ${i + 1} with ${have} found`);
        for (const post of loud) assert.equal(hear(place, have, post).strength, 1);
      }
    }
  }
});

test('its ear: full on a loud post, less a square or two off, nothing for a quiet one or one already found', () => {
  const place = PLACES[1]; // loud at 1, 7, 8; the post at 14 is quiet
  assert.equal(hear(place, [], 1).strength, 1);
  assert.deepEqual(hear(place, [], 0), { strength: 0.55, side: 1, post: 1 }, 'one off, and it lies to the right');
  assert.equal(hear(place, [], 14).strength, 0.28, 'a finger on the quiet post hears only a loud one, two off');
  assert.equal(hear(PLACES[3], [], 14).strength, 0, 'and out of reach of any loud one, nothing: being a post does not make it heard');
  assert.equal(hear(place, [1, 7, 8], 12).strength, 0, 'nothing left that is loud');
  assert.equal(hear(place, [], 3).side, 0, 'straight below');
});

test('in the last place it hears nothing at all', () => {
  const place = PLACES[4];
  for (const cell of place.regions.keys()) assert.equal(hear(place, [], cell).strength, 0);
});

test('the last place: your crosses are its memory, and one cross is enough to begin', () => {
  const place = PLACES[4];
  const sure = (crosses) => where(read(place, [], [...vouch(place, [], [], crosses)]), 'sure');
  // at the start no post is sure, and it can see the reason for a cross in the top right corner
  assert.deepEqual(sure([]), []);
  assert.ok(where(read(place, []), 'room').includes(3));
  // which leaves that colour with one square
  assert.deepEqual(sure([3]), [2]);
  // a cross it cannot see the reason for is not vouched for, and changes nothing it knows
  assert.deepEqual([...vouch(place, [], [], [8])], []);
  assert.deepEqual(sure([8]), []);
  // one cross can make the reason for the next
  const first = where(read(place, []), 'room');
  const then = where(read(place, [], [3]), 'room');
  assert.ok(then.some((cell) => !first.includes(cell)), 'something it could not see before the first cross');
});

test('it never vouches for a cross on a post, whatever is crossed', () => {
  const place = PLACES[4];
  const all = [...place.regions.keys()];
  // every set of crosses is too many to try: every single cross, every pair, and everything at once
  const sets = [all, ...all.map((a) => [a]), ...all.flatMap((a) => all.filter((b) => b > a).map((b) => [a, b]))];
  for (const found of [[], [2], [4], [11], [13], [2, 4], [11, 13]]) {
    for (const crosses of sets) {
      const good = vouch(place, found, [], crosses.filter((cell) => !found.includes(cell)));
      for (const cell of good) assert.ok(!place.posts.includes(cell), `vouched for a cross on the post at ${cell}`);
    }
  }
  // with everything crossed, what it will not vouch for is exactly the posts
  assert.deepEqual(all.filter((cell) => !vouch(place, [], [], all).has(cell)), [2, 4, 11, 13]);
});

test('after any first post in the last place, the rest follow one at a time', () => {
  const place = PLACES[4];
  for (const first of place.posts) {
    const found = [first];
    while (found.length < place.posts.length) {
      const sure = where(read(place, found), 'sure');
      assert.ok(sure.length > 0, `stuck after ${found}`);
      found.push(sure[0]);
    }
  }
});

test('what is in the posts: pieces of the sound in the middle places, and Dot at the quarter mark', () => {
  const lasts = PLACES.map((place, i) => mailIn(i, place.posts.length - 1, place.posts.length));
  assert.ok(!lasts[0].friend && !lasts[0].dot, 'the first post of all is somebody else\'s');
  // a longer piece each time, each nearer than the last, and never all of it
  const pieces = lasts.slice(1, 4);
  assert.ok(pieces.every((mail) => mail.friend));
  assert.deepEqual(pieces.map((mail) => mail.notes.length), [1, 2, 3]);
  assert.ok(pieces[0].far > pieces[1].far && pieces[1].far > pieces[2].far);
  // Dot is in the last post of the last place, and nowhere before it
  assert.ok(lasts[4].dot && !lasts[4].friend);
  PLACES.forEach((place, i) => {
    for (let order = 0; order < place.posts.length; order++) {
      const mail = mailIn(i, order, place.posts.length);
      assert.equal(Boolean(mail.dot), i === 4 && order === place.posts.length - 1, `place ${i + 1}, post ${order + 1}`);
      if (order < place.posts.length - 1) assert.ok(!mail.friend && mail.notes.length > 0, 'the earlier posts are other people\'s');
    }
  });
  // and only once: with Dot already found, that post is somebody's ordinary mail
  const again = mailIn(4, PLACES[4].posts.length - 1, PLACES[4].posts.length, true);
  assert.ok(!again.dot && !again.friend && again.notes.length > 0);
});
