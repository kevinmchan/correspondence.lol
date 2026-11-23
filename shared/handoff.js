// Moving to the installed app. On an iPhone or iPad the app on the Home Screen
// starts with empty storage: it does not know who its owner was in the browser.
// So a browser on a guest profile asks the server for a code that lets one
// more device into that profile, and
//   - bakes it into the address the Home Screen icon opens, so the app hands
//     it in by itself each time it starts, and
//   - shows it in the install guide, to be typed in if that did not work.

import { rpc } from './api.js';
import { load, myToken, recentRooms, save } from './identity.js';

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

// Hand a code in: this device joins the guest profile the code came from,
// bringing along any rooms of its own. The answer is the profile; `fresh`
// lists the rooms that were not on this device before.
export async function claim(code) {
  const known = new Set(recentRooms().map((room) => room.id));
  const profile = await rpc('handoff_claim', { p_code: code, p_token: myToken() });
  profile.fresh = profile.rooms.filter((room) => !known.has(room.id));
  return profile;
}

// The code the app was opened with, unless the server has already turned it down.
export function codeInAddress() {
  const code = asCode(new URLSearchParams(location.hash.slice(1)).get('move') ?? '');
  return code && load(SPENT_KEY) !== code ? code : null;
}

// Expired, or another device's by now: do not try it again on every start.
export const giveUpOn = (code) => save(SPENT_KEY, code);
