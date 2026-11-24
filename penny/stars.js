// The night's rules. No page here and no sound, only data and arithmetic, so
// the tests can run it. The screen is penny/sky.js and what it sounds like is
// penny/chimes.js.
//
// The night is a picture come to life: five lights on black. Three are stars
// with four points, in a line that falls from the top left, each bigger than
// the last; two are small and round, one either side of the line. Everything
// below is read off that picture, and nothing is added to it. What makes it a
// living thing and not a picture is in how the five are drawn, never in
// anything drawn beside them.
//
//   Where a light is, up and down, is its pitch: higher is higher, on the five
//   notes the rest of the app keeps to. That makes the three stars E, C and E
//   again an octave down, the same notes whatever is under them: bright over
//   C and sad over A minor. Nothing here settles which.
//
//   How big a light is, is how near. What is near is loud, full and long, and
//   keeps almost still, as a planet does. What is far is quiet, dull and
//   mostly echo, and it is the far ones that twinkle most, as stars do.
//
//   None of them keeps still. Each wanders a little from its place the way a
//   speck in water does, pulled back the further it strays, so that it is
//   always near where the picture has it and never quite there.

// --- The picture -------------------------------------------------------------------
export const SKY = '#09090d'; // both measured off it
export const LIGHT = '#dedede';
// The night's own light is the picture's, warmed a little: the black is left
// as it is, and against it the lights are the colour of a lamp seen a long
// way off, not of a screen. (Red, green, blue.) Their glow is warmer than
// they are; and a light that a finger has warmed turns towards an ember.
export const WARM = [238, 224, 204];
export const HALO = [255, 212, 166];
export const EMBER = [255, 194, 138];

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

// How near a light is, 0 to 1, from its size: the big star is as near as
// anything gets, the middle one half way, and a dot is as far off as can be.
const FARTHEST = 28 / SIDE; // a star this small would be as far as a dot
const NEAREST = 136 / SIDE;
export const nearness = (light) => (light.kind === 'dot' ? 0 : Math.max(0, Math.min(1, (light.a - FARTHEST) / (NEAREST - FARTHEST))));

// --- Pitch ------------------------------------------------------------------------
export const ROWS = 10; // to the picture's side
const FIVE = [0, 2, 4, 7, 9]; // C D E G A, in semitones from C
const NAMES = ['C', 'D', 'E', 'G', 'A'];
const MIDDLE_C = 261.63;
export const rowOf = (y) => Math.floor(y * ROWS);
// The top row of the picture is A5, and each row down is the next of the five down.
const stepOf = (row) => 9 - Math.max(0, Math.min(ROWS - 1, row));
const octaveOf = (step) => Math.floor(step / 5);
export const pitchOf = (row) => MIDDLE_C * 2 ** ((FIVE[stepOf(row) - octaveOf(stepOf(row)) * 5] + 12 * octaveOf(stepOf(row))) / 12);
export const nameOf = (row) => `${NAMES[stepOf(row) - octaveOf(stepOf(row)) * 5]}${4 + octaveOf(stepOf(row))}`;
// What a light sounds at. A dot is short and bright: an octave over its row.
export const soundOf = (light) => pitchOf(rowOf(light.y)) * (light.kind === 'dot' ? 2 : 1);

// --- Time ---------------------------------------------------------------------------
// Everything keeps to one slow grid, and the echo falls in with it.
export const STEP = 0.4; // seconds
export const TURN = 56; // steps to one turn of the night
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

// The night under it: the game's four chords, one to a turn, held very low.
// The lights' notes never change; what is under them does, and that is all
// that turns the same phrase from glad to sad and back. `under` is the notes
// held, [pitch, share]. Each is a root, the same again higher, and one note
// more, and none of them has its third: whether a chord is glad or sad is
// left to the lights. They are held as triangle waves, whose first overtone is
// a twelfth up, and for every note here that overtone is one of the five the
// lights are on.
export const NIGHT = [
  { name: 'C', under: [[130.81, 1], [196.0, 0.8], [261.63, 0.55]] },
  { name: 'A minor', under: [[110.0, 1], [220.0, 0.8], [261.63, 0.5]] },
  { name: 'F', under: [[87.31, 0.8], [174.61, 1], [261.63, 0.5]] },
  { name: 'G', under: [[98.0, 0.8], [196.0, 1], [293.66, 0.55]] },
];

// --- How it is alive -----------------------------------------------------------------
// The picture's lights are a pale grey, nearly white. The night's are far
// dimmer: something to look at in the dark for a long time. A light is drawn
// as itself, faintly, and as a handful of fainter copies of itself laid over
// it, each a little out of place. Where they all lie on one another they add
// up to its brightness at rest; where they do not, at its edges and along its
// points, it is soft and never still. When it twinkles the copies fall into
// place for a moment, and it is sharp, and brighter.
export const REST = 0.4; // how bright a light is at rest, where 1 would be the picture's own
export const GLINT = 0.62; // and at the top of a twinkle
export const MOST = 0.66; // and the most it ever is, flicker, twinkle and a finger's warmth together: always short of the picture
export const GHOSTS = 6; // how many copies
export const CORE = 0.19; // how much of its brightness at rest is the light itself; the rest is its copies

function bell(chance) { // a number that is near nought more often than not
  return Math.sqrt(-2 * Math.log(1 - chance())) * Math.cos(2 * Math.PI * chance());
}
// A step of a wandering that is pulled back the further it goes: what a
// speck in water does, on a spring. `at` is [how far it has got from its
// place, how fast it is going]; `seconds` how long has passed; `spread` how
// far it is found from its place on the whole; `pace` how many times a second
// it would swing to and fro if nothing jostled it. It is jostled all the
// time, at random, and what comes of that is a path with no corners in it
// that never repeats. `chance` gives numbers from 0 to 1. However long or
// short the steps it is taken in, it is found as far from its place on the
// whole.
const DAMPED = 0.7; // how soon a swing dies down: this much, and it barely overshoots
export function sway([at, speed], seconds, { spread, pace }, chance = Math.random) {
  const pull = 2 * Math.PI * pace;
  const jostle = spread * Math.sqrt(4 * DAMPED * pull ** 3);
  // (in small steps, or a long gap between frames would throw it)
  for (let left = seconds; left > 1e-9; left -= 1 / 120) {
    const step = Math.min(left, 1 / 120);
    speed += (-2 * DAMPED * pull * speed - pull * pull * at) * step + jostle * Math.sqrt(step) * bell(chance);
    at += speed * step;
  }
  return [at, speed];
}
// A step of a wandering that nothing pulls back and nothing smooths: a mote
// set loose, knocked about. `loose` is how far it gets, on the whole, in one
// second.
export const roam = (at, seconds, loose, chance = Math.random) => at + loose * Math.sqrt(seconds) * bell(chance);

// The whole picture is afloat, as whoever is looking at it drifts: more
// slowly than any light wanders by itself, and by no more. What is near goes
// by faster than what is far, which is what makes it deep.
export const afloat = { spread: 0.004, pace: 0.05 };
// How a light wanders from its place, in units of the picture's side: the
// far ones further than the near, and all of them further when stirred.
// `heat` is how stirred it is, 0 to 1: a finger near it warms it.
export const drift = (light, heat = 0) => ({ spread: (0.004 + 0.005 * (1 - nearness(light))) * (1 + 1.4 * heat), pace: 0.09 });
// And how its copies wander from it: more quickly, the far ones more, and
// never by so much that a small light is lost among its own copies.
export const shimmer = (light, heat = 0) => ({
  spread: Math.min(0.0016 + 0.0026 * (1 - nearness(light)), 0.2 * (light.kind === 'dot' ? light.r : light.a)) * (1 + 1.2 * heat),
  pace: 0.8,
});
// How much its brightness comes and goes, as a share of itself, and how quickly.
export const flicker = (light) => ({ spread: 0.07 + 0.2 * (1 - nearness(light)), pace: 1.2 });
// How many seconds, on the whole, between one of its twinkles and the next,
// left to itself: the far ones oftener. Warmed, far sooner.
export const often = (light, heat = 0) => (24 + 22 * nearness(light)) / (1 + 6 * heat);

// --- Where the picture goes in a window -------------------------------------
// As a square: all of it where the window is wider than it is tall, and on a
// tall phone a little wider than the window, since the picture has room to
// spare at its sides.
export function frame(width, height) {
  const side = Math.min(width * 1.2, height);
  return { side, x: (width - side) / 2, y: (height - side) * 0.42 };
}
