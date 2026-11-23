// Loops: a music maker. The screen is a board of tiles, eight steps across and
// seven notes high, and it plays round and round. Tap a tile to put a note
// there, or drag to lay down several; tap a note to take it away. There are
// four layers, each an instrument with its own colour, that loop together.
// Every row is a note of the same five-note scale, so whatever is tapped fits.
//
// The sound comes from the app's one sound engine (postmarks/sound.js), on its
// clock, so the loop keeps exact time however busy the screen is.

import { audio, holdMusic, noise, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';

const STEPS = 8;
const ROWS = 7;
const SAVE_KEY = 'jam:v1';
const TEMPOS = [84, 100, 120, 140]; // beats a minute; a step is half a beat

// Notes, top row first.
const HZ = { C2: 65.41, E2: 82.41, G2: 98, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 };

// Each layer: how it is named, drawn, and what one of its notes sounds like.
// play(row, at, bus): `at` is seconds from now on the engine's clock.
const LAYERS = [
  {
    name: 'Bells', colour: '#f08a76', icon: '<path d="M12 4.5c-3 0-5 2.3-5 5.4v3.2l-1.6 2.6h13.2L17 13.1V9.9c0-3.1-2-5.4-5-5.4zM10 18.3a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    notes: ['C6', 'A5', 'G5', 'E5', 'D5', 'C5', 'A4'],
    play(row, at, bus) {
      const freq = HZ[this.notes[row]];
      tone({ at, freq, dur: 0.5, type: 'sine', gain: 0.2, attack: 0.004, into: bus });
      tone({ at, freq: freq * 2, dur: 0.2, type: 'sine', gain: 0.05, attack: 0.003, into: bus });
    },
  },
  {
    name: 'Keys', colour: '#f8d95a', icon: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 6v6.5M14.7 6v6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    notes: ['A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'G3'],
    play(row, at, bus) {
      const freq = HZ[this.notes[row]];
      tone({ at, freq, dur: 0.42, type: 'triangle', gain: 0.2, attack: 0.008, into: bus });
      tone({ at, freq: freq * 1.003, dur: 0.38, type: 'sine', gain: 0.1, attack: 0.008, into: bus });
    },
  },
  {
    name: 'Bass', colour: '#736dd0', icon: '<path d="M4 14c2.2 0 2.2-4 4.4-4s2.2 4 4.4 4 2.2-4 4.4-4 1.6 2 2.8 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    notes: ['E3', 'D3', 'C3', 'A2', 'G2', 'E2', 'C2'],
    play(row, at, bus) {
      const freq = HZ[this.notes[row]];
      tone({ at, freq, dur: 0.36, type: 'triangle', gain: 0.34, attack: 0.006, into: bus });
      tone({ at, freq: freq * 2, dur: 0.16, type: 'sine', gain: 0.08, attack: 0.004, into: bus });
    },
  },
  {
    name: 'Drums', colour: '#2aa198', icon: '<ellipse cx="12" cy="9" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 9v6c0 1.7 3.1 3 7 3s7-1.3 7-3V9" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    notes: ['Shaker', 'Open hat', 'Hat', 'Clap', 'Snare', 'Tom', 'Kick'],
    play(row, at, bus) {
      if (row === 0) noise({ at, dur: 0.07, from: 7000, q: 3, gain: 0.1, into: bus });
      else if (row === 1) noise({ at, dur: 0.26, from: 8000, to: 6000, q: 1.2, gain: 0.13, into: bus });
      else if (row === 2) noise({ at, dur: 0.045, from: 9000, q: 2, gain: 0.14, into: bus });
      else if (row === 3) {
        for (const d of [0, 0.012, 0.026]) noise({ at: at + d, dur: 0.07, from: 1500, q: 1.4, gain: 0.2, into: bus });
      } else if (row === 4) {
        noise({ at, dur: 0.15, from: 2200, to: 1400, q: 0.8, gain: 0.3, into: bus });
        tone({ at, freq: 210, to: 150, dur: 0.1, type: 'triangle', gain: 0.18, into: bus });
      } else if (row === 5) tone({ at, freq: 170, to: 95, dur: 0.24, type: 'sine', gain: 0.4, attack: 0.003, into: bus });
      else {
        tone({ at, freq: 150, to: 44, dur: 0.24, type: 'sine', gain: 0.6, attack: 0.002, into: bus });
        noise({ at, dur: 0.02, from: 3000, q: 0.7, gain: 0.08, into: bus });
      }
    },
  },
];

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
      pad.setAttribute('aria-label', `${LAYERS[layer].notes[row]}, step ${Number(pad.dataset.step) + 1}${on ? ', on' : ''}`);
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
  let nextStep = 0;
  let nextTime = 0;
  const queue = []; // steps written but not yet heard: [{ step, time }]

  function engine() {
    const live = audio();
    if (!live) return null;
    if (!bus) {
      bus = live.ctx.createGain();
      bus.gain.value = 0.8;
      bus.connect(live.mix);
    }
    return live;
  }

  function sound(layerIndex, row, at = 0) {
    if (engine()) LAYERS[layerIndex].play(row, at, bus);
  }

  setInterval(() => {
    const live = playing && engine();
    if (!live) {
      nextTime = 0;
      return;
    }
    const now = live.ctx.currentTime;
    if (nextTime < now) nextTime = now + 0.06; // starting, or back from being asleep
    const stepLength = 60 / TEMPOS[tempo] / 2;
    while (nextTime < now + 0.14) {
      for (let index = 0; index < LAYERS.length; index++) {
        for (let row = 0; row < ROWS; row++) {
          if (sets[index].has(keyOf(nextStep, row))) LAYERS[index].play(row, nextTime - now, bus);
        }
      }
      queue.push({ step: nextStep, time: nextTime });
      nextStep = (nextStep + 1) % STEPS;
      nextTime += stepLength;
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
      if (queue.length && queue[0].time <= live.ctx.currentTime) step = queue[0].step;
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
    } else {
      const busy = LAYERS[layer].name === 'Bass' ? 0.45 : 0.6;
      let row = 2 + Math.floor(Math.random() * 3);
      for (let step = 0; step < STEPS; step++) {
        if (step % 4 !== 0 && Math.random() > busy) continue;
        row = Math.max(0, Math.min(ROWS - 1, row + Math.floor(Math.random() * 5) - 2));
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
