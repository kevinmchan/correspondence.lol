// Penny's lessons: how Postmarks is played, one rule at a time, without a
// word. Each lesson is a small board in a world of its own, and each world has
// one more rule than the last:
//
//   1. a post is opened with a double tap
//   2. one post per colour
//   3. one post per row and column
//   4. posts cannot touch
//   5. a tap or a drag crosses squares out
//
// Penny shows what to do: a ring on the board beats the gesture (twice for a
// double tap, once for a tap, a slide for a drag) and she hums the same
// rhythm. When a post is opened, the squares the newest rule takes away light
// up one after another, so the rule is seen as a shape: the colour, the cross
// of a row and a column, the ring of neighbours. Rules a world does not have
// yet take nothing away. Nothing is lost by a wrong guess here.
//
// A solved board opens a portal to the next. The last one leads to a real game.

import { play as sfx } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { ASK, HELLO, OOPS, SWEEP, TAP, TAP_TAP, THIS_WAY, TRILL, YES, createVoice, lessonReached, setLearned, setLessonReached } from './penny.js';

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const DOUBLE_TAP_MS = 350;

const open = (cell, hint) => ({ type: 'open', cells: [cell], hint });
const cross = (cells, hint) => ({ type: 'cross', cells, hint });

// rows: the board's colours, a letter a square. tiles: which of the game's
// colours each letter is. rules: the rules this world has; the last is the one
// being taught. hint: how soon Penny shows a step ('now', 'soon', or 'late' for
// one that can be worked out).
export const LESSONS = [
  { rows: ['A'], tiles: { A: 1 }, posts: [0], rules: [], steps: [open(0, 'now')] },
  {
    rows: ['AABB', 'AABB', 'CCBB', 'CCDB'], tiles: { A: 0, B: 4, C: 2, D: 1 }, posts: [1, 7, 8, 14], rules: ['colour'],
    steps: [open(1, 'now'), open(7, 'soon'), open(8, 'soon'), open(14, 'late')],
  },
  {
    rows: ['BBAA', 'BBCC', 'DBBC', 'DDBB'], tiles: { A: 6, B: 3, C: 1, D: 0 }, posts: [2, 4, 11, 13], rules: ['colour', 'line'],
    steps: [open(2, 'now'), open(4, 'soon'), open(11, 'late'), open(13, 'late')],
  },
  {
    rows: ['AAAB', 'CABB', 'CCDB', 'CDDD'], tiles: { A: 2, B: 5, C: 0, D: 4 }, posts: [1, 7, 8, 14], rules: ['colour', 'line', 'touch'],
    steps: [open(1, 'now'), open(7, 'late'), open(8, 'late'), open(14, 'late')],
  },
  {
    rows: ['AABB', 'AAAB', 'DDCC', 'DDDC'], tiles: { A: 1, B: 0, C: 3, D: 6 }, posts: [2, 4, 11, 13], rules: ['colour', 'line', 'touch'], marks: true,
    steps: [cross([5, 6, 7], 'now'), open(4, 'late'), cross([3], 'now'), open(2, 'late'), open(11, 'late'), open(13, 'late')],
  },
];

// The squares a post at `post` takes away under one rule, nearest first.
export function ruledOut(rule, post, n, regions) {
  const [row, col] = [Math.floor(post / n), post % n];
  const far = (cell) => Math.max(Math.abs(Math.floor(cell / n) - row), Math.abs((cell % n) - col));
  return regions.map((_, cell) => cell).filter((cell) => {
    if (cell === post) return false;
    const [r, c] = [Math.floor(cell / n), cell % n];
    if (rule === 'colour') return regions[cell] === regions[post];
    if (rule === 'line') return r === row || c === col;
    return far(cell) === 1; // touch
  }).sort((a, b) => far(a) - far(b));
}

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const $ = (id) => root.querySelector(`#${id}`);
  const main = root.querySelector('.learn');
  const board = $('learn-board');
  const dots = $('learn-steps');
  const portal = $('learn-portal');
  const penny = root.querySelector('.p-penny');
  const seal = penny.querySelector('.seal');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Penny ----------------------------------------------------------------------
  const voice = createVoice(life, {
    onNote(pitch, dur) {
      seal.classList.remove('sound');
      void seal.getBoundingClientRect();
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      seal.classList.add('sound');
    },
  });
  const act = (name) => {
    const body = penny.querySelector('.act');
    body.classList.remove('hop', 'wiggle');
    void body.getBoundingClientRect();
    body.classList.add(name);
  };
  const look = (dx, dy) => { penny.querySelector('.eyes').style.translate = `${dx}px ${dy}px`; };

  // --- The board ------------------------------------------------------------------
  let index = Math.min(lessonReached(), LESSONS.length - 1);
  let lesson = null;
  let n = 1;
  let regions = [];
  let cells = []; // 'empty' | 'cross' | 'letter'
  let solved = false;

  function paint(cell, fx, delay = 0, taught = false) {
    const button = board.children[cell];
    const state = cells[cell];
    button.dataset.state = state;
    button.innerHTML = state === 'letter' ? ENVELOPE : state === 'cross' ? '×' : '';
    button.setAttribute('aria-label', `row ${Math.floor(cell / n) + 1}, column ${(cell % n) + 1}, ${state === 'letter' ? 'post found' : state === 'cross' ? 'crossed out' : 'empty'}`);
    button.classList.remove('fx-post', 'fx-cross', 'fx-clear', 'fx-miss', 'teach');
    if (!fx && !taught) return;
    void button.getBoundingClientRect();
    button.style.setProperty('--d', `${delay}ms`);
    if (fx) button.classList.add(fx);
    if (taught) button.classList.add('teach');
  }

  function start(at) {
    index = at;
    setLessonReached(index);
    lesson = LESSONS[index];
    n = lesson.rows.length;
    regions = lesson.rows.join('').split('').map((letter) => lesson.tiles[letter]);
    cells = regions.map(() => 'empty');
    solved = false;
    hideRing();
    board.style.setProperty('--n', n);
    board.replaceChildren(...regions.map((region, cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cell d${region}`;
      button.dataset.cell = cell;
      return button;
    }));
    board.append(ring);
    cells.forEach((_, cell) => paint(cell));
    portal.hidden = true;
    portal.classList.toggle('last', index === LESSONS.length - 1);
    dots.replaceChildren(...LESSONS.map((_, i) => {
      const dot = document.createElement('li');
      if (i < index) dot.className = 'done';
      else if (i === index) dot.className = 'now';
      return dot;
    }));
    asked = lesson.steps[0];
    look(0, -0.6);
    act('hop');
    voice.sing(index === 0 ? HELLO : ASK, 0.8);
    cue(1400);
  }

  // --- What Penny is asking for ----------------------------------------------------
  const ring = document.createElement('i');
  ring.className = 'learn-ring';
  ring.hidden = true;
  let cueTimer = null;
  let sweep = null;
  let asked = null; // the step she is waiting for

  const stepDone = (step) => step.cells.every((cell) => (step.type === 'open' ? cells[cell] === 'letter' : cells[cell] !== 'empty'));
  const nextStep = () => lesson.steps.find((step) => !stepDone(step)) ?? null;

  function hideRing() {
    ring.hidden = true;
    sweep?.cancel();
    sweep = null;
    clearTimeout(cueTimer);
  }
  const centre = (cell) => {
    const tile = board.children[cell];
    return { x: tile.offsetLeft + tile.offsetWidth / 2, y: tile.offsetTop + tile.offsetHeight / 2, size: tile.offsetWidth };
  };
  // Show the next step on the board, and hum its rhythm. `wait` is how long to
  // hold off first; she asks again now and then until it is done.
  function cue(wait, times = 0) {
    clearTimeout(cueTimer);
    cueTimer = life.setTimeout(() => {
      const step = nextStep();
      if (!step || solved) return;
      const first = centre(step.cells[0]);
      ring.hidden = false;
      ring.style.width = ring.style.height = `${first.size}px`;
      ring.style.left = `${first.x - first.size / 2}px`;
      ring.style.top = `${first.y - first.size / 2}px`;
      const drag = step.type === 'cross' && step.cells.length > 1;
      ring.className = `learn-ring ${step.type === 'open' ? 'twice' : drag ? 'slide' : 'once'}`;
      sweep?.cancel();
      sweep = null;
      if (drag && !still) {
        const path = step.cells.map(centre);
        sweep = ring.animate([
          ...path.map((p, i) => ({ transform: `translate(${p.x - first.x}px, ${p.y - first.y}px)`, opacity: 1, offset: (i / (path.length - 1)) * 0.7 })),
          { transform: `translate(${path.at(-1).x - first.x}px, ${path.at(-1).y - first.y}px)`, opacity: 0, offset: 0.85 },
          { transform: 'none', opacity: 0, offset: 1 },
        ], { duration: 1900, iterations: Infinity, easing: 'ease-in-out' });
      }
      // she looks at the square she means
      const tile = board.children[step.cells[0]].getBoundingClientRect();
      const me = penny.getBoundingClientRect();
      const dx = tile.left + tile.width / 2 - (me.left + me.width / 2);
      look(Math.max(-1.6, Math.min(1.6, dx / 60)), -1.3);
      voice.sing(step.type === 'open' ? TAP_TAP : drag ? SWEEP : TAP, 0.8, { breath: 0 });
      if (times < 4) cue(5200 + times * 1500, times + 1);
    }, wait);
  }
  const HOLD = { now: 900, soon: 2600, late: 7000 };

  // After something has changed: on to the next step, or the portal.
  function advance(settle = 0) {
    hideRing();
    const step = nextStep();
    asked = step;
    if (step) {
      cue(settle + HOLD[step.hint]);
      return;
    }
    solved = true;
    life.setTimeout(() => {
      board.classList.add('won');
      portal.hidden = false;
      look(1.6, 0.4);
      act('hop');
      voice.sing(THIS_WAY);
    }, settle + 500);
  }

  // --- Opening a post -----------------------------------------------------------------
  function ripple(cell) {
    if (still) return;
    const at = centre(cell);
    const wave = document.createElement('i');
    wave.className = 'ripple';
    wave.style.left = `${at.x}px`;
    wave.style.top = `${at.y}px`;
    wave.style.setProperty('--reach', `${board.offsetWidth * 2.4}px`);
    board.append(wave);
    life.setTimeout(() => wave.remove(), 1200);
  }

  function guess(cell) {
    if (solved || cells[cell] === 'letter') return;
    if (!lesson.posts.includes(cell)) {
      // not here: the square shakes its head, and she shows where
      paint(cell, 'fx-miss');
      act('wiggle');
      voice.sing(OOPS, 0.7);
      cue(900);
      return;
    }
    cells[cell] = 'letter';
    paint(cell, 'fx-post');
    ripple(cell);
    sfx('post');
    act('hop');

    // What the post takes away. Rules already learnt go quickly; the one this
    // world is teaching goes slowly, square by square, and is lit as it goes.
    const teach = lesson.marks ? null : lesson.rules.at(-1);
    const delays = [];
    let wait = 240;
    for (const rule of lesson.rules.filter((r) => r !== teach)) {
      for (const other of ruledOut(rule, cell, n, regions)) {
        if (cells[other] !== 'empty') continue;
        cells[other] = 'cross';
        paint(other, 'fx-cross', wait);
        delays.push(wait);
        wait += lesson.marks ? 45 : 25;
      }
    }
    if (teach) {
      wait += 260;
      for (const other of ruledOut(teach, cell, n, regions)) {
        const fresh = cells[other] === 'empty';
        if (fresh) cells[other] = 'cross';
        if (cells[other] === 'letter') continue;
        paint(other, fresh ? 'fx-cross' : null, wait, true);
        delays.push(wait);
        wait += 130;
      }
    }
    if (delays.length) sfx('cascade', { delays });
    life.setTimeout(() => voice.sing(nextStep() ? YES : TRILL, 0.9), Math.min(wait, 900));
    advance(wait + 300);
  }

  // --- Crossing out ---------------------------------------------------------------------
  function mark(cell, to) {
    if (cells[cell] === 'letter' || cells[cell] === to) return false;
    cells[cell] = to;
    paint(cell, to === 'cross' ? 'fx-cross' : 'fx-clear');
    sfx(to === 'cross' ? 'cross' : 'clear');
    return true;
  }
  // A cross on a square that holds a post is put right at once: she cannot
  // let you lose a letter.
  function afterMarks() {
    const wrong = lesson.posts.filter((cell) => cells[cell] === 'cross');
    if (wrong.length) {
      life.setTimeout(() => {
        wrong.forEach((cell) => { if (cells[cell] === 'cross') mark(cell, 'empty'); });
        act('wiggle');
        voice.sing(OOPS, 0.7);
      }, 350);
    }
    // on to whatever is now the first thing left to do
    if (nextStep() !== asked) advance(0);
  }

  // --- Touches ------------------------------------------------------------------------------
  const cellAt = (x, y) => {
    const button = document.elementFromPoint(x, y)?.closest?.('.cell');
    return button && board.contains(button) ? Number(button.dataset.cell) : null;
  };
  let lastTap = { cell: null, at: 0, before: null };
  let stroke = null; // while dragging: { to, any }
  let nudge = null;

  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || solved) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;
    clearTimeout(nudge);
    const again = cell === lastTap.cell && event.timeStamp - lastTap.at < DOUBLE_TAP_MS;
    if (again) {
      // the first tap of a double tap may have crossed the square: undo that
      if (lastTap.before && cells[cell] !== 'letter' && cells[cell] !== lastTap.before) {
        cells[cell] = lastTap.before;
        paint(cell);
      }
      lastTap = { cell: null, at: 0, before: null };
      stroke = null;
      guess(cell);
      return;
    }
    lastTap = { cell, at: event.timeStamp, before: cells[cell] };
    if (lesson.marks && cells[cell] !== 'letter') {
      stroke = { to: cells[cell] === 'cross' ? 'empty' : 'cross' };
      mark(cell, stroke.to);
    } else {
      // one tap does nothing in a world without crosses: she shows the two again
      nudge = life.setTimeout(() => cue(0), DOUBLE_TAP_MS + 80);
    }
  });
  life.on(window, 'pointermove', (event) => {
    if (!stroke || !event.isPrimary) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell !== null) mark(cell, stroke.to);
  });
  const lift = () => {
    if (!stroke) return;
    stroke = null;
    // wait out a possible second tap before judging the stroke
    life.setTimeout(() => { if (!stroke && !solved) afterMarks(); }, DOUBLE_TAP_MS + 40);
  };
  life.on(window, 'pointerup', lift);
  life.on(window, 'pointercancel', lift);

  // Keys: Enter opens the square in focus, Space or X crosses it.
  board.addEventListener('keydown', (event) => {
    const cell = Number(event.target.closest?.('.cell')?.dataset.cell ?? NaN);
    if (Number.isNaN(cell) || solved) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      guess(cell);
    } else if ((event.key === ' ' || event.key.toLowerCase() === 'x') && lesson.marks) {
      event.preventDefault();
      if (mark(cell, cells[cell] === 'cross' ? 'empty' : 'cross')) afterMarks();
    }
  });

  // A tap on Penny: she shows again.
  penny.addEventListener('click', () => {
    act('hop');
    if (!solved) cue(0);
    else voice.sing(THIS_WAY);
  });

  // --- Through the portal ---------------------------------------------------------------------
  portal.addEventListener('click', () => {
    if (portal.hidden || main.classList.contains('through')) return;
    if (index === LESSONS.length - 1) {
      setLearned();
      setLessonReached(0);
      go('/postmarks/');
      return;
    }
    main.classList.add('through');
    life.setTimeout(() => {
      board.classList.remove('won');
      start(index + 1);
      main.classList.remove('through');
    }, still ? 0 : 460);
  });

  start(index);
}
