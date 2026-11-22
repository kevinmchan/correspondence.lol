// How to play, as a short looping animation with no words: a 4 × 4 board
// plays itself, one rule at a time. Text equivalents are provided for screen
// readers only.

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

const N = 4;
// One letter in each row, column and district; none touching.
const REGIONS = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
const LETTERS = [1, 7, 8, 14];

const SUMMARY =
  'How to play. One letter is hidden in every row, every column and every coloured district, and letters never ' +
  'touch, not even diagonally. On your turn, cross out squares where a letter cannot be, by tapping or dragging, ' +
  'or pick the letter tool and tap where you think a letter is. Then press Submit to play your move. Players take ' +
  'turns; whoever just moved waits for someone else. A wrong guess costs one of three shared hearts. Find every ' +
  'letter to win.';

let dialog = null;
let run = null; // the animation currently playing: { live: boolean }

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'howto';
  dialog.setAttribute('aria-label', 'How to play');
  dialog.innerHTML = `
    <p class="sr-only">${SUMMARY}</p>
    <div class="stage" aria-hidden="true">
      <div class="top">
        <div class="people"><span class="person"></span><span class="person"></span></div>
        <div class="hearts"><span>♥</span><span>♥</span><span>♥</span></div>
      </div>
      <div class="board"></div>
      <div class="bottom">
        <div class="tools"><span class="tool" data-tool="cross">×</span><span class="tool" data-tool="letter">${ENVELOPE}</span></div>
        <span class="ok">${CHECK}</span>
      </div>
      <span class="finger"></span>
    </div>
    <div class="foot">
      <div class="dots" aria-hidden="true">${'<i></i>'.repeat(7)}</div>
      <button type="button" class="start" aria-label="Start playing">${PLAY}</button>
    </div>`;
  const board = dialog.querySelector('.board');
  for (let cell = 0; cell < N * N; cell++) {
    const tile = document.createElement('span');
    tile.className = `cell d${[0, 4, 2, 5][REGIONS[cell]]}`;
    tile.dataset.state = 'empty';
    board.append(tile);
  }
  dialog.querySelector('.start').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // a tap on the backdrop
  });
  dialog.addEventListener('close', () => {
    if (run) run.live = false;
  });
  document.body.append(dialog);
}

async function play(token) {
  const stage = dialog.querySelector('.stage');
  const tiles = [...dialog.querySelectorAll('.cell')];
  const people = [...dialog.querySelectorAll('.person')];
  const hearts = [...dialog.querySelectorAll('.hearts span')];
  const dots = [...dialog.querySelectorAll('.dots i')];
  const finger = dialog.querySelector('.finger');
  const ok = dialog.querySelector('.ok');
  const tools = { cross: dialog.querySelector('[data-tool="cross"]'), letter: dialog.querySelector('[data-tool="letter"]') };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wait = (ms) => new Promise((resolve, reject) => {
    setTimeout(() => (token.live ? resolve() : reject(new Error('stopped'))), calm ? ms * 1.4 : ms);
  });
  const set = (cell, state) => {
    const tile = tiles[cell];
    if (tile.dataset.state === state) return;
    tile.dataset.state = state;
    tile.innerHTML = state === 'letter' || state === 'guess' ? ENVELOPE : state === 'cross' || state === 'miss' ? '×' : '';
    tile.classList.toggle('pop', state === 'letter');
  };
  const draft = (cells, on = true) => cells.forEach((c) => tiles[c].classList.toggle('drawing', on));
  const focus = (cells) => tiles.forEach((tile, c) => tile.classList.toggle('dim', Boolean(cells) && !cells.includes(c)));
  const glow = (cells) => tiles.forEach((tile, c) => tile.classList.toggle('glow', Boolean(cells) && cells.includes(c)));
  const turn = (who) => people.forEach((person, i) => person.classList.toggle('on', i === who));
  const tool = (name) => Object.entries(tools).forEach(([key, node]) => node.classList.toggle('on', key === name));
  const scene = (index) => dots.forEach((dot, i) => dot.classList.toggle('on', i === index));
  const crossAll = async (cells, gap = 110) => {
    for (const c of cells) {
      if (tiles[c].dataset.state === 'empty') {
        set(c, 'cross');
        await wait(gap);
      }
    }
  };

  const moveTo = async (node) => {
    const a = stage.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    finger.style.transform = `translate(${b.left - a.left + b.width / 2}px, ${b.top - a.top + b.height / 2}px)`;
    finger.classList.add('show');
    await wait(520);
  };
  const press = async (node, then) => {
    await moveTo(node);
    finger.classList.add('down');
    node.classList.add('pressed');
    await wait(160);
    then?.();
    finger.classList.remove('down');
    node.classList.remove('pressed');
    await wait(260);
  };
  const submit = async (then) => {
    ok.classList.add('ready');
    await wait(250);
    await press(ok, () => {
      ok.classList.remove('ready');
      then();
    });
  };

  const row = (r) => [0, 1, 2, 3].map((c) => r * N + c);
  const col = (c) => [0, 1, 2, 3].map((r) => r * N + c);
  const district = (id) => REGIONS.flatMap((region, c) => (region === id ? [c] : []));
  const around = (cell) => tiles.map((_, c) => c).filter((c) =>
    Math.abs(Math.floor(c / N) - Math.floor(cell / N)) <= 1 && Math.abs((c % N) - (cell % N)) <= 1);
  const ruledOutBy = (cell) => [...new Set([...row(Math.floor(cell / N)), ...col(cell % N), ...district(REGIONS[cell]), ...around(cell)])];

  for (;;) {
    // reset
    dialog.classList.remove('won');
    tiles.forEach((_, c) => set(c, 'empty'));
    draft(tiles.map((_, c) => c), false);
    focus(null);
    glow(null);
    hearts.forEach((heart) => { heart.textContent = '♥'; heart.classList.remove('lost'); });
    finger.classList.remove('show');
    turn(-1);
    tool('cross');
    await wait(500);

    // 1–4. Where letters can be: one per row, per column, per colour, none touching.
    scene(0);
    focus(row(0));
    await wait(700);
    set(1, 'letter');
    await wait(600);
    await crossAll(row(0));
    await wait(800);

    scene(1);
    focus(col(1));
    await wait(600);
    await crossAll(col(1));
    await wait(800);

    scene(2);
    focus(district(0));
    await wait(600);
    await crossAll(district(0));
    await wait(800);

    scene(3);
    focus(around(1));
    glow(around(1));
    await wait(700);
    await crossAll(around(1));
    await wait(900);
    glow(null);
    focus(null);
    await wait(400);

    // 5. A turn: tap or drag crosses, then submit. Then it is someone else's turn.
    scene(4);
    turn(0);
    await wait(500);
    await moveTo(tiles[10]);
    finger.classList.add('down');
    set(10, 'cross');
    draft([10]);
    await wait(250);
    await moveTo(tiles[11]);
    set(11, 'cross');
    draft([11]);
    await wait(150);
    finger.classList.remove('down');
    await wait(350);
    await submit(() => draft([10, 11], false));
    turn(1);
    await wait(900);

    // 6. A wrong guess costs a heart.
    scene(5);
    await press(tools.letter, () => tool('letter'));
    await press(tiles[12], () => { set(12, 'guess'); draft([12]); });
    await submit(() => {
      draft([12], false);
      set(12, 'miss');
      hearts[2].textContent = '♡';
      hearts[2].classList.add('lost');
    });
    tool('cross');
    turn(0);
    await wait(1100);

    // 7. A right guess clears everything it rules out. Find them all to win.
    scene(6);
    await press(tools.letter, () => tool('letter'));
    await press(tiles[7], () => { set(7, 'guess'); draft([7]); });
    await submit(() => { draft([7], false); set(7, 'letter'); });
    tool('cross');
    await crossAll(ruledOutBy(7), 70);
    turn(1);
    await wait(700);
    for (const [cell, who] of [[8, 0], [14, 1]]) {
      await press(tools.letter, () => tool('letter'));
      await press(tiles[cell], () => { set(cell, 'guess'); draft([cell]); });
      await submit(() => { draft([cell], false); set(cell, 'letter'); });
      tool('cross');
      await crossAll(ruledOutBy(cell), 50);
      turn(who);
      await wait(350);
    }
    finger.classList.remove('show');
    turn(-1);
    dialog.classList.add('won');
    await wait(2400);
  }
}

export function openHowTo() {
  if (!dialog) build();
  if (dialog.open) return;
  if (run) run.live = false;
  run = { live: true };
  dialog.showModal();
  dialog.querySelector('.start').focus();
  play(run).catch(() => {
    /* stopped because the dialog was closed */
  });
}
