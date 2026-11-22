import {
  CROSS, EMPTY, LETTER, MISS, MAX_PLAYERS, MIN_PLAYERS, START_HEARTS,
  applyMove, isLetterCell, lettersFound, newGame,
} from './game.js';

const GAME_KEY = 'postmarks:game:v1';
const NAMES_KEY = 'postmarks:names:v1';
const DISTRICTS = ['coral', 'amber', 'lime', 'mint', 'sky', 'periwinkle', 'orchid', 'tan', 'grey'];
const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';

const $ = (id) => document.getElementById(id);
const el = {
  setup: $('setup'), form: $('setup-form'), players: $('players'), addPlayer: $('add-player'), size: $('size'),
  play: $('play'), turn: $('turn'), hearts: $('hearts'), found: $('found'), board: $('board'),
  tools: $('tools'), hint: $('hint'), message: $('message'), newGame: $('new-game'),
};

// --- Storage (the game must still work if storage is unavailable) ---------
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: play on without saving */
  }
}

let state = load(GAME_KEY);
if (!state || state.v !== 1) state = null;
let tool = 'mark';
let builtFor = null; // the regions array the board DOM was built from

// --- Setup screen ---------------------------------------------------------
function addPlayerRow(name = '') {
  const count = el.players.children.length;
  if (count >= MAX_PLAYERS) return;
  const li = document.createElement('li');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.required = true;
  input.autocomplete = 'off';
  input.value = name;
  input.placeholder = `Player ${count + 1}`;
  input.setAttribute('aria-label', `Player ${count + 1} name`);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'quiet remove';
  remove.textContent = '−';
  remove.setAttribute('aria-label', `Remove player ${count + 1}`);
  remove.addEventListener('click', () => {
    li.remove();
    syncPlayerControls();
  });
  li.append(input, remove);
  el.players.append(li);
  syncPlayerControls();
}

function syncPlayerControls() {
  const rows = [...el.players.children];
  rows.forEach((li, i) => {
    li.querySelector('input').placeholder = `Player ${i + 1}`;
    li.querySelector('input').setAttribute('aria-label', `Player ${i + 1} name`);
    li.querySelector('.remove').setAttribute('aria-label', `Remove player ${i + 1}`);
    li.querySelector('.remove').hidden = rows.length <= MIN_PLAYERS;
  });
  el.addPlayer.hidden = rows.length >= MAX_PLAYERS;
}

function showSetup() {
  el.players.replaceChildren();
  const names = load(NAMES_KEY);
  const initial = Array.isArray(names) && names.length >= MIN_PLAYERS ? names.slice(0, MAX_PLAYERS) : ['', ''];
  initial.forEach((name) => addPlayerRow(String(name)));
  el.setup.hidden = false;
  el.play.hidden = true;
}

el.addPlayer.addEventListener('click', () => {
  addPlayerRow();
  el.players.lastElementChild.querySelector('input').focus();
});

el.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const names = [...el.players.querySelectorAll('input')].map((i) => i.value.trim());
  if (names.some((n) => !n)) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  state = newGame({ size: Number(el.size.value), seed, players: names });
  tool = 'mark';
  save(NAMES_KEY, names);
  save(GAME_KEY, state);
  el.message.textContent = '';
  render();
  el.board.querySelector('.cell')?.focus();
});

// --- Board ----------------------------------------------------------------
function buildBoard() {
  const { size, regions } = state;
  el.board.style.setProperty('--n', size);
  el.board.replaceChildren();
  for (let cell = 0; cell < size * size; cell++) {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cell = cell;
    const edges = [
      row > 0 && regions[cell - size] !== regions[cell] && 'et',
      col < size - 1 && regions[cell + 1] !== regions[cell] && 'er',
      row < size - 1 && regions[cell + size] !== regions[cell] && 'eb',
      col > 0 && regions[cell - 1] !== regions[cell] && 'el',
    ].filter(Boolean);
    button.className = ['cell', `d${regions[cell]}`, ...edges].join(' ');
    el.board.append(button);
  }
  builtFor = regions;
}

const where = (cell) => `row ${Math.floor(cell / state.size) + 1}, column ${(cell % state.size) + 1}`;

function describeLast() {
  const { last, players } = state;
  if (!last) return '';
  const who = players[last.player];
  if (last.type === 'mark') return `${who} crossed out ${where(last.cell)}.`;
  if (last.type === 'unmark') return `${who} removed the cross at ${where(last.cell)}.`;
  return last.correct
    ? `${who} found a letter at ${where(last.cell)}.`
    : `${who} guessed ${where(last.cell)} — no letter there. A heart lost.`;
}

function render() {
  if (!state) {
    showSetup();
    return;
  }
  el.setup.hidden = true;
  el.play.hidden = false;
  if (builtFor !== state.regions) buildBoard();

  const over = state.status !== 'playing';
  const found = lettersFound(state);

  // Squares
  for (const button of el.board.children) {
    const cell = Number(button.dataset.cell);
    const mark = state.cells[cell];
    let name = 'empty';
    let content = '';
    let label = 'empty';
    if (mark === CROSS) [name, content, label] = ['cross', '×', 'crossed out'];
    else if (mark === MISS) [name, content, label] = ['miss', '×', 'wrong guess'];
    else if (mark === LETTER) [name, content, label] = ['letter', ENVELOPE, 'letter found'];
    if (state.status === 'lost' && mark !== LETTER && isLetterCell(state, cell)) {
      [name, content, label] = ['reveal', ENVELOPE, 'a letter was here'];
    }
    if (button.dataset.state !== name) {
      button.dataset.state = name;
      button.innerHTML = content;
    }
    button.classList.toggle('last', state.last?.cell === cell);
    button.setAttribute('aria-label', `${where(cell)}, ${DISTRICTS[state.regions[cell]]} district, ${label}`);
  }
  el.board.setAttribute('aria-disabled', String(over));

  // Heads-up display
  el.hearts.textContent = '♥'.repeat(state.hearts) + '♡'.repeat(START_HEARTS - state.hearts);
  el.hearts.setAttribute('aria-label', `${state.hearts} of ${START_HEARTS} hearts left`);
  el.found.textContent = `${found}/${state.size} letters`;

  el.turn.replaceChildren();
  if (state.status === 'won') {
    el.turn.textContent = 'All delivered — you win!';
  } else if (state.status === 'lost') {
    el.turn.textContent = 'Out of hearts.';
  } else {
    const strong = document.createElement('strong');
    strong.textContent = state.players[state.turn];
    el.turn.append(strong, '’s turn');
  }

  // Tools
  el.tools.hidden = over;
  for (const button of el.tools.children) {
    button.setAttribute('aria-checked', String(button.dataset.tool === tool));
  }
  if (over) {
    el.hint.textContent = state.status === 'won'
      ? `Solved together in ${state.moves} turns with ${state.hearts} ${state.hearts === 1 ? 'heart' : 'hearts'} to spare.`
      : `The remaining letters are shown faded. ${found} of ${state.size} found.`;
  } else {
    el.hint.textContent = tool === 'guess'
      ? 'Tap the square where you think a letter is. A wrong guess costs a heart.'
      : 'Tap a square to cross it out, or tap a cross to remove it.';
  }
  el.newGame.textContent = over ? 'Play again' : 'New game';
}

function play(cell) {
  if (!state || state.status !== 'playing') return;
  const type = tool === 'guess' ? 'guess' : state.cells[cell] === CROSS ? 'unmark' : 'mark';
  if (type === 'mark' && state.cells[cell] !== EMPTY) {
    say('That square is already settled.', true);
    return;
  }
  const result = applyMove(state, { player: state.turn, type, cell });
  if (!result.ok) {
    say(result.error, true);
    return;
  }
  state = result.state;
  tool = 'mark'; // each turn starts on the safe tool, so a stray tap never costs a heart
  save(GAME_KEY, state);
  say(describeLast(), state.last.type === 'guess' && !state.last.correct);
  render();
}

function say(text, bad = false) {
  el.message.textContent = text;
  el.message.classList.toggle('bad', bad);
}

el.board.addEventListener('click', (event) => {
  const button = event.target.closest('.cell');
  if (button) play(Number(button.dataset.cell));
});

// Arrow keys move between squares.
el.board.addEventListener('keydown', (event) => {
  const button = event.target.closest('.cell');
  if (!button || !state) return;
  const { size } = state;
  const cell = Number(button.dataset.cell);
  const row = Math.floor(cell / size);
  const col = cell % size;
  let next = null;
  if (event.key === 'ArrowUp' && row > 0) next = cell - size;
  else if (event.key === 'ArrowDown' && row < size - 1) next = cell + size;
  else if (event.key === 'ArrowLeft' && col > 0) next = cell - 1;
  else if (event.key === 'ArrowRight' && col < size - 1) next = cell + 1;
  if (next === null) return;
  event.preventDefault();
  el.board.children[next].focus();
});

el.tools.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tool]');
  if (!button) return;
  tool = button.dataset.tool;
  render();
});

el.newGame.addEventListener('click', () => {
  if (state?.status === 'playing' && state.moves > 0 && !confirm('Abandon this game and start a new one?')) return;
  state = null;
  builtFor = null;
  save(GAME_KEY, null);
  render();
});

render();
if (state) say(describeLast());
