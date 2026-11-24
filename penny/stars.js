// The night sky's rules. No page here and no sound, only data and arithmetic,
// so the tests can run it. The screen is penny/sky.js and what it sounds like
// is penny/chimes.js.
//
// The sky began as a picture: five lights on black. Three are stars with four
// points, in a line that falls from the top left, each bigger than the last;
// two are small and round, one either side of the line. Everything below is
// read off that picture, and everything a hand adds to the sky keeps to it.
//
// The picture is read the way the rest of Penny's world is ("How a place says
// it", in the README). What is quick is short and bright: a tap leaves one of
// the round ones. What is slow is long, low and has come a long way: a finger
// held still grows a star, for as long as it is held. So the picture is also
// a lesson in what a hand can do: two taps, and three holds, each longer than
// the one before.
//
//   Where a light is, up and down, is its pitch: higher is higher. The sky is
//   ruled in rows, ten to the picture's side, on the five notes the rest of
//   the app keeps to. That makes the picture's three stars E, C and E again
//   an octave down: the same notes whatever is under them, bright over C and
//   sad over A minor. Nothing here settles which.
//
//   How big a light is, is how near. What is near is loud, full and long, and
//   comes straight; what is far is quiet, dull and mostly echo.
//
//   Every light a hand makes keeps its own time. It sounds when it is made,
//   and comes back, fainter each time, until it goes out. The bigger, the
//   slower it comes round and the longer it lasts; a dot is gone after three.
//   The five of the picture are read together instead, left to right, once
//   to each turn of the sky, and they do not fade.

// --- The picture -------------------------------------------------------------------
export const SKY = '#09090d'; // both measured off it
export const LIGHT = '#dedede';

const SIDE = 1024; // the picture's side, in its own pixels
// The five, in the order they are read: left to right. Places and sizes are in
// units of the picture's side. A star's `a` is from its middle out to its side
// points and `b` up to its top one; a dot's `r` is its radius.
export const PICTURE = [
  { kind: 'star', x: 304 / SIDE, y: 272 / SIDE, a: 46 / SIDE, b: 64 / SIDE },
  { kind: 'dot', x: 358 / SIDE, y: 632 / SIDE, r: 10 / SIDE },
  { kind: 'star', x: 484 / SIDE, y: 488 / SIDE, a: 82 / SIDE, b: 118 / SIDE },
  { kind: 'dot', x: 610 / SIDE, y: 335 / SIDE, r: 11.75 / SIDE },
  { kind: 'star', x: 718 / SIDE, y: 758 / SIDE, a: 136 / SIDE, b: 190 / SIDE },
];

// The shape of a star. Its sides curve in more sharply than a circle's arc
// would: in every one of the three, the edge is where the 0.42th powers of
// the distances across and up add to one. That is what makes the points
// needles. And each is 1.4 times as tall as it is wide.
export const POINTED = 0.42;
export const TALL = 1.4;
// Its outline, once round from the right-hand point, for a star one unit
// across and one up from its middle: [across, up] pairs.
export function outline(steps = 40) {
  const quarter = [];
  for (let i = 0; i < steps; i++) {
    const turn = (i / steps) * (Math.PI / 2);
    quarter.push([Math.cos(turn) ** (2 / POINTED), Math.sin(turn) ** (2 / POINTED)]);
  }
  return [
    ...quarter,
    ...quarter.map(([x, y]) => [-y, x]),
    ...quarter.map(([x, y]) => [-x, -y]),
    ...quarter.map(([x, y]) => [y, -x]),
  ];
}

// --- Sizes ---------------------------------------------------------------------------
// A size runs from 0, the smallest star a hand can make, to 1, the biggest:
// the picture's own big one. The picture's small and middle stars are sizes
// 0.17 and 0.5.
export const SMALLEST = 28 / SIDE;
export const BIGGEST = 136 / SIDE;
export const SPECK = 10 / SIDE; // the radius of a dot
export const halfWidth = (size) => SMALLEST + (BIGGEST - SMALLEST) * size;
export const sizeOf = (a) => (a - SMALLEST) / (BIGGEST - SMALLEST);
// How near a light is, 0 to 1. A dot is as far off as anything gets.
export const nearness = (light) => (light.kind === 'dot' ? 0 : Math.max(0, Math.min(1, light.size)));

// --- Pitch ------------------------------------------------------------------------
export const ROWS = 10; // to the picture's side; the sky goes on above and below it
const FIVE = [0, 2, 4, 7, 9]; // C D E G A, in semitones from C
const NAMES = ['C', 'D', 'E', 'G', 'A'];
const MIDDLE_C = 261.63;
const [LOWEST, HIGHEST] = [-6, 15]; // steps of the five from middle C: A2 up to C7
export const rowOf = (y) => Math.floor(y * ROWS);
// The top row of the picture is A5, and each row down is the next of the five down.
const stepOf = (row) => Math.max(LOWEST, Math.min(HIGHEST, 9 - row));
const octaveOf = (step) => Math.floor(step / 5);
export const noteOf = (row) => stepOf(row) - octaveOf(stepOf(row)) * 5; // which of the five: 0 is C
export const pitchOf = (row) => MIDDLE_C * 2 ** ((FIVE[noteOf(row)] + 12 * octaveOf(stepOf(row))) / 12);
export const nameOf = (row) => `${NAMES[noteOf(row)]}${4 + octaveOf(stepOf(row))}`;
// What a light sounds at. A dot is short and bright: an octave over its row.
export const soundOf = (light) => pitchOf(light.row) * (light.kind === 'dot' ? 2 : 1);

// --- The hand ----------------------------------------------------------------------
// One thing decides what a hand leaves: how fast it is going.
export const TAP_MS = 280; // let go within this, and it was a tap: a dot
export const FULL_MS = 5200; // held this long, a star is as big as they come
const EASING_MS = 2200; // it grows quickly at first, and more slowly the bigger it gets
const eased = (ms) => 1 - Math.exp(-(ms - TAP_MS) / EASING_MS);
// The size of a star that has been held for `ms`. Nothing, for a tap.
export function grown(ms) {
  if (ms < TAP_MS) return null;
  return Math.min(1, eased(ms) / eased(FULL_MS));
}
// How long a star of this size takes to grow: grown() the other way round.
export const heldFor = (size) => TAP_MS - EASING_MS * Math.log(1 - Math.min(1, size) * eased(FULL_MS));

export const FAST = 0.9; // pixels a millisecond: at this and over nothing stays (as in scene two: penny/slow.js)
export const slowness = (speed) => Math.max(0, Math.min(1, 1 - speed / FAST)); // 1: hardly moving. 0: a rush
// A finger moving slowly sows small stars as it goes: the slower, the bigger.
// One moving fast sows nothing.
export function sown(slow) {
  if (slow < 0.18) return null;
  return slow * slow * 0.4;
}

// --- Time ---------------------------------------------------------------------------
// Everything keeps to one slow grid, so that lights made at any moment still
// fall in with one another, and the echo falls in with them.
export const STEP = 0.4; // seconds
export const TURN = 56; // steps to one turn of the sky
export const ECHO = 2; // steps behind
// When, in a turn, each light of the picture sounds: as far apart in time as
// they are from left to right.
export const PHRASE = [2, 4, 8, 12, 15];
// How the picture is read on one turn: [{ index, step, level }]. Mostly as it
// is written. Sometimes a dot keeps quiet, or the upper one says itself
// twice, or the big star takes its time. No two turns need be alike.
export function reading(chance) {
  const notes = PHRASE.map((step, index) => ({ index, step, level: 1 }));
  if (chance < 0.45) return notes;
  if (chance < 0.58) notes.splice(1, 1);
  else if (chance < 0.71) notes.splice(3, 1);
  else if (chance < 0.84) notes.splice(4, 0, { index: 3, step: PHRASE[3] + 1.5, level: 0.5 });
  else notes[notes.length - 1].step += 1;
  return notes;
}

// How many steps a light a hand has made takes to come round again. All odd,
// and a turn of the sky is even, so nothing made by hand ever locks to the
// picture: it drifts against it.
export function period(light) {
  if (light.kind === 'dot') return light.row % 2 === 0 ? 11 : 13;
  return 15 + Math.round(nearness(light) * 13) * 2;
}
// How much of its level a light keeps each time it comes round.
export const keeps = (light) => (light.kind === 'dot' ? 0.45 : 0.74 + 0.2 * nearness(light) ** 0.6);
export const OUT = 0.14; // under this it has gone out
// How many times it sounds, the first included, before it goes out.
export const soundings = (light) => Math.ceil(Math.log(OUT) / Math.log(keeps(light)));

// The night under it: the game's four chords, one to a turn, held very low.
// The lights' notes never change; what is under them does, and that is all
// that turns the same phrase from glad to sad and back. `under` is the notes
// held, [pitch, share]; `air` the colour low in the sky while they are.
// Each is a root, the same again higher, and one note more, and none of them
// has its third: whether a chord is glad or sad is left to the lights. They
// are held as triangle waves, whose first overtone is a twelfth up, and for
// every note here that overtone is one of the five the lights are on.
export const NIGHT = [
  { name: 'C', under: [[130.81, 1], [196.0, 0.8], [261.63, 0.55]], air: [34, 40, 82] },
  { name: 'A minor', under: [[110.0, 1], [220.0, 0.8], [261.63, 0.5]], air: [16, 44, 70] },
  { name: 'F', under: [[87.31, 0.8], [174.61, 1], [261.63, 0.5]], air: [54, 32, 86] },
  { name: 'G', under: [[98.0, 0.8], [196.0, 1], [293.66, 0.55]], air: [74, 38, 64] },
];

// --- Where the picture goes in a window -------------------------------------
// As a square: all of it where the window is wider than it is tall, and on a
// tall phone a little wider than the window, since the picture has room to
// spare at its sides. Its bottom left corner is empty: that is where Penny
// stands.
export function frame(width, height) {
  const side = Math.min(width * 1.2, height);
  return { side, x: (width - side) / 2, y: (height - side) * 0.42 };
}
export const PENNY_AT = 0.24; // how far across the window Penny stands
