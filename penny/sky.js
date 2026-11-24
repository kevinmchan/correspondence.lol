// The night sky (/?sky). No words.
//
// It began as a picture: five lights on black. The screen opens on that
// picture and nothing else, and the lights come out one at a time, in the
// order they are read, each with its note. After that it is a sky, and yours.
// What a hand leaves in it depends on one thing only, as in scene two
// (penny/slow.js): how fast it is going.
//
//   A tap: a point of light. Short and bright, and gone after three.
//   Still: a star, growing for as long as the finger is held, up to the size
//     of the picture's big one. The bigger, the nearer: louder, fuller,
//     longer. It comes round again in its own time, fainter each time.
//   Slow: small stars sown along the way; the slower, the bigger.
//   Fast: a shooting star. Thin, straight, and gone almost as it is made.
//
// How high a light is, is its pitch, so the sky can be played like a harp
// stood on end; a light that is touched rings. The picture's five are read
// together once to each turn of the sky, never quite the same way twice, and
// under them the night holds the game's four chords, one a turn: the notes of
// the lights do not change, and what is under them does. (The rules are in
// penny/stars.js and the sounds in penny/chimes.js.)
//
// Whoever stays sees more. The faint stars were always there: they cannot be
// seen until eyes have had time to get used to the dark, which takes a minute
// and a half of nothing being rushed. A rush puts them out again for a while.
// Once they are all out, the faintest of them can just be heard.
//
// Penny stands at the bottom edge, as everywhere, and looks up with you. It
// holds its breath while a star is grown, is glad of each one in proportion
// to it, starts at a shooting star, and shuts its eyes to listen when the
// sky has been left alone a while. Whoever is caught waiting is shown, as in
// the film: Penny looks out, and a fingertip of light holds still in an empty
// part of the sky until a star has grown under it. That one fades; it was
// only to show.

import { audio, holdMusic } from '/postmarks/sound.js';
import { claim as callPal } from './pal.js';
import { MM, WONDER, hasDot } from './penny.js';
import { createChimes } from './chimes.js';
import {
  ECHO, FAST, LIGHT, NIGHT, OUT, PENNY_AT, PICTURE, SKY, SPECK, STEP, TALL, TAP_MS, TURN,
  frame, grown, halfWidth, heldFor, keeps, nearness, noteOf, outline, period, reading, rowOf, sizeOf, slowness, soundOf, sown,
} from './stars.js';

// What a light sounds like can be seen: the ring that spreads from it, and its
// glow while it rings, are the colour of its note. One of the game's colours
// for each of the five: C D E G A.
const COLOURS = [[248, 217, 90], [124, 196, 106], [240, 138, 118], [154, 211, 247], [243, 179, 230]];
const WHITE = [222, 222, 222]; // LIGHT, as numbers

const STEP_MS = STEP * 1000;
const TURN_MS = TURN * STEP_MS;
const ECHO_MS = ECHO * STEP_MS;
const AHEAD = 200; // sounds are written onto the engine's clock this far ahead of time
const MOST = 26; // how many lights a hand can have sounding at once: after that the faintest goes out
const SLOP = 12; // how far a finger may wander and still count as still, in pixels
const STILL_MS = 380; // how long a moving finger has to stop for before a star starts under it (as in scene two)
const DARK_MS = 95000; // how long eyes take to get used to the dark
const NEEDLE = 0.0006; // how thick the very tip of a star's point is, as a share of the picture's side

// The same chances in the same order from the same seed: the faint stars are
// scattered with these, so the sky is one sky however the window changes.
function chancesFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A soft round glow of one colour, to be drawn at any size.
function glowOf([r, g, b]) {
  const sheet = document.createElement('canvas');
  sheet.width = 128;
  sheet.height = 128;
  const ink = sheet.getContext('2d');
  const fall = ink.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, alpha] of [[0, 0.9], [0.12, 0.5], [0.3, 0.2], [0.6, 0.05], [1, 0]]) fall.addColorStop(stop, `rgb(${r} ${g} ${b} / ${alpha})`);
  ink.fillStyle = fall;
  ink.fillRect(0, 0, 128, 128);
  return sheet;
}

export function mount(root, life) {
  document.title = 'Night sky · correspondence.lol';
  const main = root.querySelector('.sky');
  const view = root.querySelector('.sky-view');
  const tip = root.querySelector('.sky-tip');
  const said = root.querySelector('#sky-said');
  const pen = view.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rest = (ms) => new Promise((done) => life.setTimeout(done, ms));

  // The strip at the top of a phone takes the sky's colour while the sky is up.
  const bar = document.querySelector('meta[name="theme-color"]');
  const barWas = bar?.content;
  if (bar) bar.content = SKY;
  life.onEnd(() => { if (bar?.content === SKY) bar.content = barWas; });

  // --- Sound -------------------------------------------------------------------------
  // The app's own music stands aside. The sky's sounds need the engine awake,
  // which takes a first touch: until then everything happens in silence.
  holdMusic(true);
  let chimes = null;
  function sounds() {
    const live = audio();
    if (!live) return null;
    chimes ??= createChimes(live.ctx, live.mix);
    return chimes;
  }
  life.onEnd(() => {
    holdMusic(false);
    chimes?.end();
  });

  // --- Time --------------------------------------------------------------------------
  // The sky does not go on without you: time spent with the page out of sight
  // is not counted, and it picks up where it was.
  let lost = 0;
  const now = () => performance.now() - lost;

  // --- The lights ---------------------------------------------------------------------
  // The picture's five, and after them whatever a hand has made. Each has a
  // place in the picture's own units (so it stays put with the picture when
  // the window changes), a row, which is its pitch, and a size. `level` is how
  // much of itself it still has; `shown` how far it has come out (the
  // picture's are not there until they first sound); `flare` how brightly it
  // is ringing this moment.
  const picture = PICTURE.map((light) => ({
    ...light, fixed: true, row: rowOf(light.y), size: light.kind === 'star' ? sizeOf(light.a) : 0,
    level: 1, shown: still ? 1 : 0, arrived: still, flare: 0, rung: -1e9,
  }));
  const lights = [...picture];
  const embers = []; // lights that have gone out: still up there, small and silent, for the rest of the visit
  const shows = []; // lights about to be seen sounding: [{ at, light, strength, echo }]
  const ripples = []; // the rings spreading from the ones that have
  const streaks = []; // shooting stars
  const trails = []; // the scratch a fast finger leaves, gone almost as it is made
  let lit = still ? picture.length : 0;

  function shape(light) {
    if (light.kind === 'dot') {
      light.r = SPECK;
    } else {
      light.a = halfWidth(light.size);
      light.b = light.a * TALL;
    }
  }
  const sounding = (light) => !light.fixed && !light.ghost && !light.growing && light.goneAt == null;
  function count() {
    main.dataset.made = String(lights.filter(sounding).length);
  }
  const say = (text) => { said.textContent = text; };
  const tell = (light) => say(light.kind === 'dot' ? 'A point of light.' : light.size < 0.3 ? 'A small star.' : light.size < 0.85 ? 'A star.' : 'A big star.');

  // --- The window -----------------------------------------------------------------
  let wide = 0;
  let high = 0;
  let dense = 1;
  let place = { x: 0, y: 0, side: 1 };
  const spot = (light) => [place.x + light.x * place.side, place.y + light.y * place.side]; // where on the screen
  const unspot = (px, py) => [(px - place.x) / place.side, (py - place.y) / place.side];
  const panOf = (px) => ((px - place.x) / place.side - 0.5) * 1.5;
  // where in the window, for Penny's eyes
  const inWindow = (px, py) => {
    const box = main.getBoundingClientRect();
    return { x: box.left + px, y: box.top + py };
  };

  // The faint ones, scattered once over far more sky than any window shows.
  const seed = Math.floor(Math.random() * 2 ** 32);
  const scatter = chancesFrom(seed);
  const farAll = [];
  for (let i = 0; i < 2600; i++) {
    const bright = scatter() ** 2.6; // most of them are very faint
    farAll.push({
      x: -1.5 + scatter() * 4, y: -1.5 + scatter() * 4, bright,
      when: (1 - bright) ** 0.8 * 0.92, // the brightest are the first to be seen
      depth: 0.15 + scatter() * 0.35, beat: 0.0006 + scatter() * 0.0022, phase: scatter() * 6.283, spark: 0,
    });
  }
  let far = []; // those of them in the window
  let band = null; // and the band of them that crosses the whole sky, drawn once for the window

  function fit() {
    const box = main.getBoundingClientRect();
    if (!box.width || !box.height || (Math.round(box.width) === wide && Math.round(box.height) === high)) return;
    wide = Math.round(box.width);
    high = Math.round(box.height);
    dense = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.round(wide * dense);
    view.height = Math.round(high * dense);
    place = frame(wide, high);
    far = [];
    for (const one of farAll) {
      const [px, py] = spot(one);
      if (px < -2 || py < -2 || px > wide + 2 || py > high + 2) continue;
      one.px = px;
      one.py = py;
      far.push(one);
    }

    // The band: from the bottom left to the top right, across the line of the
    // picture's stars. A dust of points too faint to be told apart, and a
    // glow where they are thickest.
    const chance = chancesFrom(seed ^ 0x9e3779b9);
    const bell = () => (chance() + chance() + chance() + chance() - 2) / 2; // near the middle more often than not
    band = document.createElement('canvas');
    band.width = view.width;
    band.height = view.height;
    const ink = band.getContext('2d');
    ink.scale(dense, dense);
    const [cx, cy] = spot({ x: 0.5, y: 0.5 });
    const [ax, ay] = [Math.cos(-0.66), Math.sin(-0.66)];
    const along = (far0, across) => [cx + ax * far0 * place.side - ay * across * place.side, cy + ay * far0 * place.side + ax * across * place.side];
    for (let i = 0; i < 170; i++) {
      const [x, y] = along((chance() - 0.5) * 3.4, bell() * 0.09);
      const reach = place.side * (0.09 + chance() * 0.15);
      if (x < -reach || y < -reach || x > wide + reach || y > high + reach) continue;
      const fall = ink.createRadialGradient(x, y, 0, x, y, reach);
      fall.addColorStop(0, 'rgb(176 186 222 / 0.02)');
      fall.addColorStop(1, 'rgb(176 186 222 / 0)');
      ink.fillStyle = fall;
      ink.fillRect(x - reach, y - reach, reach * 2, reach * 2);
    }
    ink.fillStyle = LIGHT;
    for (let i = 0; i < 5200; i++) {
      const [x, y] = along((chance() - 0.5) * 3.4, bell() * 0.16);
      const alpha = 0.05 + chance() ** 3 * 0.4;
      const half = 0.3 + chance() * 0.4;
      if (x < 0 || y < 0 || x > wide || y > high) continue;
      ink.globalAlpha = alpha;
      ink.fillRect(x - half, y - half, half * 2, half * 2);
    }
  }
  fit();
  life.on(window, 'resize', fit);

  // --- A light sounding ------------------------------------------------------------
  // It is heard at `at`, and seen then too: it flares, a ring spreads from it,
  // and it flares again, fainter, with each echo.
  function ring(light, at = now(), level = light.level, { byHand = false } = {}) {
    const pan = (light.x - 0.5) * 1.5;
    const sound = (live, when) => {
      if (light.kind === 'dot') live.dot(when, { freq: soundOf(light), level, pan });
      else live.star(when, { freq: soundOf(light), near: nearness(light), level, pan });
    };
    const live = sounds();
    if (live) {
      sound(live, live.ctx.currentTime + Math.max(0, at - now()) / 1000);
    } else if (byHand) {
      // the very first touch: the engine is still waking. As soon as it has
      // (and if that takes too long, the moment has passed: let it go).
      const late = (ms, otherwise) => life.setTimeout(() => {
        const woken = sounds();
        if (woken) sound(woken, woken.ctx.currentTime);
        else otherwise?.();
      }, ms);
      late(160, () => late(260));
    }
    shows.push({ at, light, strength: level });
    if (!still) {
      const farOff = 1 - nearness(light) * 0.6; // what is far is mostly echo
      shows.push({ at: at + ECHO_MS, light, strength: level * 0.42 * farOff, echo: true });
      shows.push({ at: at + ECHO_MS * 2, light, strength: level * 0.18 * farOff, echo: true });
    }
    light.rung = at;
  }

  // --- The turning of the sky ----------------------------------------------------------
  // Each turn: the night's next chord, and the picture read through once.
  let turn = -1;
  let turnAt = 0;
  let chord = NIGHT[0];
  let bedUntil = 0; // when, on the engine's clock, the chord now held will have gone
  const score = []; // what is written for the turn: [{ at, light, level }]
  const airNow = [...NIGHT[0].air]; // the colour low in the sky, on its way to the chord's own
  function bed(seconds) {
    const live = sounds();
    if (!live || seconds < 2) return;
    live.night(live.ctx.currentTime + 0.05, chord.under, seconds);
    bedUntil = live.ctx.currentTime + seconds;
  }
  function begin(at) {
    turn += 1;
    turnAt = at;
    chord = NIGHT[turn % NIGHT.length];
    score.push({ at, bed: true });
    // the first time, as it is written; after that, however it comes
    for (const note of reading(turn === 0 ? 0 : Math.random())) {
      const loose = turn === 0 || still ? 0 : (Math.random() - 0.5) * 36; // played, not triggered
      score.push({ at: at + note.step * STEP_MS + loose, light: picture[note.index], level: note.level * (turn === 0 ? 1 : 0.88 + Math.random() * 0.2) });
    }
  }
  // When a light made by hand next comes round: on the grid everything keeps to.
  const dueAfter = (light, from) => turnAt + Math.round((from + period(light) * STEP_MS - turnAt) / STEP_MS) * STEP_MS;

  let awake = Boolean(audio());
  let dark = 0; // how used to the dark eyes are: 0 to 1
  let reached = 0; // the most they have been
  let hurry = 0; // how much of a rush it has been lately
  let rushed = false;
  let nextGlint = 0;
  let nextStreak = now() + 55000 + Math.random() * 30000;
  let lastTick = now();
  begin(now() + 600);

  function tick() {
    if (document.hidden) return;
    let t = now();
    if (t - lastTick > 1500) { // the page was held up: carry on from where it was, without a rush to catch up
      lost += t - lastTick - 40;
      t = now();
    }
    lastTick = t;

    // The first touch has woken the engine. The sky answers: the night comes
    // in under it, and the picture is read again from the start, aloud.
    if (!awake && sounds()) {
      awake = true;
      score.length = 0;
      turn -= 1;
      begin(t + 700);
    }

    if (t + AHEAD >= turnAt + TURN_MS) begin(turnAt + TURN_MS);
    for (let i = 0; i < score.length;) {
      const note = score[i];
      if (note.at > t + AHEAD) {
        i += 1;
        continue;
      }
      score.splice(i, 1);
      if (note.bed) bed(TURN * STEP);
      else ring(note.light, note.at, note.level);
    }

    // what a hand has made comes round in its own time, fainter, and at last goes out
    for (const light of lights) {
      if (!sounding(light) || light.due == null || light.due > t + AHEAD) continue;
      light.level *= keeps(light);
      if (light.level < OUT) {
        light.goneAt = light.due;
        continue;
      }
      ring(light, light.due);
      light.due += period(light) * STEP_MS;
    }

    // for whoever has stayed: one of the faint ones, heard
    if (dark > 0.6 && !rushed && t >= nextGlint && far.length) {
      nextGlint = t + 1200 + Math.random() * 3400;
      const seen = far.filter((one) => one.bright > 0.22 && one.when < dark - 0.12);
      const one = seen[Math.floor(Math.random() * seen.length)];
      if (one) {
        if (!still) one.spark = 1;
        const live = sounds();
        const freq = Math.min(4200, soundOf({ kind: 'dot', row: rowOf(one.y) }) * 2);
        live?.glint(live.ctx.currentTime, { freq, pan: (one.x - 0.5) * 1.5, level: (dark - 0.6) / 0.4 });
      }
    }
    // and, now and then, one that falls
    if (dark > 0.4 && t >= nextStreak && hands.size === 0 && !still) {
      nextStreak = t + 50000 + Math.random() * 70000;
      const fromLeft = Math.random() < 0.5;
      shoot(wide * (fromLeft ? 0.1 + Math.random() * 0.3 : 0.6 + Math.random() * 0.3), high * (0.06 + Math.random() * 0.2), (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.4, 1.5);
    }
  }
  life.setInterval(tick, 40);

  // --- Penny --------------------------------------------------------------------------
  const pal = callPal(life, { x: PENNY_AT, height: 'low', mood: 'calm', dot: hasDot() });
  const hands = new Map(); // the fingers on the sky (and the keyboard's one)
  let feeling = 0; // which feeling is the latest: an older one's ending does not undo a newer
  let asleep = false;
  let touched = false;
  let lastTouch = now();
  let firstStar = true;
  const growing = () => [...hands.values()].some((hand) => hand.mode === 'hold');
  function calm() {
    feeling += 1;
    pal.mood(rushed ? 'unsure' : 'calm').look(inWindow(...spot(picture[2]))).settle('peek');
  }
  function feel(mood, { gesture, back = 1800 } = {}) {
    const mine = ++feeling;
    pal.mood(mood);
    if (gesture) pal.gesture(gesture);
    if (back) life.setTimeout(() => { if (mine === feeling && !growing()) calm(); }, back);
  }
  // A light has sounded: its eyes go to it. And when the sky has been left
  // alone a while, the picture's big star is something to shut them for.
  function heard(light) {
    if (growing() || asleep) return;
    const at = inWindow(...spot(light));
    pal.look(at).look(at, 'dot');
    if (light === picture[4] && now() - lastTouch > 25000) feel('listening', { back: 5200 });
  }
  pal.onTap(() => {
    pal.gesture('hop');
    pal.sing(MM, 0.6);
  });
  life.setTimeout(() => { if (!growing()) calm(); }, 900);
  // No touch yet, so no sound: its seal beats slowly, the sign that there is something to hear.
  let beat = false;
  life.setInterval(() => {
    if (awake || asleep) return;
    beat = !beat;
    pal.glow(beat ? 0.95 : 0.15, 1100);
  }, 1100);
  // Left alone long enough, it sleeps.
  life.setInterval(() => {
    if (asleep || hands.size || now() - lastTouch < 150000) return;
    asleep = true;
    feeling += 1;
    pal.mood('sleepy').look(null).settle('peek');
  }, 5000);

  // --- The hand -------------------------------------------------------------------------
  // The light under a point of the screen, if there is one near enough to count as touched.
  function under(px, py) {
    let best = null;
    let nearest = Infinity;
    for (const light of lights) {
      if (light.ghost || light.growing || light.goneAt != null || light.shown < 0.5) continue;
      const [lx, ly] = spot(light);
      const reach = Math.max(18, (light.kind === 'star' ? light.a * 0.62 : light.r * 1.5) * place.side);
      const off = Math.hypot(px - lx, py - ly);
      if (off <= reach && off < nearest) {
        best = light;
        nearest = off;
      }
    }
    return best;
  }
  const room = (px, py) => lights.every((light) => light.ghost || Math.hypot(px - spot(light)[0], py - spot(light)[1]) > place.side * 0.05);

  function make(kind, px, py, size = 0, more = {}) {
    const [x, y] = unspot(px, py);
    const light = { kind, x, y, size, row: rowOf(y), fixed: false, level: 1, shown: 1, flare: 0, rung: -1e9, due: null, ...more };
    shape(light);
    lights.push(light);
    // too many at once: the faintest goes out now, to make room
    const live = lights.filter(sounding);
    if (live.length > MOST) live.reduce((faint, one) => (one.level < faint.level ? one : faint)).goneAt = now();
    return light;
  }

  // A shooting star, from a point of the screen, along a heading, at a speed in pixels a millisecond.
  function shoot(px, py, heading, speed) {
    const pace = Math.min(2.6, Math.max(1.1, speed * 1.15));
    const ms = 430 + Math.random() * 170;
    streaks.push({ x: px, y: py, dx: Math.cos(heading), dy: Math.sin(heading), pace, at: now(), ms });
    const endX = px + Math.cos(heading) * pace * ms;
    const live = sounds();
    live?.streak(live.ctx.currentTime, { from: panOf(px), to: panOf(endX), falling: Math.sin(heading) >= 0, seconds: ms / 1000 });
    say('A shooting star.');
    if (asleep) return;
    feel('surprised', { gesture: 'start', back: 1500 });
    pal.look(inWindow(endX, py + Math.sin(heading) * pace * ms));
  }

  function press(id, px, py) {
    const t = now();
    touched = true;
    lastTouch = t;
    if (asleep) { // woken
      asleep = false;
      pal.gesture('start');
      calm();
    }
    const hand = { id, x: px, y: py, from: [px, py], at: t, movedAt: t, mode: 'down', base: 0, light: null, voice: null, speed: 0, heading: 0, way: 0, sowed: 0, row: 0 };
    hands.set(id, hand);
    hurry += 0.22;
    // a light that is there, touched, rings; and held, one of yours grows
    const on = under(px, py);
    if (!on) return;
    hand.light = on;
    if (on.fixed) {
      hand.mode = 'spent';
    } else {
      on.level = 1; // it has been tended
      on.due = dueAfter(on, t);
      hand.base = on.kind === 'star' ? heldFor(on.size) - TAP_MS : 0;
    }
    ring(on, t, 1, { byHand: true });
  }

  // A star is finished: the finger has lifted, or wandered off, or the star is as big as they come.
  function finish(hand) {
    const light = hand.light;
    const t = now();
    hand.voice?.end();
    hand.voice = null;
    hand.light = null;
    hand.mode = 'spent';
    light.growing = false;
    light.level = 1;
    light.due = dueAfter(light, t);
    ring(light, t, 1, { byHand: true });
    count();
    tell(light);
    // Penny is glad of it in proportion to it
    if (light.size < 0.3) feel('glad', { gesture: 'nod', back: 1500 });
    else if (light.size < 0.85) feel('warm', { gesture: 'hop', back: 2200 });
    else {
      feel('thrilled', { gesture: 'jump', back: 2800 });
      pal.hearts(1);
    }
    if (firstStar) { // the first one it has seen made
      firstStar = false;
      life.setTimeout(() => pal.sing(WONDER, 0.32), 650); // under its breath
    }
  }

  // Every frame, for each finger that is down.
  function hold(hand, t) {
    if (t - hand.movedAt > 60) hand.speed *= 0.8; // no longer moving: no longer fast
    if (hand.mode === 'drag' && t - hand.movedAt > STILL_MS) {
      // it has stopped: a star starts here, or one of yours that is here grows
      const on = under(hand.x, hand.y);
      hand.mode = 'down';
      hand.from = [hand.x, hand.y];
      hand.at = t - TAP_MS;
      hand.light = on && !on.fixed ? on : null;
      hand.base = hand.light?.kind === 'star' ? heldFor(hand.light.size) - TAP_MS : 0;
      if (on?.fixed) hand.mode = 'spent';
    }
    if (hand.mode === 'down' && t - hand.at >= TAP_MS) {
      hand.mode = 'hold';
      if (!hand.light) {
        hand.light = make('star', hand.from[0], hand.from[1], 0);
      } else if (hand.light.kind === 'dot') {
        hand.light.kind = 'star'; // a dot, held, becomes a star
        hand.light.size = 0;
      }
      hand.light.growing = true;
      hand.light.due = null;
      hand.voice = sounds()?.gather({ freq: soundOf(hand.light), pan: (hand.light.x - 0.5) * 1.5 }) ?? null;
      feeling += 1;
      pal.rise().mood('holding').look(inWindow(...spot(hand.light))); // it holds its breath
    }
    if (hand.mode === 'hold') {
      const size = grown(hand.base + t - hand.at);
      hand.light.size = size;
      shape(hand.light);
      hand.voice?.grow(size);
      if (size >= 1) finish(hand);
    }
  }

  function move(hand, px, py, stamp) {
    const t = stamp - lost;
    const far0 = Math.hypot(px - hand.x, py - hand.y);
    if (far0 < 0.5) return;
    const took = Math.max(1, t - hand.movedAt);
    hand.speed += (far0 / took - hand.speed) * 0.35;
    const from = [hand.x, hand.y];
    hand.x = px;
    hand.y = py;
    if (hand.mode !== 'drag') {
      if (Math.hypot(px - hand.from[0], py - hand.from[1]) <= SLOP) return; // near enough to still
      if (hand.mode === 'hold') finish(hand); // it has moved off: the star is as big as it got
      hand.mode = 'drag';
      hand.light = null;
      hand.sowed = 0;
      hand.row = rowOf(unspot(px, py)[1]);
    }
    hand.movedAt = t;
    hand.heading = Math.atan2(py - from[1], px - from[0]);
    hand.way += far0;
    const slow = slowness(hand.speed);
    const size = sown(slow);
    // a light that is there, run across, rings
    const on = under(px, py);
    if (on && t - on.rung > 450) ring(on, t, Math.max(on.level, 0.5) * 0.8, { byHand: true });
    if (size === null) {
      // a rush: a thin cold scratch, and nothing stays
      hurry += far0 / 420;
      if (!still) trails.push({ x0: from[0], y0: from[1], x1: px, y1: py, at: t });
      return;
    }
    // slowly: small stars are sown along the way, one to each row crossed, and now and then along a row
    hand.sowed += far0;
    const row = rowOf(unspot(px, py)[1]);
    if (hand.sowed < place.side * (row !== hand.row ? 0.045 : 0.17) || on || !room(px, py)) return;
    hand.sowed = 0;
    hand.row = row;
    const light = make('star', px, py, size);
    light.due = dueAfter(light, t);
    ring(light, t, 0.6 + 0.4 * slow, { byHand: true });
    count();
  }

  function release(id, cancelled = false) {
    const hand = hands.get(id);
    if (!hand) return;
    hands.delete(id);
    const t = now();
    lastTouch = t;
    if (hand.mode === 'hold') {
      finish(hand);
    } else if (hand.mode === 'down' && !hand.light && !cancelled) {
      // a tap on empty sky: a point of light, short and bright
      const light = make('dot', hand.from[0], hand.from[1]);
      light.due = dueAfter(light, t);
      ring(light, t, 1, { byHand: true });
      count();
      tell(light);
      if (!asleep && !growing()) {
        const at = inWindow(...spot(light));
        pal.look(at).look(at, 'dot').gesture('hop', 'dot'); // Dot is fond of a dot
      }
    } else if (hand.mode === 'drag' && !cancelled && !still && hand.speed >= FAST * 0.85 && hand.way > 40) {
      shoot(hand.x, hand.y, hand.heading, hand.speed); // flicked: it goes on without you
    }
    hand.voice?.end();
  }

  const where = (event) => {
    const box = main.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  main.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('a, button') || (event.pointerType === 'mouse' && event.button !== 0) || hands.size >= 4) return;
    press(event.pointerId, ...where(event));
  });
  life.on(window, 'pointermove', (event) => {
    const hand = hands.get(event.pointerId);
    if (!hand) return;
    for (const each of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) move(hand, ...where(each), each.timeStamp || event.timeStamp);
  });
  life.on(window, 'pointerup', (event) => release(event.pointerId));
  life.on(window, 'pointercancel', (event) => release(event.pointerId, true));
  main.addEventListener('touchmove', (event) => { if (event.cancelable) event.preventDefault(); }, { passive: false });
  main.addEventListener('contextmenu', (event) => event.preventDefault()); // a long press is a star, not a menu

  // The keyboard: the arrow keys carry a point of light about the sky, and
  // the space bar is a finger put down there. Tapped, a dot; held, a star.
  const STEPS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const key = { on: false, x: 0, y: 0, seen: 0 };
  const keyHere = () => {
    if (key.on) return;
    key.on = true;
    [key.x, key.y] = spot({ x: 0.74, y: 0.25 });
  };
  life.on(window, 'keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = STEPS[event.key];
    if (step) {
      event.preventDefault();
      keyHere();
      key.seen = now();
      // half a row at a time; or, with the space bar down, at a walk, sowing as it goes (with shift, at a rush)
      const hand = hands.get('key');
      const pace = hand ? (event.shiftKey ? 26 : 5) : (place.side / 20) * (event.shiftKey ? 4 : 1);
      key.x = Math.max(6, Math.min(wide - 6, key.x + step[0] * pace));
      key.y = Math.max(6, Math.min(high - 6, key.y + step[1] * pace));
      if (hand) move(hand, key.x, key.y, performance.now());
    } else if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !event.target.closest?.('a, button')) {
      event.preventDefault();
      keyHere();
      key.seen = now();
      if (!hands.has('key')) press('key', key.x, key.y);
    }
  });
  life.on(window, 'keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') release('key');
  });

  // --- Drawing ------------------------------------------------------------------------
  const edge = new Path2D(); // a star, one unit out to each of its points
  outline().forEach(([x, y], i) => (i ? edge.lineTo(x, y) : edge.moveTo(x, y)));
  edge.closePath();
  const glows = COLOURS.map(glowOf);
  const plain = glowOf(WHITE);
  const tintOf = (light) => COLOURS[noteOf(light.row)];
  const shade = (flare) => {
    const v = Math.round(WHITE[0] + (255 - WHITE[0]) * Math.min(1, flare));
    return `rgb(${v} ${v} ${v})`;
  };

  function drawLight(light, t) {
    const [px, py] = spot(light);
    const fade = light.goneAt == null ? 1 : Math.max(0, Math.min(1, 1 - (t - light.goneAt) / 1400)); // going out: it dwindles to a point
    // (how bright it is drawn, 0 to 1: the picture's are at full, yours as much as they have left)
    let alpha = light.shown * (light.fixed ? 1 : 0.4 + 0.6 * Math.min(1, light.level)) * (0.25 + 0.75 * fade);
    if (light.ghost) alpha *= light.level;
    let flare = light.flare;
    if (light.growing) flare = Math.max(flare, still ? 0.25 : 0.24 + 0.08 * Math.sin(t / 170)); // a soft light while it is grown
    const breath = still || light.growing ? 0 : Math.sin(t * 0.0011 + light.x * 40) * 0.012; // at rest it is never quite still
    const swell = (still ? 1 : 1 + flare * 0.13 + breath) * (0.15 + 0.85 * fade) * (still ? 1 : 0.6 + 0.4 * light.shown);
    const tint = glows[noteOf(light.row)];
    if (light.kind === 'dot') {
      const r = light.r * place.side * (still ? 1 : 1 + flare * 0.5) * (0.4 + 0.6 * fade);
      const reach = r * (5 + flare * 9);
      pen.globalAlpha = alpha * (0.05 + flare * 0.55);
      pen.drawImage(tint, px - reach, py - reach, reach * 2, reach * 2);
      pen.globalAlpha = alpha;
      pen.fillStyle = shade(flare);
      pen.beginPath();
      pen.arc(px, py, r, 0, Math.PI * 2);
      pen.fill();
      return;
    }
    const a = light.a * place.side * swell;
    const b = light.b * place.side * swell;
    const reach = b * (1.5 + flare * 1.5);
    pen.globalAlpha = alpha * (0.03 + flare * 0.5);
    pen.drawImage(tint, px - reach, py - reach, reach * 2, reach * 2);
    if (flare > 0.03 && !still) {
      // its points, drawn out long and thin while it rings
      for (const [dx, dy, len] of [[0, 1, b * (1 + flare * 1.5)], [1, 0, a * (1 + flare * 1.5)]]) {
        const ray = pen.createLinearGradient(px - dx * len, py - dy * len, px + dx * len, py + dy * len);
        ray.addColorStop(0, 'rgb(255 255 255 / 0)');
        ray.addColorStop(0.5, `rgb(255 255 255 / ${Math.min(0.9, flare)})`);
        ray.addColorStop(1, 'rgb(255 255 255 / 0)');
        pen.globalAlpha = alpha;
        pen.strokeStyle = ray;
        pen.lineWidth = 1;
        pen.beginPath();
        pen.moveTo(px - dx * len, py - dy * len);
        pen.lineTo(px + dx * len, py + dy * len);
        pen.stroke();
      }
    }
    pen.globalAlpha = alpha;
    pen.fillStyle = shade(flare);
    pen.setTransform(dense * a, 0, 0, dense * b, dense * px, dense * py);
    pen.fill(edge);
    pen.setTransform(dense, 0, 0, dense, 0, 0);
    // In the picture the points never quite thin away to nothing: each is a
    // needle that can be seen all the way to its tip, whatever the star's size.
    pen.strokeStyle = pen.fillStyle;
    pen.lineWidth = Math.max(0.4, place.side * NEEDLE);
    pen.lineCap = 'butt';
    pen.beginPath();
    pen.moveTo(px, py - b);
    pen.lineTo(px, py + b);
    pen.moveTo(px - a, py);
    pen.lineTo(px + a, py);
    pen.stroke();
    if (light.growing) {
      // and a ring round it, so that it can be seen past the finger that is growing it
      pen.globalAlpha = 0.28;
      pen.strokeStyle = `rgb(${tintOf(light).join(' ')})`;
      pen.lineWidth = 1;
      pen.beginPath();
      pen.arc(px, py, b + 12, 0, Math.PI * 2);
      pen.stroke();
    }
  }

  function draw(t, dt) {
    pen.setTransform(dense, 0, 0, dense, 0, 0);
    pen.globalAlpha = 1;
    pen.fillStyle = SKY;
    pen.fillRect(0, 0, wide, high);

    // low in the sky, the colour of the chord the night is holding
    for (let i = 0; i < 3; i++) airNow[i] += (chord.air[i] - airNow[i]) * (1 - Math.exp(-dt / 2600));
    const glow = pen.createLinearGradient(0, high * 0.4, 0, high);
    const colour = airNow.map(Math.round).join(' ');
    glow.addColorStop(0, `rgb(${colour} / 0)`);
    glow.addColorStop(1, `rgb(${colour} / ${dark * 0.36})`); // none at first: the sky starts as the picture's flat black
    pen.fillStyle = glow;
    pen.fillRect(0, high * 0.4, wide, high * 0.6);

    // the band, for whoever has stayed longest
    if (dark > 0.5 && band) {
      const come = (dark - 0.5) / 0.5;
      pen.globalAlpha = come * come * (3 - 2 * come);
      pen.drawImage(band, 0, 0, wide, high);
    }
    // the faint ones: the more of them, the more used to the dark
    pen.fillStyle = LIGHT;
    const grain = Math.max(1, Math.min(1.6, place.side / 560)); // (a little bigger in a big window, or they are lost in it)
    for (const one of far) {
      const come = Math.min(1, (dark - one.when) / 0.12);
      if (come <= 0 && one.spark < 0.02) continue;
      let alpha = Math.max(0, come) * (0.16 + 0.84 * one.bright ** 1.5);
      if (!still) alpha *= 1 - one.depth * (0.5 + 0.5 * Math.sin(t * one.beat + one.phase));
      const half = (0.45 + one.bright * 0.75) * grain + one.spark * 0.8;
      pen.globalAlpha = Math.min(1, alpha + one.spark);
      if (half < 0.85) {
        pen.fillRect(one.px - half, one.py - half, half * 2, half * 2);
      } else { // the brighter ones are round
        pen.beginPath();
        pen.arc(one.px, one.py, half * 1.1, 0, Math.PI * 2);
        pen.fill();
      }
      if (one.spark > 0.02) {
        pen.globalAlpha = one.spark * 0.5;
        pen.drawImage(plain, one.px - 9, one.py - 9, 18, 18);
        one.spark *= Math.exp(-dt / 500);
      }
    }
    // and what has gone out: still there
    pen.globalAlpha = 0.5;
    for (const ember of embers) {
      const [px, py] = spot(ember);
      pen.fillRect(px - 0.9, py - 0.9, 1.8, 1.8);
    }

    // the rings spreading from what has sounded
    for (const ripple of ripples) {
      const { light } = ripple;
      const near = nearness(light);
      const span = ripple.echo ? 1100 : 1500 + near * 1500;
      const part = (t - ripple.at) / span;
      if (part >= 1) continue;
      const [px, py] = spot(light);
      const start = (light.kind === 'star' ? light.a * 0.6 : light.r * 2) * place.side;
      const radius = start + part ** 0.6 * place.side * (0.07 + near * 0.2) * (ripple.echo ? 0.7 : 1);
      pen.globalAlpha = Math.min(1, ripple.strength) * (1 - part) ** 2 * 0.6;
      pen.strokeStyle = `rgb(${tintOf(light).join(' ')})`;
      pen.lineWidth = 1.2;
      pen.beginPath();
      pen.arc(px, py, radius, 0, Math.PI * 2);
      pen.stroke();
    }

    // a fast finger's scratch
    pen.lineCap = 'butt';
    for (const trail of trails) {
      pen.globalAlpha = Math.max(0, 1 - (t - trail.at) / 420) * 0.7;
      pen.strokeStyle = 'rgb(154 211 247)';
      pen.lineWidth = 1;
      pen.beginPath();
      pen.moveTo(trail.x0, trail.y0);
      pen.lineTo(trail.x1, trail.y1);
      pen.stroke();
    }
    // shooting stars: a bright head, and a tail that thins away behind it
    for (const streak of streaks) {
      const age = t - streak.at;
      const gone = Math.min(age, streak.ms) * streak.pace;
      const tail = Math.min(gone, streak.pace * 190);
      const [hx, hy] = [streak.x + streak.dx * gone, streak.y + streak.dy * gone];
      const [tx, ty] = [hx - streak.dx * tail, hy - streak.dy * tail];
      const dying = age > streak.ms ? Math.max(0, 1 - (age - streak.ms) / 320) : 1;
      if (tail > 1) {
        const line = pen.createLinearGradient(tx, ty, hx, hy);
        line.addColorStop(0, 'rgb(222 222 222 / 0)');
        line.addColorStop(0.7, 'rgb(236 240 255 / 0.5)');
        line.addColorStop(1, 'rgb(255 255 255 / 1)');
        pen.globalAlpha = dying;
        pen.strokeStyle = line;
        pen.lineCap = 'round';
        pen.lineWidth = 2.2;
        pen.beginPath();
        pen.moveTo(tx, ty);
        pen.lineTo(hx, hy);
        pen.stroke();
        pen.lineCap = 'butt';
      }
      pen.globalAlpha = dying;
      pen.drawImage(plain, hx - 20, hy - 20, 40, 40);
    }

    // the lights themselves
    for (const light of lights) if (light.shown > 0) drawLight(light, t);

    // where a finger is: a breath of light under it
    for (const hand of hands.values()) {
      if (hand.id === 'key') continue;
      pen.globalAlpha = 0.16;
      pen.drawImage(plain, hand.x - 30, hand.y - 30, 60, 60);
    }
    // and where the keyboard's point of light is
    if (key.on && (hands.has('key') || t - key.seen < 9000)) {
      pen.globalAlpha = 0.7;
      pen.strokeStyle = LIGHT;
      pen.lineWidth = 1;
      pen.beginPath();
      pen.arc(key.x, key.y, 11, 0, Math.PI * 2);
      pen.stroke();
      pen.globalAlpha = 0.4;
      pen.drawImage(plain, key.x - 16, key.y - 16, 32, 32);
    }
    pen.globalAlpha = 1;
  }

  // --- Every frame ----------------------------------------------------------------------
  let lastFrame = now();
  let lastDrawn = 0;
  let darkShown = -1;
  function each() {
    if (life.over) return;
    requestAnimationFrame(each);
    if (document.hidden || !wide) return;
    const t = now();
    const dt = Math.min(64, Math.max(0, t - lastFrame));
    lastFrame = t;

    // what is due to be seen sounding
    for (let i = shows.length - 1; i >= 0; i--) {
      const show = shows[i];
      if (show.at > t) continue;
      shows.splice(i, 1);
      const { light } = show;
      if (!lights.includes(light)) continue; // it has gone out since
      if (light.fixed && !light.arrived) { // one of the picture's, come out
        light.arrived = true;
        lit += 1;
        main.dataset.lit = String(lit);
      }
      light.flare = Math.max(light.flare, Math.min(1, show.strength));
      if (!still) ripples.push({ light, at: t, strength: show.strength, echo: show.echo });
      if (!show.echo) heard(light);
    }

    for (const hand of hands.values()) hold(hand, t);

    for (let i = lights.length - 1; i >= 0; i--) {
      const light = lights[i];
      light.flare *= Math.exp(-dt / (still ? 900 : 380 + nearness(light) * 520));
      if (light.arrived && light.shown < 1) light.shown = Math.min(1, light.shown + dt / 800);
      if (light.ghost && !light.growing) light.level = Math.max(0, light.level - dt / 2600); // only shown: it fades right away
      const over = light.ghost ? !light.growing && light.level <= 0 : light.goneAt != null && t - light.goneAt > 1400;
      if (!over) continue;
      lights.splice(i, 1);
      if (!light.ghost) {
        embers.push({ x: light.x, y: light.y });
        if (embers.length > 160) embers.shift();
        count();
      }
    }
    for (const list of [ripples, trails, streaks]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const age = t - list[i].at;
        if (age > (list === trails ? 420 : list === streaks ? list[i].ms + 320 : 3200)) list.splice(i, 1);
      }
    }

    // A rush puts the faint stars out for a while; nothing rushed, and they
    // come back, quickly to where they were, and slowly past it.
    hurry *= Math.exp(-dt / 1600);
    const was = rushed;
    rushed = hurry > 1 ? true : hurry < 0.35 ? false : rushed;
    if (rushed) dark += (reached * 0.2 - dark) * (1 - Math.exp(-dt / 700));
    else dark = Math.min(1, dark + dt / (dark < reached ? 9000 : DARK_MS));
    reached = Math.max(reached, dark);
    if (rushed !== was) {
      main.dataset.pace = rushed ? 'fast' : 'slow';
      if (!asleep && !growing()) {
        if (rushed) feel('unsure', { gesture: 'shake', back: 0 }); // it winces at a rush
        else calm();
      }
    }
    if (Math.floor(dark * 10) !== darkShown) {
      darkShown = Math.floor(dark * 10);
      main.dataset.dark = String(darkShown);
    }

    // At rest the sky changes slowly, and is drawn a third as often: a phone
    // left looking at it should not be kept busy.
    const stirring = hands.size || ripples.length || streaks.length || trails.length || (key.on && t - key.seen < 9000)
      || lights.some((light) => light.flare > 0.02 || light.growing || light.ghost || light.goneAt != null || (light.arrived && light.shown < 1));
    if (!stirring && t - lastDrawn < 48) return;
    draw(t, Math.min(64, t - lastDrawn));
    lastDrawn = t;
  }
  requestAnimationFrame(each);

  // --- Shown how, if caught waiting --------------------------------------------------
  // Penny looks out at you, and then up; a fingertip of light holds still in
  // an empty part of the sky, and a star grows under it for as long as it
  // does. Until the first touch, and not after.
  async function illustrate() {
    if (touched || life.over) return;
    if (document.hidden || asleep) {
      life.setTimeout(illustrate, 4000);
      return;
    }
    feeling += 1;
    pal.rise().mood('hopeful').look(null).gesture('wiggle');
    await rest(1100);
    if (touched || life.over) {
      if (!growing()) calm();
      return;
    }
    const [px, py] = spot({ x: 0.74, y: 0.25 });
    pal.look(inWindow(px, py));
    tip.style.translate = `${px}px ${py}px`;
    tip.classList.add('on');
    await rest(still ? 300 : 700);
    if (touched || life.over) {
      tip.classList.remove('on');
      if (!growing()) calm();
      return;
    }
    const ghost = make('star', px, py, 0, { ghost: true, growing: true });
    const voice = sounds()?.gather({ freq: soundOf(ghost), pan: (ghost.x - 0.5) * 1.5 });
    pal.mood('holding');
    const began = now();
    const length = 1700;
    await new Promise((done) => {
      const grow = () => {
        const held = now() - began;
        if (touched || life.over || held >= length) return done();
        ghost.size = grown(TAP_MS + (still ? length : held));
        shape(ghost);
        voice?.grow(ghost.size);
        requestAnimationFrame(grow);
      };
      grow();
    });
    voice?.end();
    tip.classList.remove('on');
    ghost.growing = false;
    if (touched || life.over) {
      ghost.level = 0; // the sky is theirs now
      if (!growing()) calm();
      return;
    }
    ring(ghost, now(), 0.8);
    feel('glad', { gesture: 'nod', back: 1600 });
    life.setTimeout(illustrate, 13000);
  }
  life.setTimeout(illustrate, 10500);

  // --- Out of sight -----------------------------------------------------------------
  let hiddenAt = null;
  life.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      chimes?.hush(true);
      for (const id of [...hands.keys()]) release(id, true);
    } else if (hiddenAt !== null) {
      lost += performance.now() - hiddenAt;
      hiddenAt = null;
      lastTick = now();
      lastFrame = now();
      chimes?.hush(false);
      // the chord that was being held may have run out meanwhile
      const live = sounds();
      if (live && live.ctx.currentTime > bedUntil - 2) bed((turnAt + TURN_MS - now()) / 1000);
    }
  });

  main.dataset.lit = String(lit);
  main.dataset.pace = 'slow';
  main.dataset.dark = '0';
  count();
}
