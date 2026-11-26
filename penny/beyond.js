// The places beyond the first five: where the search goes on, with Dot.
// No page here, only data and arithmetic, so the tests can run it.
//
// The first five places are a line (penny/places.js). From the fifth on the
// map is a network: a place can lead on to more than one, so two or three are
// open at once and are walked in whichever order; and the ways come together
// again, at a place that waits for all of them. Nothing of the story is
// written here yet: who is met in these places, and what each is there to
// show, are the owner's to decide. What is here is how the map opens.
//
// A place beyond is in one of four states, and the map shows each by its
// form (penny/map.js), never by a word, a lock or a number:
//
//   walked   every post in it has been found. It lies flat.
//   lit      it can be walked now. It stands up off the map, in colour.
//   near     every place that leads to it has been walked, but it is not lit
//            yet: it wants energy. Its squares take colour one by one as
//            energy is poured into it, and when the last has, it is lit.
//   faint    the way to it is not open.
//
// Energy is what lights a place (shared/energy.js: "spent, later, at places in
// the world"). It is poured by hand, a touch on the place, so that where
// there are two to choose from the choice is yours; and all of what is held
// goes in, as far as the place has room for. It is never taken back. The
// prices are kept low on purpose: the work of walking the places that lead to
// a place earns what that place costs, so nobody has to go and grind for it.
//
// Every place here is played by all the rules of the game, in the walk
// (penny/walk.js), as the fifth place is: nothing to hear, a slide makes
// crosses, and your crosses are Penny's memory. Its board is one of the
// game's own (postmarks/game.js), named by its size and seed, so it has
// exactly one answer, and so that what it earns is energy by the same rules as
// any other board: a post found, one; the board finished, as much again; and
// a board walked a second time, nothing more.

import { generatePuzzle } from '../postmarks/game.js';
import { PLACES } from './places.js';
import { held, spend } from '../shared/energy.js';

export const BEYOND_KEY = 'penny:beyond:v1';

// at: the [column, row] of its bottom-left square on the map, rows counting
// up, on the same grid as the first five (penny/walk.js, AT). after: the
// places beyond that lead to it, all of which must have been walked (none:
// the fifth place leads to it). light: what it costs to light.
const SET = [
  { id: 'west', at: [-4, 22], after: [], board: { size: 5, seed: 1203 }, light: 0 },
  { id: 'east', at: [2, 22], after: [], board: { size: 5, seed: 1207 }, light: 0 },
  { id: 'north', at: [-1, 28], after: ['west', 'east'], board: { size: 5, seed: 1213 }, light: 20 },
];

// Where each of the first five lies (the same grid).
export const FIRST_AT = [[1, 0], [0, 2], [1, 7], [-1, 12], [0, 17]];

const cache = new Map();
// A place beyond, as the walk plays one: the shape of a place in places.js.
function build(one) {
  if (cache.has(one.id)) return cache.get(one.id);
  const { size, seed } = one.board;
  const { regions, solution } = generatePuzzle(size, seed);
  const place = {
    ...one,
    n: size,
    regions,
    posts: solution.map((column, row) => row * size + column),
    rules: ['colour', 'line', 'touch'],
    loud: [], reach: 0, listen: 0, twice: 350, crosses: true, marks: true,
  };
  cache.set(one.id, place);
  return place;
}
export const BEYOND = SET.map((one) => one.id);
export const beyond = (id) => {
  const one = SET.find((each) => each.id === id);
  return one ? build(one) : null;
};
export const all = () => SET.map(build);

// The square its portal opens on: one above the place, as in the walk.
export const portalOf = ({ at, n }) => [at[0] + Math.floor((n - 1) / 2), at[1] + n];
// Everything on the map: the first five, then the places beyond. Each is
// { id, at, n, regions, posts }.
export const everywhere = () => [
  ...PLACES.map((place, index) => ({ id: index, at: FIRST_AT[index], n: place.n, regions: place.regions, posts: place.posts })),
  ...all(),
];

export const fresh = () => ({ walked: [], charge: {} });
// What was saved, made safe to use.
export function tidy(saved) {
  if (!saved || !Array.isArray(saved.walked) || typeof saved.charge !== 'object' || saved.charge === null) return fresh();
  const charge = {};
  for (const { id, light } of SET) {
    const got = saved.charge[id];
    if (Number.isSafeInteger(got) && got > 0 && light > 0) charge[id] = Math.min(got, light);
  }
  return { walked: BEYOND.filter((id) => saved.walked.includes(id)), charge };
}

const chargeOf = (progress, id) => progress.charge[id] ?? 0;
// 'walked' | 'lit' | 'near' | 'faint'. `first`: the first five have been walked.
export function stateOf(progress, id, first = true) {
  const one = SET.find((each) => each.id === id);
  if (!one) return 'faint';
  if (progress.walked.includes(id)) return 'walked';
  if (!first || !one.after.every((before) => progress.walked.includes(before))) return 'faint';
  return chargeOf(progress, id) >= one.light ? 'lit' : 'near';
}
// How far a place is towards being lit, 0 to 1.
export function lightOf(progress, id) {
  const one = SET.find((each) => each.id === id);
  if (!one) return 0;
  return one.light === 0 ? 1 : Math.min(1, chargeOf(progress, id) / one.light);
}
// How many of a place's squares have taken colour: all of them only when it is lit.
export function coloured(progress, id) {
  const place = beyond(id);
  if (!place) return 0;
  const squares = place.n * place.n;
  const part = lightOf(progress, id);
  return part >= 1 ? squares : Math.min(squares - 1, Math.floor(part * squares));
}

// Pour what energy is held into a place that is near, as far as it has room.
// Gives { progress, energy, poured }: poured is how much went in.
export function pour(progress, energy, id, first = true) {
  const none = { progress, energy, poured: 0 };
  if (stateOf(progress, id, first) !== 'near') return none;
  const one = SET.find((each) => each.id === id);
  const amount = Math.min(held(energy), one.light - chargeOf(progress, id));
  const { state, paid } = spend(energy, amount);
  if (!paid) return none;
  return { progress: { ...progress, charge: { ...progress.charge, [id]: chargeOf(progress, id) + amount } }, energy: state, poured: amount };
}

// A place walked: every post in it found.
export function walk(progress, id) {
  if (!BEYOND.includes(id) || progress.walked.includes(id)) return progress;
  return { ...progress, walked: BEYOND.filter((each) => each === id || progress.walked.includes(each)) };
}
