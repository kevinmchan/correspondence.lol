// Penny: its voice, and what it remembers.
//
// It cannot speak, read or write. What it has is a closed-mouth hum that
// comes from its seal, on the five notes the rest of the app keeps to. Every
// screen it is on (the home page, the map, its story) hums through here.

import { audio, holdMusic, isMuted, noise } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { A4, A5, C5, C6, D5, E5, G4, G5 } from './notes.js';

export { A4, A5, C5, C6, D5, E5, G4, G5 };

// Its phrases: [pitch, seconds, pitch to glide to]. A pitch of 0 is a rest.
// None of them carries a rhythm to be copied: they are feelings, not signals.
export const HELLO = [[D5, 0.26], [G5, 0.55]];
export const ASK = [[G4, 0.5, C5]]; // one note that turns up at the end: it cannot tell
export const SAG = [[E5, 0.5, D5], [C5, 1.0]];
export const OOPS = [[E5, 0.22, D5], [C5, 0.4]];
export const TRILL = [[G5, 0.1], [A5, 0.1], [G5, 0.1], [A5, 0.1], [C6, 0.55]];
export const YES = [[G5, 0.12], [C6, 0.3]];
export const THIS_WAY = [[E5, 0.2], [G5, 0.2], [C6, 0.5]];
export const GASP = [[C5, 0.16, A5]]; // it is right here
export const NEAR = [[C5, 0.17, D5]]; // close by
export const NO_NO = [[E5, 0.13], [0, 0.05], [C5, 0.2]]; // not there: the rules say so
export const LET_GO = [[E5, 0.3, D5]]; // a breath let out
export const WONDER = [[C5, 0.5, E5]]; // watching a rule take its squares
export const MM = [[C5, 0.16]]; // content: yes, it can see why
export const RELIEF = [[D5, 0.2, E5]];
export const ALARM = [[A5, 0.09], [0, 0.04], [A5, 0.09], [0, 0.04], [E5, 0.28, D5]];
export const PLEASE = [[E5, 0.32, G5], [G5, 0.75]];
export const SIGH = [[D5, 0.6, C5]];
export const LONGING = [[E5, 0.5, G5], [G5, 0.5, E5]]; // up, and back down: after something that is over

// Whether the walk through the first places has been finished on this device,
// and which place comes next.
const WALKED_KEY = 'penny:walked:v1';
const PLACE_KEY = 'penny:place:v1';
export const hasWalked = () => load(WALKED_KEY) === true;
export const setWalked = () => save(WALKED_KEY, true);
export const placeReached = () => (Number.isInteger(load(PLACE_KEY)) ? load(PLACE_KEY) : 0);
export const setPlaceReached = (index) => save(PLACE_KEY, index);
// Whether Dot has been found yet. Penny sets out alone: Dot is met a quarter
// of the way through, at the end of the first places, and stays from then on.
const DOT_KEY = 'penny:dot:v1';
export const hasDot = () => load(DOT_KEY) === true;
export const setDot = () => save(DOT_KEY, true);

// A voice for one screen, ending with its `life`.
//   onNote(pitch, seconds, tag): called as each note starts, so the screen can
//     show it (its seal brightens); `tag` is whatever sing() was given
//   alone: the app's music stands aside while this screen is up
export function createVoice(life, { onNote = () => {}, alone = false } = {}) {
  let bus = null;
  if (alone) holdMusic(true);
  life.onEnd(() => {
    if (alone) holdMusic(false);
    const live = audio();
    if (bus && live) bus.gain.setTargetAtTime(0, live.ctx.currentTime, 0.06);
  });

  function engine() {
    if (isMuted()) return null;
    const live = audio();
    if (!live) return null;
    if (!bus) {
      bus = live.ctx.createGain();
      bus.gain.value = 0.55;
      bus.connect(live.mix);
    }
    return live.ctx;
  }

  // One hummed note: a soft triangle with a sine under it and a little of the
  // octave above, all behind a low-pass so it sounds closed-mouthed. It scoops
  // up into its pitch, and a held note starts to waver.
  function hum(ctx, at, freq, dur, to, level, breath) {
    const start = ctx.currentTime + 0.03 + at;
    const end = start + dur;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = Math.max(freq, to) * 2.4;
    soften.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(0.16 * level, start + 0.07);
    amp.gain.setTargetAtTime(0.0001, Math.max(start + 0.08, end - 0.1), 0.06);
    soften.connect(amp).connect(bus);

    const waver = ctx.createOscillator();
    waver.frequency.value = 5.4;
    const depth = ctx.createGain(); // in cents
    depth.gain.setValueAtTime(0, start);
    if (dur > 0.5) {
      depth.gain.setValueAtTime(0, start + 0.22);
      depth.gain.linearRampToValueAtTime(18, start + 0.6);
    }
    waver.connect(depth);
    waver.start(start);
    waver.stop(end + 0.4);

    for (const [type, times, share] of [['triangle', 1, 1], ['sine', 1, 0.6], ['sine', 2, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * times * 0.965, start);
      osc.frequency.exponentialRampToValueAtTime(freq * times, start + 0.06);
      if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to * times, start + dur * 0.85);
      depth.connect(osc.detune);
      const part = ctx.createGain();
      part.gain.value = share;
      osc.connect(part).connect(soften);
      osc.start(start);
      osc.stop(end + 0.4);
    }
    // the breath before a phrase: paper lifting
    if (breath) noise({ at, dur: 0.09, from: 1400, to: 2600, q: 1.1, gain: 0.035 * level * breath, into: bus });
  }

  return {
    // Whether it can be heard yet (sound needs a first touch, and may be off).
    get audible() {
      return Boolean(audio()) && !isMuted();
    },
    // Hum a phrase. Resolves when it has been sung.
    sing(phrase, level = 1, { breath = 1, tag } = {}) {
      const ctx = engine();
      let at = 0;
      let first = true;
      for (const [freq, dur, to] of phrase) {
        if (freq) {
          if (ctx) hum(ctx, at, freq, dur, to ?? freq, level, first ? breath : 0);
          life.setTimeout(onNote, at * 1000, to ?? freq, dur, tag);
          first = false;
        }
        at += dur + (freq ? 0.04 : 0);
      }
      return new Promise((done) => life.setTimeout(done, at * 1000));
    },
  };
}
