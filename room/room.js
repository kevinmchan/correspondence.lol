import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { avatar, openProfile, savedLook } from '/shared/profile.js';
import { enablePush, pushState, syncPush, watchPresence } from '/shared/push.js';
import { UUID, forgetRoom, gameUrl, myName, myToken, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { generatePuzzle, phraseBoardSize, randomSize, tokenize } from '/postmarks/game.js';

const $ = (id) => document.getElementById(id);
const el = {
  name: $('room-name'), loading: $('loading'),
  join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'), joinError: $('join-error'),
  room: $('room'), members: $('members'), profile: $('profile'),
  notify: $('notify'), notifyText: $('notify-text'), notifyButton: $('notify-button'), shareLink: $('share-link'), copyLink: $('copy-link'), shareButton: $('share-button'),
  games: $('games'), noGames: $('no-games'),
  modes: $('modes'), compose: $('compose'), phraseForm: $('phrase-form'), phraseText: $('phrase-text'),
  phraseError: $('phrase-error'), phraseBack: $('phrase-back'), tokens: $('tokens'), tokenNote: $('token-note'), gameError: $('game-error'),
  chat: $('chat'), leave: $('leave'), leaveError: $('leave-error'),
};

const requested = new URLSearchParams(location.search).get('id');
const roomId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

// Arriving from a shared game link: once in the room, go on to that game.
const wantedGame = new URLSearchParams(location.search).get('game');
const nextGame = wantedGame && UUID.test(wantedGame) ? wantedGame.toLowerCase() : null;

let room = null; // the server's latest view of the room
let chat = null;
let unread = 0;
let timer = null;
let watcher = null; // live updates, once we are a member
let composing = false; // the write-a-phrase screen is showing in place of the room
let present = false; // telling the server this room is on screen

function fail(text) {
  el.loading.hidden = false;
  el.loading.textContent = `${text} `;
  const home = document.createElement('a');
  home.href = '/';
  home.textContent = 'Back to the start';
  el.loading.append(home);
}

function list(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.500 7M10 11v5M14 11v5"/></svg>'.replace('17.500', '17.5');

const MODE_NAMES = { coop: 'Postmarks', trial: 'Time trial', phrase: 'Pass phrase' };

function gameStatus(game) {
  if (game.mode === 'trial' || game.mode === 'phrase') {
    // the solo modes: where you stand, and how many have finished
    const done = `${game.finished} finished`;
    if (game.phrase_by === room.you) return { text: `You wrote this one · ${done}` };
    if (game.mine === 'won') return { text: `${game.mode === 'trial' ? 'You finished' : 'You solved it'} · ${done}` };
    if (game.mine === 'lost') return { text: `You ran out of hearts · ${done}` };
    if (game.mode === 'phrase') return { text: `${game.mine === 'playing' ? 'In progress' : 'Not started'} · ${done}`, go: true };
    return { text: `${game.mine === 'playing' ? 'Your clock is running' : 'Not started'} · ${done}`, go: true };
  }
  const hearts = '♥'.repeat(game.hearts) + '♡'.repeat(3 - game.hearts);
  if (game.status === 'won') return { text: `Solved in ${game.moves} turns · ${hearts}` };
  if (game.status === 'lost') return { text: `Out of hearts · ${game.found}/${game.size} letters found` };
  const progress = `${game.found}/${game.size} letters · ${hearts}`;
  if (game.last_player === room.you) return { text: `Waiting for someone else · ${progress}` };
  return { text: `Your move · ${progress}`, go: true };
}

function render() {
  el.name.textContent = room.name;
  setTitle();
  el.loading.hidden = true;

  if (room.you === null) {
    // people still in the room (those who left keep their place in the list, marked)
    const here = room.people.filter((person) => !person.left).map((person) => person.name);
    const n = here.length;
    el.joinText.textContent = nextGame
      ? 'You’ve been invited to a game here. Join the room to play.'
      : n === 0 ? 'Nobody is here at the moment. Join to play and chat.'
        : `${list(here)} ${n === 1 ? 'is' : 'are'} here. Join to play and chat.`;
    if (!el.joinName.value) el.joinName.value = myName();
    el.join.hidden = false;
    el.room.hidden = true;
    el.compose.hidden = true;
    el.profile.hidden = true;
    return;
  }

  if (nextGame) {
    location.replace(gameUrl('postmarks', nextGame)); // already a member: straight to the shared game
    return;
  }
  el.join.hidden = true;
  el.room.hidden = composing;
  el.compose.hidden = !composing;
  el.members.replaceChildren(...room.people.flatMap((person, seat) => {
    if (person.left) return [];
    const li = document.createElement('li');
    li.append(avatar(person), person.name + (seat === room.you ? ' (you)' : ''));
    return [li];
  }));
  el.profile.hidden = false;
  el.profile.replaceChildren(avatar(room.people[room.you]));
  el.shareLink.value = location.origin + roomUrl(room.id);

  el.games.replaceChildren(...room.games.map((game) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = gameUrl(game.kind, game.id);
    const title = document.createElement('strong');
    title.textContent = `${MODE_NAMES[game.mode] ?? 'Postmarks'} ${game.size} × ${game.size}`;
    const status = gameStatus(game);
    const line = document.createElement('span');
    line.textContent = status.text;
    if (status.go) line.className = 'go';
    a.append(title, line);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet round delete';
    remove.dataset.game = game.id;
    remove.dataset.name = title.textContent;
    remove.title = 'Delete this game';
    remove.setAttribute('aria-label', `Delete ${title.textContent}`);
    remove.innerHTML = TRASH;
    li.append(a, remove);
    return li;
  }));
  el.noGames.hidden = room.games.length > 0;

  if (!watcher) watcher = watchRoom(room.id, refresh);
  if (!present) {
    present = true;
    watchPresence(room.id);
    syncPush().catch(() => {}); // re-register this device if notifications are already on
    renderNotify();
  }
  if (!chat) {
    chat = createChat(el.chat, {
      roomId: room.id, you: room.you, people: room.people, onSent: () => watcher.poke(),
    });
  }
  chat.setPeople(room.people);
  const fromOthers = chat.add(room.messages);
  if (document.hidden && fromOthers) {
    unread += fromOthers;
    setTitle();
  }
}

function setTitle() {
  document.title = `${unread ? `(${unread}) ` : ''}${room ? room.name : 'Room'} · correspondence.lol`;
}

async function refresh() {
  clearTimeout(timer);
  try {
    room = await rpc('room_get', { p_room: roomId, p_token: myToken(), p_after: chat ? chat.lastId : null });
    if (room.you !== null) rememberRoom(room.id, room.name);
    render();
  } catch (error) {
    if (!room) {
      fail(error.message);
      if (/not found/i.test(error.message)) return;
    }
  }
  if (!document.hidden) timer = setTimeout(refresh, pollDelay(watcher));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  unread = 0;
  if (room) setTitle();
  refresh();
});
window.addEventListener('online', refresh);

el.joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = el.joinName.value.trim();
  if (!name) return;
  el.joinError.textContent = '';
  try {
    room = await rpc('room_join', { p_room: roomId, p_name: name, p_token: myToken() });
    setMyName(name);
    // bring along the look chosen in an earlier room, if any
    const look = savedLook();
    if (look) await saveProfile({ name, ...look }).catch(() => {});
    rememberRoom(room.id, room.name);
    if (nextGame) {
      location.replace(gameUrl('postmarks', nextGame)); // the game they were invited to
      return;
    }
    render();
    refresh(); // restart polling at the live pace
  } catch (error) {
    el.joinError.textContent = error.message;
  }
});

// --- Notifications ------------------------------------------------------------
function renderNotify() {
  const state = pushState();
  el.notify.hidden = state === 'granted' || state === 'unsupported';
  el.notifyButton.hidden = state === 'denied';
  if (state === 'default') {
    el.notifyText.textContent = 'Get a notification when a game starts, it’s your turn, or someone messages the room.';
    el.notifyButton.textContent = 'Turn on';
  } else if (state === 'install-first') {
    el.notifyText.textContent = 'Install the app to get a notification when a game starts, it’s your turn, or someone messages the room.';
    el.notifyButton.textContent = 'Show me how';
  } else if (state === 'denied') {
    el.notifyText.textContent = 'Notifications are blocked for this site. You can allow them in your browser or system settings.';
  }
}

el.notifyButton.addEventListener('click', async () => {
  if (pushState() === 'install-first') {
    window.openInstallGuide?.();
    return;
  }
  el.notifyButton.disabled = true;
  try {
    await enablePush();
  } catch (error) {
    el.notifyText.textContent = `Couldn’t turn on notifications: ${error.message}`;
    el.notifyButton.disabled = false;
    return;
  }
  el.notifyButton.disabled = false;
  renderNotify();
});

// --- Leaving ----------------------------------------------------------------------
el.leave.addEventListener('click', async () => {
  if (!confirm(`Leave ${room.name}? You can come back with the room's link.`)) return;
  el.leave.disabled = true;
  el.leaveError.textContent = '';
  try {
    await rpc('room_leave', { p_room: roomId, p_token: myToken() });
    watcher?.poke();
    forgetRoom(roomId); // off this device's list of rooms
    location.href = '/';
  } catch (error) {
    el.leaveError.textContent = error.message;
    el.leave.disabled = false;
  }
});

// --- Your profile: name and avatar --------------------------------------------
async function saveProfile({ name, avatar: face, color }) {
  const view = await rpc('room_profile', {
    p_room: roomId, p_token: myToken(), p_name: name, p_avatar: face, p_color: color,
  });
  // The reply carries the whole chat; keep only what this page has not shown yet.
  room = { ...view, messages: view.messages.filter((message) => !chat || message.id > chat.lastId) };
  setMyName(name); // also the default the next time a room is opened or joined
  render();
  watcher?.poke();
}

el.profile.addEventListener('click', () => {
  openProfile({ person: room.people[room.you], onSave: saveProfile });
});

// --- Deleting a game ---------------------------------------------------------------
// Any member can delete any game in the room. It disappears for everyone.
el.games.addEventListener('click', async (event) => {
  const button = event.target.closest('.delete');
  if (!button) return;
  if (!confirm(`Delete ${button.dataset.name}? It will be gone for everyone in the room.`)) return;
  button.disabled = true;
  el.gameError.textContent = '';
  try {
    await rpc('postmarks_delete', { p_game: button.dataset.game, p_token: myToken() });
    watcher?.poke();
    await refresh();
  } catch (error) {
    el.gameError.textContent = error.message;
    button.disabled = false;
  }
});

// --- Starting a game ----------------------------------------------------------------
// One tile per kind of game. Together and Time trial start on a tap; Pass
// phrase first offers a box for writing the phrase (left empty, a random one
// is used and its starter can play too).
async function startGame(mode, phrase = null) {
  if (el.modes.dataset.busy) return;
  el.modes.dataset.busy = 'true';
  el.gameError.textContent = '';
  el.phraseError.textContent = '';
  try {
    // A pass phrase hides one word in each letter, so the board is sized to
    // the phrase: as many letters as words where possible.
    // A written phrase gets a board with one letter per word where it can; the
    // server then splits the phrase into exactly one token per letter.
    const written = (phrase ?? '').trim();
    const size = mode !== 'phrase' ? randomSize() : written ? phraseBoardSize(written) : 5 + Math.floor(Math.random() * 3);
    const puzzle = generatePuzzle(size, crypto.getRandomValues(new Uint32Array(1))[0]);
    const game = await rpc('postmarks_start', {
      p_room: roomId, p_token: myToken(), p_mode: mode, p_size: size,
      p_regions: puzzle.regions, p_solution: puzzle.solution, p_phrase: mode === 'phrase' ? phrase : null,
    });
    watcher?.poke();
    location.href = gameUrl('postmarks', game.id);
  } catch (error) {
    (composing ? el.phraseError : el.gameError).textContent = error.message;
    delete el.modes.dataset.busy;
  }
}

// Show the tokens the phrase turns into, as it is typed: exactly one for each
// letter of its board.
function previewTokens() {
  const phrase = el.phraseText.value;
  const size = phraseBoardSize(phrase);
  const tokens = tokenize(phrase, size);
  // Cards are updated in place so that typing only animates what changed.
  while (el.tokens.children.length > tokens.length) el.tokens.lastElementChild.remove();
  tokens.forEach((token, i) => {
    const card = el.tokens.children[i] ?? el.tokens.appendChild(document.createElement('span'));
    const text = token.t.toUpperCase();
    if (card.textContent !== text) card.textContent = text;
    const className = ['word', i > 0 && !tokens[i - 1].gap && 'join', !token.gap && i < tokens.length - 1 && 'cont']
      .filter(Boolean).join(' ');
    if (card.className !== className) card.className = className;
  });
  el.tokenNote.textContent = tokens.length === 0 ? ''
    : tokens.length < size ? `Too short: a ${size} × ${size} board needs at least ${size} letters`
      : `${size} tokens, one in each letter of a ${size} × ${size} board`;
}

el.phraseText.addEventListener('input', () => {
  el.phraseError.textContent = ''; // an earlier complaint no longer applies to what is typed now
  previewTokens();
});

// Pass phrase has a screen of its own for writing the phrase. It is a step in
// the browser's history, so Back returns to the room.
function showCompose(show) {
  composing = show;
  el.phraseError.textContent = '';
  if (room?.you !== null) render();
  if (show) {
    previewTokens();
    el.phraseText.focus();
  }
  else window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => showCompose(location.hash === '#phrase'));
el.phraseBack.addEventListener('click', () => history.back());

el.modes.addEventListener('click', (event) => {
  const tile = event.target.closest('[data-mode]');
  if (!tile) return;
  if (tile.dataset.mode !== 'phrase') {
    startGame(tile.dataset.mode);
    return;
  }
  history.pushState(null, '', '#phrase');
  showCompose(true);
});

el.phraseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  startGame('phrase', el.phraseText.value);
});

// Copy puts exactly the room link on the clipboard.
el.copyLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.shareLink.value);
    el.copyLink.textContent = 'Copied';
  } catch {
    el.shareLink.select();
    el.copyLink.textContent = 'Select & copy';
  }
  setTimeout(() => { el.copyLink.textContent = 'Copy'; }, 2000);
});

// Share hands the link to the device's share sheet. Only the link is shared:
// extra text mentioning the site's name gets turned into a second link, to the
// home page, by messaging apps, and some share targets drop the real link.
if (navigator.share) {
  el.shareButton.hidden = false;
  el.shareButton.addEventListener('click', async () => {
    try {
      await navigator.share({ url: el.shareLink.value });
    } catch {
      /* share sheet dismissed or unavailable: Copy is still there */
    }
  });
}

el.shareLink.addEventListener('focus', () => el.shareLink.select());

if (location.hash === '#phrase') history.replaceState(null, '', location.pathname + location.search);
if (roomId) refresh();
else fail('That room link doesn’t look right.');
