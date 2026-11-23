// Sound effects, synthesised with the Web Audio API so there are no audio files
// to download. Browsers only allow sound after the player has touched the
// page, so the audio engine starts on the first tap or key press; anything
// that happens before then is simply silent.

const KEY = 'postmarks:sound:v1';
let muted = false;
try {
  muted = localStorage.getItem(KEY) === 'off';
} catch {
  /* no storage: sound stays on */
}

let ctx = null;
let out = null;

function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  ctx = new AudioContext();
  // a gentle compressor keeps stacked notes from clipping
  const squash = ctx.createDynamicsCompressor();
  out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(squash).connect(ctx.destination);
}

for (const type of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? 'off' : 'on');
  } catch {
    /* not remembered */
  }
}

// One note: a pitch (optionally gliding to another), a waveform and a quick
// fade in and out. `at` is seconds from now.
function tone({ at = 0, freq, to = freq, dur = 0.12, type = 'sine', gain = 0.25, attack = 0.005 }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// A burst of filtered noise: paper, air, a thud.
function noise({ at = 0, dur = 0.15, from = 800, to = from, q = 1, gain = 0.2 }) {
  const start = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(amp).connect(out);
  src.start(start);
}

const NOTE = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

const SOUNDS = {
  // a pencil tick; several crosses in one stroke strum upwards
  cross({ count = 1 } = {}) {
    for (let i = 0; i < Math.min(count, 8); i++) {
      tone({ at: i * 0.035, freq: 620 + i * 45, to: 380 + i * 45, dur: 0.06, type: 'triangle', gain: 0.22 });
      noise({ at: i * 0.035, dur: 0.03, from: 3200, q: 2, gain: 0.05 });
    }
  },
  // rubbing one out: a soft downward blip
  clear() {
    tone({ freq: 420, to: 250, dur: 0.1, type: 'sine', gain: 0.2 });
    noise({ dur: 0.09, from: 1800, to: 600, q: 0.8, gain: 0.06 });
  },
  // choosing a square to guess, before it is played
  pick() {
    tone({ freq: 700, to: 880, dur: 0.07, type: 'sine', gain: 0.16 });
  },
  // a post found: the flap opens, then a bright rising chime with a shimmer on top
  post() {
    noise({ dur: 0.18, from: 500, to: 4500, q: 1.2, gain: 0.16 });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) => {
      tone({ at: 0.08 + i * 0.075, freq, dur: 0.5, type: 'triangle', gain: 0.24 });
      tone({ at: 0.08 + i * 0.075, freq: freq * 2, dur: 0.3, type: 'sine', gain: 0.07 });
    });
    tone({ at: 0.42, freq: NOTE.E6, dur: 0.7, type: 'sine', gain: 0.1 });
    tone({ at: 0.46, freq: NOTE.G6, dur: 0.8, type: 'sine', gain: 0.07 });
  },
  // the crosses that follow a post, rippling outwards: ticks that climb in pitch
  cascade({ delays = [] } = {}) {
    delays.slice(0, 40).forEach((ms, i) => {
      tone({ at: ms / 1000, freq: 500 + i * 26, to: 420 + i * 26, dur: 0.05, type: 'triangle', gain: 0.1 });
    });
  },
  // a wrong guess: a dull thud and a sagging buzz
  miss() {
    noise({ dur: 0.16, from: 180, to: 70, q: 0.7, gain: 0.5 });
    tone({ freq: 196, to: 98, dur: 0.38, type: 'sawtooth', gain: 0.16, attack: 0.01 });
    tone({ at: 0.02, freq: 185, to: 92, dur: 0.38, type: 'square', gain: 0.07, attack: 0.01 });
  },
  // a heart breaking: two falling notes
  heart() {
    tone({ at: 0.18, freq: NOTE.E5, to: NOTE.C5, dur: 0.18, type: 'sine', gain: 0.18 });
    tone({ at: 0.34, freq: NOTE.C5, to: NOTE.G4, dur: 0.3, type: 'sine', gain: 0.16 });
  },
  // a token of the phrase turning over
  token() {
    noise({ dur: 0.14, from: 900, to: 5000, q: 1.5, gain: 0.1 });
    tone({ at: 0.09, freq: NOTE.A5, dur: 0.25, type: 'sine', gain: 0.16 });
    tone({ at: 0.15, freq: NOTE.E6, dur: 0.3, type: 'sine', gain: 0.1 });
  },
  // it is your move
  turn() {
    tone({ freq: NOTE.G5, dur: 0.14, type: 'sine', gain: 0.16 });
    tone({ at: 0.12, freq: NOTE.C6, dur: 0.22, type: 'sine', gain: 0.16 });
  },
  // a time trial's clock starting
  start() {
    tone({ freq: NOTE.C5, dur: 0.1, type: 'square', gain: 0.1 });
    tone({ at: 0.14, freq: NOTE.C5, dur: 0.1, type: 'square', gain: 0.1 });
    tone({ at: 0.28, freq: NOTE.C6, dur: 0.35, type: 'square', gain: 0.12 });
  },
  // solved: a fanfare that lands on a full chord
  win() {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6, NOTE.E6].forEach((freq, i) => {
      tone({ at: i * 0.1, freq, dur: 0.3, type: 'triangle', gain: 0.24 });
    });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((freq) => {
      tone({ at: 0.74, freq, dur: 1.3, type: 'triangle', gain: 0.13, attack: 0.02 });
      tone({ at: 0.74, freq: freq * 2, dur: 0.9, type: 'sine', gain: 0.04 });
    });
    noise({ at: 0.74, dur: 0.6, from: 6000, to: 9000, q: 0.5, gain: 0.05 });
  },
  // out of hearts: a slow fall
  lose() {
    [NOTE.A4, NOTE.G4, NOTE.E4, NOTE.C4].forEach((freq, i) => {
      tone({ at: i * 0.2, freq, to: freq * 0.97, dur: 0.42, type: 'triangle', gain: 0.2, attack: 0.02 });
    });
    tone({ at: 0.8, freq: 130.81, dur: 1, type: 'sine', gain: 0.18, attack: 0.03 });
  },
};

// Play a named sound, optionally `delay` milliseconds from now.
export function play(name, options = {}) {
  if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  const { delay = 0, ...rest } = options;
  if (delay) setTimeout(() => play(name, rest), delay);
  else SOUNDS[name](rest);
}
