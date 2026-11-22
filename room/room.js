import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { UUID, gameUrl, myName, myToken, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { generatePuzzle, randomSize } from '/postmarks/game.js';

const $ = (id) => document.getElementById(id);
const el = {
  name: $('room-name'), loading: $('loading'),
  join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'), joinError: $('join-error'),
  room: $('room'), members: $('members'), shareLink: $('share-link'), copyLink: $('copy-link'), shareButton: $('share-button'),
  games: $('games'), noGames: $('no-games'), newGame: $('new-game'), gameError: $('game-error'),
  chat: $('chat'),
};

const requested = new URLSearchParams(location.search).get('id');
const roomId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

let room = null; // the server's latest view of the room
let chat = null;
let unread = 0;
let timer = null;
let watcher = null; // live updates, once we are a member

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

function gameStatus(game) {
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
    el.joinText.textContent = `${list(room.members)} ${n === 1 ? 'is' : 'are'} here. Join to play and chat.`;
    if (!el.joinName.value) el.joinName.value = myName();
    el.join.hidden = false;
    el.room.hidden = true;
    return;
  }

  el.join.hidden = true;
  el.room.hidden = false;
  el.members.textContent = `In this room: ${list(room.members.map((name, seat) => (seat === room.you ? `${name} (you)` : name)))}`;
  el.shareLink.value = location.origin + roomUrl(room.id);

  el.games.replaceChildren(...room.games.map((game) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = gameUrl(game.kind, game.id);
    const title = document.createElement('strong');
    title.textContent = `Postmarks ${game.size} × ${game.size}`;
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
  if (!chat) {
    chat = createChat(el.chat, {
      roomId: room.id, you: room.you, members: room.members, onSent: () => watcher.poke(),
    });
  }
  chat.setMembers(room.members);
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
    rememberRoom(room.id, room.name);
    render();
    refresh(); // restart polling at the live pace
  } catch (error) {
    el.joinError.textContent = error.message;
  }
});

el.newGame.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = el.newGame.querySelector('button');
  button.disabled = true;
  el.gameError.textContent = '';
  try {
    const size = randomSize();
    const puzzle = generatePuzzle(size, crypto.getRandomValues(new Uint32Array(1))[0]);
    const game = await rpc('postmarks_create', {
      p_room: roomId, p_token: myToken(), p_size: size, p_regions: puzzle.regions, p_solution: puzzle.solution,
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
