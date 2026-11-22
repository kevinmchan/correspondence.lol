import {
  CROSS, EMPTY, LETTER, MISS, MAX_PLAYERS, MIN_PLAYERS, START_HEARTS,
  applyMove, canMove, isLetterCell, lettersFound, newGame,
} from './game.js';
import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { UUID, load, myToken, roomUrl, save } from '/shared/identity.js';
import { pollDelay, watchRoom } from '/shared/live.js';

// A game is either pass-and-play (saved on this device only) or belongs to a
// room (?game=<id>, stored on the server and open to everyone in that room).

const GAME_KEY = 'postmarks:game:v1';
const NAMES_KEY = 'postmarks:names:v1';
const DISTRICTS = ['coral', 'amber', 'lime', 'mint', 'sky', 'periwinkle', 'orchid', 'tan', 'grey'];
const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';

const $ = (id) => document.getElementById(id);
const el = {
  back: $('back'), loading: $('loading'),
  setup: $('setup'), form: $('setup-form'), players: $('players'), addPlayer: $('add-player'), size: $('size'),
  play: $('play'), turn: $('turn'), movers: $('movers'), hearts: $('hearts'), found: $('found'), board: $('board'),
  roster: $('roster'), tools: $('tools'), hint: $('hint'), message: $('message'), newGame: $('new-game'),
  chatBox: $('chat-box'), chat: $('chat'), chatUnread: $('chat-unread'),
};

// --- State ----------------------------------------------------------------
const requested = new URLSearchParams(location.search).get('game');
const onlineId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

let game = null; // the game being shown, in the shape game.js uses
let online = null; // { id, you, room, roomName } for a room game; you is this device's seat
let busy = false; // a move is on its way to the server
let tool = 'mark';
let mover = null; // pass-and-play: which player is holding the device
let builtFor = null;
let pollTimer = null;
let chat = null;
let watcher = null; // live updates for the game's room
let unread = 0;

if (!onlineId) {
  game = load(GAME_KEY);
  if (!game || game.v !== 1) game = null;
}

// Adopt the server's view of a room game.
function accept(view) {
  game = {
    v: 1, size: view.size, regions: view.regions, solution: view.solution, players: view.players,
    cells: view.cells, hearts: view.hearts, moves: view.moves, status: view.status, last: view.last,
  };
  online = { id: view.id, you: view.you, room: view.room, roomName: view.room_name };
}

// Anyone may move except whoever moved last.
const iCanMove = () => Boolean(online) && canMove(game, online.you);
const nameOf = (seat) => (online && seat === online.you ? 'You' : game.players[seat]);

// Pass-and-play: keep `mover` on someone allowed to move, defaulting to the
// player after the last mover.
function currentMover() {
  if (!canMove(game, mover)) mover = game.last ? (game.last.player + 1) % game.players.length : 0;
  return mover;
}

// --- Setup screen (pass-and-play) -----------------------------------------
function addPlayerRow(name = '') {
  if (el.players.children.length >= MAX_PLAYERS) return;
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

function showSetup() {
  if (el.players.children.length) return;
  const names = load(NAMES_KEY);
  const initial = Array.isArray(names) && names.length >= MIN_PLAYERS ? names.slice(0, MAX_PLAYERS) : ['', ''];
  initial.forEach((name) => addPlayerRow(String(name)));
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
  game = newGame({ size: Number(el.size.value), seed, players: names });
  tool = 'mark';
  mover = null;
  save(NAMES_KEY, names);
  save(GAME_KEY, game);
  say('');
  render();
  el.board.querySelector('.cell')?.focus();
});

// --- Keeping in step with the server (room games) -------------------------
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!online || document.hidden) return;
  pollTimer = setTimeout(poll, pollDelay(watcher, game.status === 'playing' ? 3000 : 6000));
}

async function poll() {
  clearTimeout(pollTimer);
  if (!online) return;
  try {
    const [view, room] = await Promise.all([
      game.status === 'playing' ? rpc('postmarks_get', { p_game: online.id, p_token: myToken() }) : null,
      rpc('room_get', { p_room: online.room, p_token: myToken(), p_after: chat ? chat.lastId : null }),
    ]);
    if (view && !busy && (view.moves > game.moves || view.players.length !== game.players.length)) {
      const moved = view.moves > game.moves;
      accept(view);
      if (moved) announceLast();
      render();
    }
    feedChat(room);
  } catch {
    /* offline or a blip: keep showing what we have and try again */
  }
  schedulePoll();
}

function feedChat(room) {
  if (!room || room.you === null) return;
  const history = !chat; // the first batch is old messages, not news
  if (!chat) {
    chat = createChat(el.chat, {
      roomId: room.id, you: room.you, members: room.members, onSent: () => watcher?.poke(),
    });
  }
  chat.setMembers(room.members);
  const fromOthers = chat.add(room.messages);
  if (!history && fromOthers && (!el.chatBox.open || document.hidden)) unread += fromOthers;
  el.chatBox.hidden = false;
  el.chatUnread.textContent = unread ? `· ${unread} new` : '';
}

el.chatBox.addEventListener('toggle', () => {
  if (!el.chatBox.open) return;
  unread = 0;
  el.chatUnread.textContent = '';
  const log = el.chat.querySelector('.chat-log');
  if (log) log.scrollTop = log.scrollHeight;
});

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
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cell = cell;
    button.className = `cell d${regions[cell]}`;
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
    ? `${who} found a letter at ${where(last.cell)}.${last.crossed ? ` ${last.crossed} more ${last.crossed === 1 ? 'square' : 'squares'} crossed out.` : ''}`
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
  for (const candidate of [el.loading, el.setup, el.play]) candidate.hidden = candidate !== section;
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

  show(el.play);
  if (online) {
    el.back.href = roomUrl(online.room);
    el.back.textContent = `← ${online.roomName}`;
  }
  const boardKey = `${online ? online.id : game.seed}:${game.size}`;
  if (builtFor !== boardKey) buildBoard(boardKey);

  const over = game.status !== 'playing';
  const found = lettersFound(game);

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
  } else if (!online || iCanMove()) {
    const strong = document.createElement('strong');
    strong.textContent = online ? 'Your' : `${game.players[currentMover()]}’s`;
    el.turn.append(strong, ' move');
  } else {
    const others = game.players.filter((_, seat) => seat !== online.you);
    el.turn.textContent = others.length === 0 ? 'Waiting for someone to join the room'
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

  // Room games: everyone in the room, with those who may move underlined
  el.roster.hidden = !online;
  if (online) {
    const parts = [];
    game.players.forEach((name, seat) => {
      const span = document.createElement('span');
      span.textContent = name + (seat === online.you ? ' (you)' : '');
      if (canMove(game, seat)) span.className = 'now';
      parts.push(span, ' · ');
    });
    parts.pop();
    el.roster.replaceChildren(...parts);
  }

  // Tools
  el.tools.hidden = over;
  for (const button of el.tools.children) {
    button.setAttribute('aria-checked', String(button.dataset.tool === tool));
  }
  if (over) {
    el.hint.textContent = game.status === 'won'
      ? `Solved together in ${game.moves} turns with ${game.hearts} ${game.hearts === 1 ? 'heart' : 'hearts'} to spare.`
      : `The remaining letters are shown faded. ${found} of ${game.size} found.`;
  } else if (online && !iCanMove()) {
    el.hint.textContent = 'You can close this page and come back; the game waits for you.';
  } else {
    el.hint.textContent = tool === 'guess'
      ? 'Tap the square where you think a letter is. A wrong guess costs a heart.'
      : 'Tap a square to cross it out, or tap a cross to remove it.';
  }
  el.newGame.textContent = online ? 'Back to the room' : over ? 'Play again' : 'New game';
}

// --- Taking a turn --------------------------------------------------------
async function play(cell) {
  if (!game || game.status !== 'playing' || busy) return;
  if (online && !iCanMove()) {
    say('You made the last move, so someone else goes next.');
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
      watcher?.poke();
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

el.newGame.addEventListener('click', () => {
  if (online) {
    location.href = roomUrl(online.room);
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
      if (view.you === null) {
        location.replace(roomUrl(view.room)); // games are for room members: join first
        return;
      }
      accept(view);
      watcher = watchRoom(view.room, poll);
      announceLast();
      render();
      poll();
    })
    .catch((error) => {
      el.loading.textContent = `${error.message} `;
      const home = document.createElement('a');
      home.href = '/';
      home.textContent = 'Back to the start';
      el.loading.append(home);
    });
} else if (game) {
  announceLast();
}
