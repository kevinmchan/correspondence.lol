import {
  CROSS, EMPTY, LETTER, MISS, START_HEARTS,
  applyMove, canMove, isLetterCell, lettersFound, newGame, randomSize,
} from './game.js';
import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { UUID, gameUrl, load, myToken, roomUrl, save, setMyName } from '/shared/identity.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { openHowTo } from './howto.js';
import { avatar, openProfile } from '/shared/profile.js';
import { watchPresence } from '/shared/push.js';

// A game is either a solo game (saved on this device only) or belongs to a
// room (?game=<id>, stored on the server and open to everyone in that room).

const GAME_KEY = 'postmarks:solo:v1';
const HOWTO_KEY = 'postmarks:howto:v1'; // the last game this device showed the how-to for
const DISTRICTS = ['coral', 'amber', 'lime', 'mint', 'sky', 'periwinkle', 'orchid', 'tan', 'grey'];
const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';

const $ = (id) => document.getElementById(id);
const el = {
  back: $('back'), profile: $('profile'), loading: $('loading'),
  play: $('play'), turn: $('turn'), hearts: $('hearts'), found: $('found'), board: $('board'),
  roster: $('roster'), tools: $('tools'), actions: $('actions'), submit: $('submit'), clear: $('clear'), help: $('help'),
  narration: $('narration'), message: $('message'), newGame: $('new-game'),
  chatBox: $('chat-box'), chat: $('chat'), chatUnread: $('chat-unread'),
  trial: $('trial'), trialTitle: $('trial-title'), trialHint: $('trial-hint'), trialPhrase: $('trial-phrase'),
  trialRuns: $('trial-runs'), trialStart: $('trial-start'), trialShare: $('trial-share'), trialError: $('trial-error'),
  runs: $('runs'), phrase: $('phrase'), phraseNote: $('phrase-note'), phraseEntry: $('phrase-entry'), phraseInput: $('phrase-input'),
  shareGame: $('share-game'),
};

// --- State ----------------------------------------------------------------
const requested = new URLSearchParams(location.search).get('game');
const onlineId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

let game = null; // the game being shown, in the shape game.js uses
let online = null; // { id, you, room, roomName } for a room game; you is this device's seat
let busy = false; // a move is on its way to the server
let pending = 0; // solo-mode crosses sent to the server but not yet confirmed
let sending = Promise.resolve(); // they go one after another, in order
let resync = false; // the board shown may be ahead of the server: take its word next time
// The move being put together, shown on the board but not yet played:
// { type: 'mark' | 'unmark' | 'guess', cells: [] }. Nothing counts until Submit.
let draft = null;
let dragging = false; // a drag is in progress, adding the squares it passes to the draft
let tool = 'mark';
let builtFor = null;
let pollTimer = null;
let chat = null;
let watcher = null; // live updates for the game's room
let unread = 0;

if (!onlineId) {
  game = load(GAME_KEY);
  if (!game || game.v !== 1 || game.players?.length !== 1) game = null;
}

// Adopt the server's view of a room game. Its mode is 'coop' (one board for
// the room, taking turns) or one of the solo modes, where everyone solves
// their own copy of the same board and results are listed in `runs`:
// 'trial' (against the clock) and 'phrase' (each letter found reveals a word
// of a hidden phrase, which can also be guessed outright).
function accept(view) {
  const mode = view.mode ?? 'coop';
  const started = view.started !== false; // a time trial keeps its board back until you start
  game = {
    v: 1, size: view.size, regions: view.regions ?? [], solution: view.solution ?? null, players: view.players,
    cells: view.cells ?? [], hearts: view.hearts ?? START_HEARTS, moves: view.moves ?? 0,
    status: started ? view.status : 'waiting', last: view.last ?? null,
    free: mode !== 'coop',
    absent: view.people.flatMap((person, seat) => (person.left ? [seat] : [])), // they left the room
  };
  online = {
    id: view.id, you: view.you, room: view.room, roomName: view.room_name, people: view.people,
    mode, started, runs: view.runs ?? [], author: view.phrase_by ?? null, // who wrote the phrase, if anyone
    // tokens: [{ len, gap, t }] with t null until unlocked (games from before tokens have only `shown`)
    phrase: mode === 'phrase' ? { tokens: view.tokens ?? null, shown: view.phrase ?? view.phrase_mask, known: Boolean(view.phrase) } : null,
    // the clock: how long it had run when this view was made, and when that was
    clock: view.elapsed_ms == null ? null : { ms: Number(view.elapsed_ms), at: performance.now() },
  };
}

// Moves need Submit only when a board is shared; in the solo modes you play alone.
const immediate = () => !online || online.mode !== 'coop';
const iCanMove = () => Boolean(online) && canMove(game, online.you);
const clockText = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const elapsed = () => (game.status === 'playing' ? online.clock.ms + performance.now() - online.clock.at : online.clock.ms);
const nameOf = (seat) => (online && seat === online.you ? 'You' : game.players[seat]);

// --- Solo games -----------------------------------------------------------
function startSolo() {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  game = newGame({ size: randomSize(), seed, players: ['You'] });
  tool = 'mark';
  draft = null;
  builtFor = null;
  save(GAME_KEY, game);
  say('');
  el.narration.textContent = '';
}

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
      // a finished time trial still has a leaderboard to keep up with
      game.status === 'playing' || online.mode !== 'coop' ? rpc('postmarks_get', { p_game: online.id, p_token: myToken() }) : null,
      rpc('room_get', { p_room: online.room, p_token: myToken(), p_after: chat ? chat.lastId : null }),
    ]);
    // also picks up people joining the room or changing their name
    if (view && !busy && !pending && (resync || (view.moves ?? 0) > game.moves || JSON.stringify(view.people) !== JSON.stringify(online.people)
        || JSON.stringify(view.runs ?? []) !== JSON.stringify(online.runs))) {
      const moved = !resync && (view.moves ?? 0) > game.moves; // after a rejected move, keep its notice on screen
      resync = false;
      accept(view);
      if (moved) announceLast();
      render();
    }
    feedChat(room);
  } catch (error) {
    // Someone deleted the game while it was open here: back to the room.
    if (/game not found/i.test(error.message)) {
      alert('This game was deleted.');
      location.replace(roomUrl(online.room));
      return;
    }
    /* otherwise offline or a blip: keep showing what we have and try again */
  }
  schedulePoll();
}

function feedChat(room) {
  if (!room || room.you === null) return;
  const history = !chat; // the first batch is old messages, not news
  if (!chat) {
    chat = createChat(el.chat, {
      roomId: room.id, you: room.you, people: room.people, onSent: () => watcher?.poke(),
    });
  }
  chat.setPeople(room.people);
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
  const many = last.cells?.length > 1 ? `${last.cells.length} squares` : null;
  if (last.type === 'phrase') return `${who} guessed the phrase “${last.guess}”: ${last.correct ? 'right!' : 'wrong. A heart lost.'}`;
  if (last.type === 'mark') return `${who} crossed out ${many ?? where(last.cell)}.`;
  if (last.type === 'unmark') return `${who} removed the ${many ? `crosses on ${many}` : `cross at ${where(last.cell)}`}.`;
  return last.correct
    ? `${who} found a letter at ${where(last.cell)}.${last.crossed ? ` ${last.crossed} more ${last.crossed === 1 ? 'square' : 'squares'} crossed out.` : ''}`
    : `${who} guessed ${where(last.cell)} — no letter there. A heart lost.`;
}

// The board shows the latest move by itself; this describes it for screen
// readers only.
function announceLast() {
  el.narration.textContent = describeLast();
  say('');
}

// A visible notice, used only when a tap could not be carried out.
function say(text) {
  el.message.textContent = text;
}

function show(section) {
  for (const candidate of [el.loading, el.trial, el.play]) candidate.hidden = candidate !== section;
}

// A time trial's results, best first: finished times, then those still playing
// or out of hearts.
function leaderboard(list) {
  list.replaceChildren(...online.runs.map((run) => {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'who';
    who.append(avatar(online.people[run.seat]), online.people[run.seat].name + (run.seat === online.you ? ' (you)' : ''));
    const result = document.createElement('span');
    result.className = `result ${run.status}`;
    result.textContent = run.status === 'lost' ? 'out of hearts' : run.status !== 'won' ? 'playing…'
      : online.mode === 'trial' ? clockText(run.ms) : `${run.found} of ${game.size} opened`;
    li.append(who, result);
    return li;
  }));
  list.hidden = online.runs.length === 0;
}

// The pass phrase as a row of cards, one per token: each letter on the board
// holds exactly one. A card stays face down, showing only how long its token
// is, until that letter is found. Tokens that are parts of one word sit
// joined together.
function renderPhrase(target) {
  const tokens = online.phrase.tokens
    // games from before tokens: one card per word
    ?? online.phrase.shown.split(' ').map((word) => ({ len: word.length, gap: true, t: word.includes('_') ? null : word }));
  // Cards are updated in place, so one turning over animates once and the
  // rest stay still when the page refreshes.
  while (target.children.length > tokens.length) target.lastElementChild.remove();
  tokens.forEach((token, i) => {
    const card = target.children[i] ?? target.appendChild(document.createElement('span'));
    const text = token.t === null ? '•'.repeat(token.len) : token.t.toUpperCase();
    if (card.textContent !== text) card.textContent = text;
    const className = ['word', token.t === null && 'hidden', i > 0 && !tokens[i - 1].gap && 'join', !token.gap && i < tokens.length - 1 && 'cont']
      .filter(Boolean).join(' ');
    if (card.className !== className) card.className = className;
  });
  const left = tokens.filter((token) => token.t === null).length;
  target.setAttribute('aria-label', left === 0
    ? `The phrase: ${online.phrase.shown}`
    : `The phrase, ${tokens.length} tokens, ${left} still hidden: ${tokens.map((token) => (token.t ?? 'hidden') + (token.gap ? ',' : '')).join(' ')}`);
  target.hidden = false;
}

function render() {
  document.title = `${game && iCanMove() ? '● Your move · ' : ''}Postmarks · correspondence.lol`;

  if (!game) {
    show(el.loading);
    return;
  }

  if (online) {
    el.back.href = roomUrl(online.room);
    el.back.textContent = `← ${online.roomName}`;
    el.profile.hidden = false;
    el.profile.replaceChildren(avatar(online.people[online.you]));
  }
  if (online && online.mode !== 'coop' && !online.started) {
    const wrote = online.author === online.you;
    if (online.mode === 'phrase' && !wrote) {
      startRun(); // nothing to wait for: straight to your own board
      show(el.loading);
      return;
    }
    // A time trial waits for Start. A phrase's author has no board: they watch the results.
    el.trialTitle.textContent = online.mode === 'trial' ? 'Time trial' : 'Pass phrase';
    el.trialHint.textContent = online.mode === 'trial'
      ? 'Everyone solves the same board on their own. Fastest time wins, and three wrong guesses put you out. Your clock starts when you press Start.'
      : 'You wrote this one. Everyone else solves the board on their own, and each letter they find shows them one word.';
    el.trialStart.hidden = wrote;
    if (online.phrase) renderPhrase(el.trialPhrase);
    else el.trialPhrase.hidden = true;
    leaderboard(el.trialRuns);
    show(el.trial);
    return;
  }

  show(el.play);
  const boardKey = `${online ? online.id : game.seed}:${game.size}`;
  if (builtFor !== boardKey) buildBoard(boardKey);

  pruneDraft();
  const over = game.status !== 'playing';
  const found = lettersFound(game);

  // Squares
  for (const button of el.board.children) {
    const cell = Number(button.dataset.cell);
    // squares in the draft are shown as they would be once submitted
    const drafted = Boolean(draft?.cells.includes(cell));
    const mark = drafted && draft.type !== 'guess' ? (draft.type === 'mark' ? CROSS : EMPTY) : game.cells[cell];
    let name = 'empty';
    let content = '';
    let label = 'empty';
    if (mark === CROSS) [name, content, label] = ['cross', '×', 'crossed out'];
    else if (mark === MISS) [name, content, label] = ['miss', '×', 'wrong guess'];
    else if (mark === LETTER) [name, content, label] = ['letter', ENVELOPE, 'letter found'];
    if (drafted && draft.type === 'guess') [name, content, label] = ['guess', ENVELOPE, 'your guess, not yet submitted'];
    else if (drafted) label += ', not yet submitted';
    if (game.status === 'lost' && game.solution && mark !== LETTER && isLetterCell(game, cell)) {
      [name, content, label] = ['reveal', ENVELOPE, 'a letter was here'];
    }
    if (button.dataset.state !== name) {
      button.dataset.state = name;
      button.innerHTML = content;
    }
    button.classList.toggle('last', !draft && (game.last?.cells ?? [game.last?.cell]).includes(cell));
    button.classList.toggle('drawing', drafted);
    button.setAttribute('aria-label', `${where(cell)}, ${DISTRICTS[game.regions[cell]]} district, ${label}`);
  }
  el.board.setAttribute('aria-disabled', String(over || (Boolean(online) && !iCanMove())));
  el.board.classList.toggle('busy', busy);

  // Heads-up display
  el.hearts.textContent = '♥'.repeat(game.hearts) + '♡'.repeat(START_HEARTS - game.hearts);
  el.hearts.setAttribute('aria-label', `${game.hearts} of ${START_HEARTS} hearts left`);
  el.found.textContent = `${found}/${game.size} letters`;

  el.turn.replaceChildren();
  if (online?.mode === 'trial') {
    el.turn.textContent = game.status === 'won' ? `Finished in ${clockText(elapsed())}`
      : game.status === 'lost' ? 'Out of hearts.' : clockText(elapsed());
  } else if (online?.mode === 'phrase') {
    el.turn.textContent = game.status === 'won' ? 'Phrase solved!' : game.status === 'lost' ? 'Out of hearts.' : '';
  } else if (game.status === 'won') {
    el.turn.textContent = 'All delivered — you win!';
  } else if (game.status === 'lost') {
    el.turn.textContent = 'Out of hearts.';
  } else if (!online) {
    el.turn.textContent = ''; // playing alone: it is always your move
  } else if (iCanMove()) {
    const strong = document.createElement('strong');
    strong.textContent = 'Your';
    el.turn.append(strong, ' move');
  } else {
    const others = game.players.filter((_, seat) => seat !== online.you && !game.absent.includes(seat));
    el.turn.textContent = others.length === 0 ? 'Waiting for someone to join the room'
      : others.length === 1 ? `Waiting for ${others[0]}`
      : 'Waiting for someone else to move';
  }

  // A shared game lists everyone in the room, with those who may move next
  // standing out. The solo modes show results instead.
  const solo = Boolean(online) && online.mode !== 'coop';
  el.roster.hidden = !online || solo;
  if (online && !solo) {
    el.roster.replaceChildren(...online.people.flatMap((person, seat) => {
      if (person.left) return []; // no longer in the room
      const li = document.createElement('li');
      li.append(avatar(person), person.name + (seat === online.you ? ' (you)' : ''));
      if (canMove(game, seat)) li.className = 'now';
      return [li];
    }));
  }
  el.runs.hidden = !solo;
  if (solo) leaderboard(el.runs);

  // Pass phrase: the phrase so far, and who wrote it
  const phrase = online?.phrase;
  el.phrase.hidden = !phrase;
  el.phraseNote.hidden = !(phrase && online.author !== null);
  if (phrase) {
    renderPhrase(el.phrase);
    el.phraseNote.textContent = `${online.people[online.author]?.name ?? 'Someone'} wrote this phrase.`;
  }
  el.shareGame.hidden = !online;

  // Tools, and the buttons that play or discard the draft
  el.actions.hidden = over || immediate() || !iCanMove(); // Submit belongs to shared room games
  el.phraseEntry.hidden = !(phrase && tool === 'phrase' && !over);
  el.tools.querySelector('[data-tool="phrase"]').hidden = !phrase;
  el.submit.disabled = !draft || busy;
  el.clear.disabled = !draft || busy;
  el.tools.hidden = over;
  for (const button of el.tools.children) {
    button.setAttribute('aria-checked', String(button.dataset.tool === tool));
  }
  // Room games go back to the room with the arrow at the top; only a solo
  // game needs a way to start over.
  el.newGame.hidden = Boolean(online);
  el.newGame.textContent = over ? 'Play again' : 'New game';
}

// --- Taking a turn --------------------------------------------------------
// May the person at this device act right now? Says why not if they can't.
function ready() {
  if (!game || game.status !== 'playing' || busy) return false;
  if (online && !iCanMove()) {
    say('You made the last move, so someone else goes next.');
    return false;
  }
  return true;
}

// Take a turn: one stroke of crosses, one stroke clearing crosses, or a guess.
async function play(type, cells, text) {
  if (!ready()) return;
  const move = { player: online ? online.you : 0, type, cells };
  // Crosses can be worked out here, so they appear at once; a guess in a room
  // game has to wait for the server, which is the only one who knows the answer.
  const local = (type === 'guess' || type === 'phrase') && online ? null : applyMove(game, move);
  if (local && !local.ok) {
    say(local.error);
    return;
  }

  if (!online) {
    game = local.state;
    tool = 'mark'; // each turn starts on the safe tool, so a stray tap never costs a heart
    save(GAME_KEY, game);
    announceLast();
    render();
    return;
  }

  // Playing alone, crosses are shown at once and sent in the background, so the
  // next tap never waits on the last one.
  if (online.mode !== 'coop' && local) {
    game = local.state;
    render();
    pending++;
    sending = sending
      .then(() => rpc('postmarks_play', { p_game: online.id, p_token: myToken(), p_type: type, p_cells: cells }))
      .then((view) => {
        pending--;
        if (!pending && !busy) {
          accept(view);
          render();
        }
      }, (error) => {
        pending = 0;
        say(error.message);
        resync = true; // take the server's board back
        poll();
      });
    return;
  }

  busy = true;
  if (local) game = local.state; // show the crosses now; the server confirms below
  render();
  try {
    await sending; // any crosses still on their way go first
    accept(type === 'phrase'
      ? await rpc('postmarks_guess_phrase', { p_game: online.id, p_token: myToken(), p_phrase: text })
      : await rpc('postmarks_play', { p_game: online.id, p_token: myToken(), p_type: type, p_cells: cells }));
    if (type === 'phrase') el.phraseInput.value = '';
    tool = 'mark';
    announceLast();
    watcher?.poke();
  } catch (error) {
    say(error.message);
    resync = true; // undo anything shown early by taking the server's board
  } finally {
    busy = false;
    render();
    poll();
  }
}

// --- Putting a move together -------------------------------------------------
// Tapping and dragging only edit the draft. A draft is either crosses to add,
// crosses to remove, or one guess; Submit plays it and ends the turn.

// Drop anything from the draft that the board no longer allows (for instance
// because another player moved while it was being put together).
function pruneDraft() {
  if (!draft) return;
  const fits = (cell) => {
    const mark = game.cells[cell];
    if (draft.type === 'mark') return mark === EMPTY;
    if (draft.type === 'unmark') return mark === CROSS;
    return mark === EMPTY || mark === CROSS;
  };
  const allowed = game.status === 'playing' && (!online || iCanMove());
  draft.cells = allowed ? draft.cells.filter(fits) : [];
  if (!draft.cells.length) draft = null;
}

// Add a square to a draft of crosses, starting one if need be. Returns whether
// the square went in.
function draftCross(cell) {
  const mark = game.cells[cell];
  const type = mark === EMPTY ? 'mark' : mark === CROSS ? 'unmark' : null;
  if (!type) return false;
  if (draft?.type === 'guess') draft = null; // crosses replace a drafted guess
  if (draft && draft.type !== type) return false; // one kind of change per turn
  draft ??= { type, cells: [] };
  if (!draft.cells.includes(cell)) draft.cells.push(cell);
  return true;
}

function undraft(cell) {
  draft.cells = draft.cells.filter((c) => c !== cell);
  if (!draft.cells.length) draft = null;
}

const cellAt = (x, y) => {
  const button = document.elementFromPoint(x, y)?.closest?.('.cell');
  return button && el.board.contains(button) ? Number(button.dataset.cell) : null;
};

// Each new press starts the move over: a tap drafts one square, a drag drafts
// every square it passes, and whatever was drafted before is discarded.
el.board.addEventListener('pointerdown', (event) => {
  if (tool !== 'mark' || !event.isPrimary || event.button !== 0) return;
  const cell = cellAt(event.clientX, event.clientY);
  if (cell === null || !ready()) return;
  say('');
  draft = null;
  if (draftCross(cell)) dragging = true;
  else say('That square is already settled.');
  render();
});

window.addEventListener('pointermove', (event) => {
  if (!dragging || !event.isPrimary) return;
  const cell = cellAt(event.clientX, event.clientY);
  if (cell !== null && !draft.cells.includes(cell) && draftCross(cell)) render();
});

// Play the draft. In a room this is what Submit does. Alone there is no turn
// to end, so every move is played as soon as it is made and there is no Submit.
function submitDraft() {
  if (!draft) return;
  const { type, cells, text } = draft;
  draft = null;
  play(type, cells, text);
}

// Pass phrase: guess the whole phrase. Played at once, like every solo move.
el.phraseEntry.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = el.phraseInput.value.trim();
  if (text) play('phrase', [], text);
});

window.addEventListener('pointerup', () => {
  if (dragging && immediate()) submitDraft();
  dragging = false;
});

window.addEventListener('pointercancel', () => {
  dragging = false;
});

// Clicks cover what the pointer handlers above do not: guesses, and crosses
// made from the keyboard (a keyboard "click" has detail 0). The keyboard has
// no drag, so there each press adds a square to the draft or takes it back.
el.board.addEventListener('click', (event) => {
  const button = event.target.closest('.cell');
  if (!button) return;
  const cell = Number(button.dataset.cell);
  if (tool !== 'guess' && event.detail !== 0) return;
  if (!ready()) return;
  say('');
  const settled = game.cells[cell] === LETTER || game.cells[cell] === MISS;
  if (settled) {
    say('That square is already settled.');
  } else if (tool === 'guess') {
    const same = draft?.type === 'guess' && draft.cells[0] === cell;
    draft = same ? null : { type: 'guess', cells: [cell] }; // a guess replaces whatever was drafted
  } else if (draft?.type !== 'guess' && draft?.cells.includes(cell)) {
    undraft(cell);
  } else {
    draftCross(cell);
  }
  if (immediate()) submitDraft();
  else render();
});

el.submit.addEventListener('click', submitDraft);

el.clear.addEventListener('click', () => {
  draft = null;
  say('');
  render();
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
  if (tool === 'phrase') el.phraseInput.focus();
});

// --- Solo modes: your own copy of the board ---------------------------------
// A time trial starts when its Start button is pressed; a pass phrase starts
// as soon as it is opened.
let starting = false;

async function startRun() {
  if (starting) return;
  starting = true;
  el.trialStart.disabled = true;
  el.trialError.textContent = '';
  try {
    accept(await rpc('postmarks_trial_start', { p_game: online.id, p_token: myToken() }));
    render();
    greet();
    watcher?.poke();
  } catch (error) {
    el.trialError.textContent = error.message;
    el.loading.textContent = error.message;
  } finally {
    starting = false;
    el.trialStart.disabled = false;
  }
}

el.trialStart.addEventListener('click', startRun);

// The clock ticks on screen between updates from the server.
setInterval(() => {
  if (online?.mode === 'trial' && online.started && game.status === 'playing') el.turn.textContent = clockText(elapsed());
}, 500);

// --- Sharing this game --------------------------------------------------------
// The link opens the game for room members; anyone else is taken through
// joining the room first and then brought here.
async function shareGame(button) {
  const url = location.origin + gameUrl('postmarks', online.id);
  try {
    if (navigator.share) {
      await navigator.share({ url });
      return;
    }
    await navigator.clipboard.writeText(url);
    button.title = 'Link copied';
    if (button === el.shareGame) say('Link to this game copied.');
    else button.textContent = 'Link copied';
  } catch (error) {
    if (error?.name !== 'AbortError') prompt('Copy this link to share the game', url);
  }
}

el.shareGame.addEventListener('click', () => shareGame(el.shareGame));
el.trialShare.addEventListener('click', () => shareGame(el.trialShare));

// The animated how-to opens the first time this device shows a given game.
function greet() {
  if (online?.mode === 'trial') return; // the clock is running: no interruptions
  const key = online ? online.id : String(game.seed);
  if (load(HOWTO_KEY) === key) return;
  save(HOWTO_KEY, key);
  if (game.status === 'playing') openHowTo();
}

el.help.addEventListener('click', openHowTo);

el.profile.addEventListener('click', () => {
  openProfile({
    person: online.people[online.you],
    onSave: async ({ name, avatar: face, color }) => {
      await rpc('room_profile', { p_room: online.room, p_token: myToken(), p_name: name, p_avatar: face, p_color: color });
      setMyName(name);
      resync = true; // take the server's view, which now has the new profile
      watcher?.poke();
      await poll();
    },
  });
});

el.newGame.addEventListener('click', () => {
  if (game?.status === 'playing' && game.moves > 0 && !confirm('Abandon this game and start a new one?')) return;
  startSolo();
  render();
  greet();
});

// --- Start ----------------------------------------------------------------
render();
if (onlineId) {
  rpc('postmarks_get', { p_game: onlineId, p_token: myToken() })
    .then((view) => {
      if (view.you === null) {
        // games are for room members: join first, then come straight back here
        location.replace(`${roomUrl(view.room)}&game=${view.id}`);
        return;
      }
      accept(view);
      watcher = watchRoom(view.room, poll);
      watchPresence(view.room); // no notifications about a game that is on screen
      announceLast();
      render();
      greet();
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
} else {
  startSolo(); // nothing to set up: opening the page starts a puzzle
  render();
  greet();
}
