// What is in the posts.
//
// Every post on the map has a sound inside, and opening a post lets its sound
// out, once. Most are other people's mail: small bright things, a few notes
// each, every one in a voice of its own.
//
// One sound is the one Penny is looking for. It is nobody's that we know: a
// breath blown across something hollow, low, with an echo behind it, as if it
// had come a long way. It arrives in pieces, never the whole, each piece a
// little nearer than the last. Who or what makes it is not known, here or
// anywhere else in the app, and nothing in this file should be read as a clue:
// it is only a sound. Whose it is belongs to the halfway mark of the
// adventure, which is not written.
//
// And one post has no sound at all: the last post of the fifth place, a
// quarter of the way through. That one has Dot in it (penny/walk.js).
//
// What Penny has heard of the sound so far is kept on the device, so the
// search picks up where it was left.

import { audio, isMuted, noise, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { E5, G5 } from './notes.js';
import { SOUND, echoOf } from './places.js';

// --- What it has heard of it so far --------------------------------------------------
const HEARD_KEY = 'penny:sound:v1'; // how many notes of it, from the first
export const notesHeard = () => Math.max(0, Math.min(SOUND.length, Number.isInteger(load(HEARD_KEY)) ? load(HEARD_KEY) : 0));
export function heard(mail) {
  if (mail.friend && mail.upTo > notesHeard()) save(HEARD_KEY, mail.upTo);
}
// The notes heard so far, for drawing (`height` is 0 to 1, low to high) and for playing.
export function soundSoFar() {
  const pitches = SOUND.map(([pitch, , to]) => to ?? pitch);
  const [low, high] = [Math.min(...pitches), Math.max(...pitches)];
  return SOUND.slice(0, notesHeard()).map(([pitch, dur, to]) => ({ pitch, dur, to, height: (Math.log(to ?? pitch) - Math.log(low)) / (Math.log(high) - Math.log(low)) }));
}
// The same, as a piece of mail to play: what it remembers. A thing remembered
// is never as near as it was when it happened, so this is always a long way off.
export const remembered = (far = 0.9) => {
  const notes = SOUND.slice(0, Math.max(1, notesHeard()));
  return { friend: true, notes, far, upTo: notes.length, echo: echoOf(notes) };
};

// --- Making the sounds ---------------------------------------------------------------
let rig = null; // { ctx, dry, wet }: one way out for everything in the post, with an echo for what is far off

function wires() {
  if (isMuted()) return null;
  const live = audio();
  if (!live) return null;
  if (rig?.ctx === live.ctx) return rig;
  const { ctx, mix } = live;
  const dry = ctx.createGain();
  dry.gain.value = 0.6;
  dry.connect(mix);
  const wet = ctx.createGain(); // what is sent here comes back as an echo, twice or three times
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const again = ctx.createGain();
  again.gain.value = 0.42;
  const dull = ctx.createBiquadFilter();
  dull.type = 'lowpass';
  dull.frequency.value = 1500;
  wet.connect(delay).connect(dull).connect(again).connect(delay);
  again.connect(dry);
  rig = { ctx, dry, wet };
  return rig;
}

// One note of the sound it is after: breath across something hollow. Mostly
// air (noise through a very narrow filter, which gives it a pitch), with a
// plain tone inside it so the pitch is sure. Slow to start, slow to go.
function hollow({ ctx, dry, wet }, at, freq, dur, to, far) {
  const start = ctx.currentTime + 0.04 + at;
  const end = start + dur;
  const level = 1 - far * 0.5;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(0.5 * level, start + 0.11);
  out.gain.setTargetAtTime(0.0001, Math.max(start + 0.12, end - 0.18), 0.11);
  const veil = ctx.createBiquadFilter(); // the further off, the duller
  veil.type = 'lowpass';
  veil.frequency.value = 3600 - far * 2500;
  out.connect(veil);
  veil.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.25 + far * 0.6;
  veil.connect(send).connect(wet);

  const air = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (dur + 0.6)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  air.buffer = buffer;
  const core = ctx.createOscillator();
  core.type = 'sine';
  const inside = ctx.createGain();
  inside.gain.value = 0.42;
  core.connect(inside).connect(out);
  for (const [times, q, share] of [[1, 34, 7], [2, 26, 1.6]]) {
    const pipe = ctx.createBiquadFilter();
    pipe.type = 'bandpass';
    pipe.Q.value = q;
    pipe.frequency.setValueAtTime(freq * times, start);
    if (to !== freq) pipe.frequency.exponentialRampToValueAtTime(to * times, start + dur * 0.8);
    const part = ctx.createGain();
    part.gain.value = share;
    air.connect(pipe).connect(part).connect(out);
  }
  core.frequency.setValueAtTime(freq, start);
  if (to !== freq) core.frequency.exponentialRampToValueAtTime(to, start + dur * 0.8);
  air.start(start);
  air.stop(end + 0.5);
  core.start(start);
  core.stop(end + 0.5);
}

// One note of somebody else's mail, in one of five small voices.
function other(kind, at, freq, dur, into) {
  if (kind === 'pluck') {
    tone({ at, freq, dur: dur * 1.6, type: 'triangle', gain: 0.22, attack: 0.003, into });
    tone({ at, freq: freq * 3, dur: 0.05, type: 'sine', gain: 0.05, attack: 0.002, into });
  } else if (kind === 'blip') {
    tone({ at, freq, dur: dur * 0.9, type: 'square', gain: 0.07, attack: 0.004, into });
  } else if (kind === 'chirp') {
    tone({ at, freq: freq * 0.8, to: freq, dur, type: 'sine', gain: 0.2, attack: 0.01, into });
  } else if (kind === 'bubble') {
    tone({ at, freq: freq * 0.6, to: freq * 1.25, dur: dur * 0.8, type: 'sine', gain: 0.2, attack: 0.006, into });
  } else {
    // knock: a small thud with a pitch somewhere in it
    noise({ at, dur: 0.07, from: 420, to: 180, q: 1.2, gain: 0.5, into });
    tone({ at, freq: freq / 2, dur: 0.12, type: 'sine', gain: 0.2, attack: 0.003, into });
  }
}

// A loud post making itself heard through the map, unopened: one muffled note.
export function murmur() {
  const out = wires();
  if (!out) return;
  const { ctx, dry } = out;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 520;
  const quiet = ctx.createGain();
  quiet.gain.value = 0.5;
  muffle.connect(quiet).connect(dry);
  tone({ at: 0, freq: E5 / 2, dur: 0.5, type: 'triangle', gain: 0.3, attack: 0.02, into: muffle });
  tone({ at: 0.22, freq: G5 / 2, dur: 0.6, type: 'triangle', gain: 0.24, attack: 0.02, into: muffle });
}

// Let a post's sound out. onNote(pitch, seconds) is called as each note
// starts, so that it can be seen as well as heard. Resolves when it is over
// (with sound off, after the same time, in silence).
export function playMail(life, mail, onNote = () => {}) {
  const out = wires();
  let at = 0;
  for (const [pitch, dur, to] of mail.notes) {
    if (out && mail.friend) hollow(out, at, pitch, dur, to ?? pitch, mail.far);
    else if (out) other(mail.kind, at, pitch, dur, out.dry);
    life.setTimeout(onNote, at * 1000, to ?? pitch, dur);
    at += dur + (mail.friend ? 0.1 : 0.03);
  }
  // what is far off goes on ringing after its last note
  const tail = mail.friend ? 0.5 + mail.far * 0.7 : 0.25;
  return new Promise((done) => life.setTimeout(done, (at + tail) * 1000));
}
