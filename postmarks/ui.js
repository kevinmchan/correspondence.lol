import {
  CROSS, EMPTY, LETTER, MISS, MAX_PLAYERS, MIN_PLAYERS, START_HEARTS,
  applyMove, canMove, generatePuzzle, isLetterCell, lettersFound, newGame,
} from './game.js';
import { rpc } from './api.js';

const GAME_KEY = 'postmarks:game:v1'; // the pass-and-play game on this device
const NAMES_KEY = 'postmarks:names:v1';
const TOKEN_KEY = 'postmarks:token:v1'; // proves which player this device is
const RECENT_KEY = 'postmarks:online:v1';
const MY_NAME_KEY = 'postmarks:me:v1';
const DISTRICTS = ['coral', 'amber', 'lime', 'mint', 'sky', 'periwinkle', 'orchid', 'tan', 'grey'];
const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const $ = (id) => document.getElementById(id);
const el = {
  loading: $('loading'),
  setup: $('setup'), form: $('setup-form'), players: $('players'), addPlayer: $('add-player'), size: $('size'),
  localPlayers: $('local-players'), onlinePlayers: $('online-players'), myName: $('my-name'), seats: $('seats'),
  start: $('start'), setupError: $('setup-error'), recent: $('recent'),
  join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'),
  joinError: $('join-error'), watch: $('watch'),
  play: $('play'), turn: $('turn'), movers: $('movers'), hearts: $('hearts'), found: $('found'), board: $('board'),
  roster: $('roster'), share: $('share'), shareLink: $('share-link'), copyLink: $('copy-link'),
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

// A random secret kept on this device. The server stores only a hash of it.
function myToken() {
  let token = load(TOKEN_KEY);
  if (typeof token !== 'string' || token.length < 20) {
    token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    save(TOKEN_KEY, token);
  }
  return token;
}

// --- State ----------------------------------------------------------------
const requested = new URLSearchParams(location.search).get('game');
let onlineId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

let game = null; // the game being shown, in the shape game.js uses
let online = null; // { id, seats, you } when playing across devices; you is a seat or null
let watching = false; // chose to spectate rather than join
let busy = false; // a move is on its way to the server
let tool = 'mark';
let mover = null; // pass-and-play: which player is holding the device
let builtFor = null;
let pollTimer = null;

if (!onlineId) {
  game = load(GAME_KEY);
  if (!game || game.v !== 1) game = null;
}

// Adopt the server's view of an online game.
function accept(view) {
  game = {
    v: 1, size: view.size, regions: view.regions, solution: view.solution, players: view.players,
    cells: view.cells, hearts: view.hearts, moves: view.moves, status: view.status,
    last: view.last,
  };
  online = { id: view.id, seats: view.seats, you: view.you };
}

const seatsOpen = () => Boolean(online) && game.players.length < online.seats;
// Anyone may move except whoever moved last.
const iCanMove = () => Boolean(online) && online.you !== null && canMove(game, online.you);

// Pass-and-play: keep `mover` on someone allowed to move, defaulting to the
// player after the last mover.
function currentMover() {
  if (!canMove(game, mover)) mover = game.last ? (game.last.player + 1) % game.players.length : 0;
  return mover;
}
const canJoin = () => Boolean(online) && online.you === null && seatsOpen() && game.status === 'playing';
const nameOf = (seat) => (online && seat === online.you ? 'You' : game.players[seat]);

function rememberOnlineGame() {
  if (!online || online.you === null) return;
  const recent = (load(RECENT_KEY) || []).filter((g) => g && g.id !== online.id);
  recent.unshift({ id: online.id, size: game.size, at: Date.now() });
  save(RECENT_KEY, recent.slice(0, 8));
}

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
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'quiet remove';
  remove.textContent = '−';
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

function syncWhere() {
  const isOnline = el.form.elements.where.value === 'online';
  el.localPlayers.hidden = el.localPlayers.disabled = isOnline;
  el.onlinePlayers.hidden = el.onlinePlayers.disabled = !isOnline;
  el.start.textContent = isOnline ? 'Create game' : 'Start game';
}

function showSetup() {
  if (!el.players.children.length) {
    const names = load(NAMES_KEY);
    const initial = Array.isArray(names) && names.length >= MIN_PLAYERS ? names.slice(0, MAX_PLAYERS) : ['', ''];
    initial.forEach((name) => addPlayerRow(String(name)));
    el.myName.value = String(load(MY_NAME_KEY) || '');
  }
  syncWhere();

  const recent = (load(RECENT_KEY) || []).filter((g) => g && UUID.test(g.id));
  const list = el.recent.querySelector('ul');
  list.replaceChildren(...recent.map((g) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/postmarks/?game=${g.id}`;
    const day = new Date(g.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    a.textContent = `${g.size} × ${g.size} game, last opened ${day}`;
    li.append(a);
    return li;
  }));
  el.recent.hidden = recent.length === 0;
}

el.form.addEventListener('change', (event) => {
  if (event.target.name === 'where') syncWhere();
});

el.addPlayer.addEventListener('click', () => {
  addPlayerRow();
  el.players.lastElementChild.querySelector('input').focus();
});

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.setupError.textContent = '';
  const size = Number(el.size.value);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  tool = 'mark';
  say('');

  if (el.form.elements.where.value === 'online') {
    const name = el.myName.value.trim();
    if (!name) return;
    el.start.disabled = true;
    try {
      const puzzle = generatePuzzle(size, seed);
      const view = await rpc('postmarks_create', {
        p_size: size, p_seats: Number(el.seats.value), p_regions: puzzle.regions, p_solution: puzzle.solution,
        p_name: name, p_token: myToken(),
      });
      save(MY_NAME_KEY, name);
      onlineId = view.id;
      history.replaceState(null, '', `/postmarks/?game=${view.id}`);
      accept(view);
      rememberOnlineGame();
      render();
      schedulePoll();
    } catch (error) {
      el.setupError.textContent = error.message;
    } finally {
      el.start.disabled = false;
    }
    return;
  }

  const names = [...el.players.querySelectorAll('input')].map((i) => i.value.trim());
  if (names.some((n) => !n)) return;
  game = newGame({ size, seed, players: names });
  save(NAMES_KEY, names);
  save(GAME_KEY, game);
  render();
  el.board.querySelector('.cell')?.focus();
});

// --- Joining a friend's game ------------------------------------------------
el.joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = el.joinName.value.trim();
  if (!name) return;
  el.joinError.textContent = '';
  try {
    accept(await rpc('postmarks_join', { p_game: onlineId, p_name: name, p_token: myToken() }));
    save(MY_NAME_KEY, name);
    rememberOnlineGame();
    render();
    schedulePoll();
  } catch (error) {
    el.joinError.textContent = error.message;
    poll();
  }
});

el.watch.addEventListener('click', () => {
  watching = true;
  render();
});

// --- Keeping in step with the server --------------------------------------
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!online || game.status !== 'playing' || document.hidden) return;
  // In a full two-player game nothing can change while the move is mine.
  const delay = iCanMove() && online.seats === 2 && !seatsOpen() ? 15000 : 3000;
  pollTimer = setTimeout(poll, delay);
}

async function poll() {
  clearTimeout(pollTimer);
  if (!onlineId) return;
  try {
    const view = await rpc('postmarks_get', { p_game: onlineId, p_token: myToken() });
    if (!busy && (!game || view.moves > game.moves || view.players.length !== game.players.length)) {
      const moved = !game || view.moves > game.moves;
      accept(view);
      if (moved) announceLast();
      render();
    }
  } catch {
    /* offline or a blip: keep showing what we have and try again */
  }
  schedulePoll();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && online) poll();
});
window.addEventListener('online', () => {
  if (online) poll();
});

// --- Board ----------------------------------------------------------------
function buildBoard(key) {
  const { size, regions } = game;
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
  builtFor = key;
}

const where = (cell) => `row ${Math.floor(cell / game.size) + 1}, column ${(cell % game.size) + 1}`;

function describeLast() {
  const { last } = game;
  if (!last) return '';
  const who = nameOf(last.player);
  if (last.type === 'mark') return `${who} crossed out ${where(last.cell)}.`;
  if (last.type === 'unmark') return `${who} removed the cross at ${where(last.cell)}.`;
  return last.correct
    ? `${who} found a letter at ${where(last.cell)}.`
    : `${who} guessed ${where(last.cell)} — no letter there. A heart lost.`;
}

function announceLast() {
  say(describeLast(), game.last?.type === 'guess' && game.last.correct === false);
}

function say(text, bad = false) {
  el.message.textContent = text;
  el.message.classList.toggle('bad', bad);
}

function show(section) {
  for (const candidate of [el.loading, el.setup, el.join, el.play]) candidate.hidden = candidate !== section;
}

function render() {
  document.title = `${game && iCanMove() ? '● Your move · ' : ''}Postmarks · correspondence.lol`;

  if (!game) {
    if (onlineId) {
      show(el.loading);
    } else {
      showSetup();
      show(el.setup);
    }
    return;
  }

  if (canJoin() && !watching) {
    const open = online.seats - game.players.length;
    el.joinText.textContent =
      `${game.players.join(' and ')} invited you to a ${game.size} × ${game.size} game of Postmarks. ` +
      `${open === 1 ? 'One seat is' : `${open} seats are`} open.`;
    if (!el.joinName.value) el.joinName.value = String(load(MY_NAME_KEY) || '');
    show(el.join);
    return;
  }

  show(el.play);
  const boardKey = `${online ? online.id : game.seed}:${game.size}`;
  if (builtFor !== boardKey) buildBoard(boardKey);

  const over = game.status !== 'playing';
  const found = lettersFound(game);
  const spectator = Boolean(online) && online.you === null;

  // Squares
  for (const button of el.board.children) {
    const cell = Number(button.dataset.cell);
    const mark = game.cells[cell];
    let name = 'empty';
    let content = '';
    let label = 'empty';
    if (mark === CROSS) [name, content, label] = ['cross', '×', 'crossed out'];
    else if (mark === MISS) [name, content, label] = ['miss', '×', 'wrong guess'];
    else if (mark === LETTER) [name, content, label] = ['letter', ENVELOPE, 'letter found'];
    if (game.status === 'lost' && game.solution && mark !== LETTER && isLetterCell(game, cell)) {
      [name, content, label] = ['reveal', ENVELOPE, 'a letter was here'];
    }
    if (button.dataset.state !== name) {
      button.dataset.state = name;
      button.innerHTML = content;
    }
    button.classList.toggle('last', game.last?.cell === cell);
    button.setAttribute('aria-label', `${where(cell)}, ${DISTRICTS[game.regions[cell]]} district, ${label}`);
  }
  el.board.setAttribute('aria-disabled', String(over || (Boolean(online) && !iCanMove())));
  el.board.classList.toggle('busy', busy);

  // Heads-up display
  el.hearts.textContent = '♥'.repeat(game.hearts) + '♡'.repeat(START_HEARTS - game.hearts);
  el.hearts.setAttribute('aria-label', `${game.hearts} of ${START_HEARTS} hearts left`);
  el.found.textContent = `${found}/${game.size} letters`;

  el.turn.replaceChildren();
  if (game.status === 'won') {
    el.turn.textContent = 'All delivered — you win!';
  } else if (game.status === 'lost') {
    el.turn.textContent = 'Out of hearts.';
  } else if (!online) {
    const strong = document.createElement('strong');
    strong.textContent = `${game.players[currentMover()]}’s`;
    el.turn.append(strong, ' move');
  } else if (iCanMove()) {
    const strong = document.createElement('strong');
    strong.textContent = 'Your';
    el.turn.append(strong, ' move');
  } else if (spectator) {
    el.turn.textContent = game.last ? `Anyone but ${game.players[game.last.player]} can move` : 'Anyone can move';
  } else {
    const others = game.players.filter((_, seat) => seat !== online.you);
    el.turn.textContent = others.length === 0 ? 'Waiting for someone to join'
      : others.length === 1 ? `Waiting for ${others[0]}`
      : 'Waiting for someone else to move';
  }

  // Pass-and-play: choose who is moving. Whoever moved last sits this one out.
  el.movers.hidden = Boolean(online) || over;
  if (!el.movers.hidden) {
    el.movers.replaceChildren(...game.players.map((name, player) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.player = player;
      button.textContent = name;
      button.disabled = !canMove(game, player);
      button.setAttribute('aria-checked', String(player === currentMover()));
      if (button.disabled) button.title = `${name} made the last move`;
      return button;
    }));
  }

  // Who is playing, and the invitation link while seats are open
  el.roster.hidden = !online;
  if (online) {
    const parts = [];
    for (let seat = 0; seat < online.seats; seat++) {
      const span = document.createElement('span');
      span.textContent = seat < game.players.length
        ? game.players[seat] + (seat === online.you ? ' (you)' : '')
        : 'open seat';
      if (canMove(game, seat)) span.className = 'now';
      parts.push(span, ' · ');
    }
    parts.pop();
    if (spectator) parts.push(' — you are watching');
    el.roster.replaceChildren(...parts);
  }
  el.share.hidden = !(online && seatsOpen() && !over);
  if (!el.share.hidden) el.shareLink.value = `${location.origin}/postmarks/?game=${online.id}`;

  // Tools
  el.tools.hidden = over || spectator;
  for (const button of el.tools.children) {
    button.setAttribute('aria-checked', String(button.dataset.tool === tool));
  }
  if (over) {
    el.hint.textContent = game.status === 'won'
      ? `Solved together in ${game.moves} turns with ${game.hearts} ${game.hearts === 1 ? 'heart' : 'hearts'} to spare.`
      : `The remaining letters are shown faded. ${found} of ${game.size} found.`;
  } else if (spectator) {
    el.hint.textContent = 'The board updates as the players take their turns.';
  } else if (online && !iCanMove()) {
    el.hint.textContent = 'You can close this page and come back; the game waits for you.';
  } else {
    el.hint.textContent = tool === 'guess'
      ? 'Tap the square where you think a letter is. A wrong guess costs a heart.'
      : 'Tap a square to cross it out, or tap a cross to remove it.';
  }
  el.newGame.textContent = online ? 'Leave game' : over ? 'Play again' : 'New game';
}

// --- Taking a turn --------------------------------------------------------
async function play(cell) {
  if (!game || game.status !== 'playing' || busy) return;
  if (online && !iCanMove()) {
    if (online.you === null) say('You are watching this game.');
    else say('You made the last move, so someone else goes next.');
    return;
  }
  const type = tool === 'guess' ? 'guess' : game.cells[cell] === CROSS ? 'unmark' : 'mark';
  if (type === 'mark' && game.cells[cell] !== EMPTY) {
    say('That square is already settled.', true);
    return;
  }

  if (online) {
    busy = true;
    render();
    try {
      accept(await rpc('postmarks_move', { p_game: online.id, p_token: myToken(), p_type: type, p_cell: cell }));
      tool = 'mark';
      announceLast();
    } catch (error) {
      say(error.message, true);
    } finally {
      busy = false;
      render();
      poll(); // also resynchronises after a rejected move
    }
    return;
  }

  const result = applyMove(game, { player: currentMover(), type, cell });
  if (!result.ok) {
    say(result.error, true);
    return;
  }
  game = result.state;
  mover = null; // passes to the next player by default
  tool = 'mark'; // each turn starts on the safe tool, so a stray tap never costs a heart
  save(GAME_KEY, game);
  announceLast();
  render();
}

el.board.addEventListener('click', (event) => {
  const button = event.target.closest('.cell');
  if (button) play(Number(button.dataset.cell));
});

// Arrow keys move between squares.
el.board.addEventListener('keydown', (event) => {
  const button = event.target.closest('.cell');
  if (!button || !game) return;
  const { size } = game;
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

el.movers.addEventListener('click', (event) => {
  const button = event.target.closest('[data-player]');
  if (!button || button.disabled) return;
  mover = Number(button.dataset.player);
  render();
});

el.copyLink.addEventListener('click', async () => {
  const url = el.shareLink.value;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Postmarks', text: 'Join my game of Postmarks', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    el.copyLink.textContent = 'Copied';
  } catch (error) {
    if (error?.name === 'AbortError') return; // share sheet dismissed
    el.shareLink.select();
    el.copyLink.textContent = 'Select & copy';
  }
  setTimeout(() => { el.copyLink.textContent = 'Copy'; }, 2000);
});

el.newGame.addEventListener('click', () => {
  if (online) {
    location.href = '/postmarks/'; // the game stays on the server; the link still works
    return;
  }
  if (game?.status === 'playing' && game.moves > 0 && !confirm('Abandon this game and start a new one?')) return;
  game = null;
  mover = null;
  builtFor = null;
  save(GAME_KEY, null);
  say('');
  render();
});

// --- Start ----------------------------------------------------------------
render();
if (onlineId) {
  rpc('postmarks_get', { p_game: onlineId, p_token: myToken() })
    .then((view) => {
      accept(view);
      rememberOnlineGame();
      announceLast();
      render();
      schedulePoll();
    })
    .catch((error) => {
      el.loading.textContent = `${error.message} `;
      const back = document.createElement('a');
      back.href = '/postmarks/';
      back.textContent = 'Start a new game';
      el.loading.append(back);
      if (!/not found/i.test(error.message)) pollTimer = setTimeout(poll, 5000);
    });
} else if (game) {
  announceLast();
}
