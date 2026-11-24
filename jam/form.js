// The long form of a loop: loops within loops within loops.
//
// A loop is one bar, eight steps. Played round and round as it stands it is
// pleasant for a quarter of a minute and then it is a thing stuck: the same
// tune, the same kick in the same place, for ever. So when a loop is listened
// to (on Penny's Radio) it is not played as it stands. It is the material of
// a piece that never quite comes round again, built the way music is: a small
// loop inside a longer one inside a longer one, each changing something the
// one inside it left alone.
//
// Which bar is being played, counted from the start and written in fours,
// says where it is in every one of those loops at once:
//
//   the BAR in its PHRASE (4 bars). The chord, as always. And the tune goes
//     A, A', A, B: said, answered (its second half reaching a step higher),
//     said again, and turned round (its second half backwards) to lead back.
//   the PHRASE in its SECTION (16 bars). How hard it is played. Stated; then
//     lighter (half the hats, the kick only on the one, the keys quieter);
//     then the keys answering half a bar late; then a build, a little louder,
//     with a fill on the drums to end it.
//   the SECTION in its MOVEMENT (64 bars). The order of the four chords, which
//     is different in each; a section with the bass only on the beats; and one
//     that opens with a phrase of rest: no kick, no snare, no bass, the chord
//     held under what is left.
//   the MOVEMENT in its PIECE (256 bars), and the piece in whatever is longer,
//     and that in whatever is longer still, without end: the key. Each of
//     these loops moves the whole thing up or down by a few notes and brings
//     it home again.
//
// At 100 beats a minute a phrase is ten seconds, a section forty, a movement
// two and a half minutes, a piece ten, and what it is inside, forty; and so on.
//
// Nothing here is chance. The same loop at the same bar is always the same,
// and the rules are the same for every loop: so two stations side by side are
// at the same place in the same form, and neither is flattered by it. What a
// loop is (its notes, its tempo, how busy each instrument is) is still there to
// be heard at every point; the tune is as written in more than half its bars.

import { ROWS, STEPS } from './beat.js';

// The chords, as the game's music has them, and the five-note scale that
// goes with each (semitones from its root). `root` is semitones from C.
const MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 3, 5, 7, 10];
export const CHORDS = [
  { name: 'C', root: 0, scale: MAJOR, triad: [0, 4, 7] },
  { name: 'A minor', root: -3, scale: MINOR, triad: [0, 3, 7] },
  { name: 'F', root: -7, scale: MAJOR, triad: [0, 4, 7] },
  { name: 'G', root: -5, scale: MAJOR, triad: [0, 4, 7] },
];
export const up = (hz, semitones) => hz * 2 ** (semitones / 12);
// The pitch of a row in a chord: the bottom row is the chord's root, and the
// rows go up its scale from there, into the next octave.
export function pitch(base, chord, row) {
  const place = ROWS - 1 - row;
  return up(base, chord.root + chord.scale[place % 5] + 12 * Math.floor(place / 5));
}

// The order of the four chords, a different one for each section of a movement.
export const PROGRESSIONS = [[0, 1, 2, 3], [1, 2, 0, 3], [2, 3, 1, 0], [0, 3, 1, 2]];
// How far each of the longest loops moves the key, by where it is in the loop
// above it (semitones; the first of every loop is home).
const LIFTS = [0, 2, -3, 5];
// which instrument is which, and the rows of the drums
const [BELLS, KEYS, BASS, DRUMS] = [0, 1, 2, 3];
const [SNARE, TOM, KICK] = [4, 5, 6];
const isHat = (row) => row <= 2;

// Where a bar is in every loop it is part of: [in its phrase, its phrase in
// the section, the section in the movement, the movement in the piece, ...],
// each 0 to 3. There are always at least four, and as many more as the bar needs.
export function where(bar) {
  const places = [];
  let left = Math.max(0, Math.floor(bar));
  while (places.length < 4 || left > 0) {
    places.push(left % 4);
    left = Math.floor(left / 4);
  }
  return places;
}

const pairs = (set) => [...set].map((tile) => [Math.floor(tile / ROWS), tile % ROWS]);
const tiles = (list) => new Set(list.map(([step, row]) => step * ROWS + row));

// A loop at one bar of its long form.
//   sets: for each instrument, the tiles that hold a note (as the loop is written)
// Gives what is to be played in that bar:
//   chord: which of CHORDS;  key: semitones the whole thing is moved by
//   sets: the tiles to play, for each instrument
//   level: how hard each instrument is played (1 is as written)
//   pad: how loud the chord held under the bar is (1 is as usual)
export function arrange(sets, bar) {
  const [inPhrase, phrase, section, ...longer] = where(bar);
  const rest = section === 2 && phrase === 0; // the phrase of rest that opens the third section
  const level = [1, 1, 1, 1];
  let [bells, keys, bass, drums] = sets.map(pairs);

  // the bar in its phrase: A, A', A, B
  if (inPhrase === 1) bells = bells.map(([step, row]) => (step >= STEPS / 2 ? [step, Math.max(0, row - 1)] : [step, row]));
  if (inPhrase === 3) bells = bells.map(([step, row]) => (step >= STEPS / 2 ? [STEPS + STEPS / 2 - 1 - step, row] : [step, row]));
  const swell = 0.92 + 0.08 * (inPhrase / 3); // and a little more with each bar of it
  level[BELLS] *= swell;
  level[KEYS] *= swell;
  level[BASS] *= swell;

  // the phrase in its section
  if (phrase === 1) { // lighter
    drums = drums.filter(([step, row]) => (isHat(row) ? step % 2 === 0 : row === KICK ? step === 0 : true));
    level[DRUMS] *= 0.85;
    level[KEYS] *= 0.7;
  } else if (phrase === 2) { // the keys answer, half a bar late
    keys = keys.map(([step, row]) => [(step + STEPS / 2) % STEPS, row]);
  } else if (phrase === 3) { // a build, and a fill to end it
    for (const index of [BELLS, KEYS, BASS, DRUMS]) level[index] *= 1.06;
    if (inPhrase === 3 && drums.length) drums = [...drums, [5, TOM], [6, SNARE], [7, SNARE]];
  }

  // the section in its movement
  if (section === 1 && bass.length) { // the bass only on the beats
    const onBeats = bass.filter(([step]) => step % 4 === 0);
    bass = onBeats.length ? onBeats : [bass.reduce((first, note) => (note[0] < first[0] ? note : first))];
  }
  if (rest) {
    drums = drums.filter(([, row]) => isHat(row));
    level[DRUMS] *= 0.8;
    bass = [];
  }

  // the movement in its piece, and every loop longer than that: the key
  let key = 0;
  longer.forEach((place, depth) => { key += LIFTS[place] * (depth % 2 ? -1 : 1); });
  key = ((((key + 5) % 12) + 12) % 12) - 5; // kept within half an octave of home, either way

  return {
    chord: PROGRESSIONS[section][inPhrase],
    key,
    sets: [bells, keys, bass, drums].map(tiles),
    level: level.map((value) => Math.round(Math.min(1.15, value) * 1000) / 1000),
    pad: rest ? 1.5 : 1,
  };
}

// The loop as it is written, at a bar: nothing changed but the chord, which
// goes round the first four in order. (What the music maker plays.)
export const plain = (sets, bar) => ({ chord: ((Math.floor(bar) % 4) + 4) % 4, key: 0, sets, level: [1, 1, 1, 1], pad: 1 });
