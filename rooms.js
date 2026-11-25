// Two small screens off the lobby: opening a room, and joining one with its
// code. Each asks for one thing and then goes on into the room.

import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { myName, myToken, rememberRoom, roomUrl } from '/shared/identity.js';
import { door, oops, roof } from '/shared/place.js';

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
  // (a room has to be called something: its members tell their rooms apart by name)
  const going = door(form, roomInput, error, (value) => value.trim().length > 0);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = myName();
    const roomName = roomInput.value.trim();
    if (!roomName || form.querySelector('button[type="submit"]').disabled) return;
    oops(error, '');
    going(true);
    try {
      const room = await rpc('room_create', {
        p_room_name: roomName,
        p_name: name,
        p_token: myToken(),
      });
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id), { replace: true }); // back from the room goes home, not to this form
    } catch (failure) {
      oops(error, failure.message, { shake: form });
      going(false);
    }
  });
}

export function mountJoin(root) {
  if (!ready('Join a room')) return;
  const form = root.querySelector('#join-room');
  const codeInput = root.querySelector('#join-code');
  const error = root.querySelector('#join-error');
  const code = () => codeInput.value.replace(/[^0-9a-z]/gi, '');

  // The building whose door this is: nobody knows which yet, so it has no
  // colour. Once the code is all there, somebody inside puts the light on.
  const house = root.querySelector('.roof-big');
  house.append(roof({ kind: 0, wide: 330, high: 150 }));
  codeInput.addEventListener('input', () => {
    house.classList.toggle('lit', code().length === 6);
  });
  // (a room code is six letters and digits: the door opens to a whole one)
  const going = door(form, codeInput, error, () => code().length === 6);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (code().length !== 6 || form.querySelector('button[type="submit"]').disabled) return;
    oops(error, '');
    going(true);
    try {
      const room = await rpc('room_join_code', { p_code: code(), p_name: myName(), p_token: myToken() });
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id), { replace: true });
    } catch (failure) {
      oops(error, failure.message, { shake: form });
      going(false);
    }
  });
}
