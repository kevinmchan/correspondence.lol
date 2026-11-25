// Energy: what playing earns. The first of the campaign's two currencies
// (README, "The adventure"): the one that is always accumulating, earned by
// finishing games and spent, later, at places in the world. Nothing spends it
// yet. This file is its rules and nothing else: no page, no storage, no clock.
//
// The rules, the owner's (25 November 2026):
//   - A game finished earns it; a game lost or left earns nothing.
//   - A harder game earns more. A faster one earns no more: nothing here is
//     told how long a game took, so nothing here can reward it.
//   - Hints are free: nothing here is told whether one was asked for.
//   - It never fades, and has no limit. It comes from play alone: not from
//     time passing, not from coming back.
// And one of its own: a board earns once. The same board solved again (it can
// be asked for again after a loss, and it is the same puzzle) is play for its
// own sake.

export const ENERGY_KEY = 'correspondence:energy:v1';
const REMEMBERED = 400; // boards kept, newest last, to know one that has earned already

// What a solved board earns, by its size: the smallest 1, the largest 5.
// Sizes are Postmarks' (MIN_SIZE 5 to MAX_SIZE 9 in postmarks/game.js).
export const SMALLEST = 5;
export const LARGEST = 9;
export function worth(size) {
  if (!Number.isInteger(size) || size < SMALLEST || size > LARGEST) return 0;
  return size - SMALLEST + 1;
}

export const fresh = () => ({ earned: 0, spent: 0, boards: [] });

// What was saved, made safe to use: anything else is a fresh start.
export function read(saved) {
  const whole = (n) => Number.isSafeInteger(n) && n >= 0;
  if (!saved || !whole(saved.earned) || !whole(saved.spent) || saved.spent > saved.earned || !Array.isArray(saved.boards)) return fresh();
  return { earned: saved.earned, spent: saved.spent, boards: saved.boards.filter((one) => typeof one === 'string').slice(-REMEMBERED) };
}

export const held = (state) => state.earned - state.spent;

// A game is over. `game` is { size, seed, status }, as Postmarks keeps a solo
// game. Gives { state, gained }: gained is 0 for a loss, a game still being
// played, or a board that has earned before.
export function finished(state, game) {
  const board = `${game?.size}:${game?.seed}`;
  const gained = game?.status === 'won' && !state.boards.includes(board) ? worth(game.size) : 0;
  if (!gained) return { state, gained: 0 };
  return { state: { ...state, earned: state.earned + gained, boards: [...state.boards, board].slice(-REMEMBERED) }, gained };
}

// Spending: all of a price or none of it. Gives { state, paid }.
export function spend(state, price) {
  if (!Number.isSafeInteger(price) || price <= 0 || price > held(state)) return { state, paid: false };
  return { state: { ...state, spent: state.spent + price }, paid: true };
}
