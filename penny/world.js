// The world the map is a picture of: what stands on it besides the places.
// No page here, only data and arithmetic, so the tests can run it.
//
// The places (penny/places.js, penny/beyond.js) are where the walking is done.
// Round them is a world, on the same grid, seen from above, and it is made of
// what the app already has, set down where it belongs:
//
//   landmarks   the Dead Letter Office, at the foot of the map, where it
//               began (the film, /?office); the gallery where Penny's Radio
//               stands on its plinth (/jam/?taste); the bandstand (the music
//               maker, /jam/)
//   buildings   your rooms: each a roof in the colour the room keeps, in the
//               streets round the office (shared/place.js draws them)
//   artifacts   what has been found, lying where it was found: a piece of
//               the sound at each place that gave one up; the night, once it
//               has been found (/?sky)
//   portals     the ring a walked place opened, on the square above it
//   characters  the mail you have found. Every post opened on the walk was
//               somebody's, and it is out now: a small letter in the colour
//               of the square it was found in, going about near its place.
//               They are not pressed and have nothing to say yet.
//
// A first attempt (26 November 2026), built to be looked at. Who lives here,
// and what they are for, is the owner's to decide.
//
// Everything is placed in squares: at is the [column, row] of its bottom-left
// square, rows counting up; w and h its size in squares. The world is eleven
// squares wide, columns -4 to 6, the first place at row 0.

import { PLACES } from './places.js';
import { FIRST_AT, all as allBeyond, everywhere, portalOf } from './beyond.js';

export const LEFT = -4;
export const RIGHT = 6; // the last column
export const WIDE = RIGHT - LEFT + 1;

// The landmarks. `to` is where a touch goes.
export const LANDMARKS = [
  { id: 'office', at: [-1, -5], w: 5, h: 3, to: '/?office', name: 'The Dead Letter Office' },
  { id: 'gallery', at: [-4, 7], w: 3, h: 3, to: '/jam/?taste', name: 'The gallery: Penny’s Radio' },
  { id: 'bandstand', at: [4, 12], w: 3, h: 3, to: '/jam/', name: 'The bandstand: the music maker' },
];
// The night, once found: where it fell.
export const NIGHT = { id: 'night', at: [5, 2], w: 2, h: 2, to: '/?sky', name: 'The night' };
// The portal out of the office, onto the map: the square under the first place but one.
export const OFFICE_WAY = [1, -2];

// Your rooms: the first two stand either side of the office, and the rest in
// streets of three below it, going down. Each is three squares by two.
export const ROOMS_MOST = 11;
export function roomAt(index) {
  if (index === 0) return [LEFT, -5];
  if (index === 1) return [RIGHT - 2, -5];
  const n = index - 2;
  return [LEFT + (n % 3) * 4, -8 - Math.floor(n / 3) * 3];
}
export const roomsShown = (rooms) => rooms.slice(0, ROOMS_MOST).map((room, index) => ({ id: room.id, name: room.name, at: roomAt(index), w: 3, h: 2 }));

// Everything that stands on the map and takes up squares: the places, the
// portals above them, the landmarks, the rooms, and the night if it is there.
export function standing({ rooms = [], night = false } = {}) {
  const places = everywhere().map((place) => ({ id: `place ${place.id}`, at: place.at, w: place.n, h: place.n }));
  const ways = everywhere().map((place) => ({ id: `way ${place.id}`, at: portalOf(place), w: 1, h: 1 }));
  return [...places, ...ways, { id: 'way office', at: OFFICE_WAY, w: 1, h: 1 }, ...LANDMARKS, ...roomsShown(rooms), ...(night ? [NIGHT] : [])];
}
const key = (column, row) => `${column},${row}`;
export function takenBy(things) {
  const taken = new Map();
  for (const thing of things) {
    for (let x = 0; x < thing.w; x++) for (let y = 0; y < thing.h; y++) taken.set(key(thing.at[0] + x, thing.at[1] + y), thing.id);
  }
  return taken;
}
// The rows the world runs over, lowest and highest, with a little ground beyond each end.
export function extent(things) {
  const low = Math.min(...things.map((thing) => thing.at[1]));
  const high = Math.max(...things.map((thing) => thing.at[1] + thing.h));
  return { low: low - 1, high: high + 1 };
}

// --- The pieces of the sound, lying where they were found ----------------------
// The second, third and fourth places each gave one up, in the last post
// found there: it lies on the square beside that place's portal. `heard` is
// how many notes of the sound have been heard (penny/mail.js).
export function pieces(heard) {
  return [1, 2, 3].filter((index) => heard >= index).map((index) => {
    const [column, row] = portalOf({ at: FIRST_AT[index], n: PLACES[index].n });
    return { id: `piece ${index}`, at: [column + 1, row], note: index - 1 };
  });
}

// --- The mail that has been found, going about ---------------------------------
// One for each ordinary post of a place that has been walked: not the post
// that held a piece of the sound, nor the one that held Dot. `walkedFirst` is
// how many of the first five have been walked; `walkedBeyond` the names of
// those walked beyond. Each is { id, home: [column, row], colour }: it
// starts on the square below the post it came out of, or as near as is free.
export function mailAbout({ walkedFirst = 0, walkedBeyond = [] } = {}) {
  const out = [];
  const from = (place, id, keep) => {
    place.posts.slice(0, keep).forEach((post, i) => {
      const column = place.at[0] + (post % place.n);
      const row = place.at[1] + (place.n - 1 - Math.floor(post / place.n));
      out.push({ id: `${id}:${i}`, home: [column, row], colour: place.regions[post], place: { at: place.at, n: place.n } });
    });
  };
  PLACES.slice(0, walkedFirst).forEach((place, index) => from({ ...place, at: FIRST_AT[index] }, index, index === 0 ? 1 : place.posts.length - 1));
  for (const place of allBeyond()) if (walkedBeyond.includes(place.id)) from(place, place.id, place.posts.length);
  return out;
}
// The free squares a letter may stand on: within `reach` of its place, on
// the map, and with nothing standing there. (They keep off the places and
// out of the buildings: they go about in the streets.)
export function streetsFor(one, taken, range, reach = 2) {
  const { at, n } = one.place;
  const free = [];
  for (let column = Math.max(LEFT - 1, at[0] - reach); column <= Math.min(RIGHT + 1, at[0] + n - 1 + reach); column++) {
    for (let row = Math.max(range.low, at[1] - reach); row < Math.min(range.high, at[1] + n + reach); row++) {
      if (!taken.has(key(column, row))) free.push([column, row]);
    }
  }
  return free;
}
// One step: from a square to a free square beside it (not diagonally), or
// staying put. `random` is a number from 0 up to 1. `others` are the squares
// other letters are on: two never share one.
export function step(from, streets, others, random) {
  const busy = new Set(others.map(([column, row]) => key(column, row)));
  const next = streets.filter(([column, row]) => Math.abs(column - from[0]) + Math.abs(row - from[1]) === 1 && !busy.has(key(column, row)));
  if (!next.length) return from;
  return next[Math.min(next.length - 1, Math.floor(random * next.length))];
}
// Where it first stands: the free square nearest its home.
export function startOf(one, streets, others = []) {
  const busy = new Set(others.map(([column, row]) => key(column, row)));
  const far = ([column, row]) => Math.abs(column - one.home[0]) + Math.abs(row - one.home[1]);
  return streets.filter(([column, row]) => !busy.has(key(column, row))).sort((a, b) => far(a) - far(b) || a[0] - b[0] || a[1] - b[1])[0] ?? null;
}
