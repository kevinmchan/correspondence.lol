// A reel (/?reel): Marcus Pell, an aluminium extension ladder, films himself
// in his home office and says something heartfelt, and then something else.
// It is satire: a sincere post about the line between those whose money makes
// money and those whose money makes rent, that turns into an advert for an
// energy drink. That it is a paid partnership is the punchline, and nothing
// gives it away before the end (the story doc, "One way they could look
// outside the game"; the words are the owner's, 27 November 2026).
//
// It turns up in the feed on the home page once half a bar of energy has been
// earned (shared/energy.js, `reelFound`), as one more thing waiting on you, and
// leaves it once it has been watched to its end; it never interrupts. It can
// be watched at any time from Reels on the home page's menu.
//
// Swipe up (scroll, or the arrow keys) for each line. The last line, then the
// comment under it; then from the top again. The share mark on the rail opens
// the phone's share sheet with the reel's address (/?reel).
//
// Sound. Marcus speaks as the app's people do, without words: a babble shaped
// by the vowels of what he says (an "a" opens his mouth, an "ee" thins it, a
// "p" pops and an "s" hisses), sung to each line's feeling, in an aluminium
// voice that faintly rings. His mouth moves with the syllables, sound or not.
// Under the lines is a small score of the reel's own. His voice and the little
// sounds are the app's sound effects; the pad, the drumroll, the drone and the
// jingle are its music (the profile's two switches, postmarks/sound.js). The
// app's own music stands aside while the reel is up.

import { audio, holdMusic, isMusicOff, isMuted } from '/postmarks/sound.js';
import { WATCHED_KEY, body, mouthPath } from './marcus.js';
import { save } from '/shared/identity.js';

// --- His room: cold, tidy, lit for camera. The chart on the wall is his. ----------------------
// (The picture is 360 by 640 and fills the phone, cut at the sides on a tall one: what matters is in the middle.)
const ROOM = `
  <defs>
    <linearGradient id="reel-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdd6dc"/><stop offset="1" stop-color="#b3bec6"/></linearGradient>
    <linearGradient id="reel-window" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4f8"/><stop offset="1" stop-color="#c9d7e1"/></linearGradient>
    <radialGradient id="reel-ring" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="-60" y="-60" width="480" height="760" fill="url(#reel-wall)"/>
  <rect x="214" y="70" width="112" height="190" rx="4" fill="url(#reel-window)"/>
  <path d="M270 70v190M214 165h112" stroke="#aebcc6" stroke-width="5"/>
  <rect x="210" y="66" width="120" height="198" rx="6" fill="none" stroke="#e7ecef" stroke-width="6"/>
  <g transform="translate(40 92)">
    <rect width="104" height="80" rx="3" fill="#f6f8f9" stroke="#2c3a46" stroke-width="4"/>
    <path d="M12 66 H94 M12 66 V12" stroke="#9aa7b1" stroke-width="1.5"/>
    <path d="M14 62 C34 60 48 54 60 44 S82 20 92 12" stroke="#2f5d8a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M14 63 C38 62 56 60 92 54" stroke="#c8a05a" stroke-width="2" fill="none" stroke-dasharray="3 3" stroke-linecap="round"/>
  </g>
  <rect x="32" y="214" width="150" height="7" rx="2" fill="#8c98a2"/>
  <g fill="#5b6873"><rect x="44" y="178" width="11" height="36" rx="1.5"/><rect x="57" y="178" width="11" height="36" rx="1.5"/><rect x="70" y="178" width="11" height="36" rx="1.5"/></g>
  <path d="M110 186 h20 q0 16 -10 18 q-10 -2 -10 -18z M116 204 h8 v6 h-8z M112 210 h16 v4 h-16z" fill="#c9a24c"/>
  <g transform="translate(154 214)"><rect x="-10" y="-14" width="20" height="14" rx="3" fill="#e4e8ea"/>
    <path d="M0 -14 q-14 -14 -16 -30 q12 8 16 30 M0 -14 q2 -20 10 -34 q4 16 -10 34 M0 -14 q12 -10 22 -12 q-6 12 -22 12" fill="#7d9c84"/></g>
  <rect x="-60" y="-60" width="480" height="760" fill="url(#reel-ring)"/>`;

// --- What he says: the owner's draft, word for word, split only into beats ---------------------
// Each with how it is said (`mood`) and what plays round it (from SCORE). `sincere` lifts his brows.
const LINES = [
  { text: 'I opened up Wealthmart', mood: { pitch: 1.05, rate: 1.05, contour: 'up', lastGlide: 1.1 }, after: (s, e) => s.shopDoor(e + 0.05) },
  { text: 'and saw they were offering a free energy evaluator', mood: { pitch: 1.08, rate: 1.25, contour: 'hype', lastGlide: 1.08 }, after: (s, e) => s.sparkle(e) },
  { text: 'if you transferred 100k credits.', mood: { pitch: 1, rate: 0.95, contour: 'deflate', lastHold: 2.4, lastGlide: 0.72 }, after: (s, e) => s.sadTill(e + 0.05) },
  { text: 'Now, I get why this deal makes sense from a business perspective.', mood: { pitch: 0.86, rate: 0.85, contour: 'hat' }, before: (s) => s.penClick(0) },
  { text: 'But man, it got me thinking,', mood: { pitch: 0.9, rate: 0.7, contour: 'fall', breath: 0.3, vib: 8, gain: 0.9 }, sincere: true,
    before: (s) => s.bed('pad', [261.63, 329.63, 392, 493.88], { gain: 0.03, attack: 1.6, cutoff: 1200 }) },
  { text: 'it sure does pay to have money.', mood: { pitch: 0.86, rate: 0.7, contour: 'fall', breath: 0.25, vib: 16, lastHold: 2.4, lastGlide: 0.9 }, sincere: true, after: (s, e) => s.warmBell(e) },
  { text: 'Am I a little salty that I didn’t have the credits to accept the offer.', mood: { pitch: 1.14, rate: 1.4, contour: 'hat', vib: 22, vibRate: 7.5, gain: 0.65 }, sincere: true },
  { text: 'Maybe?', mood: { pitch: 1.22, rate: 0.85, contour: 'flat', lastHold: 2.6, lastGlide: 1.55, gain: 0.6 }, sincere: true, after: (s, e) => s.squeak(e + 0.35) },
  // (the sincere music stops dead, and a drumroll begins)
  { text: 'Which is why I’m excited to announce my new channel sponsor…', mood: { pitch: 1, rate: 1.3, contour: 'hype', lastHold: 2, lastGlide: 1.15 },
    before: (s) => s.stopBed('pad', 0.02), under: (s, e) => s.drumroll(0, e + 0.4) },
  { text: 'Penny’s Energy', mood: { pitch: 1.38, rate: 0.62, contour: 'hat', gain: 1.25, echo: true, lastHold: 2.2, lastGlide: 1.05, vib: 14 }, big: true, paid: true,
    before: (s) => s.crash(0), after: (s, e) => s.jingle(e + 0.05) },
  { text: 'The harshness of life got you down?', mood: { pitch: 0.72, rate: 0.78, contour: 'dramatic', lastGlide: 1.15, breath: 0.15 },
    before: (s) => { s.timpani(0); s.bed('drone', [110, 130.81, 164.81], { type: 'sawtooth', gain: 0.022, attack: 0.8, cutoff: 700 }); } },
  // (the small print, read at the speed of small print)
  { text: 'Worried about being on the wrong side of a crushing and growing hoarding of resources.', mood: { pitch: 1.16, rate: 2.4, contour: 'flat', lastHold: 1, gain: 0.5 } },
  { text: 'Go get yours with Penny’s Energy.', mood: { pitch: 1.15, rate: 1.1, contour: 'hat', gain: 1.15, lastGlide: 1.08 },
    before: (s) => s.stopBed('drone', 0.3), after: (s, e) => s.jingle(e, true) },
  { text: 'I take one every hour to keep me going.', mood: { pitch: 1.1, rate: 1.18, contour: 'up', vib: 30, vibRate: 8, lastGlide: 1.12 },
    before: (s) => s.canCrack(0), under: (s, e) => s.ticking(0.5, e + 0.8) },
  { text: 'sending only love fam', mood: { pitch: 0.94, rate: 0.82, contour: 'fall', breath: 0.3, vib: 12, lastHold: 2.2, lastGlide: 0.93, gain: 0.9 }, sincere: true,
    after: (s, e) => s.kiss(e + 0.08) },
  { text: 'and remember…', mood: { pitch: 0.82, rate: 0.62, contour: 'hat', breath: 0.35, lastHold: 2.6, lastGlide: 0.96, gain: 0.85 }, sincere: true,
    before: (s) => s.riser(0, 1.6) },
  // (a pun: a rung of his own on "step", a rimshot, and a wink)
  { text: 'don’t fall out of step', mood: { pitch: 0.95, rate: 0.9, contour: 'fall', lastHold: 1.8, lastGlide: 0.9 }, wink: true,
    after: (s, e) => { s.clank(e - 0.3); s.rimshot(e + 0.35); } },
];
// The comment under it, in somebody else's voice.
const COMMENT = { text: 'Go get that paper boiiiii!', mood: { pitch: 1.1, rate: 1.15, contour: 'up', lastHold: 7, lastGlide: 0.55, vib: 55, vibRate: 6 }, them: true, before: (s) => s.notify(0) };
const STEPS = LINES.length + 1;
const PAID_FROM = LINES.findIndex((line) => line.paid);

// --- How he says it ---------------------------------------------------------------------------
// Vowels as two formants, and how open the mouth is for each.
const VOWEL = { a: [800, 1250, 1], e: [520, 1850, 0.62], i: [330, 2300, 0.42], o: [540, 880, 0.85], u: [380, 860, 0.55], y: [340, 2200, 0.45] };
const CONTOUR = {
  flat: () => 1,
  up: (x) => 1 + 0.2 * x * x, // upspeak
  fall: (x) => 1.1 - 0.26 * x, // meaning it
  hat: (x) => 1 + 0.16 * Math.sin(Math.PI * x), // a reasonable man, explaining
  hype: (x) => 0.92 + 0.55 * x * x, // building to the announcement
  deflate: (x) => (x < 0.5 ? 1.12 : 1.12 - (0.5 * (x - 0.5)) / 0.5), // ...credits.
  dramatic: (x) => 0.85 + 0.12 * Math.sin(Math.PI * x),
};
function syllables(text) {
  const words = text.toLowerCase().replace(/100k/g, 'one hundred kay').match(/[a-z’']+|[,.?!…]/g) || [];
  const out = [];
  for (const word of words) {
    if (/^[,.?!…]$/.test(word)) {
      out.push({ pause: word === ',' ? 0.17 : word === '…' ? 0.45 : 0.26 });
      continue;
    }
    const parts = word.match(/[^aeiouy]*[aeiouy]+/g) || [word];
    if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts[parts.length - 1]) && word.endsWith('e')) parts.splice(-2, 2, parts[parts.length - 2] + parts[parts.length - 1]);
    parts.forEach((part, i) => {
      const on = (part.match(/^[^aeiouy]*/) || [''])[0];
      out.push({ on, v: part[on.length] || 'e', stress: i === 0 && parts.length > 1 });
    });
  }
  return out;
}
// When each syllable is said, and how: worked out before anything sounds, so that his mouth can follow it muted.
function plan(text, mood) {
  const all = syllables(text);
  const n = all.filter((one) => !one.pause).length;
  const rate = mood.rate || 1;
  const contour = CONTOUR[mood.contour || 'flat'];
  const out = [];
  let t = 0;
  let k = 0;
  for (const one of all) {
    if (one.pause) {
      t += one.pause / Math.min(rate, 1.5);
      continue;
    }
    const x = n > 1 ? k / (n - 1) : 1;
    k += 1;
    const last = k === n;
    const cons = /^[’']?[pbtdkgcq]/.test(one.on) ? 'p' : /^[’']?(sh|th|ch|[sfhzxj])/.test(one.on) ? 'f' : '';
    const pre = cons === 'f' ? 0.045 / rate : cons === 'p' ? 0.018 / rate : 0;
    let dur = (0.13 / rate) * (one.stress ? 1.15 : 1) * (0.85 + Math.random() * 0.3);
    if (last) dur *= mood.lastHold || 1.7;
    const p = contour(x) * (one.stress ? 1.07 : 1) * (0.96 + Math.random() * 0.08);
    out.push({ at: t + pre, dur, v: one.v, cons, p, glide: last ? mood.lastGlide || 0.94 : 0.985 });
    t += pre + dur + 0.014 / rate;
  }
  return { syl: out, end: t };
}

// The sound of it all, on the app's own engine. Made when the screen comes up; quiet when it goes.
function soundsFor(life) {
  let made = null; // { ctx, out, echo, noise }
  const make = () => {
    const engine = audio();
    if (!engine) return null;
    if (made && made.ctx === engine.ctx) return made;
    const { ctx, mix } = engine;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(mix);
    // a short slap of echo, for the announcer and the jingle
    const echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.19;
    const back = ctx.createGain();
    back.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3200;
    echo.connect(out);
    echo.connect(delay);
    delay.connect(dark).connect(back).connect(delay);
    dark.connect(wet).connect(out);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    made = { ctx, out, echo, noise };
    return made;
  };
  const effects = () => !isMuted() && make();
  const music = () => !isMusicOff() && make();
  const T = (m, at) => m.ctx.currentTime + 0.04 + at;

  function shape(m, gain, start, attack, peak, end, hold) {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    if (hold) {
      gain.gain.setValueAtTime(peak, Math.max(start + attack, end - 0.04));
      gain.gain.linearRampToValueAtTime(0.0001, end);
    } else gain.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  function tone(m, { at = 0, freq, to, dur, type = 'sine', gain = 0.1, attack = 0.005, into = m.out, hold = false }) {
    const start = T(m, at);
    const osc = m.ctx.createOscillator();
    const amp = m.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    shape(m, amp, start, attack, gain, start + dur, hold);
    osc.connect(amp).connect(into);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
  function hiss(m, { at = 0, dur, type = 'bandpass', freq = 2000, to, q = 1, gain = 0.1, attack = 0.004, into = m.out }) {
    const start = T(m, at);
    const src = m.ctx.createBufferSource();
    const filter = m.ctx.createBiquadFilter();
    const amp = m.ctx.createGain();
    src.buffer = m.noise;
    src.loop = true;
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.value = q;
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + dur);
    shape(m, amp, start, attack, gain, start + dur, false);
    src.connect(filter).connect(amp).connect(into);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }
  // A struck bell, as the game's bells have it: the note and a little of its 2.76 partial.
  function bell(m, at, freq, gain = 0.08, dur = 1.4, into = m.out) {
    tone(m, { at, freq, dur, gain, attack: 0.003, into });
    tone(m, { at, freq: freq * 2.76, dur: dur * 0.35, gain: gain * 0.25, attack: 0.002, into });
  }

  // Long sounds that last across lines: the sincere pad, the infomercial drone.
  const beds = {};
  function stopBed(name, fade = 0.5) {
    const bed = beds[name];
    if (!bed) return;
    const now = bed.ctx.currentTime;
    bed.amp.gain.cancelScheduledValues(now);
    bed.amp.gain.setValueAtTime(Math.max(0.0001, bed.amp.gain.value), now);
    bed.amp.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, fade));
    for (const osc of bed.oscs) osc.stop(now + fade + 0.05);
    delete beds[name];
  }
  const stopBeds = (fade) => Object.keys(beds).forEach((name) => stopBed(name, fade));
  life.onEnd(() => stopBeds(0.3));

  // The score: one small thing for each line, made for its feeling. Effects unless said.
  const score = {
    bed(name, chord, { type = 'triangle', gain = 0.035, attack = 1.2, cutoff = 1400 } = {}) { // music
      stopBed(name, 0.3);
      const m = music();
      if (!m) return;
      const start = T(m, 0);
      const amp = m.ctx.createGain();
      const filter = m.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + attack);
      const oscs = chord.flatMap((freq) => [-6, 6].map((cents) => {
        const osc = m.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(start);
        return osc;
      }));
      filter.connect(amp).connect(m.out);
      beds[name] = { ctx: m.ctx, amp, oscs };
    },
    stopBed,
    stopBeds,
    shopDoor(at) { const m = effects(); if (m) { bell(m, at, 1318.5, 0.06, 1.1); bell(m, at + 0.22, 1046.5, 0.06, 1.6); } },
    sparkle(at) { const m = effects(); if (m) [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(m, at + i * 0.06, f, 0.035, 0.8)); },
    sadTill(at) { // a till that rings, and sags
      const m = effects();
      if (!m) return;
      hiss(m, { at, dur: 0.05, type: 'highpass', freq: 3000, gain: 0.08 });
      tone(m, { at, freq: 2349, to: 1100, dur: 0.9, gain: 0.05 });
      tone(m, { at, freq: 3136, to: 1400, dur: 0.8, gain: 0.035 });
      tone(m, { at: at + 0.25, freq: 233, to: 150, dur: 0.7, type: 'triangle', gain: 0.07 });
    },
    penClick(at) { const m = effects(); if (m) { hiss(m, { at, dur: 0.018, type: 'highpass', freq: 4000, gain: 0.09 }); hiss(m, { at: at + 0.09, dur: 0.015, type: 'highpass', freq: 3500, gain: 0.07 }); } },
    warmBell(at) { const m = effects(); if (m) { bell(m, at, 523.25, 0.05, 2.6); bell(m, at + 0.02, 659.25, 0.03, 2.4); } },
    squeak(at) { const m = effects(); if (m) tone(m, { at, freq: 1500, to: 2400, dur: 0.12, gain: 0.03 }); },
    drumroll(at, dur) { // music: a snare that gathers itself
      const m = music();
      if (!m) return;
      let t = 0;
      let step = 0.11;
      while (t < dur) {
        hiss(m, { at: at + t, dur: 0.05, freq: 1900, q: 0.7, gain: 0.02 + 0.07 * (t / dur) });
        t += step;
        step = Math.max(0.035, step * 0.93);
      }
    },
    crash(at) { const m = music(); if (m) { hiss(m, { at, dur: 1.8, type: 'highpass', freq: 5000, gain: 0.09 }); tone(m, { at, freq: 82, to: 41, dur: 0.4, gain: 0.2 }); } },
    jingle(at, small = false) { // music: bright, brassy, and much too pleased with itself
      const m = music();
      if (!m) return;
      const notes = small ? [[0, 783.99], [0.12, 1046.5]] : [[0, 523.25], [0.11, 659.25], [0.22, 783.99], [0.36, 1046.5]];
      for (const [t, f] of notes) {
        tone(m, { at: at + t, freq: f, dur: 0.16, type: 'square', gain: 0.028, into: m.echo });
        tone(m, { at: at + t, freq: f / 2, dur: 0.16, type: 'triangle', gain: 0.05, into: m.echo });
      }
      const end = at + notes[notes.length - 1][0] + 0.14;
      if (!small) for (const f of [523.25, 659.25, 783.99, 1046.5]) tone(m, { at: end, freq: f, dur: 0.9, type: 'sawtooth', gain: 0.016, attack: 0.02, into: m.echo });
      bell(m, end, 2093, small ? 0.03 : 0.05, 1.2, m.echo);
    },
    timpani(at) { const m = music(); if (m) { tone(m, { at, freq: 98, to: 82, dur: 1.4, gain: 0.22 }); hiss(m, { at, dur: 0.08, type: 'lowpass', freq: 400, gain: 0.12 }); } },
    canCrack(at) { const m = effects(); if (m) { hiss(m, { at, dur: 0.04, type: 'highpass', freq: 2500, gain: 0.14 }); hiss(m, { at: at + 0.03, dur: 0.9, freq: 6000, to: 4000, q: 0.6, gain: 0.05 }); } },
    ticking(at, dur) { const m = effects(); if (m) for (let t = 0; t < dur; t += 0.25) hiss(m, { at: at + t, dur: 0.012, type: 'highpass', freq: t % 0.5 ? 3200 : 4200, gain: 0.045 }); },
    kiss(at) { const m = effects(); if (m) { hiss(m, { at, dur: 0.03, freq: 1400, q: 2, gain: 0.12 }); tone(m, { at, freq: 900, to: 1500, dur: 0.07, gain: 0.05 }); bell(m, at + 0.12, 1318.5, 0.035, 1.2); bell(m, at + 0.2, 1568, 0.03, 1.4); } },
    riser(at, dur) { const m = music(); if (m) { tone(m, { at, freq: 220, to: 440, dur, gain: 0.03, attack: 0.6, hold: true }); tone(m, { at, freq: 330, to: 660, dur, gain: 0.018, attack: 0.6, hold: true }); } },
    clank(at) { const m = effects(); if (m) { bell(m, at, 660, 0.05, 0.6); hiss(m, { at, dur: 0.03, type: 'highpass', freq: 3000, gain: 0.08 }); } }, // his own rung, on "step"
    rimshot(at) {
      const m = effects();
      if (!m) return;
      hiss(m, { at, dur: 0.06, freq: 1900, q: 0.8, gain: 0.12 });
      hiss(m, { at: at + 0.15, dur: 0.06, freq: 1900, q: 0.8, gain: 0.12 });
      hiss(m, { at: at + 0.32, dur: 1.2, type: 'highpass', freq: 6000, gain: 0.08 });
      tone(m, { at: at + 0.32, freq: 90, to: 50, dur: 0.2, gain: 0.14 });
    },
    notify(at) { const m = effects(); if (m) { bell(m, at, 1760, 0.05, 0.5); bell(m, at + 0.09, 2349, 0.05, 0.7); } },
    // His tell: a section of aluminium sliding up, and its lock clicking shut.
    tell() { const m = effects(); if (m) { hiss(m, { at: 0, dur: 0.5, freq: 1800, to: 3200, q: 6, gain: 0.04 }); bell(m, 0.5, 740, 0.05, 0.5); hiss(m, { at: 0.5, dur: 0.03, type: 'highpass', freq: 3000, gain: 0.08 }); } },
  };

  // A voice: Marcus's, aluminium, faintly ringing; or the commenter's, brighter and brasher.
  const THROATS = {
    marcus: { wave: 'triangle', pitch: 0.86, formant: 0.95, q: 6, ping: 0.025, ring: true },
    them: { wave: 'sawtooth', pitch: 1.35, formant: 1.1, q: 6 },
  };
  let line = null; // the line being said, to quiet it if another is asked for first
  function speak(said, mood, who) {
    const planned = plan(said, mood);
    if (line) {
      line.gain.setTargetAtTime(0.0001, line.context.currentTime, 0.03);
      line = null;
    }
    const m = effects();
    if (!m) return planned;
    const throat = THROATS[who];
    const gain = m.ctx.createGain();
    gain.gain.value = mood.gain || 1;
    gain.connect(mood.echo ? m.echo : m.out);
    line = gain;
    const base = 190 * throat.pitch * (mood.pitch || 1);
    for (const one of planned.syl) {
      const start = T(m, one.at);
      const end = start + one.dur;
      const f = base * one.p;
      const [F1, F2] = VOWEL[one.v] || VOWEL.e;
      const osc = m.ctx.createOscillator();
      osc.type = throat.wave;
      osc.frequency.setValueAtTime(f * 0.95, start);
      osc.frequency.exponentialRampToValueAtTime(f, start + 0.03);
      osc.frequency.exponentialRampToValueAtTime(f * one.glide, end);
      if (mood.vib) {
        const lfo = m.ctx.createOscillator();
        const depth = m.ctx.createGain();
        lfo.frequency.value = mood.vibRate || 5.8;
        depth.gain.value = mood.vib;
        lfo.connect(depth).connect(osc.detune);
        lfo.start(start);
        lfo.stop(end + 0.05);
      }
      const amp = m.ctx.createGain();
      shape(m, amp, start, 0.018, 0.5, end + 0.03, true);
      amp.gain.setTargetAtTime(0.0001, Math.max(start + 0.02, end - 0.04), 0.025);
      for (const [F, q, share] of [[F1, throat.q, 1], [F2, throat.q + 2, 0.6]]) {
        const band = m.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = F * throat.formant;
        band.Q.value = q;
        const part = m.ctx.createGain();
        part.gain.value = share * 1.3;
        osc.connect(band).connect(part).connect(amp);
      }
      const dry = m.ctx.createBiquadFilter();
      dry.type = 'lowpass';
      dry.frequency.value = 900;
      const dryGain = m.ctx.createGain();
      dryGain.gain.value = 0.12;
      osc.connect(dry).connect(dryGain).connect(amp);
      amp.connect(gain);
      osc.start(start);
      osc.stop(end + 0.08);
      if (throat.ping) tone(m, { at: one.at, freq: f * 3, dur: one.dur, gain: throat.ping, into: gain });
      if (mood.breath) hiss(m, { at: one.at, dur: one.dur, freq: F2 * throat.formant, q: 3, gain: 0.05 * mood.breath, into: gain });
      if (one.cons === 'p') hiss(m, { at: one.at - 0.016, dur: 0.016, type: 'highpass', freq: 2200, gain: 0.07, into: gain });
      if (one.cons === 'f') hiss(m, { at: one.at - 0.045, dur: 0.045, freq: 4800, q: 1.2, gain: 0.05, into: gain });
      if (throat.ring && Math.random() < 0.12) bell(m, one.at, 1900 + Math.random() * 400, 0.012, 0.25, gain); // aluminium
    }
    return planned;
  }
  life.onEnd(() => line?.gain.setTargetAtTime(0.0001, line.context.currentTime, 0.03));
  return { score, speak, ready: () => Boolean(audio()) };
}

// --- The screen ------------------------------------------------------------------------------
export function mount(root, life) {
  document.title = 'marcus.pell · correspondence.lol';
  const main = root.querySelector('.reel');
  const scene = root.querySelector('.reel-scene');
  const said = root.querySelector('#reel-said');
  const next = root.querySelector('#reel-next');
  const comment = root.querySelector('#reel-comment');
  const paid = root.querySelector('#reel-paid');
  const progress = root.querySelector('#reel-progress');
  const cap = root.querySelector('#reel-cap');
  const more = root.querySelector('#reel-more');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sounds = soundsFor(life);

  scene.insertAdjacentHTML('beforeend', `<g class="reel-cam">${ROOM}<g transform="translate(0 -64)">${body()}</g></g>`);
  const $ = (id) => scene.querySelector(`#${id}`);
  const cam = scene.querySelector('.reel-cam');
  const parts = {
    head: $('head'), torso: $('torso'), arm: $('arm'), base: $('base'), mouth: $('mouth'), browL: $('brow-l'), browR: $('brow-r'),
    lids: [...scene.querySelectorAll('.lid')], pupils: [...scene.querySelectorAll('.pupil')],
  };
  parts.head.style.transformOrigin = '180px 470px';
  for (const brow of [parts.browL, parts.browR]) brow.style.transformBox = 'fill-box';
  parts.browL.style.transformOrigin = 'right center';
  parts.browR.style.transformOrigin = 'left center';

  // The app's music stands aside while the reel has the floor.
  holdMusic(true);
  life.onEnd(() => holdMusic(false));

  let at = -1; // the line on screen (-1: none yet; LINES.length: the comment)
  let speech = null; // { start, planned, line }

  function say(index) {
    at = index;
    const line = index < LINES.length ? LINES[index] : COMMENT;
    if (index === 0) sounds.score.stopBeds(0.2);
    const start = () => {
      if (life.over || at !== index) return;
      line.before?.(sounds.score);
      const planned = sounds.speak(line.text, line.mood, line.them ? 'them' : 'marcus');
      line.under?.(sounds.score, planned.end);
      line.after?.(sounds.score, planned.end);
      speech = { start: performance.now() / 1000 + 0.04, planned, line };
    };
    // (the first touch wakes the sound engine a moment after it lands: the line waits for it, briefly)
    if (sounds.ready()) start();
    else {
      let tries = 0;
      const wait = () => (sounds.ready() || tries++ > 4 ? start() : life.setTimeout(wait, 60));
      wait();
    }
    if (index < LINES.length) {
      said.textContent = line.text;
      said.classList.toggle('big', Boolean(line.big));
      said.classList.remove('in');
      void said.offsetWidth;
      said.classList.add('in');
    } else said.textContent = '';
    comment.hidden = index !== LINES.length;
    if (index === LINES.length) save(WATCHED_KEY, true); // watched to its end: it leaves the feed
    paid.hidden = index < PAID_FROM;
    if (!next.hidden) {
      if (document.activeElement === next) main.focus({ preventScroll: true }); // (the focus does not go with it)
      next.hidden = true;
    }
    progress.style.transform = `scaleX(${(index + 1) / STEPS})`;
  }
  const advance = () => say(at + 1 >= STEPS ? 0 : at + 1);

  // Swipe up, scroll, or a key, for the next line. Not quicker than a line can start.
  let last = -Infinity; // (the first swipe always counts, however soon after the screen came up)
  const go = () => {
    const now = performance.now();
    if (now - last < 450) return;
    last = now;
    advance();
  };
  let wheel = 0;
  life.on(main, 'wheel', (event) => {
    event.preventDefault();
    wheel = Math.max(0, wheel + event.deltaY);
    if (wheel > 40) {
      wheel = 0;
      go();
    }
  }, { passive: false });
  let from = null;
  life.on(main, 'touchstart', (event) => { from = event.touches[0].clientY; }, { passive: true });
  life.on(main, 'touchmove', (event) => { if (from !== null) event.preventDefault(); }, { passive: false });
  life.on(main, 'touchend', (event) => {
    const up = from === null ? 0 : from - event.changedTouches[0].clientY;
    from = null;
    if (up > 30) go();
  });
  life.on(document, 'keydown', (event) => { // (anywhere on the screen: whatever has the focus, so long as it is not a thing to press)
    if (event.target.closest?.('button, a, input, textarea')) return;
    if (['ArrowDown', 'ArrowUp', ' ', 'PageDown', 'Enter'].includes(event.key)) {
      event.preventDefault();
      go();
    }
  });
  next.addEventListener('click', go);

  // Share: the phone's own share sheet, with the reel's address. Where there is none (a computer, mostly), the address
  // is copied, and a short line beside the rail says so; where it cannot be copied either, the line is the address.
  const share = root.querySelector('#reel-share');
  const shared = root.querySelector('#reel-shared');
  const address = `${location.origin}/?reel`;
  let sharedTimer = 0;
  const tell = (words) => {
    shared.textContent = words;
    clearTimeout(sharedTimer);
    sharedTimer = life.setTimeout(() => { shared.textContent = ''; }, 4000);
  };
  share.addEventListener('click', async () => {
    const what = { title: 'marcus.pell', text: 'Real talk about who gets to climb 🪜', url: address };
    if (navigator.share && (!navigator.canShare || navigator.canShare(what))) {
      try {
        await navigator.share(what);
      } catch { /* put away without sharing: nothing to say */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      tell('Link copied');
    } catch {
      tell(address);
    }
  });

  // His caption: its first line, and "more" for the rest (where the #ad is).
  more.addEventListener('click', () => {
    const open = !cap.classList.contains('open');
    cap.classList.toggle('open', open);
    main.classList.toggle('captioned', open);
    cap.querySelector('.reel-cap-rest').hidden = !open;
    cap.querySelector('.reel-cap-dots').hidden = open;
    more.textContent = open ? 'less' : 'more';
    more.setAttribute('aria-expanded', String(open));
  });

  // --- Alive: breathing, blinking, a nod with the words, a camera held in a hand -----------------
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  const t0 = performance.now();
  let blinkAt = -9;
  let nextBlink = 1.5;
  let tellAt = -9;
  let nextTell = 4;
  function frame(now) {
    if (life.over) return;
    const t = Math.max(0, (now - t0) / 1000);
    // His mouth follows the syllables he is saying: open by the vowel, shut between them.
    let open = 0;
    let talking = false;
    let sincere = 0;
    let wink = 0;
    if (speech) {
      const tau = now / 1000 - speech.start;
      talking = tau > -0.05 && tau < speech.planned.end + 0.1;
      const one = speech.planned.syl.find((s) => tau >= s.at && tau < s.at + s.dur);
      if (one) open = (VOWEL[one.v] || VOWEL.e)[2] * Math.sin(Math.PI * Math.min(1, ((tau - one.at) / one.dur) * 1.3)) ** 0.6;
      if (speech.line.sincere) sincere = ease((tau + 0.2) / 0.5);
      if (speech.line.wink) {
        const w = tau - speech.planned.end;
        if (w > -0.15 && w < 0.75) wink = ease((w + 0.15) / 0.12) * (1 - ease((w - 0.6) / 0.15));
      }
    }
    parts.mouth.setAttribute('d', mouthPath(open));
    const lift = (3 + sincere * 5) * 0.4;
    parts.browL.style.transform = `translateY(${-lift}px) rotate(${-4 - sincere * 6}deg)`;
    parts.browR.style.transform = `translateY(${-lift}px) rotate(${4 + sincere * 6}deg)`;
    const breath = Math.sin(t * 1.4) * 0.5 + 0.5;
    parts.torso.style.transform = `translateY(${-breath * 2}px)`;
    parts.head.style.transform = `translateY(${-breath * 2.6 + (open * 2.4 + Math.sin(t * 0.7) * 1.2) * 0.6}px) rotate(${Math.sin(t * 0.45) * 1.6}deg)`;
    cam.style.transform = `translate(${Math.sin(t * 0.37) * 3}px, ${Math.sin(t * 0.51 + 1) * 2.4}px) rotate(${Math.sin(t * 0.29) * 0.5}deg) scale(1.03)`;
    parts.arm.style.transform = `translate(${Math.sin(t * 0.37) * -2}px, ${Math.sin(t * 0.51 + 1) * -1.6}px)`;
    // His tell, only in the quiet between lines: he looks down, and hauls his lower section up.
    if (t > nextTell && !talking) {
      tellAt = t;
      nextTell = t + 6 + Math.random() * 5;
      sounds.score.tell();
    }
    const k = t - tellAt;
    const g = k < 0.25 ? ease(k / 0.25) : k < 0.9 ? 1 : 1 - ease((k - 0.9) / 0.25);
    for (const pupil of parts.pupils) pupil.style.transform = `translate(0px, ${7 * g}px)`;
    parts.base.style.transform = `translateY(${-58 * g}px)`;
    if (t > nextBlink) {
      blinkAt = t;
      nextBlink = t + 2.2 + Math.random() * 3.4;
    }
    const b = t - blinkAt;
    const shut = b < 0.07 ? b / 0.07 : b < 0.18 ? 1 - (b - 0.07) / 0.11 : 0;
    parts.lids[0].style.transform = `scaleY(${Math.max(shut, wink)})`;
    parts.lids[1].style.transform = `scaleY(${shut})`;
    requestAnimationFrame(frame);
  }
  if (!still) requestAnimationFrame(frame);
  else life.setInterval(() => { // drawn at rest; only his mouth moves, with what he says
    if (!speech) return;
    const tau = performance.now() / 1000 - speech.start;
    const one = speech.planned.syl.find((s) => tau >= s.at && tau < s.at + s.dur);
    parts.mouth.setAttribute('d', mouthPath(one ? 0.6 : 0));
  }, 80);

  main.focus({ preventScroll: true });
}
