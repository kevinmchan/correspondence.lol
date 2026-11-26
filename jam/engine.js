// The music maker's instruments, and the loop that plays them.
//
// A beat is which tiles hold a note, for each of four instruments, and a
// tempo (jam/beat.js). This is what a beat sounds like: the instruments, the
// four chords the loop goes through, and the clockwork that writes each step
// onto the sound engine's clock a little ahead of time. The music maker
// (jam.js) plays the board through it, and the radio (taste.js) plays
// whichever of its two loops is showing.

import { audio, holdMusic, noise, tone } from '/postmarks/sound.js';
import { CHORDS, arrange, pitch, plain, up } from './form.js';
import { speed } from './sample.js';

export { CHORDS };

export const STEPS = 8;
export const ROWS = 7;
export const keyOf = (step, row) => step * ROWS + row;
export const TEMPOS = [84, 100, 120, 140]; // beats a minute; a step is half a beat

// Each layer: how it is named, drawn, and what one of its notes sounds like.
// play(row, at, bus, chord, hard): `at` is seconds from now on the engine's
// clock; `hard` is how hard the note is struck (about 1).
export const LAYERS = [
  {
    name: 'Bells', colour: '#f08a76', icon: '<path d="M12 4.5c-3 0-5 2.3-5 5.4v3.2l-1.6 2.6h13.2L17 13.1V9.9c0-3.1-2-5.4-5-5.4zM10 18.3a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    base: 523.25, tuned: true,
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 1.1, type: 'sine', gain: 0.15 * hard, attack: 0.004, into: bus }); // it rings on
      tone({ at, freq: freq * 2, dur: 0.4, type: 'sine', gain: 0.04 * hard, attack: 0.003, into: bus });
      tone({ at, freq: freq * 2.76, dur: 0.12, type: 'sine', gain: 0.02 * hard, attack: 0.002, into: bus }); // the strike
    },
  },
  {
    name: 'Keys', colour: '#f8d95a', icon: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 6v6.5M14.7 6v6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    base: 261.63, tuned: true,
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 0.75, type: 'triangle', gain: 0.15 * hard, attack: 0.01, into: bus });
      tone({ at, freq: freq * 1.004, dur: 0.7, type: 'sine', gain: 0.08 * hard, attack: 0.01, into: bus }); // a second string, a shade sharp
      tone({ at, freq: freq * 0.996, dur: 0.7, type: 'sine', gain: 0.05 * hard, attack: 0.012, into: bus }); // and a third, a shade flat
    },
  },
  {
    name: 'Bass', colour: '#736dd0', icon: '<path d="M4 14c2.2 0 2.2-4 4.4-4s2.2 4 4.4 4 2.2-4 4.4-4 1.6 2 2.8 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    base: 130.81, tuned: false, // (kept dry: an echo on a low note is mud)
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 0.5, type: 'triangle', gain: 0.26 * hard, attack: 0.008, into: bus });
      tone({ at, freq: freq / 2, dur: 0.4, type: 'sine', gain: 0.14 * hard, attack: 0.01, into: bus });
      tone({ at, freq: freq * 2, dur: 0.14, type: 'sine', gain: 0.05 * hard, attack: 0.004, into: bus });
    },
  },
  {
    name: 'Drums', colour: '#2aa198', icon: '<ellipse cx="12" cy="9" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 9v6c0 1.7 3.1 3 7 3s7-1.3 7-3V9" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    notes: ['Shaker', 'Open hat', 'Hat', 'Clap', 'Snare', 'Tom', 'Kick'], tuned: false,
    play(row, at, bus, chord, hard = 1) {
      if (row === 0) noise({ at, dur: 0.07, from: 7000, q: 3, gain: 0.07 * hard, into: bus });
      else if (row === 1) noise({ at, dur: 0.26, from: 8000, to: 6000, q: 1.2, gain: 0.09 * hard, into: bus });
      else if (row === 2) noise({ at, dur: 0.045, from: 9000, q: 2, gain: 0.09 * hard, into: bus });
      else if (row === 3) {
        for (const d of [0, 0.012, 0.026]) noise({ at: at + d, dur: 0.07, from: 1500, q: 1.4, gain: 0.14 * hard, into: bus });
      } else if (row === 4) {
        noise({ at, dur: 0.15, from: 2200, to: 1400, q: 0.8, gain: 0.2 * hard, into: bus });
        tone({ at, freq: 210, to: 150, dur: 0.1, type: 'triangle', gain: 0.12 * hard, into: bus });
      } else if (row === 5) tone({ at, freq: 170, to: 95, dur: 0.24, type: 'sine', gain: 0.3 * hard, attack: 0.003, into: bus });
      else {
        tone({ at, freq: 150, to: 44, dur: 0.24, type: 'sine', gain: 0.42 * hard, attack: 0.002, into: bus });
        noise({ at, dur: 0.02, from: 3000, q: 0.7, gain: 0.06 * hard, into: bus });
      }
    },
  },
];

// The deck: the four instruments, and four places more that are no
// instrument's. Each of those plays a recorded sound, one of the four
// instruments, or nothing; has a colour of its own, and a part on the board
// like any instrument.
const MIC = '<rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
export const DECK = [...LAYERS, ...['#e79ac6', '#9bc873', '#74b4e6', '#d2a679'].map((colour) => ({ name: 'Sound', colour, icon: MIC, base: 261.63, tuned: true, extra: true, play() {} }))];

// --- The loop -----------------------------------------------------------------------
// read(): what should be sounding now, { tempo, sets, long, voices } (sets:
// for each instrument, the tiles that hold a note), or null for silence.
// `voices`, if given, is for each instrument what is played in its place: a
// sound recorded ({ rate, pcm, hz }: jam/sample.js), another of the four
// instruments ({ lent: one of LAYERS }), or null for its own. It is asked
// afresh for every step, so what is played can change under it at any time.
// `long` plays the loop in its long form (jam/form.js): otherwise it is played
// as it is written, round and round, through the four chords.
export function createLoop(life, read) {
  let bus = null; // this screen's own volume, so leaving can fade it out
  let room = null; // where the tuned instruments go: the same, with an echo behind them
  let echo = null;
  let nextStep = 0;
  let nextTime = 0;
  let bar = 0; // how many times round: which chord
  let chordHeard = 0;
  let tempoHeard = -1;
  let barHeard = 0;
  const queue = []; // steps written but not yet heard: [{ step, time, chord, bar }]
  // what is to be played in the bar being written: worked out once a bar, and again if what is playing changes under it
  let shaped = null;
  const shapeOf = (playing) => {
    if (!shaped || shaped.bar !== bar || shaped.from !== playing.sets || shaped.long !== Boolean(playing.long)) {
      shaped = { bar, from: playing.sets, long: Boolean(playing.long), shape: (playing.long ? arrange : plain)(playing.sets, bar) };
    }
    return shaped.shape;
  };
  const stepLength = (tempo) => 60 / TEMPOS[tempo] / 2;

  function engine() {
    const live = audio();
    if (!live) return null;
    if (!bus) {
      const { ctx } = live;
      bus = ctx.createGain();
      bus.gain.value = 0.7;
      bus.connect(live.mix);
      // the echo: a step and a half behind, each repeat duller and quieter than the last
      room = ctx.createGain();
      room.connect(bus);
      const send = ctx.createGain();
      send.gain.value = 0.3;
      echo = ctx.createDelay(1.5);
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 2400;
      const again = ctx.createGain();
      again.gain.value = 0.36;
      room.connect(send).connect(echo).connect(dull).connect(bus);
      dull.connect(again).connect(echo);
    }
    return live;
  }
  const into = (kind) => (kind.tuned ? room : bus);

  // One note of an instrument: its own, or the sound recorded to be played in its place.
  const ready = new WeakMap(); // a recorded sound, as the engine plays it
  function strike(index, row, at, chord, hard, voices) {
    const kind = DECK[index];
    const voice = voices?.[index];
    if (!voice) return kind.play(row, at, into(kind), chord, hard);
    if (voice.lent) return voice.lent.play(row, at, into(voice.lent), chord, hard); // (another instrument, as it sounds in its own place)
    const { ctx } = audio();
    let buffer = ready.get(voice);
    if (!buffer) {
      buffer = ctx.createBuffer(1, voice.pcm.length, voice.rate);
      buffer.getChannelData(0).set(voice.pcm);
      ready.set(voice, buffer);
    }
    const start = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed(kind, voice.hz, chord, row);
    const amp = ctx.createGain();
    amp.gain.value = 0.3 * hard;
    src.connect(amp).connect(kind.extra && !voice.hz ? bus : into(kind)); // (a sound with no note is kept dry, as the drums are)
    src.start(start);
  }

  life.setInterval(() => {
    const playing = read();
    const live = playing && engine();
    if (!live) {
      nextTime = 0;
      return;
    }
    const { tempo } = playing;
    const now = live.ctx.currentTime;
    if (nextTime < now) nextTime = now + 0.06; // starting, or back from being asleep
    const length = stepLength(tempo);
    if (tempo !== tempoHeard) { // the echo keeps time
      if (tempoHeard < 0) echo.delayTime.value = length * 1.5;
      else echo.delayTime.setTargetAtTime(length * 1.5, now, 0.05);
      tempoHeard = tempo;
    }
    while (nextTime < now + 0.14) {
      const shape = shapeOf(playing);
      const { sets } = shape;
      const chord = shape.key ? { ...CHORDS[shape.chord], root: CHORDS[shape.chord].root + shape.key } : CHORDS[shape.chord];
      // the off-steps come a hair late, and the beats are struck harder than what falls between
      const at = nextTime - now + (nextStep % 2 ? length * 0.1 : 0);
      const weight = nextStep % 4 === 0 ? 1 : nextStep % 2 === 0 ? 0.86 : 0.7;
      if (nextStep === 0 && playing.sets.some((set) => set.size > 0)) {
        // the chord itself, held under the whole bar: it swells in, and out again
        const whole = length * STEPS;
        for (const semitones of chord.triad) {
          tone({ at, freq: up(261.63, chord.root + semitones), dur: whole * 1.08, type: 'sine', gain: 0.04 * shape.pad, attack: whole * 0.35, into: room });
        }
      }
      for (let index = 0; index < sets.length; index++) {
        for (let row = 0; row < ROWS; row++) {
          if (sets[index].has(keyOf(nextStep, row))) strike(index, row, at, chord, weight * (shape.level[index] ?? 1) * (0.92 + Math.random() * 0.16), playing.voices);
        }
      }
      queue.push({ step: nextStep, time: nextTime, chord: shape.chord, bar });
      nextStep = (nextStep + 1) % STEPS;
      if (nextStep === 0) bar += 1;
      nextTime += length;
    }
  }, 30);

  // The app's background music stands aside while a loop's screen is up.
  holdMusic(true);
  life.onEnd(() => {
    holdMusic(false);
    const live = audio();
    if (bus && live) bus.gain.setTargetAtTime(0, live.ctx.currentTime, 0.08);
  });

  return {
    // Whether the sound engine is awake (it needs a first touch).
    get awake() { return Boolean(audio()); },
    // The step being heard this moment, its chord, and which bar it is in,
    // counted from the start: { step, chord, bar }. step is -1 in silence.
    heard() {
      const live = audio();
      let step = -1;
      if (read() && live) {
        while (queue.length > 1 && queue[1].time <= live.ctx.currentTime) queue.shift();
        if (queue.length && queue[0].time <= live.ctx.currentTime) {
          step = queue[0].step;
          chordHeard = queue[0].chord;
          barHeard = queue[0].bar;
        }
      }
      return { step, chord: chordHeard, bar: barHeard };
    },
    // One note now, by hand, in the chord being heard (`voices`: as read() gives them).
    tap(layerIndex, row, voices = null) {
      if (engine()) strike(layerIndex, row, 0, CHORDS[chordHeard], 1, voices);
    },
    // Back to the first step of the first chord.
    rewind() {
      nextStep = 0;
      nextTime = 0;
      bar = 0;
      chordHeard = 0;
      barHeard = 0;
      queue.length = 0;
    },
  };
}
