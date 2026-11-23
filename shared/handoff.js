// Moving to the installed app. On an iPhone or iPad the app on the Home Screen
// starts with empty storage: it does not know who its owner was in the browser
// or which rooms they joined. So the browser asks the server for a code that
// stands for its places in those rooms (good for one app only), and
//   - bakes it into the address the Home Screen icon opens, so the app hands
//     it in by itself each time it starts, and
//   - shows it in the install guide, to be typed in if that did not work.

import { rpc } from './api.js';
import { load, myToken, recentRooms, rememberRoom, save, setMyName } from './identity.js';
import { saveLook } from './profile.js';

const CODE_KEY = 'correspondence:handoff:v2'; // { code, until }: this browser's current code
const SPENT_KEY = 'correspondence:handoff-spent:v1'; // a code the server turned down: not worth trying again
const HALF_DAY = 12 * 3600 * 1000;

export const prettyCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
// What someone typed, as a code: eight letters and digits, however they are spaced.
export const asCode = (text) => {
  const code = String(text).replace(/[^0-9a-z]/gi, '').toUpperCase();
  return code.length === 8 ? code : null;
};

let asking = null;

// This browser's code, or null if it has no rooms to bring along.
export function moveCode() {
  if (recentRooms().length === 0) return Promise.resolve(null);
  const kept = load(CODE_KEY);
  if (kept && typeof kept.code === 'string' && kept.until > Date.now()) return Promise.resolve(kept.code);
  asking ??= rpc('handoff_start', { p_token: myToken() })
    .then((code) => {
      save(CODE_KEY, { code, until: Date.now() + HALF_DAY });
      return code;
    })
    .catch(() => null)
    .finally(() => { asking = null; });
  return asking;
}

// Make the Home Screen icon open the app with the code attached. The page's
// manifest is swapped for a copy whose start address carries it. (After the
// #, so it is never sent to the web server.)
export async function bakeIntoIcon() {
  const link = document.querySelector('link[rel="manifest"]');
  const code = await moveCode();
  if (!link || !code) return;
  try {
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    const absolute = (path) => new URL(path, location.origin).href;
    manifest.start_url = `${absolute('/')}#move=${code}`;
    manifest.scope = absolute('/');
    manifest.id = absolute('/');
    manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: absolute(icon.src) }));
    link.href = `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest))}`;
  } catch {
    /* the ordinary manifest stays; the code can still be typed in */
  }
}

// Hand a code in. The rooms of the browser it came from become this device's,
// with its name and look. The same device can hand the same code in again
// later, to fetch rooms that browser has joined since. `fresh` in the answer
// lists the rooms that were not here before.
export async function claim(code) {
  const moved = await rpc('handoff_claim', { p_code: code, p_token: myToken() });
  const known = new Set(recentRooms().map((room) => room.id));
  moved.fresh = moved.rooms.filter((room) => !known.has(room.id));
  for (const room of [...moved.fresh].reverse()) rememberRoom(room.id, room.name);
  if (moved.fresh.length > 0 || known.size === 0) {
    if (moved.name) setMyName(moved.name);
    if (moved.avatar && Number.isInteger(moved.color)) saveLook(moved.avatar, moved.color);
  }
  return moved;
}

// The code the app was opened with, unless the server has already turned it down.
export function codeInAddress() {
  const code = asCode(new URLSearchParams(location.hash.slice(1)).get('move') ?? '');
  return code && load(SPENT_KEY) !== code ? code : null;
}

// Expired, or another device's by now: do not try it again on every start.
export const giveUpOn = (code) => save(SPENT_KEY, code);
