// Who this device is. There are no accounts: the device keeps a random secret
// and the server stores only a hash of it. Everything here must keep working
// when storage is unavailable (private mode), just without remembering.

const TOKEN_KEY = 'correspondence:token:v1';
const NAME_KEY = 'correspondence:name:v1';
const ROOMS_KEY = 'correspondence:rooms:v1';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* play on without saving */
  }
}

let memoryToken = null;

export function myToken() {
  let token = load(TOKEN_KEY) || memoryToken;
  if (typeof token !== 'string' || token.length < 20) {
    token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    memoryToken = token;
    save(TOKEN_KEY, token);
  }
  return token;
}

export const myName = () => String(load(NAME_KEY) || '');
export const setMyName = (name) => save(NAME_KEY, name);

export function recentRooms() {
  const rooms = load(ROOMS_KEY);
  return Array.isArray(rooms) ? rooms.filter((r) => r && UUID.test(r.id)) : [];
}

export function rememberRoom(id, name) {
  const rooms = recentRooms().filter((r) => r.id !== id);
  rooms.unshift({ id, name: String(name).slice(0, 40), at: Date.now() });
  save(ROOMS_KEY, rooms.slice(0, 12));
}

// The rooms as the server lists them for this profile: [{ id, name, at }].
export function setRooms(rooms) {
  save(ROOMS_KEY, rooms.filter((r) => r && UUID.test(r.id)).slice(0, 50)
    .map((r) => ({ id: r.id, name: String(r.name).slice(0, 40), at: Number(r.at) || Date.now() })));
}

// Start afresh as a new, blank guest: a new secret and nothing remembered.
export function resetIdentity() {
  memoryToken = null;
  for (const key of [TOKEN_KEY, NAME_KEY, ROOMS_KEY, 'correspondence:look:v1', 'correspondence:profile:v1',
    'correspondence:handoff:v2', 'correspondence:handoff-spent:v1']) save(key, null);
}

export function forgetRoom(id) {
  save(ROOMS_KEY, recentRooms().filter((r) => r.id !== id));
}

export const roomUrl = (id) => `/room/?id=${id}`;
export const gameUrl = (kind, id) => (kind === 'postmarks' ? `/postmarks/?game=${id}` : null);
