import { rpc } from '/shared/api.js';
import { UUID, myName, myToken, recentRooms, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { asCode, claim, codeInAddress, giveUpOn } from '/shared/handoff.js';
import { savedLook } from '/shared/profile.js';

const form = document.getElementById('create-room');
const nameInput = document.getElementById('my-name');
const roomInput = document.getElementById('room-name');
const error = document.getElementById('create-error');
const rooms = document.getElementById('rooms');

function showRooms() {
  nameInput.value ||= myName();
  const recent = recentRooms();
  rooms.hidden = recent.length === 0;
  rooms.querySelector('ul').replaceChildren(...recent.map((room) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = roomUrl(room.id);
    const name = document.createElement('strong');
    name.textContent = room.name;
    const when = document.createElement('span');
    when.textContent = `Last opened ${new Date(room.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    a.append(name, when);
    li.append(a);
    return li;
  }));
}
showRooms();

// --- Getting into a room that already exists --------------------------------
// With an invite link, pasted here (the installed app has no address bar to
// paste it into), or with the code a browser gives when the app is installed,
// which brings that browser's rooms and profile across.
const joinForm = document.getElementById('join-room');
const joinInput = document.getElementById('join-text');
const joinNote = document.getElementById('join-note');

async function bringAcross(code, quietly = false) {
  try {
    const moved = await claim(code);
    showRooms();
    // On a quiet start, speak up only when something new came across.
    const n = quietly ? moved.fresh.length : moved.rooms.length;
    const names = moved.fresh.map((room) => room.name).join(', ');
    joinNote.className = 'message';
    joinNote.textContent = n === 0 ? (quietly ? '' : 'Nothing to bring across: your browser has no rooms.')
      : moved.fresh.length === 0 ? 'You’re up to date: nothing new in your browser.'
      : moved.fresh.length < moved.rooms.length ? `Brought across from your browser: ${names}.`
      : `Welcome back${moved.name ? `, ${moved.name}` : ''}. Your ${n === 1 ? 'room is' : `${n} rooms are`} here.`;
    return true;
  } catch (failure) {
    const offline = failure.message.startsWith('Can’t reach');
    if (quietly && !offline) giveUpOn(code); // expired or another device's: stop trying on every start
    if (!quietly) {
      joinNote.className = 'message bad';
      joinNote.textContent = failure.message;
    }
    return false;
  }
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = joinInput.value.trim();
  joinNote.textContent = '';
  const room = text.match(/[?&]id=([0-9a-f-]{36})/i)?.[1] ?? (UUID.test(text) ? text : null);
  if (room && UUID.test(room)) {
    const game = text.match(/[?&]game=([0-9a-f-]{36})/i)?.[1];
    location.href = roomUrl(room) + (game && UUID.test(game) ? `&game=${game}` : '');
    return;
  }
  const code = asCode(text);
  if (!code) {
    joinNote.className = 'message bad';
    joinNote.textContent = 'That doesn’t look like an invite link or a code.';
    return;
  }
  const button = joinForm.querySelector('button');
  button.disabled = true;
  if (await bringAcross(code)) joinInput.value = '';
  button.disabled = false;
});

// The installed app, opened from an icon that carries a code: hand it in.
// It does so on every start, which also fetches rooms joined in the browser since.
const carried = codeInAddress();
if (carried) {
  bringAcross(carried, true);
  history.replaceState(null, '', location.pathname + location.search);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const button = form.querySelector('button');
  button.disabled = true;
  error.textContent = '';
  try {
    const room = await rpc('room_create', {
      p_room_name: roomInput.value.trim() || `${name}’s room`.slice(0, 40),
      p_name: name,
      p_token: myToken(),
    });
    setMyName(name);
    rememberRoom(room.id, room.name);
    const look = savedLook(); // bring along the look chosen in an earlier room
    if (look) {
      await rpc('room_profile', {
        p_room: room.id, p_token: myToken(), p_name: name, p_avatar: look.avatar, p_color: look.color,
      }).catch(() => {});
    }
    location.href = roomUrl(room.id);
  } catch (failure) {
    error.textContent = failure.message;
    button.disabled = false;
  }
});

// The version, small and out of the way at the bottom of the page.
document.getElementById('version').textContent = self.APP_VERSION ?? '';
