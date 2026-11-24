// Penny's Radio (/jam/?taste). To whoever is using it, it is a small portable
// radio standing on the map: two stations on the dial, a swipe to tune from
// one to the other, a double tap to keep the one you would go on listening
// to. The station kept stays on the dial and a new one comes in beside it. A
// station kept five times running is saved to one of the presets on the set,
// and two new stations take the dial.
//
// Penny shows how. Nothing is said; as on the walk (penny/walk.js) one thing
// is shown at a time, and the next waits until that has been done. First that
// a swipe tunes: Penny looks at the radio and back at you, and a fingertip of
// light slides across the display. Then that a station has to be listened to:
// Penny shuts its eyes and listens with you until the signal is full, both
// stations in turn. Then that two taps keep one: the fingertip taps twice.
// Whatever is done is Penny's delight. After that it is taught, and Penny only
// keeps time: one small hop at the top of each bar, the same whatever is
// playing, so that it gives no opinion of a station. It does not hum once the
// radio is on.
//
// Behind it, out of sight until the flask at the top is pressed, it is an
// experiment in whether what you like in a loop can be predicted. Every
// station kept is a label; what is measured about a loop, the model, and the
// test of whether the model can really tell are in jam/taste-model.js. The
// longer a station has been kept, the likelier the next one beside it is a
// near relation of it, which is the harder choice.
//
// Two things are done for the sake of the experiment and not of the radio. A
// station cannot be kept until both have been listened to. And which of the
// two is tuned in when a new pair arrives is decided by a coin, so that "the
// one I heard first" is not always the newcomer.

import { audio, noise } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { ask } from '/shared/ask.js';
import { decode, encode } from './beat.js';
import { LAYERS, ROWS, STEPS, createLoop } from './engine.js';
import { claim as callPal } from '/penny/pal.js';
import { ASK, hasDot } from '/penny/penny.js';
import { NEEDED, REIGN, WARMUP, begin, choose, fit, leanings, pairVector, standing } from './taste-model.js';

const KEY = 'jam:taste:v1';
const TAUGHT_KEY = 'radio:taught:v1'; // Penny has shown how, on this device
const SLOTS = 5; // presets on the set
const LISTEN_MS = 1500; // how long a side has to have been heard before a pick counts
const SIDES = ['front', 'back'];
// Where on the dial a station is: worked out from the loop itself, so the same
// loop is always the same station. (Between 87.5 and 108, as FM is.)
const [LOW, HIGH_END] = [87.5, 108];
function dialOf(beat) {
  let hash = 2166136261;
  for (const letter of encode(beat)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  return LOW + (hash % 206) / 10;
}
const otherSide = (side) => (side === 'front' ? 'back' : 'front');

// What is kept: the picks, with the loops as their codes, and the pair now up.
const packPair = (pair) => ({ ...pair, front: encode(pair.front), back: encode(pair.back), phantom: encode(pair.phantom) });
function unpackPair(pair) {
  const [front, back, phantom] = [decode(pair?.front), decode(pair?.back), decode(pair?.phantom)];
  return front && back && phantom ? { ...pair, front, back, phantom } : null;
}
function restore() {
  const kept = load(KEY);
  if (!kept || kept.v !== 1 || !Array.isArray(kept.trials)) return null;
  const trials = kept.trials.map(unpackPair);
  const current = unpackPair(kept.current);
  if (!current || trials.some((trial) => !trial)) return null;
  const rows = trials.map((trial) => [pairVector(trial.front, trial.back, trial.reigning, trial.first), trial.pick === 'front' ? 1 : 0]);
  return {
    trials, current, streak: Number(kept.streak) || 0,
    retired: (Array.isArray(kept.retired) ? kept.retired : []).map(decode).filter(Boolean),
    weights: rows.length ? fit(rows, { rounds: 10 }) : null,
    habits: rows.length ? fit(rows, { music: false, rounds: 10 }) : null,
  };
}

export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  document.title = 'Penny’s Radio · correspondence.lol';
  const el = {
    card: $('taste-card'), note: $('taste-note'), flip: $('taste-flip'), pick: $('taste-pick'), play: $('taste-play'),
    freq: $('radio-freq'), tag: $('radio-tag'), signal: $('radio-signal'), behind: $('taste-behind'),
    picks: $('lab-picks'), called: $('lab-called'), habits: $('lab-habits'), coin: $('lab-coin'), stake: $('lab-stake'), meter: $('lab-meter'),
    verdict: $('lab-verdict'), likes: $('lab-likes'), hall: $('lab-hall'), copy: $('taste-copy'), reset: $('taste-reset'),
  };
  const faces = Object.fromEntries(SIDES.map((side) => [side, root.querySelector(`.face.${side}`)]));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = restore() ?? begin();
  let up = state.current.first; // the side that is showing, and playing
  let started = false; // sound needs a first touch
  let heardMs = { front: 0, back: 0 };
  let flips = 0;
  let shownAt = performance.now();
  const keep = () => save(KEY, { v: 1, streak: state.streak, retired: state.retired.map(encode), trials: state.trials.map(packPair), current: packPair(state.current) });
  keep();

  // --- Sound: whichever side is up, round and round -------------------------------------
  const setsOf = (beat) => beat.notes.map((tiles) => new Set(tiles));
  let sets = { front: setsOf(state.current.front), back: setsOf(state.current.back) };
  const loop = createLoop(life, () => (started ? { tempo: state.current[up].tempo, sets: sets[up] } : null));

  // --- The card ------------------------------------------------------------------------------
  // Each side is a picture of its loop, and the picture is lit by the loop as
  // it plays. The board, with a dot for every note in its instrument's colour.
  // Over it hang four lamps, one for each instrument, and each throws its
  // beam when its instrument sounds. A note that sounds jumps and flares, and a
  // ring spreads from it. A bar of light crosses with the beat, the edge of
  // the card glows in the colour of what has just sounded, and at the top of
  // every bar a gleam runs across the whole card.
  const [WIDE, HIGH] = [STEPS * 10, ROWS * 10];
  function picture(beat) {
    const beams = LAYERS.map((kind, index) => {
      const x = WIDE * ((index + 0.5) / LAYERS.length);
      return `<path class="beam" data-layer="${index}" d="M${x - 2} -6 L${x + 2} -6 L${x + 17} ${HIGH + 4} L${x - 17} ${HIGH + 4} Z" fill="${kind.colour}" opacity="0"/>`
        + `<circle class="lamp" data-layer="${index}" cx="${x}" cy="-5" r="2.2" fill="${kind.colour}" opacity="${beat.notes[index].length ? 0.55 : 0.15}"/>`;
    });
    const dots = [];
    beat.notes.forEach((tiles, index) => {
      for (const tile of tiles) {
        const [step, row] = [Math.floor(tile / ROWS), tile % ROWS];
        dots.push(`<rect class="dot" data-step="${step}" data-layer="${index}" x="${step * 10 + 1.5}" y="${row * 10 + 1.5}" width="7" height="7" rx="2" fill="currentColor" style="color:${LAYERS[index].colour}"/>`);
      }
    });
    return `<svg viewBox="0 -8 ${WIDE} ${HIGH + 8}" aria-hidden="true"><g class="beams">${beams.join('')}</g><rect class="now" x="0" y="0" width="10" height="${HIGH}" rx="3" opacity="0"/>${dots.join('')}<g class="rings"></g></svg>`;
  }
  // One step of the side that is up has just sounded: light it.
  let bars = 0;
  function light(side, step) {
    const face = faces[side];
    const hit = [...face.querySelectorAll(`.dot[data-step="${step}"]`)];
    if (step === 0) bars += 1;
    if (still) return;
    const rings = face.querySelector('.rings');
    const sounding = new Set();
    for (const dot of hit) {
      sounding.add(Number(dot.dataset.layer));
      dot.classList.remove('hit');
      void dot.getBoundingClientRect();
      dot.classList.add('hit');
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', Number(dot.getAttribute('x')) + 3.5);
      ring.setAttribute('cy', Number(dot.getAttribute('y')) + 3.5);
      ring.setAttribute('r', 4);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', dot.style.color);
      ring.setAttribute('stroke-width', 1.1);
      rings.append(ring);
      ring.animate([{ r: 4, opacity: 0.9 }, { r: 15, opacity: 0 }], { duration: 560, easing: 'ease-out', fill: 'forwards' });
      life.setTimeout(() => ring.remove(), 600);
    }
    // each instrument that sounded throws its beam, swinging a little one way or the other
    for (const index of sounding) {
      const lean = (bars + index) % 2 ? 5 : -5;
      face.querySelector(`.beam[data-layer="${index}"]`)?.animate(
        [{ opacity: step % 4 === 0 ? 0.3 : 0.2, transform: `rotate(${lean}deg)` }, { opacity: 0, transform: `rotate(${-lean}deg)` }],
        { duration: 620, easing: 'ease-out' },
      );
      face.querySelector(`.lamp[data-layer="${index}"]`)?.animate([{ r: 3.6, opacity: 1 }, { r: 2.2, opacity: 0.55 }], { duration: 420, easing: 'ease-out' });
    }
    // the edge of the card takes the colour of what sounded, harder on the beat
    if (hit.length) {
      face.style.setProperty('--glow', hit[0].style.color);
      face.classList.remove('beat', 'offbeat');
      void face.offsetWidth;
      face.classList.add(step % 4 === 0 ? 'beat' : 'offbeat');
    }
    if (step === 0) { // the top of the bar: a gleam across the whole card
      face.classList.remove('gleam');
      void face.offsetWidth;
      face.classList.add('gleam');
    }
  }
  // The two stations' places on the dial (never quite the same place).
  let dial = { front: 0, back: 0 };
  const name = (side) => dial[side].toFixed(1);
  function place() {
    dial = { front: dialOf(state.current.front), back: dialOf(state.current.back) };
    if (Math.abs(dial.front - dial.back) < 0.8) dial.back = dial.front + (dial.front > 98 ? -1.2 : 1.2);
  }
  const along = (at) => `${(((at - LOW) / (HIGH_END - LOW)) * 100).toFixed(2)}%`;
  // What changes while a pair is up: which is tuned in, and what has been listened to.
  function tune() {
    el.card.classList.toggle('turned', up === 'back');
    el.card.style.setProperty('--needle', along(dial[up]));
    el.card.style.setProperty('--turn', ((dial[up] - LOW) / (HIGH_END - LOW)).toFixed(3)); // the knob turns with it
    el.card.style.setProperty('--edge', up === 'front' ? '#f08a76' : '#2aa198');
    for (const side of SIDES) {
      faces[side].classList.toggle('tuned', side === up);
      faces[side].classList.toggle('heard', heardMs[side] >= LISTEN_MS);
      el.card.querySelector(`.mark.${side}`).classList.toggle('heard', heardMs[side] >= LISTEN_MS);
    }
    el.freq.textContent = name(up);
    const kept = state.current.reigning === up;
    el.tag.textContent = kept ? `★ Kept ${state.streak} of ${REIGN}` : state.current.reigning ? 'New station' : '';
    el.tag.classList.toggle('kept', kept);
    el.signal.dataset.bars = String(Math.min(3, Math.floor((heardMs[up] / LISTEN_MS) * 3)));
    el.card.setAttribute('aria-label', `Tuned to ${name(up)} FM${kept ? ', the station you have kept' : ''}. Swipe to tune to the other station; double tap to keep this one.`);
    el.pick.setAttribute('aria-label', `Keep ${name(up)} FM`);
    el.play.setAttribute('aria-pressed', String(started));
    el.play.setAttribute('aria-label', started ? 'Pause' : 'Play');
    el.play.classList.toggle('playing', started);
  }
  // A new pair: their pictures, and their places on the dial.
  function show() {
    place();
    for (const side of SIDES) {
      faces[side].querySelector('.pic').innerHTML = picture(state.current[side]);
      el.card.querySelector(`.mark.${side}`).style.left = along(dial[side]);
    }
    tune();
  }
  let noteTimer = 0;
  function say(text) {
    el.note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = life.setTimeout(() => { el.note.textContent = ''; }, 3500);
  }
  const start = () => { started = true; };
  function turn() {
    start();
    up = otherSide(up);
    flips += 1;
    // between stations: a moment of static, seen and heard
    if (!still) {
      el.card.classList.remove('retune');
      void el.card.offsetWidth;
      el.card.classList.add('retune');
    }
    if (audio()) noise({ dur: 0.13, from: 2600, to: 5200, q: 0.5, gain: 0.035 });
    tune();
    lesson.did('tune');
  }
  function pick() {
    if (!started) { // nothing has been heard yet
      start();
      tune();
      return;
    }
    const unheard = SIDES.find((side) => heardMs[side] < LISTEN_MS);
    if (unheard) {
      say(unheard === up ? 'Stay on this one a moment longer.' : `Tune to ${name(unheard)} first.`);
      pal.rise().mood('no').gesture('shake'); // not yet
      life.setTimeout(() => lesson.resume(), 900);
      if (unheard !== up) turn(); // and here it is
      el.card.classList.remove('nope');
      void el.card.offsetWidth;
      el.card.classList.add('nope');
      return;
    }
    const picked = up;
    const keptName = name(picked);
    choose(state, picked, Math.random, { at: Date.now(), ms: Math.round(performance.now() - shownAt), flips, heardFront: Math.round(heardMs.front), heardBack: Math.round(heardMs.back) });
    keep();
    sets = { front: setsOf(state.current.front), back: setsOf(state.current.back) };
    heardMs = { front: 0, back: 0 };
    flips = 0;
    shownAt = performance.now();
    up = state.current.first; // a coin decides which is heard first
    const face = faces[picked];
    face.classList.remove('won');
    void face.offsetWidth;
    face.classList.add('won');
    const saved = Boolean(state.trials[state.trials.length - 1].retired);
    if (saved) say(`${keptName} is a keeper: saved to a preset. Two new stations.`);
    lesson.did('keep', saved);
    show();
    notes();
  }

  // --- Penny, who shows how ---------------------------------------------------------------
  // One thing at a time: 'tune' (a swipe), 'listen' (to both, in turn), 'keep'
  // (two taps). What is to be done next is shown again every few seconds until
  // it is done. `step` is null once it has all been shown.
  const pal = callPal(life, { x: 0.2, height: 'low', mood: 'calm', dot: hasDot() });
  const tip = root.querySelector('.radio .tip');
  const display = root.querySelector('.radio .display');
  const lesson = {
    step: load(TAUGHT_KEY) === true ? null : 'tune',
    timer: 0,
    // the fingertip of light: across the display for a swipe, twice on the spot for two taps
    point(kind) {
      if (still) {
        tip.animate([{ opacity: 0.9 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 1400 });
        return;
      }
      if (kind === 'swipe') {
        tip.animate([
          { opacity: 0, translate: '5.5em 0' }, { opacity: 0.95, translate: '4.5em 0', offset: 0.15 },
          { opacity: 0.9, translate: '-4.5em 0', offset: 0.8 }, { opacity: 0, translate: '-5.5em 0' },
        ], { duration: 1100, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' });
      } else {
        tip.animate([
          { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 0.8, offset: 0.12 }, { opacity: 0.2, scale: 1.3, offset: 0.34 },
          { opacity: 1, scale: 0.8, offset: 0.5 }, { opacity: 0, scale: 1.6 },
        ], { duration: 900, easing: 'ease-out' });
      }
    },
    // show what is to be done now, and again in a while if it has not been
    resume() {
      clearTimeout(lesson.timer);
      if (life.over) return;
      const { step } = lesson;
      if (step === null) {
        pal.mood('calm').look(null).settle('peek');
        return;
      }
      const bothHeard = SIDES.every((side) => heardMs[side] >= LISTEN_MS);
      if (step === 'tune' || (step === 'listen' && heardMs[up] >= LISTEN_MS && !bothHeard)) {
        // "this is how": at the radio, back at you, and the swipe
        pal.rise().mood('hopeful').look(display);
        if (!started) pal.sing(ASK, 0.5); // (only while the radio is still off)
        lesson.point('swipe');
        life.setTimeout(() => { if (lesson.step === step) pal.look(null); }, 1200);
      } else if (step === 'listen') {
        pal.rise().mood('listening').look(null); // eyes shut: it is listening too
      } else if (step === 'keep') {
        pal.rise().mood('pleading').look(display);
        lesson.point('taps');
        life.setTimeout(() => { if (lesson.step === step) pal.look(null); }, 1100);
      }
      lesson.timer = life.setTimeout(lesson.resume, step === 'listen' && !(heardMs[up] >= LISTEN_MS) ? 1600 : 3800);
    },
    // something has been done: 'tune', 'listen' (a station has been heard through) or 'keep'
    did(what, saved = false) {
      const bothHeard = SIDES.every((side) => heardMs[side] >= LISTEN_MS);
      if (lesson.step === null) {
        // taught already: it is glad of a station kept, the same every time, and gladder of a preset
        if (what === 'keep') {
          pal.rise().mood(saved ? 'thrilled' : 'glad').look(null).gesture(saved ? 'jump' : 'nod');
          if (saved) pal.hearts(3);
          clearTimeout(lesson.timer);
          lesson.timer = life.setTimeout(lesson.resume, 1500);
        }
        return;
      }
      if (what === 'tune' && lesson.step === 'tune') {
        pal.rise().mood('thrilled').look(null).gesture('jump'); // that is it!
        lesson.step = 'listen';
        clearTimeout(lesson.timer);
        lesson.timer = life.setTimeout(lesson.resume, 1100);
      } else if (what === 'listen' && lesson.step === 'listen') {
        pal.mood('glad').gesture('nod'); // heard
        if (bothHeard) lesson.step = 'keep';
        clearTimeout(lesson.timer);
        lesson.timer = life.setTimeout(lesson.resume, 900);
      } else if (what === 'tune' && lesson.step === 'listen') {
        if (bothHeard) lesson.step = 'keep';
        lesson.resume();
      } else if (what === 'keep') {
        pal.rise().mood('thrilled').look(null).gesture('jump').hearts(3); // and that is all there is to it
        lesson.step = null;
        save(TAUGHT_KEY, true);
        clearTimeout(lesson.timer);
        lesson.timer = life.setTimeout(lesson.resume, 2200);
      }
    },
    // the top of a bar: once it has all been shown, Penny keeps time, the same whatever is playing
    beat() {
      if (lesson.step === null && !still) pal.gesture('hop');
    },
    again() {
      save(TAUGHT_KEY, false);
      lesson.step = 'tune';
      lesson.resume();
    },
  };
  life.setTimeout(lesson.resume, 1200);

  // The hand: a swipe across tunes to the other station; two taps close together keep this one.
  let down = null;
  let lastTap = 0;
  el.card.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.target.closest('button, a')) return; // (its knob and buttons are pressed, not swiped)
    down = { x: event.clientX, y: event.clientY, at: performance.now() };
  });
  life.on(window, 'pointerup', (event) => {
    if (!down || !event.isPrimary) return;
    const [dx, dy, took] = [event.clientX - down.x, event.clientY - down.y, performance.now() - down.at];
    down = null;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy)) {
      lastTap = 0;
      turn();
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && took < 400) {
      const now = performance.now();
      if (now - lastTap < 380) {
        lastTap = 0;
        pick();
      } else {
        lastTap = now;
        if (!started) { start(); tune(); }
      }
    }
  });
  life.on(window, 'pointercancel', () => { down = null; });
  el.card.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); turn(); }
    else if (event.key === 'Enter') { event.preventDefault(); pick(); }
  });
  el.flip.addEventListener('click', turn);
  el.pick.addEventListener('click', pick);
  el.play.addEventListener('click', () => { started = !started; tune(); });

  // Every frame: the bar across the side that is playing, and the listening counted.
  let frame = 0;
  let last = performance.now();
  let lit = -1;
  function draw() {
    const now = performance.now();
    const { step } = loop.heard();
    if (step !== lit) {
      lit = step;
      if (step >= 0) light(up, step);
      if (step === 0) lesson.beat();
    }
    if (step >= 0) {
      const before = heardMs[up];
      heardMs[up] += Math.min(250, now - last); // (a long gap between frames is the screen having been away, not listening)
      const bars = (ms) => Math.min(3, Math.floor((ms / LISTEN_MS) * 3));
      if (bars(before) !== bars(heardMs[up])) { // the signal fills as it is listened to
        tune();
        if (heardMs[up] >= LISTEN_MS) lesson.did('listen');
      }
    }
    for (const side of SIDES) {
      const bar = faces[side].querySelector('.now');
      if (!bar) continue;
      bar.setAttribute('opacity', side === up && step >= 0 ? 0.3 : 0);
      if (side === up && step >= 0) bar.setAttribute('x', step * 10);
    }
    last = now;
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  life.onEnd(() => cancelAnimationFrame(frame));

  // --- The lab notes --------------------------------------------------------------------------
  const small = (beat) => `<svg viewBox="0 0 ${STEPS * 4} ${ROWS * 4}" aria-hidden="true">${beat.notes.map((tiles, index) => tiles.map((tile) => `<rect x="${Math.floor(tile / ROWS) * 4 + 0.5}" y="${(tile % ROWS) * 4 + 0.5}" width="3" height="3" rx="0.8" fill="${LAYERS[index].colour}"/>`).join('')).join('')}</svg>`;
  const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
  const times = (value) => `×${value >= 10 ? value.toFixed(0) : value.toFixed(2)}`;
  function notes() {
    const now = standing(state.trials);
    el.picks.textContent = String(now.picks);
    el.called.textContent = now.called ? `${now.right} of ${now.called} (${percent(now.right, now.called)})` : '–';
    el.habits.textContent = now.called ? `${now.habitsRight} of ${now.called} (${percent(now.habitsRight, now.called)})` : '–';
    el.coin.textContent = now.bets ? `${now.won} of ${now.bets} (${percent(now.won, now.bets)})` : '–';
    el.stake.textContent = `${times(now.stake)} of ×${NEEDED}`;
    el.meter.style.setProperty('--full', Math.max(0, Math.min(1, Math.log(Math.max(now.peak, 1)) / Math.log(NEEDED))).toFixed(3));
    el.meter.classList.toggle('done', now.significant);
    el.verdict.classList.toggle('yes', now.significant);
    if (now.picks < WARMUP) {
      const left = WARMUP - now.picks;
      el.verdict.textContent = `The model starts calling your choices after ${WARMUP}. ${left} to go.`;
    } else if (now.significant) {
      el.verdict.textContent = `Significant. The music itself predicts your choices: p = ${now.p.toFixed(3)}, reached at choice ${now.reachedAt}.`;
    } else {
      el.verdict.textContent = `Not yet. So far p = ${now.p.toFixed(2)}; it is significant when the stake reaches ×${NEEDED} (p = 0.05).`;
    }
    // the presets: five buttons on the set, the latest stations kept five times
    // running. A press on one opens it in the music maker
    const latest = state.retired.slice(-SLOTS);
    el.hall.querySelector('ul').replaceChildren(...Array.from({ length: SLOTS }, (_, slot) => {
      const li = document.createElement('li');
      const beat = latest[slot];
      if (!beat) return li;
      const a = document.createElement('a');
      a.href = `/jam/?b=${encode(beat)}`;
      a.setAttribute('aria-label', `Preset ${slot + 1}, ${dialOf(beat).toFixed(1)} FM: open it in the music maker`);
      a.title = `${dialOf(beat).toFixed(1)} FM: open in the music maker`;
      a.innerHTML = small(beat);
      li.append(a);
      return li;
    }));
    const likes = leanings(state.weights);
    el.likes.textContent = now.picks < WARMUP || likes.length === 0 ? '' : `So far it thinks you go for ${likes.map((one) => one.words).join(', ')}.`;
  }

  el.copy.addEventListener('click', async () => {
    const data = JSON.stringify({ made: new Date().toISOString(), standing: standing(state.trials), weights: state.weights, trials: state.trials.map(packPair) });
    try {
      await navigator.clipboard.writeText(data);
      say(`Copied ${state.trials.length} picks.`);
    } catch {
      prompt('Copy the data', data);
    }
  });
  el.reset.addEventListener('click', async () => {
    if (!(await ask('Start the experiment over?', { detail: `Your ${state.trials.length} choices and your presets will be thrown away.`, yes: 'Start over', danger: true }))) return;
    state = begin();
    up = state.current.first;
    sets = { front: setsOf(state.current.front), back: setsOf(state.current.back) };
    heardMs = { front: 0, back: 0 };
    flips = 0;
    shownAt = performance.now();
    keep();
    show();
    notes();
  });

  // The experiment, behind the radio: a sheet that opens over it.
  $('taste-behind-open').addEventListener('click', () => {
    notes();
    el.behind.showModal();
  });
  $('taste-behind-close').addEventListener('click', () => el.behind.close());
  $('taste-again').addEventListener('click', () => {
    el.behind.close();
    lesson.again();
  });
  el.behind.addEventListener('click', (event) => { if (event.target === el.behind) el.behind.close(); }); // a tap outside it
  life.onEnd(() => { if (el.behind.open) el.behind.close(); });

  if (still) el.card.classList.add('still');
  show();
  notes();
}
