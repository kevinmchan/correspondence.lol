// The taste test (/jam/?taste): an experiment in whether what you like in a
// loop can be predicted.
//
// One card, two sides, a loop on each. A swipe across the card turns it over,
// and the side that is up is the one that is playing. A double tap on a side
// picks it. The loop that was picked stays where it is, and a new challenger
// takes the other side. Every pick is one label for the model.
//
// What is measured about a loop, the model, and the test of whether the model
// can really tell are in jam/taste-model.js. This file is the card, the
// sound, and the lab notes underneath, which say where the experiment stands
// after every pick.
//
// Two things are done for the sake of the experiment and not of the game. A
// pick does not count until both sides have been listened to. And which side
// is up when a new pair arrives is decided by a coin, so that "the one I heard
// first" is not always the challenger.

import { load, save } from '/shared/identity.js';
import { ask } from '/shared/ask.js';
import { decode, encode } from './beat.js';
import { LAYERS, ROWS, STEPS, TEMPOS, createLoop } from './engine.js';
import { NEEDED, WARMUP, begin, choose, fit, leanings, pairVector, standing } from './taste-model.js';

const KEY = 'jam:taste:v1';
const LISTEN_MS = 1500; // how long a side has to have been heard before a pick counts
const SIDES = ['front', 'back'];
const LETTER = { front: 'A', back: 'B' };
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
    weights: rows.length ? fit(rows, { rounds: 10 }) : null,
    habits: rows.length ? fit(rows, { music: false, rounds: 10 }) : null,
  };
}

export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  document.title = 'Taste test · correspondence.lol';
  const el = {
    card: $('taste-card'), hint: $('taste-hint'), note: $('taste-note'), flip: $('taste-flip'), pick: $('taste-pick'), play: $('taste-play'),
    picks: $('lab-picks'), called: $('lab-called'), habits: $('lab-habits'), coin: $('lab-coin'), stake: $('lab-stake'), meter: $('lab-meter'),
    verdict: $('lab-verdict'), likes: $('lab-likes'), copy: $('taste-copy'), reset: $('taste-reset'),
  };
  const faces = Object.fromEntries(SIDES.map((side) => [side, root.querySelector(`.face.${side}`)]));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = restore() ?? begin();
  let up = state.current.first; // the side that is showing, and playing
  let started = false; // sound needs a first touch
  let heardMs = { front: 0, back: 0 };
  let flips = 0;
  let shownAt = performance.now();
  const keep = () => save(KEY, { v: 1, streak: state.streak, trials: state.trials.map(packPair), current: packPair(state.current) });
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
  function show() {
    for (const side of SIDES) {
      const face = faces[side];
      face.querySelector('.pic').innerHTML = picture(state.current[side]);
      face.querySelector('.tempo').textContent = `${TEMPOS[state.current[side].tempo]} bpm`;
      const reigns = state.current.reigning === side;
      face.querySelector('.crown').hidden = !reigns;
      face.querySelector('.crown b').textContent = reigns && state.streak > 1 ? `×${state.streak}` : '';
      face.querySelector('.new').hidden = reigns || state.current.reigning === null;
    }
    el.card.classList.toggle('turned', up === 'back');
    el.card.setAttribute('aria-label', `Loop ${LETTER[up]} is up${state.current.reigning === up ? ', the reigning one' : ''}. Swipe to turn the card over; double tap to pick this loop.`);
    el.pick.textContent = `Pick ${LETTER[up]}`;
    el.play.setAttribute('aria-pressed', String(started));
    el.play.setAttribute('aria-label', started ? 'Pause' : 'Play');
    el.play.classList.toggle('playing', started);
    el.hint.hidden = state.trials.length > 2;
    for (const side of SIDES) faces[side].classList.toggle('heard', heardMs[side] >= LISTEN_MS);
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
    show();
  }
  function pick() {
    if (!started) { // nothing has been heard yet
      start();
      show();
      return;
    }
    const unheard = SIDES.find((side) => heardMs[side] < LISTEN_MS);
    if (unheard) {
      say(unheard === up ? 'Listen to this one a moment longer.' : `Listen to ${LETTER[unheard]} first.`);
      if (unheard !== up) turn(); // and here it is
      el.card.classList.remove('nope');
      void el.card.offsetWidth;
      el.card.classList.add('nope');
      return;
    }
    const picked = up;
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
    show();
    notes();
  }

  // The hand: a swipe across turns the card over; two taps close together pick.
  let down = null;
  let lastTap = 0;
  el.card.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
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
        if (!started) { start(); show(); }
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
  el.play.addEventListener('click', () => { started = !started; show(); });

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
    }
    if (step >= 0) {
      const before = heardMs[up];
      heardMs[up] += Math.min(250, now - last); // (a long gap between frames is the screen having been away, not listening)
      if (before < LISTEN_MS && heardMs[up] >= LISTEN_MS) faces[up].classList.add('heard');
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
      el.verdict.textContent = `The model starts calling your picks after ${WARMUP}. ${left} to go.`;
    } else if (now.significant) {
      el.verdict.textContent = `Significant. The music itself predicts your picks: p = ${now.p.toFixed(3)}, reached at pick ${now.reachedAt}.`;
    } else {
      el.verdict.textContent = `Not yet. So far p = ${now.p.toFixed(2)}; it is significant when the stake reaches ×${NEEDED} (p = 0.05).`;
    }
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
    if (!(await ask('Start the experiment over?', { detail: `Your ${state.trials.length} picks will be thrown away.`, yes: 'Start over', danger: true }))) return;
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

  if (still) el.card.classList.add('still');
  show();
  notes();
}
