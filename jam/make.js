// Beats made up: one instrument's part, as the dice make one; a whole beat;
// and a beat that is another one changed a little. Nothing here makes a
// sound, so it runs anywhere (the tests make thousands).

import { LAYER_COUNT, ROWS, STEPS, TEMPO_COUNT } from './beat.js';

const keyOf = (step, row) => step * ROWS + row;
// which instrument is which (jam/engine.js has them in this order)
const BASS = 2;
const DRUMS = 3;

// One instrument's part, likely to sound good: the tiles that hold a note.
export function randomLayer(index, random = Math.random) {
  const set = new Set();
  if (index === DRUMS) {
    for (const step of [0, 4]) set.add(keyOf(step, 6));
    if (random() < 0.6) set.add(keyOf(random() < 0.5 ? 3 : 7, 6));
    for (const step of [2, 6]) set.add(keyOf(step, random() < 0.6 ? 4 : 3));
    for (let step = 0; step < STEPS; step++) if (random() < 0.7) set.add(keyOf(step, 2));
  } else if (index === BASS) {
    // mostly the root, on the beats, with a step away from it now and then
    for (let step = 0; step < STEPS; step++) {
      const chance = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.45 : 0.15;
      if (random() < chance) set.add(keyOf(step, step % 4 === 0 || random() < 0.5 ? ROWS - 1 : ROWS - 1 - (random() < 0.5 ? 3 : 2)));
    }
  } else {
    // a tune as the game's music makes one: likelier on the beats, moving
    // by small steps, and leaving rests
    let row = 2 + Math.floor(random() * 3);
    for (let step = 0; step < STEPS; step++) {
      const chance = step % 4 === 0 ? 0.9 : step % 2 === 0 ? 0.55 : 0.28;
      if (random() > chance) continue;
      row = Math.max(0, Math.min(ROWS - 1, row + Math.floor(random() * 3) - 1));
      set.add(keyOf(step, row));
    }
  }
  return [...set];
}

// A whole beat: { tempo, notes }. Most have all four instruments; some leave one or two out.
export function randomBeat(random = Math.random) {
  const notes = [0, 1, 2, 3].map((index) => (random() < 0.82 ? randomLayer(index, random) : []));
  if (notes.every((tiles) => tiles.length === 0)) notes[0] = randomLayer(0, random);
  return { tempo: Math.floor(random() * TEMPO_COUNT), notes };
}

// A beat that is another one, changed a little: one instrument's part made
// afresh (or taken away, or put in), or the tempo moved a step.
export function mutate(beat, random = Math.random) {
  const notes = beat.notes.map((tiles) => [...tiles]);
  let { tempo } = beat;
  if (random() < 0.25) {
    tempo = Math.max(0, Math.min(TEMPO_COUNT - 1, tempo + (random() < 0.5 ? -1 : 1)));
    if (tempo === beat.tempo) tempo = beat.tempo === 0 ? 1 : beat.tempo - 1;
  } else {
    const index = Math.floor(random() * LAYER_COUNT);
    notes[index] = notes[index].length && random() < 0.2 ? [] : randomLayer(index, random);
    if (notes.every((tiles) => tiles.length === 0)) notes[index] = randomLayer(index, random);
  }
  return { tempo, notes };
}
