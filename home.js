import { rpc } from '/shared/api.js';
import { myName, myToken, recentRooms, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { savedLook } from '/shared/profile.js';

const form = document.getElementById('create-room');
const nameInput = document.getElementById('my-name');
const roomInput = document.getElementById('room-name');
const error = document.getElementById('create-error');
const rooms = document.getElementById('rooms');

nameInput.value = myName();

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
