// Which reels are in the feed (the owner, 26 November 2026). A reel is met in
// one of two ways: somebody shares it with you (its link, opened, and it stays
// in your feed from then on), or your energy reaches the middle of a bar. The
// first reel is at the middle of the first bar, the next at the middle of the
// second, and so on: halfway to what a bar is for.

import { BAR } from './energy.js';
import { load, save } from './identity.js';

// The reels there are, in the order they come in the middle of the bars.
export const REELS = ['inflection'];
const MET_KEY = 'reels:met:v1';

// How much energy brings the reel at `index` into the feed.
export const reelAt = (index) => Math.round((index + 0.5) * BAR);

// The reels opened by a link (or from the feed), on this device.
export const met = () => {
  const saved = load(MET_KEY);
  return Array.isArray(saved) ? saved.filter((name) => REELS.includes(name)) : [];
};
export function meet(name) {
  if (REELS.includes(name) && !met().includes(name)) save(MET_KEY, [...met(), name]);
}

// The reels in the feed, for energy `earned` in all and the reels already met.
export const reelsFor = (earned, seen = []) => REELS.filter((name, index) => earned >= reelAt(index) || seen.includes(name));

// --- Reels made of these ---------------------------------------------------------------
// A reel can be made of one of these by writing its words (reels/reel.js). Its
// words go in its link, so it needs nothing of the server: `w` is the words
// written, as JSON, in base64url. The reels made on this device, and those
// made by others and shared with you, are kept, newest first.
const MADE_KEY = 'reels:made:v1';
const MOST = 40; // reels kept
const LONGEST = 200; // letters in one entry

export function encodeWords(words) {
  const kept = Object.fromEntries(Object.entries(words).map(([key, text]) => [key, String(text ?? '').trim().slice(0, LONGEST)]).filter(([, text]) => text));
  const bytes = new TextEncoder().encode(JSON.stringify(kept));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// The words in a link, kept to the entries `keys` names. Anything else, or
// anything that cannot be read, is nothing.
export function decodeWords(code, keys) {
  try {
    const binary = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
    const read = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
    if (!read || typeof read !== 'object' || Array.isArray(read)) return {};
    return Object.fromEntries(Object.entries(read).filter(([key, text]) => keys.includes(key) && typeof text === 'string' && text.trim()).map(([key, text]) => [key, text.trim().slice(0, LONGEST)]));
  } catch {
    return {};
  }
}
export const madeLink = (reel, code) => `/?reel=${encodeURIComponent(reel)}&w=${code}`;

// { reel, code, mine, at }, newest first.
export const made = () => {
  const saved = load(MADE_KEY);
  return Array.isArray(saved) ? saved.filter((one) => one && REELS.includes(one.reel) && typeof one.code === 'string' && one.code) : [];
};
// Keep a reel made of `reel` (in place of `replaces`, when it was being changed).
export function keep({ reel, code, mine, replaces = null }) {
  const others = made().filter((one) => !(one.reel === reel && (one.code === code || (replaces && one.code === replaces && one.mine))));
  const was = made().find((one) => one.reel === reel && one.code === code);
  save(MADE_KEY, [{ reel, code, mine: Boolean(mine || was?.mine), at: Date.now() }, ...others].slice(0, MOST));
}

// What is being written, until it is kept: a reel half made is not lost by leaving it.
const DRAFT_KEY = 'reels:draft:v1';
export const draftOf = (reel) => {
  const saved = load(DRAFT_KEY);
  return saved && saved.reel === reel && saved.words && typeof saved.words === 'object' ? saved.words : null;
};
export const keepDraft = (reel, words) => save(DRAFT_KEY, { reel, words });
export const dropDraft = () => save(DRAFT_KEY, null);
