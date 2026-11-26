// Sound effects and background music, synthesised with the Web Audio API so
// there are no audio files to download. Every page loads this (through the
// profile menu's module), so the music plays on the home page and in rooms as
// well as in games. Browsers only allow sound after the player has touched the
// page, so the audio engine starts on the first tap or key press; anything
// that happens before then is simply silent.

const KEY = 'postmarks:sound:v1'; // effects: 'off' when switched off
const MUSIC_KEY = 'postmarks:music:v1'; // background music: 'off' when switched off
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // no storage: sound stays on
  }
};
let muted = stored(KEY) === 'off';
let musicOff = stored(MUSIC_KEY) === 'off';

const MUSIC_LEVEL = 0.3; // how loud the music is, next to the effects' 0.5
let ctx = null;
let out = null; // effects
let band = null; // music, with its echo
let mix = null; // where everything meets on its way out
let held = false; // the background music is standing aside (the music maker is playing)

// Start the engine, or wake it. Safari on iPhone only lets this happen at the
// end of a tap (touchend, click), not the start, and puts the engine back to
// sleep ("suspended" or "interrupted") whenever the app goes to the background
// or a call comes in: so every touch tries again.
function unlock() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  ctx = new AudioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // a gentle compressor keeps stacked notes from clipping
  const squash = ctx.createDynamicsCompressor();
  mix = squash;
  out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(squash).connect(ctx.destination);
  // the music sits further back: quieter, and with a soft echo behind it
  band = ctx.createGain();
  band.gain.value = held ? 0 : MUSIC_LEVEL;
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.42;
  const tail = ctx.createGain();
  tail.gain.value = 0.3;
  band.connect(squash);
  band.connect(echo).connect(tail).connect(echo);
  tail.connect(squash);
  startMusic();
}

for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
});

export const isMuted = () => muted;

const remember = (key, off) => {
  try {
    localStorage.setItem(key, off ? 'off' : 'on');
  } catch {
    /* not remembered */
  }
};

export function setMuted(value) {
  muted = value;
  remember(KEY, value);
}

export const isMusicOff = () => musicOff;

export function setMusicOff(value) {
  musicOff = value;
  remember(MUSIC_KEY, value);
  if (band) band.gain.setTargetAtTime(value || held ? 0 : MUSIC_LEVEL, ctx.currentTime, 0.25); // fade, do not cut
}

// The music maker has the floor: the background music fades out while it is
// open, and comes back afterwards. Holds are counted, not just switched: the
// next screen asks for quiet before the last one has gone, so going from the
// music maker to the radio (or from one scene of the film to the next) once let
// the screen that was leaving bring the music back over the one arriving.
let holds = 0;
export function holdMusic(on) {
  holds = Math.max(0, holds + (on ? 1 : -1));
  held = holds > 0;
  if (band) band.gain.setTargetAtTime(held || musicOff ? 0 : MUSIC_LEVEL, ctx.currentTime, 0.2);
}

// The running sound engine, for something that wants to make its own sounds on
// the same clock: { ctx, mix }. Null until a first touch has woken it.
export const audio = () => (ctx && ctx.state === 'running' ? { ctx, mix } : null);

// One note: a pitch (optionally gliding to another), a waveform and a quick
// fade in and out. `at` is seconds from now.
export function tone({ at = 0, freq, to = freq, dur = 0.12, type = 'sine', gain = 0.25, attack = 0.005, into = out }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(into);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// A burst of filtered noise: paper, air, a thud.
export function noise({ at = 0, dur = 0.15, from = 800, to = from, q = 1, gain = 0.2, into = out }) {
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
  src.connect(filter).connect(amp).connect(into);
  src.start(start);
}

const NOTE = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1568 };

let lastCross = 0; // when the last single cross chimed, and how many have followed closely
let streak = 0;

// The voice most of the effects share: a small glass bell, with a little
// sparkle an octave up.
function bell(at, freq, gain, dur = 0.2) {
  tone({ at, freq, dur, type: 'sine', gain, attack: 0.004 });
  tone({ at, freq: freq * 2, dur: dur * 0.45, type: 'sine', gain: gain * 0.28, attack: 0.003 });
}

const SOUNDS = {
  // a small bright chime, like a glass tapped: two quick rising notes for one
  // cross, and a run up the scale for a stroke of several. Kept short and
  // soft, so that finding a post is still the bigger moment.
  cross({ count = 1 } = {}) {
    const scale = [NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6];
    if (count > 1) {
      // a whole stroke arriving at once (someone else's move)
      for (let i = 0; i < Math.min(count, scale.length); i++) bell(i * 0.05, scale[i], 0.15);
      return;
    }
    // Squares crossed one after another in a drag each arrive on their own:
    // the first chimes, and each one soon after climbs a step higher.
    const now = performance.now();
    streak = now - lastCross < 500 ? streak + 1 : 0;
    lastCross = now;
    if (streak === 0) {
      bell(0, NOTE.E5, 0.17);
      bell(0.06, NOTE.G5, 0.15);
    } else {
      bell(0, scale[Math.min(streak + 1, scale.length - 1)], 0.15);
    }
  },
  // moving on to the next screen: a breath of air and two bells stepping up.
  // (Short: the page it plays on is about to go.)
  forth() {
    noise({ dur: 0.16, from: 700, to: 3600, q: 0.9, gain: 0.05 });
    bell(0, NOTE.E5, 0.09, 0.1);
    bell(0.06, NOTE.A5, 0.09, 0.13);
  },
  // and coming back: the same, stepping down
  back() {
    noise({ dur: 0.16, from: 3200, to: 600, q: 0.9, gain: 0.045 });
    bell(0, NOTE.A5, 0.09, 0.1);
    bell(0.06, NOTE.E5, 0.09, 0.13);
  },
  // a sheet or dialog opening, and closing
  sheet() {
    noise({ dur: 0.1, from: 900, to: 2600, q: 1, gain: 0.035 });
    bell(0.02, NOTE.G5, 0.08, 0.14);
  },
  shut() {
    bell(0, NOTE.E5, 0.06, 0.1);
  },
  // pressing a button or a tile of the menus: the lightest touch of the bell
  tap() {
    bell(0, NOTE.E5, 0.07, 0.11);
  },
  // Dot, tapped. (Penny has a voice of its own: see penny/penny.js.)
  squeak() {
    bell(0, NOTE.A5, 0.11, 0.12);
    bell(0.07, NOTE.E6, 0.1, 0.2);
  },
  // taking a cross back: the cross's two notes in reverse, quieter, stepping down
  clear() {
    bell(0, NOTE.G5, 0.11);
    bell(0.07, NOTE.E5, 0.1, 0.24);
  },
  // choosing a square to guess, before it is played: one expectant note
  pick() {
    bell(0, NOTE.A5, 0.13, 0.16);
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
  // the crosses that follow a post, rippling outwards: tiny bells running up
  // and round a scale under the post's chime
  cascade({ delays = [] } = {}) {
    const run = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6];
    delays.slice(0, 40).forEach((ms, i) => {
      const step = i % (run.length * 2 - 2);
      bell(ms / 1000, run[step < run.length ? step : run.length * 2 - 2 - step], 0.055, 0.14);
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
  // a token of the phrase turning over: paper, then two bells a fifth apart
  token() {
    noise({ dur: 0.14, from: 900, to: 5000, q: 1.5, gain: 0.08 });
    bell(0.09, NOTE.A5, 0.15, 0.3);
    bell(0.16, NOTE.E6, 0.11, 0.36);
  },
  // it is your move: a doorbell's two notes
  turn() {
    bell(0, NOTE.G5, 0.16, 0.22);
    bell(0.13, NOTE.C6, 0.16, 0.34);
  },
  // a time trial's clock starting: ready, steady, go
  start() {
    bell(0, NOTE.C5, 0.14, 0.14);
    bell(0.16, NOTE.C5, 0.14, 0.14);
    bell(0.32, NOTE.C6, 0.18, 0.5);
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
  if (muted || !ctx || !SOUNDS[name]) return;
  const { delay = 0, ...rest } = options;
  if (delay) {
    setTimeout(() => play(name, rest), delay);
  } else if (ctx.state === 'running') {
    SOUNDS[name](rest);
  } else {
    // still waking up (the very first tap, or just back from the background):
    // play as soon as it is, unless that takes so long the moment has passed
    const asked = performance.now();
    ctx.resume().then(() => {
      if (ctx.state === 'running' && performance.now() - asked < 400) SOUNDS[name](rest);
    }).catch(() => {});
  }
}

// --- Background music ----------------------------------------------------------
// Made up as it goes, so it never loops: four slow chords turning over, each
// held as a soft pad with a low note under it, and a sparse tune picked from
// the notes that suit the chord. It is pitched below the effects and kept
// quiet, so the bells of the game still read clearly over it.

const BEAT = 0.78; // seconds
const BAR = 8; // beats per chord
const CHORDS = [
  { bass: 130.81, pad: [261.63, 329.63, 392.0], tune: [392.0, 440.0, 523.25, 587.33, 659.25] }, // C
  { bass: 110.0, pad: [220.0, 261.63, 329.63], tune: [329.63, 440.0, 523.25, 587.33, 659.25] }, // A minor
  { bass: 87.31, pad: [174.61, 261.63, 349.23], tune: [349.23, 440.0, 523.25, 587.33, 698.46] }, // F
  { bass: 98.0, pad: [196.0, 293.66, 392.0], tune: [392.0, 493.88, 587.33, 659.25, 783.99] }, // G
];

let musicTimer = null;
let nextBeat = 0; // when, on the engine's clock, the next beat falls
// Each page starts its own music. So that going from the home page into a room
// and on into a game sounds like one piece carrying on, the place reached in
// the chords is kept for the session and the next page picks up at the next bar.
const PLACE_KEY = 'postmarks:music-beat';
let beat = 0;
try {
  beat = Math.ceil((Number(sessionStorage.getItem(PLACE_KEY)) || 0) / 8) * 8;
} catch {
  /* no storage: start from the top */
}
let lastNote = 2; // where in the chord's notes the tune last was

function scheduleBeat(at, n) {
  const chord = CHORDS[Math.floor(n / BAR) % CHORDS.length];
  const where = n % BAR;
  const from = at - ctx.currentTime;
  if (where === 0) {
    // the chord, swelling in and out over the whole bar
    for (const freq of chord.pad) {
      tone({ at: from, freq, dur: BEAT * BAR * 1.05, type: 'sine', gain: 0.05, attack: BEAT * 2.5, into: band });
    }
    tone({ at: from, freq: chord.bass, dur: BEAT * BAR, type: 'triangle', gain: 0.07, attack: BEAT, into: band });
  }
  // the tune: more likely on the strong beats, moving by small steps, sometimes resting
  // (about two and a half notes to a bar: any more and it chimes over the quiet)
  const chance = where % 4 === 0 ? 0.62 : where % 2 === 0 ? 0.36 : 0.13;
  if (Math.random() < chance) {
    lastNote = Math.max(0, Math.min(chord.tune.length - 1, lastNote + Math.floor(Math.random() * 3) - 1));
    const freq = chord.tune[lastNote];
    tone({ at: from, freq, dur: BEAT * 1.9, type: 'sine', gain: 0.085, attack: 0.012, into: band });
    tone({ at: from, freq: freq * 2, dur: BEAT * 0.7, type: 'sine', gain: 0.018, attack: 0.01, into: band });
  }
}

function startMusic() {
  if (musicTimer || !ctx) return;
  band.gain.value = musicOff || held ? 0 : MUSIC_LEVEL;
  // beats are written onto the engine's clock a little ahead of time
  musicTimer = setInterval(() => {
    if (ctx.state !== 'running' || musicOff || held) {
      nextBeat = 0; // pick up afresh when it can be heard again
      return;
    }
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.15;
    while (nextBeat < ctx.currentTime + 0.6) {
      scheduleBeat(nextBeat, beat);
      beat += 1;
      try {
        sessionStorage.setItem(PLACE_KEY, String(beat));
      } catch { /* not kept */ }
      nextBeat += BEAT;
    }
  }, 150);
}

// Every button and menu tile gives a small tap, so the whole app answers to the
// touch the way the board does. (The board, the code buttons and the switches
// have sounds of their own.)
document.addEventListener('click', (event) => {
  const target = event.target.closest?.('button, .pal-dot'); // links have the screen-change sound
  if (!target || target.closest('#board, .walk-board, .walk-trail, .tools, .setting, .jam') || target.classList.contains('code') || target.disabled) return;
  play(target.closest('.pal-dot') ? 'squeak' : 'tap');
}, { capture: true });
