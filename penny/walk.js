// Walking the map with Penny (/?walk).
//
// The screen is the map, seen from far above: a few districts lit, the rest of
// it faint all round. Penny is not on it. She stands at the bottom edge with
// you (penny/pal.js), as big as life, and the two of you look at it together.
// She is searching it for a sound: every post has a sound inside, and one of
// them is the one she is after (penny/mail.js).
//
// Nothing here is taught. You play, on five places each with one more rule
// than the last (penny/places.js), and she is beside you while you do. She
// cannot say anything and she does not show you what to do. What she has is
// how she feels about the square your finger is on, and that comes from the
// only two things she has to go on: what the rules make certain or impossible,
// and what she can hear through the map when you are close. Touch a square and
// she tells you, with her whole face, what she makes of it. Leave the map alone
// and she starts looking for herself: first at whatever the rules have made
// certain, then, if nothing is, listening.
//
// A place that has given up all its posts opens a portal to the next. The last
// leads out to the game itself.

import { play as sfx } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { PLACES, read, ruledOut, warmth } from './places.js';
import { claim } from './pal.js';
import { heard, mailIn, playMail, remembered, soundSoFar } from './mail.js';
import {
  ALARM, ASK, COLD, HELLO, HERE, MM, NO_NO, OOPS, THIS_WAY, TRILL, WARMER, YES,
  placeReached, setPlaceReached, setWalked,
} from './penny.js';

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const DOUBLE_TAP_MS = 350;

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const $ = (id) => root.querySelector(`#${id}`);
  const main = root.querySelector('.walk');
  const board = $('walk-board');
  const map = root.querySelector('.walk-map');
  const trail = $('walk-trail');
  const portal = $('walk-portal');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms));
  const pal = claim(life, { x: 0.64, height: 'up', mood: 'calm' });

  // --- The place ------------------------------------------------------------------
  let index = Math.min(placeReached(), PLACES.length - 1);
  let place = null;
  let cells = []; // 'empty' | 'cross' | 'letter'
  let found = []; // the squares whose posts are open, in the order they were found
  let squares = []; // what the rules say about each square (places.js read())
  let done = false;
  let busy = false; // a post is being opened and listened to

  const tile = (cell) => board.children[cell];

  function paint(cell, fx, delay = 0, taught = false) {
    const button = tile(cell);
    const state = cells[cell];
    const n = place.n;
    button.dataset.state = state;
    button.innerHTML = state === 'letter' ? ENVELOPE : state === 'cross' ? '×' : '';
    button.setAttribute('aria-label', `row ${Math.floor(cell / n) + 1}, column ${(cell % n) + 1}, ${state === 'letter' ? 'post found' : state === 'cross' ? 'crossed out' : 'empty'}`);
    button.classList.remove('fx-post', 'fx-cross', 'fx-clear', 'fx-miss', 'teach', 'why', 'felt', 'ringing', 'hers');
    if (!fx && !taught) return;
    void button.getBoundingClientRect();
    button.style.setProperty('--d', `${delay}ms`);
    if (fx) button.classList.add(fx);
    if (taught) button.classList.add('teach');
  }

  // Line the faint map up with the lit squares, and put the portal's spot on
  // it: one square below the place, as if the next were further down the map.
  function lay() {
    const first = tile(0);
    if (!first) return;
    const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
    const pitch = first.offsetWidth + gap;
    const left = board.offsetLeft;
    const top = board.offsetTop;
    main.style.setProperty('--pitch', `${pitch}px`);
    main.style.setProperty('--map-x', `${left - gap / 2}px`);
    main.style.setProperty('--map-y', `${top - gap / 2}px`);
    main.style.setProperty('--lit-x', `${left + board.offsetWidth / 2}px`);
    main.style.setProperty('--lit-y', `${top + board.offsetHeight / 2}px`);
    const column = Math.floor((place.n - 1) / 2);
    portal.style.width = `${first.offsetWidth}px`;
    portal.style.left = `${left + column * pitch}px`;
    portal.style.top = `${top + place.n * pitch}px`;
  }
  life.on(window, 'resize', lay);

  // The sound so far, at the top of the map: a mark a note, set as high as the
  // note is, and a fading tail for what has not been heard yet. Pressing it
  // plays what she has of it, and she listens.
  function showTrail() {
    const notes = soundSoFar();
    trail.replaceChildren(...notes.map((note) => {
      const mark = document.createElement('i');
      mark.style.setProperty('--h', note.height);
      mark.style.setProperty('--w', note.dur);
      return mark;
    }), ...[0, 1, 2].map(() => Object.assign(document.createElement('i'), { className: 'more' })));
    trail.hidden = notes.length === 0;
  }
  trail.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    clearTimeout(resting);
    pal.mood('listening').look(trail);
    const marks = [...trail.querySelectorAll('i:not(.more)')];
    let n = 0;
    await playMail(life, remembered(0.5), () => {
      const mark = marks[n++];
      if (!mark) return;
      mark.classList.remove('lit');
      void mark.getBoundingClientRect();
      mark.classList.add('lit');
    });
    busy = false;
    pal.mood('hopeful').look(null);
    rest(2600);
  });

  function start(at) {
    index = at;
    setPlaceReached(index);
    place = PLACES[index];
    cells = place.regions.map(() => 'empty');
    found = [];
    squares = read(place, found);
    done = false;
    busy = false;
    board.classList.remove('won');
    board.style.setProperty('--n', place.n);
    board.replaceChildren(...place.regions.map((region, cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cell d${region}`;
      button.dataset.cell = cell;
      return button;
    }));
    cells.forEach((_, cell) => paint(cell));
    portal.hidden = true;
    portal.classList.toggle('last', index === PLACES.length - 1);
    showTrail();
    lay();
    // she looks the new place over, then at you
    pal.mood('curious').goTo(0.64).look(board);
    pal.gesture('hop');
    pal.sing(index === 0 ? HELLO : ASK, 0.8);
    life.setTimeout(() => { if (!touching) pal.look(null); }, 1300);
    rest(2600);
  }

  // --- How she feels about a square ---------------------------------------------------
  // Called with the square under a finger (or the pointer, or the keyboard's
  // focus). `pressed` is false for a pointer merely passing over: then she
  // only looks and warms, without a sound.
  let lastFelt = { cell: null, at: 0 };
  function feel(cell, pressed = true) {
    if (done || busy) return;
    pal.look(tile(cell));
    const state = cells[cell];
    if (state === 'letter') {
      pal.mood('glad');
      return;
    }
    const known = squares[cell];
    if (known.is === 'out') {
      // the rules say no. She shakes her head, and glances at the post that says so
      pal.mood('no');
      if (!pressed) return;
      pal.gesture('shake');
      pal.sing(NO_NO, 0.7, { breath: 0 });
      const why = tile(known.post);
      why.classList.remove('why');
      void why.getBoundingClientRect();
      why.classList.add('why');
      life.setTimeout(() => { if (touching === cell || lastFelt.cell === cell) pal.look(why); }, 380);
      return;
    }
    const warm = warmth(place, found, cell);
    pal.glow(0.15 + warm * 0.85);
    if (warm === 1) {
      // there is one right here
      pal.mood(known.is === 'sure' ? 'thrilled' : 'warm');
      if (!pressed) return;
      pal.gesture('hop2');
      pal.sing(HERE, 0.95, { breath: 0 });
    } else if (warm > 0) {
      pal.mood('hopeful');
      if (pressed) pal.sing(WARMER(warm), 0.75, { breath: 0 });
    } else {
      pal.mood('unsure');
      if (pressed) pal.sing(COLD, 0.55, { breath: 0 });
    }
  }

  // --- Left alone, she looks for herself ----------------------------------------------
  // First at whatever the rules have made certain; with nothing certain, she
  // listens, and in time catches which way something lies.
  let resting = null;
  let touching = null; // the square a finger is on
  function rest(after = 3600) {
    clearTimeout(resting);
    resting = life.setTimeout(wonder, after, 0);
  }
  function wonder(turn) {
    if (life.over || busy || touching !== null) return;
    for (const button of board.children) button.classList.remove('felt');
    if (done) {
      // the way on is open: she stands under it and looks from it to you
      pal.mood('hopeful').pointAt(portal);
      if (turn % 2 === 0) {
        pal.gesture('hop');
        pal.sing(THIS_WAY, 0.85);
      }
      life.setTimeout(() => { if (touching === null && done) pal.look(null); }, 1700);
      resting = life.setTimeout(wonder, turn > 5 ? 14000 : 6500, turn + 1); // she goes on hoping, less and less often
      return;
    }
    const sure = squares.map((square, cell) => (square.is === 'sure' ? cell : -1)).filter((cell) => cell >= 0);
    const left = place.posts.filter((post) => !found.includes(post));
    if (sure.length) {
      const cell = sure[0];
      if (turn === 0) {
        pal.mood('hopeful').pointAt(tile(cell));
        pal.sing(ASK, 0.7);
      } else {
        // still nothing: she can hardly keep still, and her warmth falls on the square
        pal.mood(turn > 1 ? 'thrilled' : 'warm').pointAt(tile(cell));
        pal.gesture(turn > 1 ? 'hop2' : 'hop');
        pal.sing(turn > 1 ? HERE : YES, 0.85);
        if (turn > 1) tile(cell).classList.add('felt');
      }
      life.setTimeout(() => { if (touching === null && !busy) pal.look(null); }, 2200);
      resting = life.setTimeout(wonder, turn > 3 ? 12000 : 5200, turn + 1);
      return;
    }
    // nothing certain: she listens
    if (turn < 2) {
      pal.mood('listening').look(tile(Math.floor(Math.random() * cells.length)));
    } else if (left.length) {
      // she has caught something: over that way, she thinks
      const near = left[0];
      const guess = turn < 4 ? { x: tile(near).getBoundingClientRect().left + (Math.random() - 0.5) * tile(near).offsetWidth * 2.4, y: tile(near).getBoundingClientRect().top } : tile(near);
      pal.mood(turn < 4 ? 'curious' : 'hopeful');
      if (turn < 4) pal.look(guess);
      else pal.pointAt(guess);
      pal.sing(ASK, 0.6);
    }
    resting = life.setTimeout(wonder, turn < 2 ? 2400 : turn > 6 ? 11000 : 4600, turn + 1);
  }

  // --- Opening a post -----------------------------------------------------------------
  function ripple(cell) {
    if (still) return;
    const button = tile(cell);
    const wave = document.createElement('i');
    wave.className = 'ripple';
    wave.style.left = `${button.offsetLeft + button.offsetWidth / 2}px`;
    wave.style.top = `${button.offsetTop + button.offsetHeight / 2}px`;
    wave.style.setProperty('--reach', `${board.offsetWidth * 2.4}px`);
    board.append(wave);
    life.setTimeout(() => wave.remove(), 1200);
  }

  // A sound coming out of a post, to be seen as well as heard: the square
  // rings once for each note (gold for the sound she is after).
  function ring(cell, hers) {
    const button = tile(cell);
    button.classList.remove('ringing', 'hers');
    void button.getBoundingClientRect();
    button.classList.add('ringing');
    button.classList.toggle('hers', hers);
  }

  async function open(cell) {
    if (done || busy || cells[cell] === 'letter') return;
    clearTimeout(resting);
    pal.look(tile(cell));
    if (!place.posts.includes(cell)) {
      // nothing there. She feels it with you, and it costs nothing
      paint(cell, 'fx-miss');
      pal.mood('sad').gesture('sink');
      pal.sing(OOPS, 0.7);
      rest(2200);
      return;
    }
    busy = true;
    cells[cell] = 'letter';
    found.push(cell);
    paint(cell, 'fx-post');
    ripple(cell);
    sfx('post');
    pal.mood('surprised').gesture('jump');

    // What the post takes away. Rules met before go quickly; the one this
    // place is here for goes slowly, square by square, and is lit as it goes,
    // so that it is seen as a shape.
    const { n, regions, rules } = place;
    const newest = place.marks ? null : rules.at(-1);
    const delays = [];
    let at = 240;
    for (const rule of rules.filter((r) => r !== newest)) {
      for (const other of ruledOut(rule, cell, n, regions)) {
        if (cells[other] !== 'empty') continue;
        cells[other] = 'cross';
        paint(other, 'fx-cross', at);
        delays.push(at);
        at += place.marks ? 45 : 25;
      }
    }
    if (newest) {
      at += 260;
      for (const other of ruledOut(newest, cell, n, regions)) {
        if (cells[other] === 'letter') continue;
        const fresh = cells[other] === 'empty';
        if (fresh) cells[other] = 'cross';
        paint(other, fresh ? 'fx-cross' : null, at, true);
        delays.push(at);
        at += 130;
      }
    }
    if (delays.length) sfx('cascade', { delays });
    squares = read(place, found);
    done = found.length === place.posts.length;

    // And what was inside it. She holds still to listen.
    await wait(Math.max(900, Math.min(at + 200, 1500)));
    const mail = mailIn(index, found.length - 1, place.posts.length);
    pal.mood('listening').look(tile(cell));
    await playMail(life, mail, () => ring(cell, mail.friend));
    if (life.over) return;
    if (mail.friend) {
      // that is part of it. She knows it at once, and hums it back
      heard(mail);
      showTrail();
      pal.mood('thrilled').gesture('jump').hearts(2);
      await wait(250);
      await pal.sing(mail.echo, 1);
    } else {
      // someone else's. She is glad for them, and looks on
      pal.mood('calm').gesture('nod');
      await pal.sing(done ? TRILL : MM, 0.7);
    }
    busy = false;
    if (done) {
      board.classList.add('won');
      portal.hidden = false;
      lay();
      pal.mood('glad');
      wonder(0);
    } else {
      pal.look(null);
      rest(2800);
    }
  }

  // --- Crossing out ---------------------------------------------------------------------
  function mark(cell, to) {
    if (cells[cell] === 'letter' || cells[cell] === to || squares[cell].is === 'out') return false;
    cells[cell] = to;
    paint(cell, to === 'cross' ? 'fx-cross' : 'fx-clear');
    sfx(to === 'cross' ? 'cross' : 'clear');
    return true;
  }
  // How she takes a cross. Over a post she can hear, it frightens her; she
  // cannot take it off, only show you. Anywhere else, she is easy about it.
  function crossed(cell, to) {
    pal.look(tile(cell));
    const over = warmth(place, found, cell) === 1;
    if (to === 'cross' && over) {
      pal.mood('worried').gesture('shake');
      pal.sing(ALARM, 0.9, { breath: 0 });
    } else if (to === 'cross') {
      pal.mood('calm').gesture('nod');
      pal.sing(MM, 0.5, { breath: 0 });
    } else if (over) {
      pal.mood('warm').gesture('hop2');
      pal.sing(HERE, 0.9, { breath: 0 });
    } else {
      pal.mood('calm');
    }
  }
  // while a cross sits on a post she can hear, she cannot settle
  const uneasy = () => place.marks && place.posts.some((post) => cells[post] === 'cross');

  // --- Touches ------------------------------------------------------------------------------
  const cellAt = (x, y) => {
    const button = document.elementFromPoint(x, y)?.closest?.('.cell');
    return button && board.contains(button) ? Number(button.dataset.cell) : null;
  };
  let lastTap = { cell: null, at: 0, before: null };
  let stroke = null; // while a finger is down in a place with crosses: { to }

  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || done || busy) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;
    clearTimeout(resting);
    for (const button of board.children) button.classList.remove('felt');
    // (in the very first place a slower second tap will do: nobody has found out yet that it takes two)
    const again = cell === lastTap.cell && event.timeStamp - lastTap.at < (index === 0 ? 600 : DOUBLE_TAP_MS);
    if (again) {
      // the first tap of the two may have crossed the square: put it back
      if (lastTap.before && cells[cell] !== 'letter' && cells[cell] !== lastTap.before) {
        cells[cell] = lastTap.before;
        paint(cell);
      }
      lastTap = { cell: null, at: 0, before: null };
      stroke = null;
      touching = null;
      open(cell);
      return;
    }
    lastTap = { cell, at: event.timeStamp, before: cells[cell] };
    touching = cell;
    lastFelt = { cell, at: event.timeStamp };
    if (place.marks && cells[cell] !== 'letter' && squares[cell].is !== 'out') {
      stroke = { to: cells[cell] === 'cross' ? 'empty' : 'cross' };
      if (mark(cell, stroke.to)) crossed(cell, stroke.to);
    } else {
      feel(cell);
    }
  });
  life.on(window, 'pointermove', (event) => {
    if (!event.isPrimary || done || busy) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (touching === null) {
      // a pointer passing over, nothing pressed: she watches it, and warms or cools
      if (event.pointerType === 'mouse' && cell !== null && cell !== lastFelt.cell) {
        lastFelt = { cell, at: event.timeStamp };
        feel(cell, false);
        rest(5000);
      }
      return;
    }
    if (cell === null || cell === touching) return;
    // a finger sliding across the map
    touching = cell;
    lastTap = { cell: null, at: 0, before: null };
    lastFelt = { cell, at: event.timeStamp };
    if (stroke) {
      if (mark(cell, stroke.to)) crossed(cell, stroke.to);
    } else {
      feel(cell);
    }
  });
  const lift = () => {
    if (touching === null) return;
    touching = null;
    stroke = null;
    if (done || busy) return;
    // she stays with what she felt for a moment, then goes back to looking
    life.setTimeout(() => {
      if (touching !== null || busy || done) return;
      if (uneasy()) pal.mood('worried').look(tile(place.posts.find((post) => cells[post] === 'cross')));
      else pal.look(null);
    }, 900);
    rest(uneasy() ? 2600 : 4200);
  };
  life.on(window, 'pointerup', lift);
  life.on(window, 'pointercancel', lift);

  // Keys: moving the focus onto a square is touching it; Enter opens it, Space
  // or X crosses it where crosses are in use.
  board.addEventListener('focusin', (event) => {
    const cell = Number(event.target.closest?.('.cell')?.dataset.cell ?? NaN);
    if (!Number.isNaN(cell) && event.target.matches(':focus-visible')) feel(cell);
  });
  board.addEventListener('keydown', (event) => {
    const cell = Number(event.target.closest?.('.cell')?.dataset.cell ?? NaN);
    if (Number.isNaN(cell) || done || busy) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      open(cell);
    } else if ((event.key === ' ' || event.key.toLowerCase() === 'x') && place.marks) {
      event.preventDefault();
      const to = cells[cell] === 'cross' ? 'empty' : 'cross';
      if (mark(cell, to)) crossed(cell, to);
      rest(4200);
    } else if (event.key.startsWith('Arrow')) {
      const n = place.n;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[event.key];
      const next = cell + step;
      const wraps = Math.abs(step) === 1 && Math.floor(next / n) !== Math.floor(cell / n);
      if (next >= 0 && next < cells.length && !wraps) {
        event.preventDefault();
        tile(next).focus();
      }
    }
  });

  // A tap on Penny herself: she looks for herself straight away.
  pal.onTap(() => {
    pal.gesture('hop');
    clearTimeout(resting);
    wonder(done ? 0 : 1);
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');

  // --- Through the portal ---------------------------------------------------------------------
  portal.addEventListener('click', async () => {
    if (portal.hidden || main.classList.contains('through')) return;
    clearTimeout(resting);
    if (index === PLACES.length - 1) {
      setWalked();
      setPlaceReached(0);
      go('/postmarks/');
      return;
    }
    // the map rushes up through the portal, and settles on the next place
    const at = portal.getBoundingClientRect();
    const frame = main.getBoundingClientRect();
    main.style.setProperty('--through-x', `${at.left + at.width / 2 - frame.left}px`);
    main.style.setProperty('--through-y', `${at.top + at.height / 2 - frame.top}px`);
    pal.mood('thrilled').gesture('jump');
    main.classList.add('through');
    await wait(still ? 0 : 520);
    start(index + 1);
    main.classList.remove('through');
    main.classList.add('arriving');
    await wait(still ? 0 : 560);
    main.classList.remove('arriving');
  });

  start(index);
}
