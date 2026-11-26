import test from 'node:test';
import assert from 'node:assert/strict';
import { MOST_KEPT, noteOf, pack, prepare, speed, unpack } from '../jam/sample.js';
import { CHORDS, pitch } from '../jam/form.js';
import { ROWS } from '../jam/beat.js';

const RATE = 44100;
// A second of silence, then `seconds` of a sound, then silence again.
const heard = (seconds, at) => {
  const all = new Float32Array(RATE * 3);
  for (let i = 0; i < seconds * RATE; i++) all[RATE + i] = at(i / RATE);
  return all;
};
// a voice humming a note: the note itself, and two more above it
const hum = (hz) => (t) => 0.2 * (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t) + 0.25 * Math.sin(6 * Math.PI * hz * t));
let seed = 3;
const hiss = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.4; };

test('a recording is cut to its sound, made as loud as it will go, and does not click', () => {
  const made = prepare(heard(0.5, hum(220)), RATE);
  assert.ok(Math.abs(made.pcm.length / RATE - 0.5) < 0.12, `half a second of sound, and ${made.pcm.length / RATE} kept`);
  const peak = made.pcm.reduce((most, x) => Math.max(most, Math.abs(x)), 0);
  assert.ok(peak > 0.8 && peak <= 0.9001, `as loud as it will go: ${peak}`);
  assert.equal(made.pcm[0], 0);
  assert.equal(made.pcm.at(-1), 0);
  assert.equal(made.rate, RATE);
});

test('no more of it is kept than the most there may be', () => {
  assert.ok(prepare(heard(1.9, hum(220)), RATE).pcm.length <= MOST_KEPT * RATE);
});

test('silence, or next to it, is nothing heard', () => {
  assert.equal(prepare(new Float32Array(RATE), RATE), null);
  assert.equal(prepare(heard(0.5, () => 0.004), RATE), null);
  assert.equal(prepare(new Float32Array(0), RATE), null);
});

test('a hum has a note, found to within a few cents; a noise has none', () => {
  for (const hz of [98, 147, 220, 330, 523, 880]) {
    const found = prepare(heard(0.6, hum(hz)), RATE).hz;
    assert.ok(found && Math.abs(1200 * Math.log2(found / hz)) < 8, `${hz} hertz, heard as ${found}`);
  }
  assert.equal(prepare(heard(0.6, hiss), RATE).hz, null);
  assert.equal(noteOf(new Float32Array(200), RATE), null, 'too short to tell');
});

test('a sound with a note is played in tune, never far from how it was heard', () => {
  const [bells, bass] = [{ base: 523.25 }, { base: 130.81 }];
  for (const kind of [bells, bass]) {
    for (const hz of [110, 196, 440, 700]) {
      for (const chord of CHORDS) {
        for (let row = 0; row < ROWS; row++) {
          const rate = speed(kind, hz, chord, row);
          const octaves = Math.log2((hz * rate) / pitch(kind.base, chord, row));
          assert.ok(Math.abs(octaves - Math.round(octaves)) < 1e-9, 'the row\'s note, in some octave');
          assert.ok(rate > 0.3 && rate < 3.2, `played at ${rate} of its speed`);
        }
      }
    }
  }
});

test('a sound without one is moved as the instrument would be, and on the drums the rows are seven heights of it', () => {
  const keys = { base: 261.63 };
  assert.ok(speed(keys, null, CHORDS[0], 0) > speed(keys, null, CHORDS[0], ROWS - 1), 'higher at the top');
  assert.ok(Math.abs(speed(keys, null, CHORDS[0], 0) / speed(keys, null, CHORDS[0], 5) - 2) < 1e-9, 'five rows up is an octave');
  const drums = {};
  const speeds = Array.from({ length: ROWS }, (_, row) => speed(drums, 300, CHORDS[2], row));
  assert.equal(speeds[3], 1, 'the middle row is the sound as it was heard');
  for (let row = 1; row < ROWS; row++) assert.ok(speeds[row] < speeds[row - 1]);
  assert.deepEqual(speeds, Array.from({ length: ROWS }, (_, row) => speed(drums, null, CHORDS[0], row)), 'whatever the chord or the note');
});

test('a sound goes to the server and comes back the same, to within a sixteen-bit number', () => {
  const made = prepare(heard(1.9, hum(220)), RATE);
  const text = pack(made.pcm);
  assert.match(text, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(text.length < 200000, `${text.length} letters`);
  const back = unpack(text);
  assert.equal(back.length, made.pcm.length);
  for (let i = 0; i < back.length; i += 97) assert.ok(Math.abs(back[i] - made.pcm[i]) < 1 / 32000);
  assert.deepEqual([...unpack(pack(Float32Array.of(-1, 0, 1, 2)))], [-1, 0, 1, 1], 'nothing louder than as loud as it goes');
  assert.equal(unpack('not a sound!'), null);
  assert.equal(unpack(btoa('abc')), null, 'half a number');
});
