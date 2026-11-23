// Postmarks — pure game logic. No DOM access, so it runs in the browser and in
// Node (tests), and can later be shared with a sync backend.
//
// Puzzle: an N×N grid split into N districts. Exactly one letter is hidden in
// every row, every column and every district, and no two letters touch, not
// even diagonally.

export const EMPTY = 0; // nothing marked
export const CROSS = 1; // a player's "no letter here" mark (removable)
export const LETTER = 2; // a correct guess (permanent)
export const MISS = 3; // a wrong guess (permanent, cost a heart)

export const MIN_SIZE = 5;
export const MAX_SIZE = 9;
export const MIN_PLAYERS = 1; // one player is a solo game
export const MAX_PLAYERS = 4;
export const START_HEARTS = 3;

// Board sizes are not chosen by players: each game gets one at random.
export const randomSize = (random = Math.random) => MIN_SIZE + Math.floor(random() * (MAX_SIZE - MIN_SIZE + 1));

// --- Pass phrase tokens ---------------------------------------------------
// A phrase is hidden one token per board letter, so it is split into exactly
// `n` tokens. Each word starts as a token. With too few, the token with the
// most letters is split in half, repeatedly; with too many, the neighbouring
// pair that makes the shortest token is joined, repeatedly. Returns
// [{ t: text, gap: is it followed by a space }]. The server does the same
// (postmarks.tokenize in the database) and its result is what the game uses;
// this copy draws the preview while a phrase is being written.
const letters = (text) => text.replace(/[^A-Za-z0-9]/g, '').length;

export function tokenize(phrase, n) {
  const tokens = phrase.trim().split(/\s+/).filter(Boolean).map((t) => ({ t, gap: true }));
  if (!tokens.length) return [];
  tokens[tokens.length - 1].gap = false;

  while (tokens.length < n) {
    let best = -1;
    let most = 1;
    tokens.forEach((token, i) => {
      if (letters(token.t) > most) {
        best = i;
        most = letters(token.t);
      }
    });
    if (best < 0) break; // nothing left with two letters to split
    const { t, gap } = tokens[best];
    const half = Math.floor((most + 1) / 2);
    let seen = 0;
    let cut = 0;
    for (let j = 0; j < t.length; j++) {
      if (/[A-Za-z0-9]/.test(t[j])) seen++;
      if (seen === half) {
        cut = j + 1;
        break;
      }
    }
    tokens.splice(best, 1, { t: t.slice(0, cut), gap: false }, { t: t.slice(cut), gap });
  }

  while (tokens.length > n) {
    let best = 0;
    let shortest = Infinity;
    for (let i = 0; i < tokens.length - 1; i++) {
      const length = tokens[i].t.length + tokens[i + 1].t.length;
      if (length < shortest) {
        best = i;
        shortest = length;
      }
    }
    const [a, b] = [tokens[best], tokens[best + 1]];
    tokens.splice(best, 2, { t: a.t + (a.gap ? ' ' : '') + b.t, gap: b.gap });
  }
  return tokens;
}

// The board for a written phrase: one letter per word where the board's size
// allows (5 to 9), so that tokens are whole words whenever possible.
export const phraseBoardSize = (phrase) =>
  Math.min(MAX_SIZE, Math.max(MIN_SIZE, phrase.trim().split(/\s+/).filter(Boolean).length));

// What may be written as a phrase, checked as it is typed. The server has the
// last word (postmarks_start in the database applies the same rules).
// A phone's curly apostrophe is taken as a plain one.
export const tidyPhrase = (phrase) => phrase.replace(/[\u2018\u2019]/g, "'");

// Why this phrase cannot be used, in words for its writer; null if it can.
// An empty phrase is fine: a random one is used instead.
export function phraseProblem(phrase) {
  const text = tidyPhrase(phrase).trim();
  if (!text) return null;
  const pieces = typeof Intl !== 'undefined' && Intl.Segmenter
    ? Array.from(new Intl.Segmenter().segment(text), (s) => s.segment) : Array.from(text);
  const bad = [...new Set(pieces.filter((piece) => !/^[A-Za-z0-9\s.,!?'-]+$/.test(piece)))];
  if (bad.length) {
    return `${bad.slice(0, 4).join(' ')} can’t be used. A phrase is letters, numbers, spaces and . , ! ? ' -`;
  }
  if (text.replace(/\s+/g, ' ').length > 60) return 'Too long: a phrase is up to 60 characters.';
  const size = phraseBoardSize(text);
  if (letters(text) < size) return `Too short: a ${size} × ${size} board needs at least ${size} letters.`;
  return null;
}

// Small seeded PRNG (mulberry32) so a seed always yields the same puzzle.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

// One column per row, all different, with consecutive rows at least two
// columns apart (which rules out diagonal contact).
function randomSolution(size, rand) {
  const cols = [];
  const used = new Array(size).fill(false);
  const place = (row) => {
    if (row === size) return true;
    for (const col of shuffled(range(size), rand)) {
      if (used[col]) continue;
      if (row > 0 && Math.abs(cols[row - 1] - col) <= 1) continue;
      used[col] = true;
      cols[row] = col;
      if (place(row + 1)) return true;
      used[col] = false;
    }
    return false;
  };
  return place(0) ? cols : null;
}

// Grow one district outward from each letter until the grid is full.
function growRegions(size, solution, rand) {
  const regions = new Array(size * size).fill(-1);
  // Shuffle ids so a district's colour says nothing about its letter's row.
  const ids = shuffled(range(size), rand);
  solution.forEach((col, row) => {
    regions[row * size + col] = ids[row];
  });

  const neighbours = (cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const out = [];
    if (row > 0) out.push(cell - size);
    if (row < size - 1) out.push(cell + size);
    if (col > 0) out.push(cell - 1);
    if (col < size - 1) out.push(cell + 1);
    return out;
  };

  let remaining = size * size - size;
  while (remaining > 0) {
    const frontier = [];
    for (let cell = 0; cell < regions.length; cell++) {
      if (regions[cell] === -1 && neighbours(cell).some((n) => regions[n] !== -1)) {
        frontier.push(cell);
      }
    }
    const cell = frontier[Math.floor(rand() * frontier.length)];
    const options = neighbours(cell).filter((n) => regions[n] !== -1);
    regions[cell] = regions[options[Math.floor(rand() * options.length)]];
    remaining--;
  }
  return regions;
}

// Find up to `limit` solutions of a district layout (each is a column per row).
function findSolutions(size, regions, limit) {
  const usedCol = new Array(size).fill(false);
  const usedRegion = new Array(size).fill(false);
  const cols = [];
  const found = [];
  const place = (row) => {
    if (row === size) {
      found.push(cols.slice());
      return;
    }
    for (let col = 0; col < size && found.length < limit; col++) {
      const region = regions[row * size + col];
      if (usedCol[col] || usedRegion[region]) continue;
      if (row > 0 && Math.abs(cols[row - 1] - col) <= 1) continue;
      usedCol[col] = true;
      usedRegion[region] = true;
      cols[row] = col;
      place(row + 1);
      usedCol[col] = false;
      usedRegion[region] = false;
    }
  };
  place(0);
  return found;
}

// The solution of a district layout (a column for each row), or null if it has
// none. Layouts made by generatePuzzle have exactly one.
export const solve = (size, regions) => findSolutions(size, regions, 1)[0] ?? null;

// Count solutions of a district layout, stopping once `limit` is reached.
export function countSolutions(size, regions, limit = 2) {
  return findSolutions(size, regions, limit).length;
}

function orthogonal(size, cell) {
  const out = [];
  if (cell >= size) out.push(cell - size);
  if (cell < size * (size - 1)) out.push(cell + size);
  if (cell % size > 0) out.push(cell - 1);
  if (cell % size < size - 1) out.push(cell + 1);
  return out;
}

// Would district `id` still be one connected piece without `removed`?
function staysConnected(size, regions, id, removed) {
  const cells = [];
  for (let i = 0; i < regions.length; i++) if (regions[i] === id && i !== removed) cells.push(i);
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    for (const n of orthogonal(size, queue.pop())) {
      if (n !== removed && regions[n] === id && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

function districtSizes(size, regions) {
  const sizes = new Array(size).fill(0);
  for (const id of regions) sizes[id]++;
  return sizes;
}

// Generate a puzzle with exactly one solution.
// Returns { size, regions, solution } where regions[cell] is a district id and
// solution[row] is the column of that row's letter.
//
// Random district layouts rarely have a unique solution at larger sizes, so
// after growing one we repair it: while an unintended solution exists, hand one
// of its squares to a neighbouring district. That leaves the unintended
// solution with two letters in one district and none in another, while the
// intended solution is untouched.
export function generatePuzzle(size, seed) {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`size must be an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  }
  const rand = rng(seed);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const solution = randomSolution(size, rand);
    if (!solution) continue;
    const regions = growRegions(size, solution, rand);

    for (let step = 0; step < size * size * 4; step++) {
      const other = findSolutions(size, regions, 2).find((s) => s.some((c, r) => c !== solution[r]));
      if (!other) {
        // A one-square district gives its letter away; try again instead.
        if (districtSizes(size, regions).some((n) => n < 2)) break;
        return { size, regions, solution };
      }
      const sizes = districtSizes(size, regions);

      // Squares used only by the unintended solution, paired with a
      // neighbouring district that could absorb them.
      const fixes = [];
      other.forEach((col, row) => {
        if (col === solution[row]) return;
        const cell = row * size + col;
        const from = regions[cell];
        const targets = [...new Set(orthogonal(size, cell).map((n) => regions[n]))].filter((id) => id !== from);
        if (targets.length && sizes[from] > 2 && staysConnected(size, regions, from, cell)) {
          for (const to of targets) fixes.push({ cell, to });
        }
      });
      if (!fixes.length) break;
      const fix = fixes[Math.floor(rand() * fixes.length)];
      regions[fix.cell] = fix.to;
    }
  }
  throw new Error('Could not generate a puzzle; try another seed');
}

export function newGame({ size, seed, players }) {
  const names = players.map((name) => String(name).trim()).filter(Boolean);
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new RangeError(`Postmarks takes ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  const puzzle = generatePuzzle(size, seed);
  return {
    v: 1,
    seed,
    size,
    regions: puzzle.regions,
    solution: puzzle.solution,
    players: names,
    cells: new Array(size * size).fill(EMPTY),
    hearts: START_HEARTS,
    moves: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
    last: null, // the latest move: { player, type, cell, cells?, correct?, crossed? }
  };
}

export const isLetterCell = (state, cell) =>
  state.solution[Math.floor(cell / state.size)] === cell % state.size;

export const lettersFound = (state) => state.cells.filter((c) => c === LETTER).length;

// Turn-taking. Anyone may take the next turn except the player who took the
// last one, but only when more than one person can play: someone alone has
// nobody to wait for. Optional flags on the state change who can play:
//   state.shared  a room's board: the last mover always waits, even with
//                 nobody else there yet (someone has to join and move)
//   state.free    no turns at all (a time trial, where each player has their own board)
//   state.author  index of a player sitting out (they wrote the pass phrase)
//   state.absent  indexes of players no longer taking part (they left the room)
const sittingOut = (state, player) => player === state.author || Boolean(state.absent?.includes(player));
const mustAlternate = (state) =>
  !state.free && (Boolean(state.shared) || state.players.filter((_, player) => !sittingOut(state, player)).length > 1);

export const canMove = (state, player) =>
  state.status === 'playing' &&
  Number.isInteger(player) && player >= 0 && player < state.players.length &&
  !sittingOut(state, player) &&
  (!mustAlternate(state) || state.last?.player !== player);

// Apply one turn. A turn is exactly one action:
//   { player, type: 'mark',   cells }  cross out one or more empty squares
//   { player, type: 'unmark', cells }  remove one or more crosses
//   { player, type: 'guess',  cell }   claim a letter is here
// `cells` is one stroke; squares in it that are not in the right state are
// skipped. `cell` is accepted in place of a one-square `cells`.
// Returns { ok: true, state } with a new state, or { ok: false, error }.
export function applyMove(state, move) {
  const fail = (error) => ({ ok: false, error });
  if (state.status !== 'playing') return fail('The game is over.');
  if (!Number.isInteger(move.player) || move.player < 0 || move.player >= state.players.length) {
    return fail('That is not a player in this game.');
  }
  if (move.player === state.author) return fail('You wrote this phrase, so you are watching this one.');
  if (mustAlternate(state) && state.last?.player === move.player) {
    return fail(`${state.players[move.player]} made the last move, so someone else goes next.`);
  }
  const { type } = move;
  const stroke = [...new Set(Array.isArray(move.cells) ? move.cells : [move.cell])];
  if (!stroke.length || stroke.some((c) => !Number.isInteger(c) || c < 0 || c >= state.cells.length)) {
    return fail('That square is not on the board.');
  }

  const { size, regions } = state;
  const cells = state.cells.slice();
  let { hearts, status } = state;
  const last = { player: move.player, type, cell: stroke[0] };

  if (type === 'mark' || type === 'unmark') {
    const [from, to] = type === 'mark' ? [EMPTY, CROSS] : [CROSS, EMPTY];
    const changed = stroke.filter((c) => cells[c] === from);
    if (!changed.length) {
      return fail(type === 'mark' ? 'That square is already marked.' : 'There is no cross to remove there.');
    }
    for (const c of changed) cells[c] = to;
    last.cell = changed[0];
    last.cells = changed;
  } else if (type === 'guess') {
    if (stroke.length !== 1) return fail('Guess one square at a time.');
    const cell = stroke[0];
    if (cells[cell] === LETTER || cells[cell] === MISS) return fail('That square is already settled.');
    last.correct = isLetterCell(state, cell);
    if (last.correct) {
      cells[cell] = LETTER;
      // No other letter can share this one's row, column or district, or touch
      // it even diagonally, so cross those squares out to save the busywork.
      const row = Math.floor(cell / size);
      const col = cell % size;
      last.crossed = 0;
      for (let other = 0; other < cells.length; other++) {
        const r = Math.floor(other / size);
        const c = other % size;
        const ruledOut =
          r === row || c === col || regions[other] === regions[cell] ||
          (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1);
        if (ruledOut && cells[other] === EMPTY) {
          cells[other] = CROSS;
          last.crossed++;
        }
      }
      if (cells.filter((c) => c === LETTER).length === size) status = 'won';
    } else {
      cells[cell] = MISS;
      hearts -= 1;
      if (hearts === 0) status = 'lost';
    }
  } else {
    return fail('Unknown move.');
  }

  return {
    ok: true,
    state: { ...state, cells, hearts, status, last, moves: state.moves + 1 },
  };
}
