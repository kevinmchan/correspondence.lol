// What the night sounds like (penny/sky.js is the screen, penny/stars.js its
// rules). Made out of nothing but sine waves and air, as everything in the
// app is: there are no audio files.
//
// It takes the sound engine it is to play on and where to send what it makes,
// and asks for nothing else, so it can be rendered without a page or a
// speaker and looked at. Every `when` is a time on that engine's own clock.
//
// The sounds are the two columns of "How a place says it" (README):
//
//   A dot is short and bright: a tap on glass, an octave up, and over.
//   A star is long, and has come a long way. It is struck, and rings, and
//   the ringing comes back as an echo and hangs in the air after that. How
//   near it is decides the rest. What is near is loud and full, with a low
//   note under it, and comes straight. What is far is quiet and dull, and
//   most of what reaches you is echo and air.
//
// Under them the night holds one chord very low, for one turn, and then the
// next.

import { ECHO, STEP } from './stars.js';

const LEVEL = 0.9; // the whole sky, next to the rest of the app
const SWELL = 6; // seconds the night's chord takes to come in
const FADE = 7; // and to go, under the one that follows

// The air of a very large place: what a sound leaves hanging after it. A few
// seconds of hiss that dies away, duller the longer it has gone on. Made
// once for an engine and kept.
const airs = new WeakMap();
function airOf(ctx) {
  if (airs.has(ctx)) return airs.get(ctx);
  const seconds = 3.6;
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let side = 0; side < 2; side++) {
    const data = buffer.getChannelData(side);
    let held = 0;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const open = 0.05 + 0.5 * Math.exp(-t / 0.5); // how much of the hiss gets through: less and less
      held += open * (Math.random() * 2 - 1 - held);
      data[i] = held * Math.exp(-t / 0.62) * Math.min(1, t / 0.012);
    }
  }
  airs.set(ctx, buffer);
  return buffer;
}
// Very high partials are let through less: a bright note should glint, not sting.
const tame = (freq) => 1 / (1 + (freq / 3000) ** 2);

export function createChimes(ctx, out) {
  const bus = ctx.createGain(); // everything the sky sounds goes out through here
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.5);
  bus.connect(out);

  // the air: what hangs after a sound
  const air = ctx.createConvolver();
  air.buffer = airOf(ctx);
  const hang = ctx.createGain();
  hang.gain.value = 0.3;
  air.connect(hang).connect(bus);

  // the echo: two steps behind, each time duller and quieter than the last, and in the air as well
  const echo = ctx.createDelay(2);
  echo.delayTime.value = ECHO * STEP;
  const dull = ctx.createBiquadFilter();
  dull.type = 'lowpass';
  dull.frequency.value = 1600;
  const again = ctx.createGain();
  again.gain.value = 0.42;
  const far = ctx.createGain();
  far.gain.value = 0.5;
  echo.connect(dull);
  dull.connect(again).connect(echo);
  dull.connect(bus);
  dull.connect(far).connect(air);

  // the night's chord goes under everything, with the edge taken off it
  const under = ctx.createBiquadFilter();
  under.type = 'lowpass';
  under.frequency.value = 620;
  const underAir = ctx.createGain();
  underAir.gain.value = 0.5;
  under.connect(bus);
  under.connect(underAir).connect(air);
  const held = new Set(); // what is sounding of the night's chords, so it can be stopped

  // Where one sound goes: how far left or right it is, and how much of it
  // comes straight, how much as an echo, how much off the air. `veil` dulls
  // it first: what is far off has lost its edge on the way.
  function way(pan, { straight, echoed, aired, veil = 0 }) {
    const head = ctx.createGain();
    let from = head;
    if (veil) {
      const cloth = ctx.createBiquadFilter();
      cloth.type = 'lowpass';
      cloth.frequency.value = veil;
      from.connect(cloth);
      from = cloth;
    }
    const side = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (side) {
      side.pan.value = Math.max(-0.85, Math.min(0.85, pan));
      from.connect(side);
      from = side;
    }
    for (const [share, to] of [[straight, bus], [echoed, echo], [aired, air]]) {
      if (!share) continue;
      const send = ctx.createGain();
      send.gain.value = share;
      from.connect(send).connect(to);
    }
    return { head, side };
  }

  // One partial of something struck: it starts at once and dies away, and
  // `ring` is how many seconds until it is as good as gone.
  function struck(into, when, freq, level, attack, ring) {
    if (level < 0.0004 || freq > 12000) return;
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(level, when + attack);
    amp.gain.setTargetAtTime(0, when + attack, ring / 6.9);
    osc.connect(amp).connect(into);
    osc.start(when);
    osc.stop(when + attack + ring * 1.15);
  }

  let ended = false;
  return {
    ctx,

    // A star, struck. near: 0 (as far as a star gets) to 1. level: how hard.
    // pan: -1 left to 1 right.
    star(when, { freq, near = 0.5, level = 1, pan = 0 }) {
      if (ended) return;
      const loud = 0.15 * level * (0.6 + 0.4 * near);
      const ring = 1.8 + 5.2 * near;
      const soft = 0.005 + 0.012 * near; // what is near is struck with something softer
      const { head } = way(pan, { straight: 0.5 + 0.4 * near, echoed: 0.5 - 0.3 * near, aired: 0.75 - 0.35 * near, veil: 1500 + 7000 * near });
      struck(head, when, freq, loud, soft, ring);
      struck(head, when, freq * 1.0009, loud * 0.32, soft, ring); // a second string a shade sharp: the two beat slowly, and the note twinkles
      struck(head, when, freq * 2, loud * 0.36 * tame(freq * 2), soft, ring * 0.5);
      struck(head, when, freq * 3, loud * 0.12 * tame(freq * 3), soft, ring * 0.3);
      struck(head, when, freq * 2.76, loud * 0.06 * tame(freq * 2.76), 0.002, 0.25); // the strike itself, as the game's bells have it
      struck(head, when, freq * 4.16, loud * 0.05 * (0.3 + 0.7 * near) * tame(freq * 4.16), 0.003, ring * 0.1); // and its glint
      if (near > 0.3) struck(head, when, freq / 2, loud * 0.4 * ((near - 0.3) / 0.7), 0.03, ring); // what is near has a low note under it
    },

    // A dot: short and bright.
    dot(when, { freq, level = 1, pan = 0 }) {
      if (ended) return;
      const { head } = way(pan, { straight: 0.7, echoed: 0.4, aired: 0.5 });
      struck(head, when, freq, 0.11 * level * tame(freq * 0.6), 0.003, 0.55);
      struck(head, when, freq * 2, 0.03 * level * tame(freq * 2), 0.002, 0.2);
      struck(head, when, freq * 3.01, 0.016 * level * tame(freq * 3.01), 0.002, 0.07);
    },

    // The night's chord: notes as [pitch, share], coming in slowly, held for
    // `seconds`, and going slowly under whatever follows.
    night(when, notes, seconds) {
      if (ended) return;
      const swell = Math.min(SWELL, seconds * 0.6);
      for (const [pitch, share] of notes) {
        // two of each, a hair apart and one much the quieter: they beat slowly, so it is never quite still
        for (const [lean, part] of [[0, 1], [0.0022, 0.35]]) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = pitch * (1 + lean);
          const amp = ctx.createGain();
          const full = 0.01 * share * part;
          amp.gain.setValueAtTime(0, when);
          amp.gain.linearRampToValueAtTime(full, when + swell);
          amp.gain.setValueAtTime(full, when + seconds);
          amp.gain.linearRampToValueAtTime(0, when + seconds + FADE);
          osc.connect(amp).connect(under);
          osc.start(when);
          osc.stop(when + seconds + FADE + 0.1);
          held.add(osc);
          osc.onended = () => held.delete(osc);
        }
      }
    },

    // Out of hearing for a while (the page is not being looked at), and back.
    hush(on) {
      if (ended) return;
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(on ? 0 : LEVEL, ctx.currentTime, on ? 0.15 : 0.6);
    },

    // The screen has gone: fade, and then take it all down.
    end() {
      if (ended) return;
      ended = true;
      const at = ctx.currentTime;
      bus.gain.cancelScheduledValues(at);
      bus.gain.setTargetAtTime(0, at, 0.12);
      for (const osc of held) {
        try { osc.stop(at + 1); } catch { /* it had stopped already */ }
      }
      setTimeout(() => {
        try { bus.disconnect(); } catch { /* the engine itself has gone */ }
      }, 1200);
    },
  };
}
