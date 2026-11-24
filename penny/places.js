// The places Penny takes you through, and what it can tell about them.
// No page here, only data and arithmetic, so the tests can run it. What is in
// each post is at the end of the file.
//
// Every place is played by all the rules of the game, so nothing on the map
// ever contradicts it: a post found crosses out its colour, its row and
// column, and the squares that touch it. What changes from place to place is
// which one thing the place is there to show:
//
//   1. a post is opened with a double tap (one square: no rules to speak of)
//   2. one post per colour
//   3. one post per row and column
//   4. posts cannot touch
//   5. nothing to hear: the rules alone
//
// The rule a place shows is the one whose crosses come first and slowly, lit
// one by one, so that it is seen as a shape; the others follow quickly.
// From the second place on, a quick tap crosses a square out, as in the game.
// The last place is made to be gentle: one cross in the right corner leaves a
// colour with a single square.
//
// Penny does not know where the posts are: it is looking too. Nothing here
// that works out its feelings is given the posts. It has two things to go
// on, and that is all.
//
//   Its head: the rules. Once a post is found, the rules this place has rule
//   squares out; and a colour (or, later, a row or column) with one square
//   left must have its post there. That is read(). In the last place it can
//   take one more step of thought, "a post here would leave that colour with
//   nowhere", and no more: it cannot follow a chain. But it can lean on
//   yours. A cross you make that it can see the reason for, it will vouch
//   for, and after that it is as good as known to it: your crosses are the
//   memory it does not have. That is vouch().
//
//   Its ear. Posts have sounds in them, and some are loud enough to be heard
//   through the map by a finger close to them. The rest are quiet until
//   opened. That is hear(). Place by place fewer of them are loud, and in the
//   last none is: what is found there is found by the rules.
//
// So it can be unsure, and it can be wrong about nothing but what your own
// crosses have told it.

import { A4, A5, C5, C6, D4, D5, E4, E5, G4, G5 } from './notes.js';

// rows: the place's colours, a letter a square. tiles: which of the game's
// colours each letter is. posts: where they are (only opening a square, and
// the list of loud ones, ever look at this). rules: the rules this place is played by
// (all of them, but for the first, which is one square). shows: the one rule
// it is there to show. loud: the posts it can hear. reach: how
// many squares off it hears them. listen: how long it listens before it can
// say, in milliseconds. twice: how soon the second tap of a double tap has to
// come. crosses: a quick tap crosses a square out (holding, or sliding, is
// listening). marks: the last place, where nothing can be heard, so a slide
// crosses too, and Penny can take its one extra step of thought.
export const PLACES = [
  { rows: ['A'], tiles: { A: 1 }, posts: [0], rules: [], loud: [0], reach: 0, listen: 250, twice: 500 },
  { rows: ['AABB', 'AABB', 'CCBB', 'CCDB'], tiles: { A: 0, B: 4, C: 2, D: 1 }, posts: [1, 7, 8, 14], rules: ['colour', 'line', 'touch'], shows: 'colour', loud: [1, 7, 8], reach: 2, listen: 300, twice: 450, crosses: true },
  { rows: ['BBAA', 'BBCC', 'DBBC', 'DDBB'], tiles: { A: 6, B: 3, C: 1, D: 0 }, posts: [2, 4, 11, 13], rules: ['colour', 'line', 'touch'], shows: 'line', loud: [2, 4], reach: 2, listen: 380, twice: 350, crosses: true },
  { rows: ['AAAB', 'AABB', 'CCDB', 'CDDD'], tiles: { A: 2, B: 5, C: 0, D: 4 }, posts: [1, 7, 8, 14], rules: ['colour', 'line', 'touch'], shows: 'touch', loud: [1], reach: 2, listen: 460, twice: 350, crosses: true },
  { rows: ['BBAA', 'BBCC', 'DDDC', 'DDDC'], tiles: { A: 1, B: 0, C: 3, D: 6 }, posts: [2, 4, 11, 13], rules: ['colour', 'line', 'touch'], loud: [], reach: 0, listen: 0, twice: 350, crosses: true, marks: true },
].map((place) => ({ ...place, n: place.rows.length, regions: place.rows.join('').split('').map((letter) => place.tiles[letter]) }));

const rowOf = (cell, n) => Math.floor(cell / n);
const colOf = (cell, n) => cell % n;
// how many squares apart, counting a diagonal step as one
export const apart = (a, b, n) => Math.max(Math.abs(rowOf(a, n) - rowOf(b, n)), Math.abs(colOf(a, n) - colOf(b, n)));

// The squares a post at `post` takes away under one rule, nearest first.
export function ruledOut(rule, post, n, regions) {
  return regions.map((_, cell) => cell).filter((cell) => {
    if (cell === post) return false;
    if (rule === 'colour') return regions[cell] === regions[post];
    if (rule === 'line') return rowOf(cell, n) === rowOf(post, n) || colOf(cell, n) === colOf(post, n);
    return apart(cell, post, n) === 1; // touch
  }).sort((a, b) => apart(a, post, n) - apart(b, post, n));
}

// The groups that each hold exactly one post, under the rules a place has:
// its colours, and (once it has that rule) its rows and columns.
export function groupsOf({ n, regions, rules }) {
  const groups = [];
  const by = (key) => {
    const sets = new Map();
    regions.forEach((_, cell) => sets.set(key(cell), [...(sets.get(key(cell)) ?? []), cell]));
    groups.push(...sets.values());
  };
  if (rules.includes('colour')) by((cell) => regions[cell]);
  if (rules.includes('line')) {
    by((cell) => rowOf(cell, n));
    by((cell) => colOf(cell, n));
  }
  return groups;
}

// What the rules say about every square. `found` is the squares whose posts
// are open; `shut` the squares known to be empty some other way (a guess that
// found nothing; in the last place, a cross it has vouched for). Returns, a
// square each:
//   { is: 'found' }
//   { is: 'out', post, rule }   cannot hold a post: that post, by that rule, says so
//   { is: 'out', shut: true }   cannot: it is one of `shut`
//   { is: 'sure', group }       must hold one: the only square its group has left
//   { is: 'room', group }       (last place) cannot: a post here would leave that group nowhere
//   { is: 'open' }              nothing known either way
// and, as `.stuck`, any group left with no square at all, which can only
// happen when something in `shut` was wrong.
export function read(place, found, shut = []) {
  const { n, regions, rules } = place;
  const squares = regions.map(() => ({ is: 'open' }));
  for (const cell of shut) squares[cell] = { is: 'out', shut: true };
  for (const post of found) squares[post] = { is: 'found' };
  for (const post of found) {
    for (const rule of rules) {
      for (const cell of ruledOut(rule, post, n, regions)) {
        if (squares[cell].is === 'open') squares[cell] = { is: 'out', post, rule };
      }
    }
  }
  const waiting = groupsOf(place).filter((group) => !group.some((cell) => squares[cell].is === 'found'));
  const left = (group) => group.filter((cell) => squares[cell].is !== 'out');
  squares.stuck = waiting.filter((group) => left(group).length === 0);
  for (const group of waiting) {
    const still = left(group);
    if (still.length === 1) squares[still[0]] = { is: 'sure', group };
  }
  if (place.marks) {
    // one step of thought, never a chain: suppose a post here; is some other group left with nowhere?
    squares.forEach((square, cell) => {
      if (square.is !== 'open') return;
      const taken = new Set(rules.flatMap((rule) => ruledOut(rule, cell, n, regions)));
      const starved = waiting.find((group) => !group.includes(cell) && left(group).length > 0 && left(group).every((other) => taken.has(other)));
      if (starved) squares[cell] = { is: 'room', group: starved };
    });
  }
  return squares;
}

// Which of the crosses made by hand it can vouch for: those it can see the
// reason for, given the posts found, the guesses that found nothing, and the
// crosses already vouched for. One cross can make the reason for the next.
export function vouch(place, found, misses, crosses) {
  const good = new Set();
  for (let changed = true; changed;) {
    changed = false;
    const squares = read(place, found, [...misses, ...good]);
    for (const cell of crosses) {
      if (good.has(cell) || !['out', 'room'].includes(squares[cell].is)) continue;
      good.add(cell);
      changed = true;
    }
  }
  return good;
}

// What it hears with a finger on `cell`: how strongly (1 on a loud post not
// yet found, less a square or two off, 0 out of reach), and which way it lies
// (-1 to the left, 1 to the right, 0 in the same column).
export function hear({ n, loud, reach }, found, cell) {
  let best = { strength: 0, side: 0 };
  for (const post of loud) {
    if (found.includes(post)) continue;
    const far = apart(cell, post, n);
    if (far > reach) continue;
    const strength = far === 0 ? 1 : far === 1 ? 0.55 : 0.28;
    if (strength > best.strength) best = { strength, side: Math.sign(colOf(post, n) - colOf(cell, n)), post };
  }
  return best;
}

// === What is in the posts =========================================================
// (How each of these sounds is in penny/mail.js; this is only which post holds what.)

// --- The sound it is after -----------------------------------------------------
// As much of it as the opening of the story gives away: [pitch, seconds, pitch
// to glide to]. There is more of it than this.
export const SOUND = [[A4, 0.62], [E4, 0.26], [G4, 0.3], [D4, 0.9, E4]];

// Which piece each place gives up, as [first note, one past the last], and how
// far off it sounds there (1 is a long way; 0 would be in the room). The last
// place gives up no piece: what is in its last post is Dot.
const PIECES = [null, { notes: [0, 1], far: 0.85 }, { notes: [0, 2], far: 0.65 }, { notes: [0, 3], far: 0.45 }, 'dot'];
// Its answer to a piece is the same notes hummed back, an octave up.
export const echoOf = (notes) => notes.map(([pitch, dur, to]) => [pitch * 2, dur * 0.7, to ? to * 2 : undefined]);

// --- Other people's mail ---------------------------------------------------------
// kind is the voice; notes are [pitch, seconds].
const OTHERS = [
  { kind: 'pluck', notes: [[C5, 0.16], [E5, 0.16], [G5, 0.3]] },
  { kind: 'blip', notes: [[G5, 0.1], [G5, 0.1], [C6, 0.22]] },
  { kind: 'chirp', notes: [[E5, 0.14], [A5, 0.2]] },
  { kind: 'knock', notes: [[G4, 0.12], [G4, 0.12], [C5, 0.2]] },
  { kind: 'pluck', notes: [[A5, 0.14], [G5, 0.14], [E5, 0.14], [D5, 0.3]] },
  { kind: 'bubble', notes: [[C5, 0.12], [D5, 0.12], [E5, 0.12], [G5, 0.24]] },
  { kind: 'blip', notes: [[E5, 0.12], [D5, 0.12], [C5, 0.26]] },
  { kind: 'chirp', notes: [[G5, 0.12], [E5, 0.12], [G5, 0.12], [C6, 0.24]] },
  { kind: 'knock', notes: [[C5, 0.1], [C5, 0.1], [C5, 0.1], [E5, 0.22]] },
  { kind: 'bubble', notes: [[A4, 0.14], [C5, 0.14], [A5, 0.3]] },
  { kind: 'pluck', notes: [[D5, 0.2], [G5, 0.34]] },
];

// What is in the post opened `order`-th (0 for the first) in place `place`.
// In every place after the first, the last post to be opened is the one with
// a piece of the sound in it: whichever square that turns out to be.
// (`dotFound`: Dot has been found already, on an earlier walk. Then that post
// is somebody's ordinary mail: Dot is only there to be found once.)
export function mailIn(place, order, posts, dotFound = false) {
  const piece = PIECES[place];
  if (piece === 'dot' && order === posts - 1 && !dotFound) return { dot: true, notes: [] };
  if (piece && piece !== 'dot' && order === posts - 1) {
    const notes = SOUND.slice(...piece.notes);
    return { friend: true, notes, far: piece.far, upTo: piece.notes[1], echo: echoOf(notes) };
  }
  let before = 0;
  for (let i = 0; i < place; i++) before += i === 0 ? 1 : 3; // the ordinary posts in the places before this one
  return { friend: false, ...OTHERS[(before + order) % OTHERS.length] };
}
