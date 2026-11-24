// Penny's Radio (/jam/?taste). It is a work in a gallery that keeps music: a
// small portable radio on a pale plinth under a light, with the gallery's
// label on the plinth (index.html, jam/taste.css). To whoever is using it, it
// is a radio: two stations on the dial, a swipe to tune from one to the other,
// a double tap to keep the one you would go on listening to. The station kept
// stays on the dial and a new one comes in beside it. A station kept five
// times running is saved to one of the presets on the set, and two new
// stations take the dial. It is played without words; the words are in the
// reading, the gallery's entry for it, which the tag on its side opens.
//
// THE STORY. Somebody else shows how: an express letter (Dash, in the code
// and nowhere on the screen), the hurry of the sorting office with a face, in
// an attendant's cap. It stands by the plinth and hangs a sign over the
// gallery's label, its how over the gallery's what: one order at a time, the
// kind of sign that needs no words: swipe, play, listen, the other one, tap
// twice. It says how, and never why. It is not unkind and it does not hurry
// anybody: it waits, perfectly still, and shows the same sign again. When the
// first station has been kept it ticks, and is gone up the side of the set,
// and its sign with it. While it is there the gallery's light is cold; after,
// it warms. (The light follows the story and nothing else: it is the same
// however many stations are kept, and whatever the experiment makes of them.)
//
// On that side hangs a tag with a flask on it. It has been in plain sight all
// along, and it is not the gallery's: the label does not mention it. Penny,
// who watched the lesson from under the edge, looks at the label, which it
// cannot read, and then sees the tag, which is a picture. It tries to get you
// to notice: goes and stands under it, throws its fingertip of light at it,
// jumps for it. Then it tries to say what it is, and cannot: Penny has no
// words. So it tells Dot, in hums. Dot is a stamp, and knows words: it turns
// to you and says what Penny means, "You're part of an experiment.", as the
// audio guide would, and the reading opens.
//
// Without Dot (who is met on the walk, a quarter of the way through) there is
// nobody to say it: Penny tries, cannot, and rests. The tag can be pressed at
// any time by anybody, and that opens the reading too; the telling waits for a
// visit when Dot is there. How far the story has got is kept on the device
// (radio:story:v1): not yet seen; 'seen' (Penny has noticed the tag); 'found'
// (the reading was opened from the tag, with no Dot to say it); 'told'.
//
// Afterwards Penny only keeps time: one small hop at the top of each bar, the
// same whatever is playing, so that it gives no opinion of a station. Nothing
// anybody on this screen does says which station to keep.
//
// Behind it, out of sight until the tag on its side is pressed, it is an
// experiment in whether what you like in a loop can be predicted. Every
// station kept is a label; what is measured about a loop, the model, and the
// test of whether the model can really tell are in jam/taste-model.js. The
// reading asks the question the piece asks before it shows any of that, and
// leaves it open (README, "The question Penny's Radio asks"): nothing on this
// screen answers it.
//
// Two things are done for the sake of the experiment and not of the radio. A
// station cannot be kept until both have been listened to. And which of the
// two is tuned in when a new pair arrives is decided by a coin, so that "the
// one I heard first" is not always the newcomer.

import { audio, noise, play as sfx, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { ask } from '/shared/ask.js';
import { decode, encode } from './beat.js';
import { LAYERS, ROWS, STEPS, createLoop } from './engine.js';
import { arrange } from './form.js';
import { claim as callPal } from '/penny/pal.js';
import { ASK, G4, GASP, PLEASE, RELIEF, SIGH, THIS_WAY, WONDER, hasDot } from '/penny/penny.js';
import { NEEDED, REIGN, WARMUP, begin, choose, fit, leanings, pairVector, standing } from './taste-model.js';

const KEY = 'jam:taste:v1';
const TAUGHT_KEY = 'radio:taught:v1'; // it has been shown how, on this device
const STORY_KEY = 'radio:story:v1'; // how far the story has got: nothing yet, 'seen', 'found' or 'told'
const STUCK = [[G4, 0.1], [0, 0.14], [G4, 0.08]]; // Penny, trying to say it: two starts on one low note, and nothing
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
// The signs the one who shows how hangs over the label: drawn, never written, square-ended, in the one weight.
const SIGN = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square">${inner}</svg>`;
const SIGNS = {
  swipe: SIGN('<circle cx="18.5" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M14.6 12H4.6M8.6 8l-4 4 4 4"/>'), // a fingertip drawn across
  other: SIGN('<circle cx="5.5" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M9.4 12h10M15.4 8l4 4-4 4"/>'), // and back the other way
  play: SIGN('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'), // the play button's own sign
  listen: SIGN('<path d="M7 10a5 5 0 0 1 10 0c0 2.7-2.6 3.6-3 5.6-.4 2-1.8 3.4-3.7 3.4-1.4 0-2.5-.8-3-1.9"/><path d="M10 10.2a2 2 0 0 1 4 0c0 1.3-1.2 1.6-1.7 2.6"/>'), // an ear
  keep: SIGN('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.6" stroke-width="1.8"/><circle cx="12" cy="12" r="9.2" stroke-width="1.8"/>'), // a fingertip, and two rings: twice
  'not-yet': SIGN('<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v2c0 3 4 4.4 4 6.5s-4 3.5-4 6.5v2M16 3.5v2c0 3-4 4.4-4 6.5s4 3.5 4 6.5v2"/><path d="M9.6 19.6h4.8L12 17.2z" fill="currentColor" stroke="none"/>'), // an hourglass
};

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
    freq: $('radio-freq'), tag: $('radio-tag'), signal: $('radio-signal'), behind: $('taste-behind'), reading: root.querySelector('#taste-behind .taste-lab'),
    presetsOpen: $('taste-presets-open'), presets: $('taste-presets'), presetsNone: $('presets-none'), dotTold: $('dot-told'),
    lamps: [...root.querySelectorAll('#taste-presets .preset-lamps i')],
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
  // A station is not its loop played round and round: that goes stale in a
  // quarter of a minute. It is played in its long form (jam/form.js), loops
  // within loops, the same rules for every station; and the clock of that
  // form runs on from one pair to the next, so a station that is kept is
  // heard further into its piece each time, not from the top again.
  const loop = createLoop(life, () => (started ? { tempo: state.current[up].tempo, sets: sets[up], long: true } : null));
  let barNow = 0; // the bar being heard, counted from when the radio was turned on

  // --- The card ------------------------------------------------------------------------------
  // Each side is a picture of its loop, and the picture is lit by the loop as
  // it plays. The board, with a dot for every note in its instrument's colour.
  // Over it hang four lamps, one for each instrument, and each throws its
  // beam when its instrument sounds. A note that sounds jumps and flares, and a
  // ring spreads from it. A bar of light crosses with the beat, the edge of
  // the card glows in the colour of what has just sounded, and at the top of
  // every bar a gleam runs across the whole card.
  const [WIDE, HIGH] = [STEPS * 10, ROWS * 10];
  // The picture of one bar: what is played in it (jam/form.js), which is the
  // station's loop as that bar of its long form has it. `level` is how hard
  // each instrument is played: one that is resting has its lamp out.
  function picture({ sets: playing, level }) {
    const beams = LAYERS.map((kind, index) => {
      const x = WIDE * ((index + 0.5) / LAYERS.length);
      return `<path class="beam" data-layer="${index}" d="M${x - 2} -6 L${x + 2} -6 L${x + 17} ${HIGH + 4} L${x - 17} ${HIGH + 4} Z" fill="${kind.colour}" opacity="0"/>`
        + `<circle class="lamp" data-layer="${index}" cx="${x}" cy="-5" r="2.2" fill="${kind.colour}" opacity="${playing[index].size && level[index] > 0 ? 0.55 : 0.15}"/>`;
    });
    const dots = [];
    playing.forEach((tiles, index) => {
      for (const tile of tiles) {
        const [step, row] = [Math.floor(tile / ROWS), tile % ROWS];
        dots.push(`<rect class="dot" data-step="${step}" data-layer="${index}" x="${step * 10 + 1.5}" y="${row * 10 + 1.5}" width="7" height="7" rx="2" fill="currentColor" style="color:${LAYERS[index].colour}"/>`);
      }
    });
    return `<svg viewBox="0 -8 ${WIDE} ${HIGH + 8}" aria-hidden="true"><g class="beams">${beams.join('')}</g><rect class="now" x="0" y="0" width="10" height="${HIGH}" rx="3" opacity="0"/>${dots.join('')}<g class="rings"></g></svg>`;
  }
  // Put on a side's display the bar that is being played (or is about to be).
  const painted = { front: -1, back: -1 };
  function paint(side) {
    faces[side].querySelector('.pic').innerHTML = picture(arrange(sets[side], barNow));
    painted[side] = barNow;
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
      paint(side);
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
    if (painted[up] !== barNow) paint(up); // (its display was left at the bar it was last tuned in at)
    tune();
    story.did('tune');
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
      story.refused();
      if (unheard !== up) turn(); // and here it is
      el.card.classList.remove('nope');
      void el.card.offsetWidth;
      el.card.classList.add('nope');
      return;
    }
    const picked = up;
    const keptName = name(picked);
    // (bar: where in the long form the radio was when this was kept, for whoever studies the data)
    choose(state, picked, Math.random, { at: Date.now(), ms: Math.round(performance.now() - shownAt), flips, heardFront: Math.round(heardMs.front), heardBack: Math.round(heardMs.back), bar: barNow });
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
    story.did('keep', saved);
    show();
    notes();
  }

  // --- The story ---------------------------------------------------------------------------
  const world = root.querySelector('.radio-world');
  const labTag = $('taste-behind-open');
  const label = root.querySelector('.gallery-label'); // the gallery's, on the plinth
  const [dashEl, sign, orders, bubble, ray, aloud] = [$('radio-dash'), $('dash-sign'), $('dash-says'), $('dot-says'), $('radio-ray'), $('radio-story')];
  const [cue, reticle] = [root.querySelector('.radio .cue'), root.querySelector('.radio .reticle')];
  const withDot = hasDot(); // Dot is met on the walk: without it there is nobody to say what Penny means
  const HOME = 0.2; // where Penny stands when nothing is going on
  const pal = callPal(life, { x: HOME, height: 'low', mood: 'calm', dot: withDot });
  const told = () => load(STORY_KEY) ?? null;
  const say$ = (text) => { aloud.textContent = text; }; // for a screen reader: what is happening, in words
  // do a thing over again from its start (a class that plays once), and take it off afterwards
  const once = (element, name, ms) => {
    element.classList.remove(name);
    void element.getBoundingClientRect();
    element.classList.add(name);
    if (ms) life.setTimeout(() => element.classList.remove(name), ms);
  };
  // A scene is a run of beats, each a while after the one before. Anything
  // the player does that settles the matter cuts it: what was still to come
  // does not.
  let scene = 0;
  const cut = () => { scene += 1; };
  function run(beats) {
    const mine = scene;
    let wait = 0;
    for (const [after, beat] of beats) {
      wait += after;
      life.setTimeout(() => { if (mine === scene && !life.over) beat(); }, wait);
    }
  }
  const story = { running: false, resume: false, opens: true };
  // The radio holds its breath for the one telling, and gets it back after.
  function hush(on) {
    if (on && started) {
      story.resume = true;
      started = false;
    } else if (!on && story.resume) {
      story.resume = false;
      started = true;
    }
    tune();
  }

  // -- the one who shows how
  const dash = {
    on: false,
    said: '',
    sound(kind) { // short and bright, all of it
      if (!audio()) return;
      if (kind === 'arrive') { noise({ dur: 0.09, from: 5200, to: 1800, q: 0.8, gain: 0.04 }); tone({ at: 0.09, freq: 1568, dur: 0.03, type: 'square', gain: 0.03 }); }
      if (kind === 'order') { tone({ freq: 1175, dur: 0.04, type: 'square', gain: 0.03 }); tone({ at: 0.09, freq: 1175, dur: 0.11, type: 'square', gain: 0.03 }); }
      if (kind === 'tick') tone({ freq: 2093, dur: 0.03, type: 'square', gain: 0.03 });
      if (kind === 'leave') { noise({ dur: 0.18, from: 900, to: 7000, q: 0.7, gain: 0.04 }); tone({ at: 0.16, freq: 2637, dur: 0.05, type: 'triangle', gain: 0.04 }); }
    },
    arrive() {
      dashEl.hidden = false;
      dashEl.classList.remove('leaving');
      once(dashEl, 'arriving', 260);
      dash.on = true;
      dash.sound('arrive');
    },
    // where its eyes are: on you, on the display, on the signal, or on the play button
    look(at) {
      const [x, y] = { you: [0, 0], display: [-1.7, -1.5], meter: [-1.4, -0.6], play: [-1.6, 0.3] }[at] ?? [0, 0];
      dashEl.style.setProperty('--look-x', `${x}px`);
      dashEl.style.setProperty('--look-y', `${y}px`);
    },
    // An order, on the sign over the label: one of SIGNS, drawn. `spoken` is the
    // same in words, for a screen reader (#dash-says), and for somebody who
    // cannot make the gesture it names (a screen reader takes swipes and double
    // taps for itself). An empty order takes the sign down.
    say(order, spoken = '', quiet = false) {
      if (dash.said === order) return;
      dash.said = order;
      sign.classList.remove('taken');
      sign.replaceChildren();
      orders.textContent = spoken;
      if (!order) return;
      const seen = document.createElement('span');
      seen.innerHTML = SIGNS[order];
      seen.dataset.order = order;
      sign.append(seen);
      once(sign, 'fed', 200);
      if (!quiet) dash.sound('order');
    },
    tick() {
      once(dashEl, 'ticked', 460);
      dash.sound('tick');
    },
    // It goes up the side of the set, and takes its sign off the label as it goes.
    leave() {
      dash.on = false;
      dashEl.classList.add('leaving');
      sign.classList.add('taken');
      dash.sound('leave');
      life.setTimeout(() => {
        if (dash.on) return;
        dashEl.hidden = true;
        dash.say('');
      }, still ? 0 : 300);
    },
  };
  // its pointer: chevrons across the display for a swipe, four corners twice for two taps
  const point = (kind) => once(kind === 'swipe' ? cue : reticle, 'on', still ? 900 : kind === 'swipe' ? 940 : 500);

  // The lesson: one thing at a time ('tune', 'listen', 'keep'), and the next
  // waits until that has been done. What is to be done now is on the sign for
  // as long as it stands, and is pointed at again every few seconds, the same
  // each time: it does not count down and it does not get louder.
  const lesson = { step: null, timer: 0, called: -1 }; // called: the scene in which that one was last sent for
  function order() {
    clearTimeout(lesson.timer);
    if (life.over || lesson.step === null || !dash.on) return;
    const bothHeard = SIDES.every((side) => heardMs[side] >= LISTEN_MS);
    const listening = lesson.step === 'listen' && started && heardMs[up] < LISTEN_MS;
    if (lesson.step === 'tune') {
      dash.say('swipe', 'Swipe, or press Tune.');
    } else if (lesson.step === 'listen' && !started) {
      dash.say('play', 'Press Play.');
    } else if (listening) {
      dash.say('listen', 'Listen.', true); // (nothing is sounded over a station that is being listened to)
    } else if (lesson.step === 'listen') {
      if (bothHeard) lesson.step = 'keep';
      else dash.say('other', 'The other one: swipe, or press Tune.');
    }
    if (lesson.step === 'keep') dash.say('keep', 'Tap twice, or press Keep, to keep one.'); // (it names no station)
    const pointing = lesson.step === 'tune' || (lesson.step === 'listen' && started && !listening) ? 'swipe' : lesson.step === 'keep' ? 'taps' : null;
    dash.look(pointing ? 'display' : listening ? 'meter' : lesson.step === 'listen' ? 'play' : 'you');
    if (pointing) {
      point(pointing);
      life.setTimeout(() => { if (dash.on) dash.look('you'); }, 1000);
    }
    // Penny, from under the edge: it watches that one; and while a station is being listened to, it listens
    if (listening) pal.height('peek').mood('listening').look(null);
    else pal.height('peek').mood('unsure').look(dashEl);
    pal.look(dashEl, 'dot');
    lesson.timer = life.setTimeout(order, listening || (lesson.step === 'listen' && !started) ? 1600 : 3800);
  }
  // It comes to stand by the set, a while from now, and gives its order. (A scene like any other: if it is cut
  // before it has come, the reading's closing sends for it again, while there is still something to show.)
  function sendFor(after) {
    lesson.called = scene;
    run([
      [after, () => { dash.arrive(); say$('An express letter in an attendant’s cap has come to stand by the radio, and hangs a sign over its label. Penny watches it from under the edge.'); }],
      [260, () => { pal.height('peek').mood('unsure').look(dashEl); pal.look(dashEl, 'dot'); }],
      [540, order],
    ]);
  }
  function teach() {
    cut();
    story.running = false;
    lesson.step = 'tune';
    world.dataset.story = 'lesson';
    sendFor(900);
  }

  // -- the tag, and what Penny does about it
  const ring = () => once(labTag, 'shown', still ? 1400 : 720); // warm: Penny's
  const glint = () => once(labTag, 'glint', 540); // cold: the lab's
  // the fingertip of light, from Penny's seal to the tag
  function throwAt(fast = false) {
    if (still) {
      ring();
      return;
    }
    const base = world.getBoundingClientRect();
    const from = pal.penny.querySelector('.seal').getBoundingClientRect();
    const to = labTag.querySelector('.lab-plate').getBoundingClientRect();
    const [fx, fy] = [from.left + from.width / 2 - base.left, from.top + from.height / 2 - base.top];
    const [tx, ty] = [to.left + to.width / 2 - base.left, to.top + to.height / 2 - base.top];
    const ms = fast ? 360 : 700;
    ray.animate([
      { opacity: 0, translate: `${fx}px ${fy}px`, scale: 0.6 }, { opacity: 0.95, translate: `${fx}px ${fy - 6}px`, scale: 1, offset: 0.12 },
      { opacity: 0.9, translate: `${tx}px ${ty}px`, scale: 0.8, offset: 0.92 }, { opacity: 0, translate: `${tx}px ${ty}px`, scale: 1.3 },
    ], { duration: ms, easing: 'ease-in-out' });
    life.setTimeout(ring, ms - 40);
  }
  // how long Penny takes to walk to x (penny/pal.js: half a second, and more the further it is)
  const walk = (x) => (still ? 0 : 500 + Math.abs(Math.max(0.12, Math.min(0.88, x)) - pal.x) * 1600);
  const upThere = () => ({ x: window.innerWidth * 0.92, y: 0 }); // the way that one went
  const goHome = () => [
    [0, () => { pal.lean(0).mood('calm').look(null).goTo(HOME); pal.look(null, 'dot'); }],
    [walk(HOME) + 100, () => { pal.settle('peek'); story.running = false; world.dataset.story = 'done'; }],
  ];

  // It notices. First the label, which is words, and Penny cannot read; then the tag, which is a picture.
  function notice() {
    cut();
    story.running = true;
    world.dataset.story = 'noticed';
    if (told() === null) save(STORY_KEY, 'seen');
    run([
      [0, () => { pal.mood('unsure').look(label); pal.look(label, 'dot'); say$('Penny looks at the label on the plinth, and cannot read it.'); }],
      [1100, () => { glint(); say$('On the side of the radio hangs a tag with a flask on it. Penny has seen it.'); }],
      [400, () => { pal.rise().mood('curious').look(labTag); pal.sing(GASP, 0.45); pal.look(labTag, 'dot'); }],
      [1000, () => pal.look(null)], // did you see?
      [500, () => pal.look(labTag)],
      [700, () => attempt(true)],
    ]);
  }
  // It tries to get you to notice: once gently, and (first time round) once harder.
  function attempt(twice) {
    const under = pal.under(labTag);
    world.dataset.story = 'trying';
    run([
      [0, () => { pal.mood('hopeful').goTo(under); say$('Penny goes to stand under the tag, and looks at you.'); }],
      [walk(under) + 150, () => { pal.rise().look(labTag); pal.look(labTag, 'dot'); }],
      [450, () => { throwAt(); pal.sing(ASK, 0.5); }],
      [900, () => pal.look(null).gesture('hop')],
      ...(twice ? [
        [1100, () => { pal.mood('pleading').look(labTag).gesture('jump'); pal.sing(PLEASE, 0.5); }], // it is far out of reach
        [330, () => throwAt(true)],
        [380, () => throwAt(true)],
        [450, () => pal.look(null)],
        [450, () => pal.look(labTag)],
        [450, () => pal.look(null)],
      ] : []),
      [900, cannot],
    ]);
  }
  // It tries to say it, and cannot.
  function cannot() {
    world.dataset.story = 'stuck';
    run([
      [0, () => { pal.look(null).mood('holding').glow(1, 300); say$('Penny tries to say what it is, and cannot.'); }],
      [150, () => pal.sing(STUCK, 0.35)],
      [650, () => { pal.mood('sad').gesture('sink').glow(0.1, 500); pal.sing(SIGH, 0.45); }],
      [900, () => (withDot ? tell() : rest())],
    ]);
  }
  // Nobody to say it for it. It rests there a while, tries once more, and goes back.
  function rest() {
    world.dataset.story = 'waiting';
    run([
      [0, () => { pal.mood('unsure').look(labTag); say$('Penny cannot say what it is. The tag on the side of the radio can be pressed.'); }],
      [5000, () => { pal.look(labTag); throwAt(); }],
      [900, () => pal.look(null)],
      [5200, () => {}],
      ...goHome(),
    ]);
  }
  // It tells Dot: the one that left, the tag, you.
  function tell() {
    world.dataset.story = 'telling';
    hush(true);
    run([
      [0, () => { pal.mood('worried').look(pal.dot).lean(-1); pal.look(pal.penny, 'dot'); say$('Penny turns to Dot and hums: the one that left, the tag, you.'); }],
      [450, () => { pal.look(upThere()); pal.sing(THIS_WAY, 0.55); }],
      [1100, () => { pal.look(labTag); throwAt(); pal.sing(WONDER, 0.55); pal.look(labTag, 'dot'); }],
      [380, () => pal.look(pal.penny, 'dot')], // (a glance at it, no more: Dot is listening to Penny)
      [520, () => { pal.look(pal.dot).mood('pleading').gesture('hop'); pal.sing(PLEASE, 0.6); }],
      [650, () => pal.look(null)], // tell them
      [320, () => pal.look(pal.dot)],
      [330, () => pal.gesture('nod', 'dot')], // Dot has it
      [550, says],
    ]);
  }
  // Dot says what Penny means.
  const LINE = ['You’re part', 'of an', 'experiment.'];
  function says() {
    world.dataset.story = 'said';
    save(STORY_KEY, 'told');
    const word = (index, freq, dur) => () => {
      bubble.querySelectorAll('span:not(.sr-only)')[index]?.classList.add('said');
      pal.gesture('nod', 'dot');
      if (audio()) tone({ freq, dur, type: 'sine', gain: 0.1 }); // a bell for each, falling: a thing said comes down
    };
    run([
      [0, () => {
        pal.lean(0).mood('holding').look(pal.dot);
        pal.look(null, 'dot');
        pal.gesture('start', 'dot');
        sfx('squeak');
        if (!pal.inTheWay) pal.height('face'); // (so that Dot's mouth is above the edge)
      }],
      [520, () => {
        // the whole line goes into the bubble at once (so it is read out once); how it arrives is only how it is shown
        bubble.innerHTML = `<span class="sr-only">Dot says: </span>${LINE.map((part) => `<span>${part}</span>`).join(' ')}`;
        if (still) bubble.querySelectorAll('span').forEach((span) => span.classList.add('said'));
        placeBubble();
      }],
      [200, word(0, 783.99, 0.2)],
      [260, word(1, 659.25, 0.2)],
      [260, () => { word(2, 523.25, 0.34)(); pal.mood('glad').gesture('nod').look(null); pal.sing(RELIEF, 0.5); }],
      [1500, unasked],
    ]);
  }
  // Beside Dot, on the side away from Penny, never off the screen, and never
  // under Dot: Penny and Dot are in a layer above the page, so anything of
  // the page's that they overlap is hidden. It is as wide as the room there is.
  // And not over the gallery's label: it goes below it, over the floor, as far
  // as there is the room. (Its size is read as it is laid out, not as it is
  // drawn: it is drawn growing.)
  function placeBubble() {
    const base = world.getBoundingClientRect();
    const dot = pal.dot.getBoundingClientRect();
    const room = dot.left - base.left - 12 - 16; // from the edge of the screen to Dot, less a margin and the tail
    bubble.style.maxWidth = `${Math.max(112, Math.round(room))}px`;
    const [wide, high] = [bubble.offsetWidth, bubble.offsetHeight];
    const left = Math.max(12, dot.left - base.left - 16 - wide);
    let top = Math.max(12, Math.min(dot.top - base.top + dot.height * 0.3 - high, base.height - high - 12));
    const words = label.getBoundingClientRect();
    const [above, below] = [words.top - base.top - 6, words.bottom - base.top + 6];
    if (top < below && top + high > above) top = Math.max(12, Math.min(below, base.height - high - 8));
    bubble.style.translate = `${Math.round(left)}px ${Math.round(top)}px`;
  }
  life.on(window, 'resize', () => { if (bubble.childElementCount) placeBubble(); });
  // The reading opens by itself, this once: but never under a finger, nor into a tab nobody is looking at.
  let fingers = 0;
  let touched = 0;
  life.on(window, 'pointerdown', () => { fingers += 1; touched = performance.now(); }, true);
  const lifted = () => { fingers = Math.max(0, fingers - 1); touched = performance.now(); };
  life.on(window, 'pointerup', lifted, true);
  life.on(window, 'pointercancel', lifted, true);
  function unasked() {
    const clear = fingers === 0 && performance.now() - touched >= 600 && !document.hidden && !document.querySelector('dialog[open]');
    if (!clear) {
      run([[300, unasked]]);
      return;
    }
    if (!story.opens) { // they have read it already: the line is said, and the sheet is left to them
      ring();
      run([[1000, () => bubble.replaceChildren()], ...goHome()]);
      hush(false);
      return;
    }
    pal.gesture('hop', 'dot');
    ring();
    bubble.replaceChildren();
    openSheet();
  }
  // The reading opens at its top, with its title focused (autofocus), whatever was read of it last time.
  function openSheet() {
    notes();
    el.dotTold.hidden = !(withDot && told() === 'told'); // Dot's line goes with you into the reading: the audio guide's stop
    if (el.behind.open) return;
    el.reading.scrollTop = 0;
    el.behind.showModal();
  }
  // The tag is pressed: you saw it. Whatever Penny was in the middle of, that is what it wanted.
  labTag.addEventListener('click', () => {
    const wanted = story.running || told() === null || told() === 'seen';
    cut();
    bubble.replaceChildren();
    if (withDot) save(STORY_KEY, 'told');
    else if (told() !== 'told') save(STORY_KEY, 'found');
    if (wanted && lesson.step === null) {
      story.running = true;
      ring();
      pal.rise().lean(0).mood('thrilled').look(null).gesture('jump').hearts(3);
      pal.gesture('hop', 'dot');
    }
    openSheet();
  });
  el.behind.addEventListener('close', () => {
    hush(false);
    if (lesson.step !== null) { // that one is still showing how: it goes on (and if the tag kept it from coming, it comes now)
      if (!dash.on && lesson.called !== scene) sendFor(600);
      return;
    }
    // (and if the tag cut short what was to come after the first station was kept, Penny goes back all the same)
    if (story.running || world.dataset.story === 'said' || world.dataset.story === 'taken') run([[300, () => pal.mood('glad').look(null)], [500, () => {}], ...goHome()]);
  });

  // What the radio tells the story has happened: a swipe ('tune'), a station
  // heard through ('listen'), a station kept ('keep').
  story.did = (what, saved = false) => {
    if (lesson.step !== null) {
      const bothHeard = SIDES.every((side) => heardMs[side] >= LISTEN_MS);
      if (what === 'tune') {
        if (lesson.step === 'tune') {
          lesson.step = 'listen';
          if (dash.on) dash.tick(); // processed, not cheered
          pal.look(null).gesture('nod'); // (Penny is on your side, whichever station it is)
        } else if (lesson.step === 'listen' && bothHeard) {
          lesson.step = 'keep';
        }
        clearTimeout(lesson.timer);
        lesson.timer = life.setTimeout(order, 500);
      } else if (what === 'listen' && lesson.step === 'listen') {
        if (dash.on) dash.tick();
        if (bothHeard) lesson.step = 'keep';
        clearTimeout(lesson.timer);
        lesson.timer = life.setTimeout(order, 500);
      } else if (what === 'keep') {
        // The first station kept. It ticks, and is gone; nobody cheers. Its going is not a beat of a scene: whatever
        // cuts the scene (the tag, pressed at once), it still goes, and takes its sign with it. (Unless it has been
        // asked to show how again in the meantime: then it is still wanted.)
        clearTimeout(lesson.timer);
        lesson.step = null;
        save(TAUGHT_KEY, true);
        cut();
        world.dataset.story = 'taken';
        say$('It ticks, and is gone, up the side of the radio, with its sign.');
        pal.look(null).gesture('nod');
        const done = () => dash.on && lesson.step === null;
        if (dash.on) dash.tick();
        life.setTimeout(() => { if (done()) dash.look('you'); }, 450);
        life.setTimeout(() => { if (done()) dash.leave(); }, 800);
        run([
          [800, () => { pal.mood('surprised').look(upThere()); pal.look(upThere(), 'dot'); }],
          [500, () => {
            if (told() === null) notice();
            else if (told() === 'found' && withDot) again$();
            else run(goHome());
          }],
        ]);
      }
      return;
    }
    if (story.running) return; // (Penny does not break off what it is telling you to nod at a station)
    if (what === 'keep') {
      // it is glad of a station kept, the same every time, and gladder of a preset
      pal.rise().mood(saved ? 'thrilled' : 'glad').look(null).gesture(saved ? 'jump' : 'nod');
      if (saved) pal.hearts(3);
      glint(); // and the tag glints: it is in the reading now, the same whichever it is
      clearTimeout(lesson.timer);
      lesson.timer = life.setTimeout(() => { if (!story.running) pal.mood('calm').look(null).settle('peek'); }, 1500);
    }
  };
  // A station kept before both have been heard.
  story.refused = () => {
    if (lesson.step !== null && dash.on) { // the refusal is that one's, while it is here: and it gives no reason either
      dash.said = '';
      dash.say('not-yet', 'Not yet.');
      once(dashEl, 'refusing', 220);
      clearTimeout(lesson.timer);
      lesson.timer = life.setTimeout(() => { dash.said = ''; order(); }, 900);
      return;
    }
    if (story.running) return;
    pal.rise().mood('no').gesture('shake');
    clearTimeout(lesson.timer);
    lesson.timer = life.setTimeout(() => { if (!story.running) pal.mood('calm').look(null).settle('peek'); }, 900);
  };
  // The top of a bar: when nothing else is going on, Penny keeps time, the same whatever is playing.
  story.beat = () => {
    if (lesson.step === null && !story.running && !still) pal.gesture('hop');
  };
  // Shown again, from the start: all of it.
  story.again = () => {
    save(TAUGHT_KEY, false);
    save(STORY_KEY, null);
    bubble.replaceChildren();
    dash.on = false;
    dashEl.hidden = true;
    dash.said = '';
    sign.classList.remove('taken');
    sign.replaceChildren();
    orders.textContent = '';
    pal.lean(0).goTo(HOME);
    story.opens = true;
    teach();
  };
  // Somebody who found the tag before there was a Dot to say it, back with Dot: it is said now. They have read the sheet.
  function again$() {
    cut();
    story.running = true;
    story.opens = false;
    const under = pal.under(labTag);
    run([[0, () => pal.mood('hopeful').goTo(under)], [walk(under) + 150, () => { pal.rise().look(labTag); }], [500, tell]]);
  }

  // Where the story is taken up, on arriving.
  if (told() === null) teach(); // not seen yet: all of it, from the one who shows how (even to somebody who knows how)
  else if (told() === 'seen') life.setTimeout(() => { if (!life.over && lesson.step === null) { story.running = true; attempt(false); } }, 1500);
  else if (told() === 'found' && withDot) life.setTimeout(() => { if (!life.over) again$(); }, 1500);
  else life.setTimeout(() => { if (!story.running) pal.mood('calm').look(null).settle('peek'); }, 1200);

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
    if (event.target !== el.card) return; // (Enter on the tag opens the sheet: it does not keep a station)
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
    const { step, bar } = loop.heard();
    if (step >= 0 && bar !== barNow) { // a new bar of the form: the display shows what this one has in it
      barNow = bar;
      paint(up);
    }
    if (step !== lit) {
      lit = step;
      if (step >= 0) light(up, step);
      if (step === 0) story.beat();
    }
    if (step >= 0) {
      const before = heardMs[up];
      heardMs[up] += Math.min(250, now - last); // (a long gap between frames is the screen having been away, not listening)
      const bars = (ms) => Math.min(3, Math.floor((ms / LISTEN_MS) * 3));
      if (bars(before) !== bars(heardMs[up])) { // the signal fills as it is listened to
        tune();
        if (heardMs[up] >= LISTEN_MS) story.did('listen');
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

  // --- The reading, and the presets ---------------------------------------------------------------
  const small = (beat) => `<svg viewBox="0 0 ${STEPS * 4} ${ROWS * 4}" aria-hidden="true">${beat.notes.map((tiles, index) => tiles.map((tile) => `<rect x="${Math.floor(tile / ROWS) * 4 + 0.5}" y="${(tile % ROWS) * 4 + 0.5}" width="3" height="3" rx="0.8" fill="${LAYERS[index].colour}"/>`).join('')).join('')}</svg>`;
  const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
  const times = (value) => `×${value >= 10 ? value.toFixed(0) : value.toFixed(2)}`;
  const OUT = '<svg class="out" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/></svg>';
  // (Nothing outside the reading follows how the experiment stands: not the light, not the room, not Penny.)
  function notes() {
    const now = standing(state.trials);
    el.picks.textContent = String(now.picks);
    el.called.textContent = now.called ? `${now.right} of ${now.called} (${percent(now.right, now.called)})` : '–';
    el.habits.textContent = now.called ? `${now.habitsRight} of ${now.called} (${percent(now.habitsRight, now.called)})` : '–';
    el.coin.textContent = now.bets ? `${now.won} of ${now.bets} (${percent(now.won, now.bets)})` : '–';
    el.stake.textContent = `${times(now.stake)} of ×${NEEDED}`;
    el.meter.style.setProperty('--full', Math.max(0, Math.min(1, Math.log(Math.max(now.peak, 1)) / Math.log(NEEDED))).toFixed(3));
    el.meter.setAttribute('aria-label', `The furthest the stake has got: ${times(Math.max(now.peak, 1))}, of the ×${NEEDED} that is significant`);
    // Its caption says what is measured, and never answers anything: no "yes", no "not yet", nothing that waits for a
    // result as if it must come, and nothing that counts down. Set the same however it stands: no state is given more
    // weight than another (README, "The question Penny's Radio asks").
    el.meter.classList.toggle('done', now.significant);
    if (now.picks < WARMUP) {
      el.verdict.textContent = 'From the tenth choice on, the model calls each one before it is made.'; // (WARMUP, in words, as "How it works" has it)
    } else if (now.significant) {
      el.verdict.textContent = `Significant at choice ${now.reachedAt}: p = ${now.p.toFixed(3)}. The music itself predicts the choices.`;
    } else {
      el.verdict.textContent = `So far p = ${now.p.toFixed(2)}. The test is significant if the stake reaches ×${NEEDED} (p = 0.05).`;
    }
    // the presets: a lamp on the set for each (five at most), the same lamps at the head of their sheet, and all of
    // them in it, the latest first: each as its picture and its place on the dial. What it is and where it goes is
    // for a screen reader; to the eye, an arrow is the way out.
    const kept = state.retired.length;
    for (const lamps of [[...el.presetsOpen.children], el.lamps]) lamps.forEach((lamp, index) => lamp.classList.toggle('lit', index < Math.min(SLOTS, kept)));
    el.presetsOpen.setAttribute('aria-label', kept ? `Presets: ${kept} saved` : 'Presets: none yet');
    el.presetsNone.hidden = kept > 0;
    el.hall.replaceChildren(...state.retired.map((beat, index) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `/jam/?b=${encode(beat)}`;
      a.innerHTML = `<span class="pic">${small(beat)}</span><span class="where"><b>${dialOf(beat).toFixed(1)}<small> FM</small></b><span class="sr-only">, preset ${index + 1}. Open it in the music maker.</span></span>${OUT}`;
      li.append(a);
      return li;
    }).reverse());
    const likes = leanings(state.weights);
    el.likes.textContent = now.picks < WARMUP || likes.length === 0 ? '' : `So far it thinks you go for ${likes.map((one) => one.words).join(', ')}.`;
  }

  const copyWords = el.copy.textContent;
  let copyTimer = 0;
  el.copy.addEventListener('click', async () => {
    const data = JSON.stringify({ made: new Date().toISOString(), standing: standing(state.trials), weights: state.weights, trials: state.trials.map(packPair) });
    try {
      await navigator.clipboard.writeText(data);
      say(`Copied ${state.trials.length} picks.`);
      el.copy.textContent = 'Copied'; // (said on the button, in the reading: the line under the radio is for a screen reader)
      clearTimeout(copyTimer);
      copyTimer = life.setTimeout(() => { el.copy.textContent = copyWords; }, 2000);
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

  // The presets' sheet, and the reading's. (The reading is opened from the tag on the side of the set: see the story, above.)
  el.presetsOpen.addEventListener('click', () => {
    notes();
    el.presets.showModal();
  });
  $('taste-presets-close').addEventListener('click', () => el.presets.close());
  el.presets.addEventListener('click', (event) => { if (event.target === el.presets) el.presets.close(); });
  $('taste-behind-close').addEventListener('click', () => el.behind.close());
  $('taste-again').addEventListener('click', () => {
    el.behind.close();
    story.again();
  });
  el.behind.addEventListener('click', (event) => { if (event.target === el.behind) el.behind.close(); }); // a tap outside it
  life.onEnd(() => { for (const sheet of [el.behind, el.presets]) if (sheet.open) sheet.close(); });

  if (still) el.card.classList.add('still');
  show();
  notes();
}
