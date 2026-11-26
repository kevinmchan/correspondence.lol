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
// A beat can be kept, and passed on. Saved beats belong to the profile: the
// list is kept on the server (beats_get, beats_put, beats_drop) and a copy of
// it on the device, so that it is there at once and when offline, and every
// device of the same account has the same list. Each has a name that can be
// changed. Sharing one hands over a link with the
// whole beat written into it (jam/beat.js): whoever opens it finds it on their
// own board, ready to play and to change, and nothing of theirs is lost by it.
//
// Penny dances to it. It stands at the bottom edge of the window, as it does
// everywhere (penny/pal.js), and while the loop plays every move it makes is on
// the beat and comes from what is being played: a hop on a kick, a wiggle on a
// snare or a clap, a nod for a note on the beat, a jump when the chords come
// round to the start, and a step to one side and back with each bar. Dot, if
// Dot has been found, hops to the bells. It does not hum: the music is yours.
//
// An instrument can be given a sound of your own. The microphone, beside the
// bin, hears a few seconds for the instrument that is chosen (jam/mic.js); what
// it heard is then what that instrument plays, at the pitch of each row, in
// tune with the chords if it has a note (jam/sample.js). The loop is quiet
// while it listens. The sounds stay on this device: a beat that is saved or
// shared is its notes, and is played elsewhere by the instruments themselves.
//
// The sound comes from the app's one sound engine (postmarks/sound.js), on its
// clock, so the loop keeps exact time however busy the screen is.

import { CHORDS, LAYERS, ROWS, STEPS, TEMPOS, createLoop, keyOf } from './engine.js';
import { randomLayer } from './make.js';
import { load, myToken, save } from '/shared/identity.js';
import { rpc } from '/shared/api.js';
import { ask } from '/shared/ask.js';
import { go } from '/shared/nav.js';
import { decode, encode, isEmpty } from './beat.js';
import { claim as callPal } from '/penny/pal.js';
import { hasDot } from '/penny/penny.js';
import { oops } from '/shared/place.js';
import { choose } from '/shared/ask.js';
import { SILENT, keepSound, listen, sounds } from './mic.js';

const SAVE_KEY = 'jam:v1'; // the beat on the board
const SAVED_KEY = 'jam:saved:v1'; // the beats kept: [{ name, code, at, auto, synced }]
const GONE_KEY = 'jam:gone:v1'; // beats deleted here that the server has still to be told of
const MOST = 30;
const nameOf = (kind, row, own) => (!own && kind.notes?.[row]) || `Note ${ROWS - row} of ${ROWS}`; // (own: it plays a recorded sound)
const MIC = '<rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';

const empty = () => LAYERS.map(() => []);

export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  const el = { board: $('jam-board'), layers: $('jam-layers'), play: $('jam-play'), tempo: $('jam-tempo'), clear: $('jam-clear'), dice: $('jam-dice'), hint: $('jam-hint'), mic: $('jam-mic'), micError: $('jam-mic-error'), save: $('jam-save'), share: $('jam-share'), note: $('jam-note'), saved: $('jam-saved') };
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
  // the sounds recorded to be played in place of the instruments: for each, { rate, pcm, hz } or null
  const voices = LAYERS.map(() => null);
  let hearing = null; // while the microphone is listening: { stop }

  // --- Penny, who dances -----------------------------------------------------------------
  const pal = callPal(life, { x: 0.74, height: 'low', mood: 'calm', dot: hasDot() });
  life.setTimeout(() => { if (!playing) pal.settle('peek'); }, 600);
  const DRUMS = LAYERS.findIndex((kind) => kind.name === 'Drums');
  const BELLS = LAYERS.findIndex((kind) => kind.name === 'Bells');
  const has = (index, step, row) => sets[index].has(keyOf(step, row));
  const anyAt = (index, step) => Array.from({ length: ROWS }, (_, row) => row).some((row) => has(index, step, row));
  // One step of the loop being heard: what Penny does about it.
  function dance(step, chord) {
    if (step < 0) return;
    const kick = has(DRUMS, step, 6) || has(DRUMS, step, 5);
    const snare = has(DRUMS, step, 4) || has(DRUMS, step, 3);
    if (step === 0) {
      pal.goTo(0.74 + (chord % 2 ? -0.07 : 0.07)); // a step to one side with each bar, and back with the next
      if (chord === 0) pal.gesture('jump'); // the chords have come round
    }
    if (step === 0 && chord === 0) { /* the jump is the move */ }
    else if (kick) pal.gesture('hop');
    else if (snare) pal.gesture('wiggle');
    else if (step % 4 === 0) pal.gesture('hop'); // the beat itself, when no drum marks it
    else if (step % 2 === 0 && LAYERS.some((kind, index) => index !== DRUMS && anyAt(index, step))) pal.gesture('nod');
    if (anyAt(BELLS, step)) pal.gesture('hop', 'dot');
  }

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
    button.innerHTML = `<span class="tile"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span><span class="name">${kind.name}</span><span class="sr-only"></span><span class="count"></span>`;
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
      pad.setAttribute('aria-label', `${nameOf(LAYERS[layer], row, voices[layer])}, step ${Number(pad.dataset.step) + 1}${on ? ', on' : ''}`);
      pad.setAttribute('aria-pressed', String(on));
      for (let other = 0; other < LAYERS.length; other++) {
        pad.children[other].hidden = other === layer || !sets[other].has(key);
      }
    }
    [...el.layers.children].forEach((button, index) => {
      button.setAttribute('aria-checked', String(index === layer));
      button.querySelector('.count').textContent = sets[index].size || '';
      // (an instrument that plays your own sound wears the microphone)
      const own = Boolean(voices[index]);
      if (button.dataset.own !== String(own)) {
        button.dataset.own = own;
        button.querySelector('svg').innerHTML = own ? MIC : LAYERS[index].icon;
        button.querySelector('.sr-only').textContent = own ? ', your sound' : '';
      }
    });
    el.mic.style.setProperty('--c', LAYERS[layer].colour);
    el.mic.classList.toggle('hearing', Boolean(hearing));
    el.mic.setAttribute('aria-pressed', String(Boolean(voices[layer])));
    const micSays = hearing ? 'Stop recording' : voices[layer] ? `${LAYERS[layer].name}: your sound` : `Record a sound for ${LAYERS[layer].name.toLowerCase()}`;
    el.mic.setAttribute('aria-label', micSays);
    el.mic.title = micSays;
    const any = sets.some((set) => set.size > 0);
    el.hint.hidden = any;
    el.clear.disabled = sets[layer].size === 0;
    el.save.disabled = !any;
    el.share.disabled = !any;
    el.tempo.textContent = `${TEMPOS[tempo]}`;
    el.tempo.setAttribute('aria-label', `Tempo, ${TEMPOS[tempo]} bpm`); // (what is written on it, and what it is: both said)
    el.play.setAttribute('aria-pressed', String(playing));
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    el.play.classList.toggle('playing', playing);
  }

  // --- Sound: the board, played round and round (jam/engine.js) -----------------------
  const loop = createLoop(life, () => (playing ? { tempo, sets, voices } : null));
  let heard = 0; // the chord being heard now
  const sound = (layerIndex, row) => loop.tap(layerIndex, row, voices);

  // --- Sight: the step being heard lights up, and its notes jump -----------------------
  let shown = -1;
  let frame = 0;
  function draw() {
    const { step, chord } = loop.heard();
    heard = chord;
    const lit = step < 0 ? -1 : heard;
    if (chordLights.dataset.lit !== String(lit)) {
      chordLights.dataset.lit = lit;
      [...chordLights.children].forEach((light, index) => light.classList.toggle('on', index === lit));
      chordLights.setAttribute('aria-label', lit < 0 ? 'Four chords, played in turn' : `Chord ${lit + 1} of ${CHORDS.length}: ${CHORDS[lit].name}`);
    }
    if (step !== shown) {
      dance(step, heard);
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
      loop.rewind();
      heard = 0;
      pal.rise().mood('dancing').look(null);
    } else {
      pal.mood('calm').goTo(0.74).settle('peek'); // the music has stopped: so has it
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
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The dice wear the four instruments' colours: round their edge, and in what flies out of them.
  LAYERS.forEach((kind, index) => el.dice.style.setProperty(`--c${index}`, kind.colour));
  function roll() { // seen: the tile jumps, and small tiles of every layer's colour fly out of it
    if (still) return;
    el.dice.classList.remove('rolled');
    void el.dice.offsetWidth;
    el.dice.classList.add('rolled');
    for (let i = 0; i < 10; i++) {
      const spark = document.createElement('i');
      spark.className = 'spark';
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const far = 3 + Math.random() * 2.2;
      spark.style.setProperty('--c', LAYERS[i % LAYERS.length].colour);
      spark.style.setProperty('--dx', `${(Math.cos(angle) * far).toFixed(2)}rem`);
      spark.style.setProperty('--dy', `${(Math.sin(angle) * far).toFixed(2)}rem`);
      el.dice.append(spark);
      life.setTimeout(() => spark.remove(), 700);
    }
    life.setTimeout(() => el.dice.classList.remove('rolled'), 600);
  }
  el.dice.addEventListener('click', () => {
    roll();
    const set = sets[layer];
    set.clear();
    for (const tile of randomLayer(layer)) set.add(tile);
    keep();
    render();
    if (!playing) setPlaying(true);
  });

  // --- A sound of your own, from the microphone ---------------------------------------------
  // The microphone hears for the instrument that is chosen. The loop is quiet
  // meanwhile (it would be heard too, and an iPhone turns everything down
  // while it listens), and goes on afterwards with the new sound in it.
  sounds(LAYERS.length).then((kept) => {
    if (life.over) return;
    kept.forEach((one, index) => { voices[index] ??= one; });
    render();
  });
  let asking = false; // the phone is asking whether the microphone may be used
  async function record() {
    const index = layer;
    const was = playing;
    oops(el.micError, '');
    if (playing) setPlaying(false);
    asking = true;
    try {
      hearing = await listen();
    } catch (failure) {
      oops(el.micError, failure.message, { shake: el.mic });
      if (was) setPlaying(true);
      return;
    } finally {
      asking = false;
    }
    if (life.over) return hearing.stop();
    render();
    const one = await hearing.heard;
    hearing = null;
    if (life.over) return;
    if (one) {
      voices[index] = one;
      keepSound(index, one);
      life.setTimeout(() => { if (!playing) sound(index, 3); }, 250); // heard back, once the phone has let go of the microphone
    } else {
      oops(el.micError, SILENT, { shake: el.mic });
    }
    render();
    if (was) setPlaying(true);
  }
  el.mic.addEventListener('click', async () => {
    if (hearing) return hearing.stop();
    if (asking) return;
    if (!voices[layer]) return record();
    const index = layer;
    const kind = LAYERS[index];
    const wanted = await choose(`${kind.name}: your sound`, { options: [{ label: `Back to ${kind.name.toLowerCase()}`, value: 'back' }, { label: 'Record again', value: 'again', primary: true }] });
    if (life.over || index !== layer) return;
    if (wanted === 'again') return record();
    if (wanted !== 'back') return;
    voices[index] = null;
    keepSound(index, null);
    oops(el.micError, '');
    render();
  });
  life.onEnd(() => hearing?.stop());

  // --- Keeping a beat, and passing one on ------------------------------------------------
  const now = () => ({ tempo, notes: sets.map((set) => [...set]) });
  const kept$ = () => (Array.isArray(load(SAVED_KEY)) ? load(SAVED_KEY).filter((beat) => beat && decode(beat.code)) : []);
  let noteTimer = 0;
  function say(text) {
    oops(el.micError, ''); // (they share a line, and this is the newer)
    el.note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = life.setTimeout(() => { el.note.textContent = ''; }, 4000);
  }
  // --- The same list on every device of the profile -----------------------------------
  // The device's copy is brought into line with the server's whenever the
  // screen opens, the app is come back to, and after anything is saved,
  // renamed or deleted. An entry is `synced` once the server has it as it is
  // here. So: one that is not synced is sent; one that is synced and no
  // longer on the server was deleted on another device, and goes from this
  // one too; and anything the server has that this device has not is added.
  // "Unsaved beat" is a convenience of this device and is never sent.
  // Offline, or signed out, the device's own copy simply stands.
  let syncing = Promise.resolve();
  const sync = () => {
    syncing = syncing.then(async () => {
      let theirs;
      try {
        for (const code of Array.isArray(load(GONE_KEY)) ? load(GONE_KEY) : []) {
          await rpc('beats_drop', { p_token: myToken(), p_code: code });
          save(GONE_KEY, (load(GONE_KEY) ?? []).filter((one) => one !== code));
        }
        theirs = await rpc('beats_get', { p_token: myToken() });
        for (const one of kept$()) {
          if (!one.auto && !one.synced) theirs = await rpc('beats_put', { p_token: myToken(), p_code: one.code, p_name: one.name });
        }
      } catch {
        return;
      }
      if (life.over || !Array.isArray(theirs)) return;
      const gone = new Set(Array.isArray(load(GONE_KEY)) ? load(GONE_KEY) : []);
      const mine = kept$();
      const sent = new Set(theirs.map((one) => one.code));
      save(SAVED_KEY, [
        ...mine.filter((one) => one.auto && !sent.has(one.code)),
        ...theirs.filter((one) => decode(one.code) && !gone.has(one.code)).map((one) => ({ name: String(one.name).slice(0, 30), code: one.code, at: Number(one.at) || Date.now(), synced: true })),
        ...mine.filter((one) => !one.auto && !one.synced && !sent.has(one.code)), // saved since it asked
      ]);
      showSaved();
    });
    return syncing;
  };
  life.on(document, 'visibilitychange', () => { if (!document.hidden) sync(); });

  // Put a beat on the board. What was there is not lost: if it was not
  // already among the saved beats, it is put by as "Unsaved beat" (one of
  // those at a time: the next takes its place).
  function adopt(beat) {
    const was = now();
    const list = kept$();
    if (!isEmpty(was) && encode(was) !== encode(beat) && !list.some((one) => one.code === encode(was))) {
      save(SAVED_KEY, [{ name: 'Unsaved beat', code: encode(was), at: Date.now(), auto: true }, ...list.filter((one) => !one.auto)].slice(0, MOST));
    }
    tempo = beat.tempo;
    beat.notes.forEach((tiles, index) => {
      sets[index].clear();
      for (const tile of tiles) sets[index].add(tile);
    });
    keep();
    render();
    showSaved();
  }
  // A small picture of a beat: the board, with each note a dot of its instrument's colour.
  function picture(beat) {
    const dots = [];
    beat.notes.forEach((tiles, index) => {
      for (const tile of tiles) dots.push(`<rect x="${Math.floor(tile / ROWS) * 4 + 0.5}" y="${(tile % ROWS) * 4 + 0.5}" width="3" height="3" rx="0.8" fill="${LAYERS[index].colour}"/>`);
    });
    return `<svg viewBox="0 0 ${STEPS * 4} ${ROWS * 4}" aria-hidden="true">${dots.join('')}</svg>`;
  }
  const linkTo = (code) => `${location.origin}/jam/?b=${code}`;
  async function share(code, name) {
    const url = linkTo(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: name ? `${name}: a beat` : 'A beat', text: 'Listen to this beat I made on correspondence.lol', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      say('Link copied. Anyone who opens it gets this beat.');
    } catch (error) {
      if (error?.name !== 'AbortError') prompt('Copy this link to share the beat', url);
    }
  }
  function showSaved() {
    const list = kept$();
    el.saved.hidden = list.length === 0;
    const here = encode(now());
    el.saved.querySelector('ul').replaceChildren(...list.map((one) => {
      const li = document.createElement('li');
      li.classList.toggle('here', one.code === here);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'open';
      open.setAttribute('aria-label', `Play ${one.name}`);
      open.innerHTML = picture(decode(one.code));
      open.addEventListener('click', () => {
        adopt(decode(one.code));
        if (!playing) setPlaying(true);
      });
      const name = document.createElement('input');
      name.type = 'text';
      name.value = one.name;
      name.maxLength = 30;
      name.autocomplete = 'off';
      name.enterKeyHint = 'done';
      name.setAttribute('aria-label', 'Name of this beat');
      name.addEventListener('change', () => {
        const to = name.value.trim() || one.name;
        name.value = to;
        save(SAVED_KEY, kept$().map((each) => (each.code === one.code ? { ...each, name: to, auto: false, synced: false } : each)));
        sync();
      });
      name.addEventListener('keydown', (event) => { if (event.key === 'Enter') name.blur(); });
      const send = document.createElement('button');
      send.type = 'button';
      send.className = 'quiet';
      send.setAttribute('aria-label', `Share ${one.name}`);
      send.innerHTML = el.share.querySelector('svg').outerHTML;
      send.addEventListener('click', () => share(one.code, kept$().find((each) => each.code === one.code)?.name));
      const bin = document.createElement('button');
      bin.type = 'button';
      bin.className = 'quiet';
      bin.setAttribute('aria-label', `Delete ${one.name}`);
      bin.innerHTML = el.clear.querySelector('svg').outerHTML;
      bin.addEventListener('click', async () => {
        const current = kept$().find((each) => each.code === one.code)?.name ?? one.name;
        if (!(await ask(`Delete “${current}”?`, { detail: 'It will be gone from this device. A link you have shared will still work.', yes: 'Delete', danger: true }))) return;
        save(SAVED_KEY, kept$().filter((each) => each.code !== one.code));
        if (!one.auto) save(GONE_KEY, [...new Set([...(load(GONE_KEY) ?? []), one.code])].slice(-MOST));
        showSaved();
        sync();
      });
      li.append(open, name, send, bin);
      return li;
    }));
  }
  $('jam-lab').addEventListener('click', () => go('/jam/?taste')); // the radio (jam/taste.js)
  el.save.addEventListener('click', () => {
    const beat = now();
    if (isEmpty(beat)) return;
    const code = encode(beat);
    const list = kept$();
    const already = list.find((one) => one.code === code);
    if (already && !already.auto) {
      say(`Already saved as “${already.name}”.`);
      return;
    }
    const taken = new Set(list.map((one) => one.name));
    let n = 1;
    while (taken.has(`Beat ${n}`)) n += 1;
    save(SAVED_KEY, [{ name: `Beat ${n}`, code, at: Date.now() }, ...list.filter((one) => one.code !== code)].slice(0, MOST));
    save(GONE_KEY, (load(GONE_KEY) ?? []).filter((one) => one !== code)); // (saved again after being deleted: it is wanted)
    say(`Saved as “Beat ${n}”. Tap its name to change it.`);
    showSaved();
    sync();
  });
  el.share.addEventListener('click', () => {
    if (!isEmpty(now())) share(encode(now()));
  });
  // (which of the saved beats is on the board is marked: kept up to date as the board changes)
  el.board.addEventListener('pointerup', () => life.setTimeout(showSaved, 0));
  for (const control of [el.dice, el.clear, el.tempo]) control.addEventListener('click', () => life.setTimeout(showSaved, 0));

  // Arriving by a link with a beat in it: it goes on the board, and the
  // address goes back to plain /jam/ so that a reload does not bring it back
  // over whatever has been made of it since.
  const given = new URLSearchParams(location.search).get('b');
  if (given !== null) {
    const beat = decode(given);
    history.replaceState(null, '', '/jam/');
    if (beat && !isEmpty(beat)) {
      adopt(beat);
      say('A beat that was shared with you. Press play, and make it yours.');
    } else {
      say('That link did not have a beat in it.');
    }
  }
  showSaved();
  sync();

  life.onEnd(() => { playing = false; });

  render();
}
