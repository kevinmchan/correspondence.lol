import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { avatar, openProfile, savedLook } from '/shared/profile.js';
import { enablePush, pushState, syncPush, watchPresence } from '/shared/push.js';
import { UUID, gameUrl, myName, myToken, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { generatePuzzle, randomSize } from '/postmarks/game.js';

const $ = (id) => document.getElementById(id);
const el = {
  name: $('room-name'), loading: $('loading'),
  join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'), joinError: $('join-error'),
  room: $('room'), members: $('members'), profile: $('profile'),
  notify: $('notify'), notifyText: $('notify-text'), notifyButton: $('notify-button'), shareLink: $('share-link'), copyLink: $('copy-link'), shareButton: $('share-button'),
  games: $('games'), noGames: $('no-games'), newGame: $('new-game'),
  mode: $('mode'), modeHint: $('mode-hint'), phraseText: $('phrase-text'), gameError: $('game-error'),
  chat: $('chat'),
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
    const n = room.members.length;
    el.joinText.textContent = nextGame
      ? 'You’ve been invited to a game here. Join the room to play.'
      : `${list(room.members)} ${n === 1 ? 'is' : 'are'} here. Join to play and chat.`;
    if (!el.joinName.value) el.joinName.value = myName();
    el.join.hidden = false;
    el.room.hidden = true;
    el.profile.hidden = true;
    return;
  }

  if (nextGame) {
    location.replace(gameUrl('postmarks', nextGame)); // already a member: straight to the shared game
    return;
  }
  el.join.hidden = true;
  el.room.hidden = false;
  el.members.replaceChildren(...room.people.map((person, seat) => {
    const li = document.createElement('li');
    li.append(avatar(person), person.name + (seat === room.you ? ' (you)' : ''));
    return li;
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
    li.append(a);
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

// What each kind of game is, shown under the picker.
const MODE_HINTS = {
  coop: 'Solve one board together, taking turns.',
  trial: 'Everyone solves the same board on their own. Fastest time wins.',
  phrase: 'Everyone solves the same board on their own. Each letter found reveals one word of a hidden phrase.',
};

function syncMode() {
  el.modeHint.textContent = MODE_HINTS[el.mode.value];
  el.phraseText.hidden = el.mode.value !== 'phrase';
}

el.mode.addEventListener('change', syncMode);
syncMode();

el.newGame.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = el.newGame.querySelector('button');
  button.disabled = true;
  el.gameError.textContent = '';
  try {
    // A pass phrase hides one word in each letter, so the board is sized to
    // the phrase: as many letters as words where possible.
    const words = el.phraseText.value.trim().split(/\s+/).filter(Boolean).length;
    const size = el.mode.value !== 'phrase' ? randomSize()
      : words ? Math.min(9, Math.max(5, words))
      : 5 + Math.floor(Math.random() * 3);
    const puzzle = generatePuzzle(size, crypto.getRandomValues(new Uint32Array(1))[0]);
    const game = await rpc('postmarks_start', {
      p_room: roomId, p_token: myToken(), p_mode: el.mode.value, p_size: size,
      p_regions: puzzle.regions, p_solution: puzzle.solution,
      p_phrase: el.mode.value === 'phrase' ? el.phraseText.value : null,
    });
    watcher?.poke();
    location.href = gameUrl('postmarks', game.id);
  } catch (error) {
    el.gameError.textContent = error.message;
    button.disabled = false;
  }
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

if (roomId) refresh();
else fail('That room link doesn’t look right.');
