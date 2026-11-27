// Energy: what playing earns. The first of the campaign's two currencies
// (README, "The adventure"): the one that is always accumulating, earned by
// solving and spent, later, at places in the world. Nothing spends it yet.
// This file is its rules and nothing else: no page, no storage, no clock.
//
// The rules, the owner's (25 November 2026):
//   - Solving earns it as it goes: every post found on a board is energy, at
//     once, whether or not the board is finished in the end.
//   - Finishing a board entirely earns more on top: as much again as all its
//     posts were worth.
//   - A harder game earns more (a bigger board has more posts, and finishing
//     it earns more). A faster one earns no more: nothing here is told how
//     long a game took, so nothing here can reward it.
//   - Hints are free: nothing here is told whether one was asked for.
//   - It never fades, and has no limit. It comes from play alone: not from
//     time passing, not from coming back.
//   - The bar is everything earned, not one game (the owner, 25 November
//     2026: "a global stat, not something that lasts for one game"): about
//     five games fill it, for now. The first time it is full, the meadow is yours: a
//     room can wear it (shared/meadow.js). What later fills are for is not
//     decided; the bar begins again from what was left over.
// And one of its own: a board earns once. The same board played again (it can
// be asked for again after a loss, and it is the same puzzle) earns only for
// posts it has not yet earned for, and its finish once.

export const ENERGY_KEY = 'correspondence:energy:v1';
const REMEMBERED = 400; // boards kept, newest last, to know what each has earned already

// Postmarks' sizes (MIN_SIZE 5 to MAX_SIZE 9 in postmarks/game.js): a board of
// size n has n posts.
export const SMALLEST = 5;
export const LARGEST = 9;
const sized = (size) => Number.isInteger(size) && size >= SMALLEST && size <= LARGEST;

export const POST = 1; // each post found
export const finish = (size) => (sized(size) ? size * POST : 0); // a board finished: its posts' worth again
export const most = (size) => (sized(size) ? size * POST + finish(size) : 0); // all a board can earn

// One bar: about five games, for now (the owner, 26 November 2026: "for now, make each stage 5 games long"; it was
// about twenty at first, then ten). Boards are drawn at sizes 5 to 9, so a game finished earns 14 on average and one
// lost about half its posts; most are finished. Five games of that are about 70.
export const BAR = 70;
// How full the bar is (0 up to, not reaching, 1), and how many times it has
// been filled. Earned, not held: spending later takes nothing off it.
export const bar = (state) => ({ fill: (state.earned % BAR) / BAR, fills: Math.floor(state.earned / BAR) });
// Marcus Pell's reel (penny/reel.js) turns up in the feed once half a bar has been earned: passing it is all it takes,
// and it never interrupts (the owner, 27 November 2026: "I want the trigger for it showing up in your feed to be passing
// the energy threshold"; the doc had it met "in the middle of an energy bar").
export const REEL_AT = BAR / 2;
export const reelFound = (state) => state.earned >= REEL_AT;
// The meadow: the reward for the first bar.
export const meadowEarned = (state) => state.earned >= BAR;
// The meadow's folk (shared/meadow.js, room/folk.js): the things of a room, alive. There are three stages, a bar
// each. The first bar filled is the meadow, and nothing in it has a body. The second is the discovery: energy runs
// through everything, and the things to press were alive all along, and asleep. The third wakes them.
export const FOLK = ['tile', 'code', 'bell', 'note', 'send', 'token', 'board', 'sign', 'portal'];
export function folkOf(state) {
  const fills = Math.floor(state.earned / BAR);
  return { kinds: fills >= 2 ? FOLK : [], awake: fills >= 3 };
}

export const fresh = () => ({ earned: 0, spent: 0, boards: [] });

// What was saved, made safe to use: anything else is a fresh start.
export function read(saved) {
  const whole = (n) => Number.isSafeInteger(n) && n >= 0;
  if (!saved || !whole(saved.earned) || !whole(saved.spent) || saved.spent > saved.earned || !Array.isArray(saved.boards)) return fresh();
  const boards = saved.boards.filter((one) => one && typeof one.b === 'string' && whole(one.p) && typeof one.w === 'boolean');
  return { earned: saved.earned, spent: saved.spent, boards: boards.slice(-REMEMBERED) };
}

export const held = (state) => state.earned - state.spent;

const keyOf = (game) => `${game?.size}:${game?.seed}`;

// What this board has earned so far: { posts, won, energy }.
export function earnedOn(state, game) {
  const one = state.boards.find((each) => each.b === keyOf(game));
  if (!one) return { posts: 0, won: false, energy: 0 };
  return { posts: one.p, won: one.w, energy: one.p * POST + (one.w ? finish(game.size) : 0) };
}

// A board as it now stands. `game` is { size, seed, status, found }: found is
// how many posts are open on it. Gives { state, gained, posts, won }: gained
// is what it earns now that it had not earned before (posts newly found, and
// the finish if it has just been won); posts and won say which. The same board
// told again earns nothing more.
export function played(state, game) {
  const none = { state, gained: 0, posts: 0, won: false };
  if (!game || !sized(game.size)) return none;
  const before = earnedOn(state, game);
  const found = Number.isInteger(game.found) ? Math.max(0, Math.min(game.size, game.found)) : 0;
  const posts = Math.max(0, found - before.posts);
  const won = game.status === 'won' && !before.won;
  if (!posts && !won) return none;
  const gained = posts * POST + (won ? finish(game.size) : 0);
  const entry = { b: keyOf(game), p: before.posts + posts, w: before.won || won };
  const boards = [...state.boards.filter((each) => each.b !== entry.b), entry].slice(-REMEMBERED);
  return { state: { ...state, earned: state.earned + gained, boards }, gained, posts, won };
}

// Spending: all of a price or none of it. Gives { state, paid }.
export function spend(state, price) {
  if (!Number.isSafeInteger(price) || price <= 0 || price > held(state)) return { state, paid: false };
  return { state: { ...state, spent: state.spent + price }, paid: true };
}
