// A sound of your own, recorded from the microphone and played in place of an
// instrument. This is what is done to a recording before it is one: the
// silence round it cut away, its loudness evened, and its note found if it
// has one, so that a hum or a whistle or a struck glass plays in tune with the
// chords. And how fast it is played for each row of the board. Nothing here
// makes a sound or hears one, so it runs anywhere (jam/mic.js does the hearing).

import { pitch } from './form.js';
import { ROWS } from './beat.js';

export const MOST_HEARD = 3; // seconds listened for, at most
export const MOST_KEPT = 1.5; // seconds of it kept, at most
const QUIET = 0.012; // a recording that never rises over this had nothing in it

// What is kept of a recording: { rate, pcm, hz }. pcm is what was heard (a
// Float32Array, one channel, at `rate` a second) from where the sound begins
// to where it has died away, as loud as it will go, with its ends faded so it
// does not click. hz is its note, or null if it has none. Null if nothing was heard.
export function prepare(heard, rate) {
  let peak = 0;
  for (let i = 0; i < heard.length; i++) peak = Math.max(peak, Math.abs(heard[i]));
  if (!(peak >= QUIET)) return null;
  const over = peak * 0.12;
  let first = 0;
  while (Math.abs(heard[first]) < over) first += 1;
  let last = heard.length - 1;
  while (Math.abs(heard[last]) < over * 0.5) last -= 1;
  const from = Math.max(0, first - Math.round(rate * 0.008)); // (a breath before it, so its start is not bitten off)
  const to = Math.min(heard.length, last + Math.round(rate * 0.09), from + Math.round(rate * MOST_KEPT));
  const pcm = Float32Array.from(heard.subarray(from, to));
  const [fadeIn, fadeOut] = [Math.min(pcm.length, Math.round(rate * 0.003)), Math.min(pcm.length, Math.round(rate * 0.04))];
  for (let i = 0; i < pcm.length; i++) pcm[i] *= 0.9 / peak;
  for (let i = 0; i < fadeIn; i++) pcm[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) pcm[pcm.length - 1 - i] *= i / fadeOut;
  return { rate, pcm, hz: noteOf(pcm, rate) };
}

// The note of a sound, in hertz, or null if it has none that is clear (a
// clap, a word, a door). It is listened to in three places, and has a note
// only if two of them agree: how like itself the sound is when laid over
// itself a little later, for every "little later" from a high note's worth to
// a low one's (McLeod's way of doing it).
export function noteOf(pcm, rate) {
  const size = Math.min(2048, Math.floor(pcm.length / 2));
  const [least, most] = [Math.floor(rate / 1000), Math.floor(rate / 70)]; // from 1000 hertz down to 70
  if (size < most * 2) return null;
  const found = [];
  for (const part of [0.2, 0.4, 0.6]) {
    const hz = noteAt(pcm, Math.floor((pcm.length - size - most) * part), size, least, most, rate);
    if (hz) found.push(hz);
  }
  found.sort((a, b) => a - b);
  for (let i = 1; i < found.length; i++) {
    if (found[i] / found[i - 1] < 1.04) return Math.sqrt(found[i] * found[i - 1]); // within two thirds of a semitone
  }
  return null;
}

function noteAt(pcm, start, size, least, most, rate) {
  const like = new Float32Array(most + 1);
  let best = 0;
  for (let lag = least; lag <= most; lag++) {
    let [both, each] = [0, 0];
    for (let i = start; i < start + size; i++) {
      both += pcm[i] * pcm[i + lag];
      each += pcm[i] * pcm[i] + pcm[i + lag] * pcm[i + lag];
    }
    like[lag] = each > 0 ? (2 * both) / each : 0;
    best = Math.max(best, like[lag]);
  }
  if (best < 0.8) return null; // never much like itself: a noise
  // the first "later" at which it is nearly as like itself as it ever is: one turn of its note
  for (let lag = least + 1; lag < most; lag++) {
    if (like[lag] >= best * 0.93 && like[lag] >= like[lag - 1] && like[lag] > like[lag + 1]) {
      const [a, b, c] = [like[lag - 1], like[lag], like[lag + 1]];
      const bend = a - 2 * b + c;
      return rate / (lag + (bend ? (0.5 * (a - c)) / bend : 0)); // (between two counts, where the top really is)
    }
  }
  return null;
}

// How fast a recorded sound is played (1 is as it was heard) for a row of the
// board, in a chord, in place of the instrument `kind` (one of jam/engine.js's).
//   An instrument with notes: the row's own pitch, as that instrument would
//   play it. A sound with a note of its own is played in tune, in whichever
//   octave leaves it nearest to how it was heard; one without is moved by as
//   much, from the middle of the board.
//   The drums: the rows are seven heights of the sound, the lowest at the
//   bottom where the kick was, and the chords leave them alone.
export function speed(kind, hz, chord, row) {
  if (!kind.base) return 2 ** (((ROWS - 1) / 2 - row) / 4);
  const middle = kind.base * 2 ** (4 / 12);
  const from = hz ? hz * 2 ** Math.round(Math.log2(middle / hz)) : middle;
  return pitch(kind.base, chord, row) / from;
}

// A sound as it is sent to the server and comes back from it: its samples as
// whole numbers of sixteen bits, low byte first, written in base64.
export function pack(pcm) {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
// (null if it is not one)
export function unpack(text) {
  let raw;
  try {
    raw = atob(text);
  } catch {
    return null;
  }
  if (raw.length < 2 || raw.length % 2) return null;
  const pcm = new Float32Array(raw.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (((raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)) << 16) >> 16) / 32767;
  return pcm;
}
