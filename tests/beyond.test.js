import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions } from '../postmarks/game.js';
import { PLACES, apart, read } from '../penny/places.js';
import { BEYOND, FIRST_AT, all, beyond, coloured, everywhere, fresh, lightOf, portalOf, pour, stateOf, tidy, walk } from '../penny/beyond.js';
import { finish, fresh as noEnergy, held, played } from '../shared/energy.js';

// The places beyond the first five are boards of the game's own, chosen by
// seed, so they are checked by machine: that each is a fair piece of the
// game, that the map they lie on has no two places on one square, and that
// the way they open is the way penny/beyond.js says.

const energyOf = (earned) => ({ ...noEnergy(), earned });

test('every place beyond is a fair board with one answer', () => {
  for (const place of all()) {
    const { n, regions, posts } = place;
    assert.equal(countSolutions(n, regions, 2), 1, `${place.id}: one answer`);
    assert.equal(posts.length, n);
    assert.equal(new Set(posts.map((p) => regions[p])).size, n, `${place.id}: colours`);
    assert.equal(new Set(posts.map((p) => p % n)).size, n, `${place.id}: columns`);
    for (const a of posts) for (const b of posts) if (a !== b) assert.ok(apart(a, b, n) > 1, `${place.id}: ${a} and ${b} touch`);
  }
});

test('every place beyond is gentle: what Penny can see for itself, a step at a time, is enough to finish it', () => {
  // (its seal on a square the rules leave alone, and one step of thought, "a
  // post here would leave that colour with nowhere": never a chain. Whoever is
  // stuck can wait for Penny, as in the fifth place.)
  for (const place of all()) {
    const found = [];
    const shut = [];
    for (let moved = true; moved;) {
      moved = false;
      read(place, found, shut).forEach((square, cell) => {
        if (square.is === 'sure') { found.push(cell); moved = true; }
        if (square.is === 'room') { shut.push(cell); moved = true; }
      });
    }
    assert.deepEqual([...found].sort((a, b) => a - b), [...place.posts].sort((a, b) => a - b), place.id);
  }
});

test('no two places on the map share a square, nor a place and a portal', () => {
  const taken = new Map();
  const take = (column, row, who) => {
    const key = `${column},${row}`;
    assert.equal(taken.get(key), undefined, `${who} is on a square of ${taken.get(key)}`);
    taken.set(key, who);
  };
  for (const place of everywhere()) {
    for (let i = 0; i < place.n * place.n; i++) take(place.at[0] + (i % place.n), place.at[1] + Math.floor(i / place.n), `place ${place.id}`);
    take(...portalOf(place), `the portal of ${place.id}`);
  }
  assert.equal(everywhere().length, PLACES.length + BEYOND.length);
  assert.equal(FIRST_AT.length, PLACES.length);
});

test('the way on is up: a place lies above every place that leads to it', () => {
  const fifth = FIRST_AT.at(-1)[1] + PLACES.at(-1).n;
  for (const place of all()) {
    assert.ok(place.at[1] > fifth, `${place.id} is above the fifth place`);
    for (const before of place.after) assert.ok(place.at[1] >= beyond(before).at[1] + beyond(before).n, `${place.id} is above ${before}`);
  }
});

test('nothing beyond is open until the first five have been walked', () => {
  for (const id of BEYOND) assert.equal(stateOf(fresh(), id, false), 'faint');
});

test('the fifth place leads to two places at once, lit for nothing, to be walked in either order', () => {
  const start = fresh();
  assert.deepEqual(BEYOND.map((id) => stateOf(start, id)), ['lit', 'lit', 'faint']);
  for (const order of [['west', 'east'], ['east', 'west']]) {
    let progress = walk(start, order[0]);
    assert.equal(stateOf(progress, order[0]), 'walked');
    assert.equal(stateOf(progress, order[1]), 'lit');
    assert.equal(stateOf(progress, 'north'), 'faint', 'the ways come together: it waits for both');
    progress = walk(progress, order[1]);
    assert.equal(stateOf(progress, 'north'), 'near');
    assert.deepEqual(progress.walked, ['west', 'east'], 'kept in the map\'s order, whichever was walked first');
  }
});

test('energy lights a place: poured by hand, all that is held as far as there is room, and never taken back', () => {
  const both = walk(walk(fresh(), 'west'), 'east');
  const north = beyond('north');
  // nothing held: nothing poured
  assert.equal(pour(both, energyOf(0), 'north').poured, 0);
  // some held: all of it goes in, and squares take colour, but never the last until it is lit
  let step = pour(both, energyOf(8), 'north');
  assert.equal(step.poured, 8);
  assert.equal(held(step.energy), 0);
  assert.equal(step.energy.earned, 8, 'the bar is everything earned: pouring takes nothing off it');
  assert.equal(stateOf(step.progress, 'north'), 'near');
  assert.equal(lightOf(step.progress, 'north'), 8 / north.light);
  assert.equal(coloured(step.progress, 'north'), Math.floor((8 / north.light) * 25));
  // the rest, and more than the rest: only what there is room for is taken
  step = pour(step.progress, { ...step.energy, earned: step.energy.earned + 100 }, 'north');
  assert.equal(step.poured, north.light - 8);
  assert.equal(held(step.energy), 100 - (north.light - 8));
  assert.equal(stateOf(step.progress, 'north'), 'lit');
  assert.equal(coloured(step.progress, 'north'), 25);
  // lit: no more goes in
  assert.equal(pour(step.progress, step.energy, 'north').poured, 0);
  // and a place the way to which is not open takes none
  assert.equal(pour(fresh(), energyOf(50), 'north').poured, 0);
  assert.equal(pour(fresh(), energyOf(50), 'west').poured, 0, 'a place lit for nothing takes none');
  assert.equal(coloured(walk(both, 'north'), 'nowhere'), 0);
});

test('nobody has to grind: walking the places that lead to a place earns what it costs', () => {
  for (const place of all()) {
    let energy = noEnergy();
    for (const id of place.after) {
      const before = beyond(id);
      energy = played(energy, { size: before.n, seed: before.board.seed, status: 'won', found: before.n }).state;
      assert.equal(energy.earned > 0, true);
    }
    assert.ok(held(energy) >= place.light, `${place.id} costs ${place.light}, and the places before it earn ${held(energy)}`);
  }
  assert.equal(finish(5), 5);
});

test('a place walked twice is walked once, and what is saved is made safe', () => {
  const once = walk(fresh(), 'west');
  assert.equal(walk(once, 'west'), once);
  assert.equal(walk(once, 'nowhere'), once);
  assert.deepEqual(tidy(null), fresh());
  assert.deepEqual(tidy({ walked: 'west', charge: {} }), fresh());
  assert.deepEqual(tidy({ walked: ['east', 'nowhere', 'west'], charge: { north: 999, west: 3, east: -1, nowhere: 4 } }), { walked: ['west', 'east'], charge: { north: beyond('north').light } });
});
