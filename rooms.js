// Two small screens off the lobby: opening a room, and joining one with its
// code. Each asks for one thing and then goes on into the room.

import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { myName, myToken, rememberRoom, roomUrl } from '/shared/identity.js';

// Both are for someone who already has an account: anyone else starts at home.
function ready(title) {
  document.title = `${title} · correspondence.lol`;
  if (myName()) return true;
  go('/', { replace: true });
  return false;
}

export function mountOpen(root) {
  if (!ready('Open a room')) return;
  const form = root.querySelector('#create-room');
  const roomInput = root.querySelector('#room-name');
  const error = root.querySelector('#create-error');
  roomInput.placeholder = `${myName()}’s room`.slice(0, 40); // what it will be called if left empty

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = myName();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    error.textContent = '';
    try {
      const room = await rpc('room_create', {
        p_room_name: roomInput.value.trim() || `${name}’s room`.slice(0, 40),
        p_name: name,
        p_token: myToken(),
      });
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id), { replace: true }); // back from the room goes home, not to this form
    } catch (failure) {
      error.textContent = failure.message;
      button.disabled = false;
    }
  });
}

export function mountJoin(root) {
  if (!ready('Join a room')) return;
  const form = root.querySelector('#join-room');
  const codeInput = root.querySelector('#join-code');
  const error = root.querySelector('#join-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = codeInput.value.replace(/[^0-9a-z]/gi, '');
    error.textContent = '';
    if (code.length !== 6) {
      error.textContent = 'A room code is six letters and digits, like ABC-123.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const room = await rpc('room_join_code', { p_code: code, p_name: myName(), p_token: myToken() });
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id), { replace: true });
    } catch (failure) {
      error.textContent = failure.message;
      button.disabled = false;
    }
  });
}
