import { rpc } from '/shared/api.js';
import { UUID, myName, myToken, recentRooms, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { asCode, claim, codeInAddress, giveUpOn } from '/shared/handoff.js';
import { AVATARS, COLORS, avatar, openProfile, savedLook } from '/shared/profile.js';
import { cachedProfile, fetchProfile, openDeviceCode, openSignIn, saveProfile, signOut, startAfresh } from '/shared/account.js';

const form = document.getElementById('create-room');
const nameInput = document.getElementById('my-name');
const roomInput = document.getElementById('room-name');
const error = document.getElementById('create-error');
const rooms = document.getElementById('rooms');

// --- Who this device is -------------------------------------------------------
// A guest profile, an account, or (after signing out, or after the profile
// became an account on another device) nobody yet.
const me = {
  card: document.getElementById('me'), edit: document.getElementById('me-edit'),
  name: document.getElementById('me-name'), kind: document.getElementById('me-kind'),
  signIn: document.getElementById('me-sign-in'), code: document.getElementById('me-code'),
  signOut: document.getElementById('me-sign-out'),
};
// With no profile on the device, the page is only the three ways to get one:
// create one, sign in, or sync a guest profile with a code from another device.
const welcome = {
  section: document.getElementById('welcome'), note: document.getElementById('welcome-note'),
  form: document.getElementById('welcome-new'), name: document.getElementById('welcome-name'),
  error: document.getElementById('welcome-new-error'),
  codeForm: document.getElementById('welcome-code'), code: document.getElementById('welcome-code-text'),
  codeNote: document.getElementById('welcome-code-note'),
};
const joinRoom = document.getElementById('join-room');
// No profile: signed out, or a device that has never had a name, a room or a sign-in.
const noProfile = () => {
  const profile = cachedProfile();
  return Boolean(profile.signed_out) || (!profile.signed_in && !myName() && recentRooms().length === 0);
};
const nameField = document.getElementById('my-name-field');
const look = () => savedLook() ?? { avatar: '🙂', color: 0 };
// After signing in from a room's join screen, go back to it.
const next = new URLSearchParams(location.search).get('next');
const onward = () => (next && /^\/(room|postmarks)\/\?[\w=&-]+$/.test(next) ? next : null);

function showMe() {
  const profile = cachedProfile();
  const none = noProfile();
  welcome.section.hidden = !none;
  welcome.note.hidden = !profile.signed_out;
  me.card.hidden = none;
  form.hidden = none;
  joinRoom.hidden = none;
  if (none) {
    rooms.hidden = true;
    return;
  }
  const name = myName();
  me.edit.replaceChildren(avatar(look()));
  me.name.textContent = name || 'Guest';
  me.kind.textContent = profile.signed_in ? profile.email ?? 'Signed in' : 'Guest profile';
  me.signIn.hidden = Boolean(profile.signed_in);
  me.code.hidden = Boolean(profile.signed_in) || (!name && recentRooms().length === 0); // nothing to share yet
  me.signOut.hidden = !profile.signed_in;
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
}

const signedIn = () => {
  const to = onward();
  if (to) location.href = to;
  else refresh();
};

me.edit.addEventListener('click', () => {
  openProfile({ person: { name: myName(), ...look() }, onSave: async (person) => { await saveProfile(person); showMe(); } });
});
me.signIn.addEventListener('click', () => openSignIn({ guest: true, onDone: signedIn }));
me.code.addEventListener('click', openDeviceCode);
me.signOut.addEventListener('click', async () => {
  if (!confirm('Sign out on this device? Your profile and rooms stay in your account.')) return;
  me.signOut.disabled = true;
  await signOut().catch(() => {});
  me.signOut.disabled = false;
  showMe();
});
document.getElementById('welcome-sign-in').addEventListener('click', () => openSignIn({ guest: false, onDone: signedIn }));

// Create a profile: a new guest, with a look to start with (it can be changed).
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
    }
  } catch (failure) {
    welcome.error.textContent = failure.message;
  }
  button.disabled = false;
});

// Sync a guest profile: this device joins it.
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

// --- Getting into a room that already exists --------------------------------
// With an invite link, pasted here (the installed app has no address bar to
// paste it into), or with a code from another device on a guest profile,
// which puts this device in that profile (see shared/account.js).
const joinForm = document.getElementById('join-room');
const joinInput = document.getElementById('join-text');
const joinNote = document.getElementById('join-note');

async function bringAcross(code, quietly = false) {
  try {
    const moved = await claim(code);
    await refresh();
    // On a quiet start, speak up only when something new came across.
    // On a quiet start, speak up only when something new came across.
    const n = moved.rooms.length;
    joinNote.className = 'message';
    joinNote.textContent = quietly && moved.fresh.length === 0 ? ''
      : `Welcome back${moved.name ? `, ${moved.name}` : ''}. ${n === 0 ? 'This device is in your profile now.' : `Your ${n === 1 ? 'room is' : `${n} rooms are`} here.`}`;
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
// After that the two share a profile, and the server's list of rooms is enough.
const carried = codeInAddress();
if (carried) {
  history.replaceState(null, '', location.pathname + location.search);
  bringAcross(carried, true).then((ok) => { if (!ok) refresh(); });
} else {
  refresh();
}

// Sent here from a room's join screen to sign in first.
if (new URLSearchParams(location.search).has('signin') && !cachedProfile().signed_in) {
  openSignIn({ guest: !noProfile(), onDone: signedIn });
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
