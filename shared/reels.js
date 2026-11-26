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
