// The night (/?sky). No words.
//
// A picture, come to life. The picture is five lights on black: three stars
// with four points in a falling line, each bigger than the last, and two small
// round ones beside the line. The screen opens on that picture, as still as a
// picture, only far dimmer; and then it wakes, a light at a time, in the order
// it is read, each with its note. Nothing is ever added to it: no more stars,
// no sky round them, no colour, and nobody standing under it. It is the same
// five lights for as long as it is looked at. What is alive is how they are
// there.
//
//   They wander. Each strays a little from its place, the way a speck in
//   water does, and is pulled back the further it goes.
//   They are not solid. A light is itself, faintly, and a handful of fainter
//   copies of itself laid over it, each a little out of place: where they lie
//   on one another it is at its brightest, and at its edges and along its
//   points it is soft, and never the same twice.
//   They glow, a little, and the glow breathes.
//   They twinkle. Their brightness flickers, the far ones most, as stars'
//   does and planets' does not. And now and then one twinkles outright: its
//   copies fall into place, it is sharp and bright for a moment, and its
//   points draw out. That is when it is heard. (Nothing comes off it. Specks
//   that did, and were knocked about for a second or two, looked like flies
//   round a lamp.)
//
// A light that is touched twinkles. A touch anywhere else, and the nearest one
// answers, more quietly. A finger held near them warms them: they stray
// further and twinkle oftener for as long as it is there.
//
// The five are read together once to each turn of the night, never quite the
// same way twice, and under them the night holds the game's four chords, one
// a turn: the notes of the lights do not change, and what is under them does.
// (The rules are in penny/stars.js, the sounds in penny/chimes.js.)
//
// It is not on any menu. It is a tag: hidden in the game, to be found
// (penny/tags.js).

import { audio, holdMusic, isMuted, noise, tone } from '/postmarks/sound.js';
import { createChimes } from './chimes.js';
import {
  CORE, ECHO, EMBER, GHOSTS, GLINT, HALO, MOST, NEEDLE, NIGHT, PICTURE, REST, SKY, STEP, TURN, WARM,
  afloat, drift, flicker, frame, nearness, often, reading, shimmer, soundOf, starPath, sway,
} from './stars.js';

const STEP_MS = STEP * 1000;
const TURN_MS = TURN * STEP_MS;
const ECHO_MS = ECHO * STEP_MS;
const AHEAD = 200; // sounds are written onto the engine's clock this far ahead of time
const WAKING_MS = 2600; // how long a light takes to come alive, once it has first sounded
const REACH = 0.22; // how far from a finger a light still feels its warmth, as a share of the picture's side
const FROM_KEY = 'tags:from'; // where the night was come to from (penny/tags.js)
const NAMES = ['The small star.', 'The lower dot.', 'The middle star.', 'The upper dot.', 'The big star.'];

// A soft round glow, to be drawn at any size: warmer than the lights
// themselves, and spread round a light more than heaped on top of it.
function glowSheet() {
  const sheet = document.createElement('canvas');
  sheet.width = 128;
  sheet.height = 128;
  const ink = sheet.getContext('2d');
  const fall = ink.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, alpha] of [[0, 0.4], [0.2, 0.3], [0.45, 0.13], [0.7, 0.04], [1, 0]]) fall.addColorStop(stop, `rgb(${HALO.join(' ')} / ${alpha})`);
  ink.fillStyle = fall;
  ink.fillRect(0, 0, 128, 128);
  return sheet;
}
const smooth = (part) => part * part * (3 - 2 * part);
const upTo1 = (value) => Math.max(0, Math.min(1, value));

export function mount(root, life) {
  document.title = 'The night · correspondence.lol';
  const main = root.querySelector('.sky');
  const view = root.querySelector('.sky-view');
  const said = root.querySelector('#sky-said');
  const back = root.querySelector('.penny-back');
  const pen = view.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The way back leads to wherever the night was found from: a tumble the
  // other way (penny/tags.js), with a breath of air and a note that rises.
  try {
    const from = sessionStorage.getItem(FROM_KEY);
    if (back && from && /^\/(?!\/)/.test(from) && !/[?&]sky\b/.test(from)) back.href = from;
  } catch { /* it leads home */ }
  back?.addEventListener('click', () => {
    if (!audio() || isMuted() || still) return;
    tone({ freq: 185, to: 590, dur: 1.05, type: 'sine', gain: 0.04, attack: 0.08 });
    noise({ dur: 0.95, from: 500, to: 2200, q: 0.8, gain: 0.028 });
  });

  // The strip at the top of a phone takes the night's colour while it is up.
  const bar = document.querySelector('meta[name="theme-color"]');
  const barWas = bar?.content;
  if (bar) bar.content = SKY;
  life.onEnd(() => { if (bar?.content === SKY) bar.content = barWas; });

  // --- Sound -------------------------------------------------------------------------
  // The app's own music stands aside. The night's sounds need the engine awake,
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
  // The night does not go on without you: time spent with the page out of
  // sight is not counted, and it picks up where it was.
  let lost = 0;
  const now = () => performance.now() - lost;

  // --- The lights ---------------------------------------------------------------------
  // The picture's five, and never another. `alive` runs from 0, as still as
  // the picture, to 1. `off` is how far it has wandered from its place,
  // across and up, and each of its copies has its own wandering from it and
  // its own flicker; `waver` is the light's flicker. (Each of those is a
  // wandering, kept as [where it has got to, how fast it is going].) `heat`
  // is how stirred it is, and `flare` how far into a twinkle.
  const lights = PICTURE.map((light, index) => ({
    ...light, index, near: nearness(light),
    alive: still ? 1 : 0, woke: still ? 0 : null,
    off: [[0, 0], [0, 0]],
    ghosts: Array.from({ length: GHOSTS }, () => ({ x: [0, 0], y: [0, 0], glint: [0, 0] })),
    waver: [0, 0], heat: 0, flare: 0, rung: -1e9, path: null,
  }));
  const shows = []; // lights about to be seen twinkling: [{ at, light, strength, echo }]
  const awake = () => lights.filter((light) => light.woke != null).length;
  const say = (text) => { said.textContent = text; };

  // --- The window -----------------------------------------------------------------
  let wide = 0;
  let high = 0;
  let dense = 1;
  let place = { x: 0, y: 0, side: 1 };
  const spot = (light) => [place.x + light.x * place.side, place.y + light.y * place.side]; // where the picture has it, on the screen
  // The whole picture is afloat: whoever is looking drifts a little, this way
  // and that, and what is near goes by faster than what is far. (A wandering,
  // across and up, kept as [where it has got to, how fast it is going].)
  const adrift = [[0, 0], [0, 0]];
  const moved = (light) => (still ? 0 : smooth(light.alive)); // how much of its movement it has yet: none while it is still a picture
  // Where it is on the screen this moment.
  const seen = (light) => {
    const [x, y] = spot(light);
    const depth = 0.25 + light.near;
    return [x + (light.off[0][0] + adrift[0][0] * depth) * place.side * moved(light), y + (light.off[1][0] + adrift[1][0] * depth) * place.side * moved(light)];
  };
  // The picture is fitted to the room the night has, whenever that changes:
  // not only when the window does. (The night once measured itself as it
  // arrived, while the page it was come to from was still holding the screen
  // open to its own length, and never again: it drew its picture for that
  // length and was then squashed into the window.) Its size is asked of its
  // own box, as it is laid out, whatever is being done to how it is shown.
  function fit() {
    const [across, down] = [main.clientWidth, main.clientHeight];
    const sharp = Math.min(window.devicePixelRatio || 1, 2);
    if (!across || !down || (across === wide && down === high && sharp === dense)) return;
    wide = across;
    high = down;
    dense = sharp;
    view.width = Math.round(wide * dense);
    view.height = Math.round(high * dense);
    place = frame(wide, high);
    for (const light of lights) if (light.kind === 'star') light.path = new Path2D(starPath(light, place.side));
    dark = false;
    if (drawn) draw(); // (a canvas given a new size is blank: it is drawn again at once, not a frame later)
  }
  let drawn = false; // whether there is a picture on it yet
  let dark = false; // whether all that is on it is the night's black, as while the way through to it is still turning
  fit();
  life.on(window, 'resize', fit);
  if (window.ResizeObserver) {
    const watching = new ResizeObserver(fit);
    watching.observe(main);
    life.onEnd(() => watching.disconnect());
  }

  // --- A light twinkling outright ----------------------------------------------------
  // It is heard at `at`, and seen then too; and seen again, fainter, with each echo.
  function ring(light, at = now(), level = 1, { byHand = false } = {}) {
    const pan = (light.x - 0.5) * 1.5;
    const sound = (live, when) => {
      if (light.kind === 'dot') live.dot(when, { freq: soundOf(light), level, pan });
      else live.star(when, { freq: soundOf(light), near: light.near, level, pan });
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
      const farOff = 1 - light.near * 0.6; // what is far is mostly echo
      shows.push({ at: at + ECHO_MS, light, strength: level * 0.42 * farOff, echo: true });
      shows.push({ at: at + ECHO_MS * 2, light, strength: level * 0.18 * farOff, echo: true });
    }
    light.rung = at;
  }

  // --- The turning of the night -----------------------------------------------------
  // Each turn: the next chord, and the picture read through once.
  let turn = -1;
  let turnAt = 0;
  let chord = NIGHT[0];
  let bedUntil = 0; // when, on the engine's clock, the chord now held will have gone
  const score = []; // what is written for the turn: [{ at, light, level }]
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
      score.push({ at: at + note.step * STEP_MS + loose, light: lights[note.index], level: note.level * (turn === 0 ? 1 : 0.88 + Math.random() * 0.2) });
    }
  }

  const hands = new Map(); // the fingers on it
  let heard = Boolean(audio()); // the engine was awake when the night began
  let lastTick = now();
  // Come to by a tumble (penny/tags.js), the picture is still on its way: the
  // night's own lights are dark until it has landed, and it waits to begin.
  const arriving = () => document.documentElement.classList.contains('tumbling');
  begin(now() + (arriving() ? 1900 : 1000));

  function tick() {
    if (document.hidden) return;
    let t = now();
    if (t - lastTick > 1500) { // the page was held up: carry on from where it was, without a rush to catch up
      lost += t - lastTick - 40;
      t = now();
    }
    lastTick = t;

    // The first touch has woken the engine. The night answers: its chord
    // comes in under it, and the picture is read again from the start, aloud.
    if (!heard && sounds()) {
      heard = true;
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

    // Between readings, each twinkles in its own time: the far ones oftener,
    // and all of them oftener for a finger near them. More softly than when
    // the picture is read, and on the grid everything keeps to.
    for (const light of lights) {
      if (light.woke == null || t - light.rung < 1800) continue;
      if (Math.random() >= 40 / (often(light, light.heat) * 1000)) continue;
      if (score.some((note) => note.light === light && note.at - t < 1600)) continue; // it is about to anyway
      ring(light, turnAt + Math.ceil((t + AHEAD - turnAt) / STEP_MS) * STEP_MS, 0.38 + Math.random() * 0.25);
    }
  }
  life.setInterval(tick, 40);

  // --- The hand -------------------------------------------------------------------------
  // The light under a point of the screen, if there is one near enough to count as touched.
  function under(px, py) {
    let best = null;
    let nearest = Infinity;
    for (const light of lights) {
      const [lx, ly] = seen(light);
      const reach = Math.max(20, (light.kind === 'star' ? light.a * 0.62 : light.r * 1.5) * place.side);
      const off = Math.hypot(px - lx, py - ly);
      if (off <= reach && off < nearest) {
        best = light;
        nearest = off;
      }
    }
    return best;
  }
  function touch(light, level = 1) {
    ring(light, now(), level, { byHand: true });
    say(NAMES[light.index]);
  }

  // The way back is there when it is looked for, and otherwise leaves the picture alone.
  let idle = 0;
  function stir() {
    main.classList.remove('idle');
    clearTimeout(idle);
    idle = life.setTimeout(() => main.classList.add('idle'), 3500);
  }
  stir();

  const where = (event) => {
    const box = main.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  main.addEventListener('pointerdown', (event) => {
    stir();
    if (event.target.closest?.('a, button') || (event.pointerType === 'mouse' && event.button !== 0) || hands.size >= 4) return;
    const [x, y] = where(event);
    const on = under(x, y);
    hands.set(event.pointerId, { x, y, on });
    if (on) {
      touch(on);
      return;
    }
    // nothing under it: the nearest answers, more quietly, a moment after (the further off, the later)
    const [nearest, far] = lights.map((light) => [light, Math.hypot(x - seen(light)[0], y - seen(light)[1])]).sort((one, other) => one[1] - other[1])[0];
    life.setTimeout(() => touch(nearest, 0.5), Math.min(360, (far / place.side) * 700));
  });
  life.on(window, 'pointermove', (event) => {
    const [x, y] = where(event);
    const hand = hands.get(event.pointerId);
    if (!hand) {
      if (event.pointerType === 'mouse') {
        stir();
        main.style.cursor = under(x, y) ? 'pointer' : '';
      }
      return;
    }
    hand.x = x;
    hand.y = y;
    // run across them, and each twinkles as it is reached
    const on = under(x, y);
    if (on && on !== hand.on && now() - on.rung > 400) touch(on, 0.85);
    hand.on = on;
  });
  const lift = (event) => hands.delete(event.pointerId);
  life.on(window, 'pointerup', lift);
  life.on(window, 'pointercancel', lift);
  main.addEventListener('touchmove', (event) => { if (event.cancelable) event.preventDefault(); }, { passive: false });
  main.addEventListener('contextmenu', (event) => event.preventDefault());

  // The keyboard: 1 to 5 are the five lights, as they are read; the space bar
  // is each of them in turn, and the arrows go back and forth along them.
  let reached = -1;
  life.on(window, 'keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    let index = null;
    if (/^[1-5]$/.test(event.key)) index = Number(event.key) - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (reached + 1) % lights.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (reached + lights.length - 1) % lights.length;
    else if ((event.key === ' ' || event.key === 'Enter') && !event.target.closest?.('a, button')) index = (reached + 1) % lights.length;
    if (index === null) return;
    event.preventDefault();
    stir();
    reached = index;
    touch(lights[index]);
  });
  life.on(window, 'focusin', stir);

  // --- Drawing ------------------------------------------------------------------------
  const glow = glowSheet();

  // One light's shape, at a place on the screen.
  function shape(light, px, py, grown = 1) {
    if (light.kind === 'dot') {
      pen.beginPath();
      pen.arc(px, py, light.r * place.side * grown, 0, Math.PI * 2);
      pen.fill();
      return;
    }
    pen.setTransform(dense * place.side * grown, 0, 0, dense * place.side * grown, dense * px, dense * py);
    pen.fill(light.path);
    pen.setTransform(dense, 0, 0, dense, 0, 0);
  }

  // The colour of a light: the night's own warm one, and warmer still for a finger near it.
  const colourOf = (light) => WARM.map((part, i) => Math.round(part + (EMBER[i] - part) * Math.min(1, light.heat) * 0.6)).join(' ');

  function drawLight(light) {
    const living = smooth(light.alive);
    const moving = moved(light);
    const [px, py] = seen(light);
    const flare = light.flare;
    const colour = colourOf(light);
    pen.fillStyle = `rgb(${colour})`;
    // its flicker: the far ones' brightness comes and goes by a good deal, the near one's hardly
    const glint = Math.max(0.45, Math.min(1.6, 1 + light.waver[0] * living));
    const warmth = 1 + light.heat * 0.35;

    // its glow, which breathes with it
    const size = light.kind === 'star' ? light.b * place.side : light.r * place.side * 3.4;
    const reach = size * (1.6 + flare * 0.6);
    pen.globalAlpha = upTo1((0.08 * living * glint + flare * 0.1) * warmth);
    pen.drawImage(glow, px - reach, py - reach, reach * 2, reach * 2);

    // How bright it is to be, all told: at rest, as its flicker has it, and
    // more at a twinkle (the big one less so: there is so much more of it).
    // Never more than the most a light is allowed, which is short of the picture.
    const lift = flare * (GLINT - REST) * (1.25 - 0.45 * light.near);
    const fits = Math.min(1, MOST / (REST * glint * warmth + lift));

    // its copies, each a little out of place; at a twinkle they fall into place
    const gathered = 1 - Math.min(1, flare * 1.25);
    const share = ((REST - CORE) / GHOSTS) * living * glint * warmth * fits;
    if (share > 0.001) {
      for (const ghost of light.ghosts) {
        pen.globalAlpha = upTo1(share * Math.max(0.2, Math.min(1.6, 1 + ghost.glint[0])));
        shape(light, px + ghost.x[0] * place.side * moving * gathered, py + ghost.y[0] * place.side * moving * gathered);
      }
    }

    // itself: all of its brightness while it is still a picture, and only its own share once it is alive
    const own = REST + (CORE - REST) * living;
    pen.globalAlpha = upTo1((own * glint * warmth + lift) * fits);
    shape(light, px, py, still ? 1 : 1 + flare * 0.04);
    if (light.kind === 'dot' || flare < 0.03 || still) return;

    // at a twinkle its points draw out, past where the picture ends them
    const [a, b] = [light.a * place.side, light.b * place.side];
    pen.lineWidth = Math.max(0.6, place.side * NEEDLE * 1.5);
    pen.lineCap = 'butt';
    for (const [dx, dy, tip] of [[0, -1, b], [0, 1, b], [-1, 0, a], [1, 0, a]]) {
      const [x0, y0] = [px + dx * tip, py + dy * tip];
      const [x1, y1] = [px + dx * tip * (1 + flare * 0.7), py + dy * tip * (1 + flare * 0.7)];
      const ray = pen.createLinearGradient(x0, y0, x1, y1);
      ray.addColorStop(0, `rgb(${colour} / ${Math.min(0.6, flare * 0.6)})`);
      ray.addColorStop(1, `rgb(${colour} / 0)`);
      pen.globalAlpha = 1;
      pen.strokeStyle = ray;
      pen.beginPath();
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      pen.stroke();
    }
  }

  function draw() {
    drawn = true;
    pen.setTransform(dense, 0, 0, dense, 0, 0);
    pen.globalCompositeOperation = 'source-over';
    pen.globalAlpha = 1;
    // (While the way through is still turning there is nothing of the night to
    // see. It is painted black once, and then left alone until it has landed:
    // a phone has enough to do, turning two screens.)
    const waiting = arriving();
    if (waiting && dark) return;
    pen.fillStyle = SKY;
    pen.fillRect(0, 0, wide, high);
    dark = waiting;
    if (waiting) return;
    // light on light adds up, as light does
    pen.globalCompositeOperation = 'lighter';
    for (const light of lights) drawLight(light);
    pen.globalAlpha = 1;
    pen.globalCompositeOperation = 'source-over';
  }

  // --- Every frame ----------------------------------------------------------------------
  let lastFrame = now();
  let lastDrawn = 0;
  function each() {
    if (life.over) return;
    requestAnimationFrame(each);
    if (document.hidden || !wide) return;
    const t = now();
    const seconds = Math.min(0.064, Math.max(0, t - lastFrame) / 1000);
    lastFrame = t;

    // what is due to be seen twinkling
    for (let i = shows.length - 1; i >= 0; i--) {
      const show = shows[i];
      if (show.at > t) continue;
      shows.splice(i, 1);
      const { light } = show;
      if (light.woke == null) { // its first: from here on it is alive
        light.woke = t;
        main.dataset.alive = String(awake());
      }
      light.flare = Math.max(light.flare, upTo1(show.strength));
    }

    if (!still) {
      adrift[0] = sway(adrift[0], seconds, afloat);
      adrift[1] = sway(adrift[1], seconds, afloat);
    }
    for (const light of lights) {
      // a finger near it warms it: quickly, and it cools slowly
      let warm = 0;
      const [lx, ly] = seen(light);
      for (const hand of hands.values()) warm = Math.max(warm, Math.exp(-((Math.hypot(hand.x - lx, hand.y - ly) / place.side / REACH) ** 2)));
      light.heat += (warm - light.heat) * (1 - Math.exp(-seconds / (warm > light.heat ? 0.25 : 1.4)));
      if (light.woke != null && light.alive < 1) light.alive = Math.min(1, (t - light.woke) / WAKING_MS);
      if (!still) {
        const wander = drift(light, light.heat);
        const tremble = shimmer(light, light.heat);
        light.off[0] = sway(light.off[0], seconds, wander);
        light.off[1] = sway(light.off[1], seconds, wander);
        for (const ghost of light.ghosts) {
          ghost.x = sway(ghost.x, seconds, tremble);
          ghost.y = sway(ghost.y, seconds, tremble);
          ghost.glint = sway(ghost.glint, seconds, { spread: 0.4, pace: 1.6 });
        }
      }
      // (with less motion asked for, its brightness still comes and goes, slowly)
      light.waver = sway(light.waver, seconds, still ? { ...flicker(light), pace: 0.2 } : flicker(light));
      light.flare *= Math.exp(-seconds / (still ? 0.9 : 0.42 + 0.5 * light.near));
    }
    if (still && t - lastDrawn < 48) return; // nothing moves: there is no call to draw it sixty times a second
    draw();
    lastDrawn = t;
  }
  requestAnimationFrame(each);

  // --- Out of sight -----------------------------------------------------------------
  let hiddenAt = null;
  life.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      chimes?.hush(true);
      hands.clear();
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

  main.dataset.alive = String(awake());
}
