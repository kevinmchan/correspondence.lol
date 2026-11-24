// Loops: a music maker. The screen is a board of tiles, eight steps across and
// seven notes high, and it plays round and round. Tap a tile to put a note
// there, or drag to lay down several; tap a note to take it away. There are
// four layers, each an instrument with its own colour, that loop together.
//
// What makes it music and not only a pattern is borrowed from the game's own
// background music (postmarks/sound.js), which is why the two now sound alike:
//   - Harmony that moves. The board is played four times over, once for each
//     of the game's four chords (C, A minor, F, G), and a row is not a fixed
//     note but a place in the chord being played: the bottom row is its root.
//     So eight steps tapped once come back four ways, and resolve.
//   - A soft chord held under everything, swelling in and out with the bar.
//   - Room: the tuned instruments have an echo behind them, in time.
//   - Touch: the beats are louder than what falls between them, no two notes
//     are struck quite alike, and the off-steps come a hair late.
// Every row is a note of a five-note scale built on the chord, so whatever is
// tapped still fits.
//
// The sound comes from the app's one sound engine (postmarks/sound.js), on its
// clock, so the loop keeps exact time however busy the screen is.

import { audio, holdMusic, noise, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';

const STEPS = 8;
const ROWS = 7;
const SAVE_KEY = 'jam:v1';
const TEMPOS = [84, 100, 120, 140]; // beats a minute; a step is half a beat

// The chords, as the game's music has them, and the five-note scale that
// goes with each (semitones from its root). `root` is semitones from C.
const MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 3, 5, 7, 10];
const CHORDS = [
  { name: 'C', root: 0, scale: MAJOR, triad: [0, 4, 7] },
  { name: 'A minor', root: -3, scale: MINOR, triad: [0, 3, 7] },
  { name: 'F', root: -7, scale: MAJOR, triad: [0, 4, 7] },
  { name: 'G', root: -5, scale: MAJOR, triad: [0, 4, 7] },
];
const up = (hz, semitones) => hz * 2 ** (semitones / 12);
// The pitch of a row in a chord: the bottom row is the chord's root, and the
// rows go up its scale from there, into the next octave.
function pitch(base, chord, row) {
  const place = ROWS - 1 - row;
  return up(base, chord.root + chord.scale[place % 5] + 12 * Math.floor(place / 5));
}

// Each layer: how it is named, drawn, and what one of its notes sounds like.
// play(row, at, bus, chord, hard): `at` is seconds from now on the engine's
// clock; `hard` is how hard the note is struck (about 1).
const LAYERS = [
  {
    name: 'Bells', colour: '#f08a76', icon: '<path d="M12 4.5c-3 0-5 2.3-5 5.4v3.2l-1.6 2.6h13.2L17 13.1V9.9c0-3.1-2-5.4-5-5.4zM10 18.3a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    base: 523.25, tuned: true,
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 1.1, type: 'sine', gain: 0.15 * hard, attack: 0.004, into: bus }); // it rings on
      tone({ at, freq: freq * 2, dur: 0.4, type: 'sine', gain: 0.04 * hard, attack: 0.003, into: bus });
      tone({ at, freq: freq * 2.76, dur: 0.12, type: 'sine', gain: 0.02 * hard, attack: 0.002, into: bus }); // the strike
    },
  },
  {
    name: 'Keys', colour: '#f8d95a', icon: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 6v6.5M14.7 6v6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    base: 261.63, tuned: true,
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 0.75, type: 'triangle', gain: 0.15 * hard, attack: 0.01, into: bus });
      tone({ at, freq: freq * 1.004, dur: 0.7, type: 'sine', gain: 0.08 * hard, attack: 0.01, into: bus }); // a second string, a shade sharp
      tone({ at, freq: freq * 0.996, dur: 0.7, type: 'sine', gain: 0.05 * hard, attack: 0.012, into: bus }); // and a third, a shade flat
    },
  },
  {
    name: 'Bass', colour: '#736dd0', icon: '<path d="M4 14c2.2 0 2.2-4 4.4-4s2.2 4 4.4 4 2.2-4 4.4-4 1.6 2 2.8 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    base: 130.81, tuned: false, // (kept dry: an echo on a low note is mud)
    play(row, at, bus, chord, hard = 1) {
      const freq = pitch(this.base, chord, row);
      tone({ at, freq, dur: 0.5, type: 'triangle', gain: 0.26 * hard, attack: 0.008, into: bus });
      tone({ at, freq: freq / 2, dur: 0.4, type: 'sine', gain: 0.14 * hard, attack: 0.01, into: bus });
      tone({ at, freq: freq * 2, dur: 0.14, type: 'sine', gain: 0.05 * hard, attack: 0.004, into: bus });
    },
  },
  {
    name: 'Drums', colour: '#2aa198', icon: '<ellipse cx="12" cy="9" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 9v6c0 1.7 3.1 3 7 3s7-1.3 7-3V9" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    notes: ['Shaker', 'Open hat', 'Hat', 'Clap', 'Snare', 'Tom', 'Kick'], tuned: false,
    play(row, at, bus, chord, hard = 1) {
      if (row === 0) noise({ at, dur: 0.07, from: 7000, q: 3, gain: 0.07 * hard, into: bus });
      else if (row === 1) noise({ at, dur: 0.26, from: 8000, to: 6000, q: 1.2, gain: 0.09 * hard, into: bus });
      else if (row === 2) noise({ at, dur: 0.045, from: 9000, q: 2, gain: 0.09 * hard, into: bus });
      else if (row === 3) {
        for (const d of [0, 0.012, 0.026]) noise({ at: at + d, dur: 0.07, from: 1500, q: 1.4, gain: 0.14 * hard, into: bus });
      } else if (row === 4) {
        noise({ at, dur: 0.15, from: 2200, to: 1400, q: 0.8, gain: 0.2 * hard, into: bus });
        tone({ at, freq: 210, to: 150, dur: 0.1, type: 'triangle', gain: 0.12 * hard, into: bus });
      } else if (row === 5) tone({ at, freq: 170, to: 95, dur: 0.24, type: 'sine', gain: 0.3 * hard, attack: 0.003, into: bus });
      else {
        tone({ at, freq: 150, to: 44, dur: 0.24, type: 'sine', gain: 0.42 * hard, attack: 0.002, into: bus });
        noise({ at, dur: 0.02, from: 3000, q: 0.7, gain: 0.06 * hard, into: bus });
      }
    },
  },
];
const nameOf = (kind, row) => kind.notes?.[row] ?? `Note ${ROWS - row} of ${ROWS}`;

const empty = () => LAYERS.map(() => []);
const keyOf = (step, row) => step * ROWS + row;

export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  const { setInterval } = life;
  const el = { board: $('jam-board'), layers: $('jam-layers'), play: $('jam-play'), tempo: $('jam-tempo'), clear: $('jam-clear'), dice: $('jam-dice'), hint: $('jam-hint') };
  document.title = 'Loops · correspondence.lol';

  // --- What has been made: for each layer, the tiles that hold a note -----------
  const kept = load(SAVE_KEY);
  let notes = empty();
  let tempo = 1;
  if (kept && kept.v === 1 && Array.isArray(kept.notes) && kept.notes.length === LAYERS.length) {
    notes = kept.notes.map((layer) => (Array.isArray(layer) ? layer.filter((k) => Number.isInteger(k) && k >= 0 && k < STEPS * ROWS) : []));
    if (TEMPOS[kept.tempo]) tempo = kept.tempo;
  }
  const sets = notes.map((layer) => new Set(layer));
  const keep = () => save(SAVE_KEY, { v: 1, tempo, notes: sets.map((set) => [...set]) });
  let layer = 0;
  let playing = false;

  // --- The chords: four small lights over the board, one lit at a time ------------------
  const chordLights = document.createElement('div');
  chordLights.className = 'jam-chords';
  chordLights.setAttribute('role', 'img');
  for (let i = 0; i < CHORDS.length; i++) chordLights.append(document.createElement('i'));
  el.board.before(chordLights);

  // --- The board ---------------------------------------------------------------------
  const pads = [];
  el.board.style.setProperty('--steps', STEPS);
  for (let row = 0; row < ROWS; row++) {
    for (let step = 0; step < STEPS; step++) {
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'pad';
      pad.dataset.step = step;
      pad.dataset.row = row;
      if (step % 4 === 0) pad.classList.add('beat'); // the start of each half of the loop
      // one small light for each of the other layers' notes on this tile
      for (let other = 0; other < LAYERS.length; other++) {
        const light = document.createElement('i');
        light.style.setProperty('--c', LAYERS[other].colour);
        pad.append(light);
      }
      el.board.append(pad);
      pads[keyOf(step, row)] = pad;
    }
  }

  LAYERS.forEach((kind, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layer';
    button.setAttribute('role', 'radio');
    button.style.setProperty('--c', kind.colour);
    button.innerHTML = `<span class="tile"><svg viewBox="0 0 24 24" aria-hidden="true">${kind.icon}</svg></span><span class="name">${kind.name}</span><span class="count"></span>`;
    button.addEventListener('click', () => {
      layer = index;
      render();
    });
    el.layers.append(button);
  });

  function render() {
    el.board.style.setProperty('--c', LAYERS[layer].colour);
    for (let key = 0; key < pads.length; key++) {
      const pad = pads[key];
      const on = sets[layer].has(key);
      pad.classList.toggle('on', on);
      const row = Number(pad.dataset.row);
      pad.setAttribute('aria-label', `${nameOf(LAYERS[layer], row)}, step ${Number(pad.dataset.step) + 1}${on ? ', on' : ''}`);
      pad.setAttribute('aria-pressed', String(on));
      for (let other = 0; other < LAYERS.length; other++) {
        pad.children[other].hidden = other === layer || !sets[other].has(key);
      }
    }
    [...el.layers.children].forEach((button, index) => {
      button.setAttribute('aria-checked', String(index === layer));
      button.querySelector('.count').textContent = sets[index].size || '';
    });
    const any = sets.some((set) => set.size > 0);
    el.hint.hidden = any;
    el.clear.disabled = sets[layer].size === 0;
    el.tempo.textContent = `${TEMPOS[tempo]}`;
    el.play.setAttribute('aria-pressed', String(playing));
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    el.play.classList.toggle('playing', playing);
  }

  // --- Sound: the loop, written onto the engine's clock a little ahead of time ------
  let bus = null; // this screen's own volume, so leaving can fade it out
  let room = null; // where the tuned instruments go: the same, with an echo behind them
  let echo = null;
  let nextStep = 0;
  let nextTime = 0;
  let bar = 0; // how many times round: which chord
  let heard = 0; // the chord being heard now, for a note tapped in by hand
  const queue = []; // steps written but not yet heard: [{ step, time, chord }]
  const stepLength = () => 60 / TEMPOS[tempo] / 2;

  function engine() {
    const live = audio();
    if (!live) return null;
    if (!bus) {
      const { ctx } = live;
      bus = ctx.createGain();
      bus.gain.value = 0.7;
      bus.connect(live.mix);
      // the echo: a step and a half behind, each repeat duller and quieter than the last
      room = ctx.createGain();
      room.connect(bus);
      const send = ctx.createGain();
      send.gain.value = 0.3;
      echo = ctx.createDelay(1.5);
      echo.delayTime.value = stepLength() * 1.5;
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 2400;
      const again = ctx.createGain();
      again.gain.value = 0.36;
      room.connect(send).connect(echo).connect(dull).connect(bus);
      dull.connect(again).connect(echo);
    }
    return live;
  }
  const into = (kind) => (kind.tuned ? room : bus);

  function sound(layerIndex, row, at = 0) {
    if (engine()) LAYERS[layerIndex].play(row, at, into(LAYERS[layerIndex]), CHORDS[heard]);
  }

  setInterval(() => {
    const live = playing && engine();
    if (!live) {
      nextTime = 0;
      return;
    }
    const now = live.ctx.currentTime;
    if (nextTime < now) nextTime = now + 0.06; // starting, or back from being asleep
    const length = stepLength();
    while (nextTime < now + 0.14) {
      const chord = CHORDS[bar % CHORDS.length];
      // the off-steps come a hair late, and the beats are struck harder than what falls between
      const at = nextTime - now + (nextStep % 2 ? length * 0.1 : 0);
      const weight = nextStep % 4 === 0 ? 1 : nextStep % 2 === 0 ? 0.86 : 0.7;
      if (nextStep === 0 && sets.some((set) => set.size > 0)) {
        // the chord itself, held under the whole bar: it swells in, and out again
        const whole = length * STEPS;
        for (const semitones of chord.triad) {
          tone({ at, freq: up(261.63, chord.root + semitones), dur: whole * 1.08, type: 'sine', gain: 0.04, attack: whole * 0.35, into: room });
        }
      }
      for (let index = 0; index < LAYERS.length; index++) {
        for (let row = 0; row < ROWS; row++) {
          if (sets[index].has(keyOf(nextStep, row))) LAYERS[index].play(row, at, into(LAYERS[index]), chord, weight * (0.92 + Math.random() * 0.16));
        }
      }
      queue.push({ step: nextStep, time: nextTime, chord: bar % CHORDS.length });
      nextStep = (nextStep + 1) % STEPS;
      if (nextStep === 0) bar += 1;
      nextTime += length;
    }
  }, 30);

  // --- Sight: the step being heard lights up, and its notes jump -----------------------
  let shown = -1;
  let frame = 0;
  function draw() {
    const live = audio();
    let step = -1;
    if (playing && live) {
      while (queue.length > 1 && queue[1].time <= live.ctx.currentTime) queue.shift();
      if (queue.length && queue[0].time <= live.ctx.currentTime) {
        step = queue[0].step;
        heard = queue[0].chord;
      }
    }
    const lit = step < 0 ? -1 : heard;
    if (chordLights.dataset.lit !== String(lit)) {
      chordLights.dataset.lit = lit;
      [...chordLights.children].forEach((light, index) => light.classList.toggle('on', index === lit));
      chordLights.setAttribute('aria-label', lit < 0 ? 'Four chords, played in turn' : `Chord ${lit + 1} of ${CHORDS.length}: ${CHORDS[lit].name}`);
    }
    if (step !== shown) {
      for (const pad of pads) {
        const here = Number(pad.dataset.step) === step;
        pad.classList.toggle('now', here);
        if (here && (pad.classList.contains('on') || [...pad.children].some((light) => !light.hidden))) {
          pad.classList.remove('hit');
          void pad.offsetWidth;
          pad.classList.add('hit');
        }
      }
      shown = step;
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  life.onEnd(() => cancelAnimationFrame(frame));

  function setPlaying(on) {
    playing = on;
    if (on) {
      nextStep = 0;
      nextTime = 0;
      bar = 0;
      heard = 0;
      queue.length = 0;
    }
    render();
  }

  // --- Touch: tap a tile, or drag across several ----------------------------------------
  let stroke = null; // while a finger is down: whether it is adding or taking away
  const padAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.pad') ?? null;

  function touch(pad) {
    if (!pad || !el.board.contains(pad)) return;
    const key = keyOf(Number(pad.dataset.step), Number(pad.dataset.row));
    if (stroke.seen.has(key)) return;
    stroke.seen.add(key);
    if (stroke.adding) {
      if (sets[layer].has(key)) return;
      sets[layer].add(key);
      sound(layer, Number(pad.dataset.row)); // hear it as it goes down
      pad.classList.remove('hit');
      void pad.offsetWidth;
      pad.classList.add('hit');
    } else {
      sets[layer].delete(key);
    }
    keep();
    render();
    if (stroke.adding && !playing) setPlaying(true); // the first note sets the loop going
  }

  el.board.addEventListener('pointerdown', (event) => {
    const pad = event.target.closest('.pad');
    if (!pad || !event.isPrimary) return;
    event.preventDefault();
    const key = keyOf(Number(pad.dataset.step), Number(pad.dataset.row));
    stroke = { adding: !sets[layer].has(key), seen: new Set() };
    touch(pad);
  });
  life.on(window, 'pointermove', (event) => {
    if (stroke && event.isPrimary) touch(padAt(event.clientX, event.clientY));
  });
  life.on(window, 'pointerup', () => { stroke = null; });
  life.on(window, 'pointercancel', () => { stroke = null; });
  // the keyboard: Enter or Space on a tile
  el.board.addEventListener('click', (event) => {
    if (event.detail !== 0) return; // a real tap was handled above
    const pad = event.target.closest('.pad');
    if (!pad) return;
    const key = keyOf(Number(pad.dataset.step), Number(pad.dataset.row));
    stroke = { adding: !sets[layer].has(key), seen: new Set() };
    touch(pad);
    stroke = null;
  });

  // --- The controls -----------------------------------------------------------------------
  el.play.addEventListener('click', () => setPlaying(!playing));
  el.tempo.addEventListener('click', () => {
    tempo = (tempo + 1) % TEMPOS.length;
    const live = audio();
    if (echo && live) echo.delayTime.setTargetAtTime(stepLength() * 1.5, live.ctx.currentTime, 0.05); // the echo keeps time
    keep();
    render();
  });
  el.clear.addEventListener('click', () => {
    sets[layer].clear();
    keep();
    render();
  });
  // Roll the dice: a pattern for this layer that is likely to sound good.
  el.dice.addEventListener('click', () => {
    const set = sets[layer];
    set.clear();
    if (LAYERS[layer].name === 'Drums') {
      for (const step of [0, 4]) set.add(keyOf(step, 6));
      if (Math.random() < 0.6) set.add(keyOf(Math.random() < 0.5 ? 3 : 7, 6));
      for (const step of [2, 6]) set.add(keyOf(step, Math.random() < 0.6 ? 4 : 3));
      for (let step = 0; step < STEPS; step++) if (Math.random() < 0.7) set.add(keyOf(step, 2));
    } else if (LAYERS[layer].name === 'Bass') {
      // mostly the root, on the beats, with a step away from it now and then
      for (let step = 0; step < STEPS; step++) {
        const chance = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.45 : 0.15;
        if (Math.random() < chance) set.add(keyOf(step, step % 4 === 0 || Math.random() < 0.5 ? ROWS - 1 : ROWS - 1 - (Math.random() < 0.5 ? 3 : 2)));
      }
    } else {
      // a tune as the game's music makes one: likelier on the beats, moving
      // by small steps, and leaving rests
      let row = 2 + Math.floor(Math.random() * 3);
      for (let step = 0; step < STEPS; step++) {
        const chance = step % 4 === 0 ? 0.9 : step % 2 === 0 ? 0.55 : 0.28;
        if (Math.random() > chance) continue;
        row = Math.max(0, Math.min(ROWS - 1, row + Math.floor(Math.random() * 3) - 1));
        set.add(keyOf(step, row));
      }
    }
    keep();
    render();
    if (!playing) setPlaying(true);
  });

  // The app's background music stands aside while this screen is up.
  holdMusic(true);
  life.onEnd(() => {
    holdMusic(false);
    playing = false;
    const live = audio();
    if (bus && live) bus.gain.setTargetAtTime(0, live.ctx.currentTime, 0.08);
  });

  render();
}
