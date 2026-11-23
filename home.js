import { rpc } from '/shared/api.js';
import { myName, myToken, recentRooms, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { asCode, claim, codeInAddress, copyable, giveUpOn, prettyCode } from '/shared/handoff.js';
import { AVATARS, COLORS, avatar, openProfile, savedLook } from '/shared/profile.js';
import { cachedProfile, fetchProfile, saveProfile, startAfresh } from '/shared/account.js';

const form = document.getElementById('create-room');
const nameInput = document.getElementById('my-name');
const roomInput = document.getElementById('room-name');
const error = document.getElementById('create-error');
const rooms = document.getElementById('rooms');

// --- Who this device is -------------------------------------------------------
// An account (the server calls it a profile), or (after signing out, or after the profile
// became an account on another device) nobody yet.
const me = {
  card: document.getElementById('me'), edit: document.getElementById('me-edit'),
  name: document.getElementById('me-name'), kind: document.getElementById('me-kind'),
  code: document.getElementById('me-code'), codeNote: document.getElementById('me-code-note'),
};
// With no account on the device, the page is only the two ways to get one:
// create one, or sync one with a code from another device.
const welcome = {
  section: document.getElementById('welcome'), note: document.getElementById('welcome-note'),
  form: document.getElementById('welcome-new'), name: document.getElementById('welcome-name'),
  error: document.getElementById('welcome-new-error'),
  codeForm: document.getElementById('welcome-code'), code: document.getElementById('welcome-code-text'),
  codeNote: document.getElementById('welcome-code-note'),
};
// No profile: signed out, or a device that has never had a name, a room or a sign-in.
const noProfile = () => {
  const profile = cachedProfile();
  return Boolean(profile.signed_out) || (!profile.signed_in && !myName() && recentRooms().length === 0);
};
const nameField = document.getElementById('my-name-field');
const joinForm = document.getElementById('join-room');
const joinCode = document.getElementById('join-code');
const joinError = document.getElementById('join-error');
const look = () => savedLook() ?? { avatar: '🙂', color: 0 };
// Sent here from a room's join screen to sync an account first: go back after.
const next = new URLSearchParams(location.search).get('next');
const onward = () => (next && /^\/(room|postmarks)\/\?[\w=&-]+$/.test(next) ? next : null);

function showMe() {
  const profile = cachedProfile();
  const none = noProfile();
  welcome.section.hidden = !none;
  welcome.note.hidden = !profile.signed_out;
  me.card.hidden = none;
  form.hidden = none;
  joinForm.hidden = none;
  if (none) {
    rooms.hidden = true;
    return;
  }
  const name = myName();
  me.edit.replaceChildren(avatar(look()));
  me.name.textContent = name || 'You';
  const n = recentRooms().length;
  me.kind.textContent = n === 0 ? 'No rooms yet' : n === 1 ? '1 room' : `${n} rooms`;
  // the name is asked for when opening a first room, and lives on the profile after that
  nameField.hidden = Boolean(name);
  nameInput.required = !name;
  nameInput.value = name;
}

async function refresh() {
  try {
    await fetchProfile();
  } catch {
    /* offline: what was remembered stays on screen */
  }
  showMe();
  if (!noProfile()) showRooms();
  showCode();
}

me.edit.addEventListener('click', () => {
  openProfile({ person: { name: myName(), ...look() }, onSave: async (person) => { await saveProfile(person); showMe(); } });
});
// The account code, on the card: a fresh one each time the page opens, and
// again before it runs out (each is good for ten minutes, once).
let codeTimer = null;
async function showCode() {
  clearTimeout(codeTimer);
  if (noProfile()) return;
  try {
    copyable(me.code, prettyCode(await rpc('profile_code', { p_token: myToken() })));
    me.code.disabled = false;
    me.codeNote.textContent = 'Works once, for ten minutes. Tap to copy.';
    codeTimer = setTimeout(showCode, 9 * 60 * 1000);
  } catch (failure) {
    me.code.disabled = true;
    me.code.textContent = '—';
    me.codeNote.textContent = failure.message;
  }
}
// back on the page after a while: the code shown may have run out
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') showCode();
});
// Create an account, with a look to start with (it can be changed).
welcome.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = welcome.name.value.trim();
  if (!name) return;
  const button = welcome.form.querySelector('button');
  button.disabled = true;
  welcome.error.textContent = '';
  try {
    if (cachedProfile().signed_out) startAfresh(); // leave the old profile's device behind
    const started = savedLook() ?? { avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], color: Math.floor(Math.random() * COLORS.length) };
    await saveProfile({ name, avatar: started.avatar, color: started.color });
    welcome.name.value = '';
    const to = onward();
    if (to) location.href = to;
    else {
      showMe();
      showRooms();
      showCode();
    }
  } catch (failure) {
    welcome.error.textContent = failure.message;
  }
  button.disabled = false;
});

// Sync an account from another device: this device joins it.
welcome.codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = asCode(welcome.code.value);
  welcome.codeNote.textContent = '';
  if (!code) {
    welcome.codeNote.textContent = 'A code is eight letters and digits, like K7M2-QP4X.';
    return;
  }
  const button = welcome.codeForm.querySelector('button');
  button.disabled = true;
  try {
    await claim(code);
    welcome.code.value = '';
    await refresh();
    const to = onward();
    if (to) location.href = to;
  } catch (failure) {
    welcome.codeNote.textContent = failure.message;
  }
  button.disabled = false;
});

function showRooms() {
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
showMe();
if (!noProfile()) showRooms();

// --- Joining a room with its code -----------------------------------------------
joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = joinCode.value.replace(/[^0-9a-z]/gi, '');
  joinError.textContent = '';
  if (code.length !== 6) {
    joinError.textContent = 'A room code is six letters and digits, like ABC-123.';
    return;
  }
  const button = joinForm.querySelector('button');
  button.disabled = true;
  try {
    const room = await rpc('room_join_code', { p_code: code, p_name: myName(), p_token: myToken() });
    rememberRoom(room.id, room.name);
    location.href = roomUrl(room.id);
  } catch (failure) {
    joinError.textContent = failure.message;
    button.disabled = false;
  }
});

// --- Arriving from the Home Screen icon ---------------------------------------
async function bringAcross(code) {
  try {
    await claim(code);
    await refresh();
    return true;
  } catch (failure) {
    if (!failure.message.startsWith('Can’t reach')) giveUpOn(code); // expired or another device's: stop trying on every start
    return false;
  }
}

// The installed app, opened from an icon that carries a code: hand it in.
// After that the two share a profile, and the server's list of rooms is enough.
const carried = codeInAddress();
if (carried) {
  history.replaceState(null, '', location.pathname + location.search);
  bringAcross(carried).then((ok) => { if (!ok) refresh(); });
} else {
  refresh();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = myName() || nameInput.value.trim();
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
    location.href = roomUrl(room.id);
  } catch (failure) {
    error.textContent = failure.message;
    button.disabled = false;
  }
});

// The version, small and out of the way at the bottom of the page.
document.getElementById('version').textContent = self.APP_VERSION ?? '';
