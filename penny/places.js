// The places Penny takes you through, and what she can tell about them.
// No page here, only data and arithmetic, so the tests can run it.
//
// Each place is a small piece of the map with one more rule than the last:
//
//   1. a post is opened with a double tap
//   2. one post per colour
//   3. one post per row and column
//   4. posts cannot touch
//   5. a tap or a drag crosses squares out
//
// Penny does not know where the posts are: she is looking too. She has two
// things to go on, and her feelings come from them and nothing else.
//
//   What the rules say. Once a post is found, the rules this place has rule
//   squares out; and a colour (or, later, a row or column) with one square
//   left must have its post there. read() works that out.
//
//   What she can hear. Posts have sounds in them, and close to, she hears
//   them through the map. How close she has to be is the place's `ear`: in
//   the first places she hears a post from two squares off, by the last only
//   when a finger is on it. warmth() is how strongly she hears one from a
//   given square.

// rows: the place's colours, a letter a square. tiles: which of the game's
// colours each letter is. posts: where they are. rules: the rules this place
// has; the last is the one it is here for. ear: how many squares off she can
// hear a post. marks: a tap crosses a square out here, as in the game.
export const PLACES = [
  { rows: ['A'], tiles: { A: 1 }, posts: [0], rules: [], ear: 0 },
  { rows: ['AABB', 'AABB', 'CCBB', 'CCDB'], tiles: { A: 0, B: 4, C: 2, D: 1 }, posts: [1, 7, 8, 14], rules: ['colour'], ear: 2 },
  { rows: ['BBAA', 'BBCC', 'DBBC', 'DDBB'], tiles: { A: 6, B: 3, C: 1, D: 0 }, posts: [2, 4, 11, 13], rules: ['colour', 'line'], ear: 1 },
  { rows: ['AAAB', 'AABB', 'CCDB', 'CDDD'], tiles: { A: 2, B: 5, C: 0, D: 4 }, posts: [1, 7, 8, 14], rules: ['colour', 'line', 'touch'], ear: 1 },
  { rows: ['AABB', 'AAAB', 'DDCC', 'DDDC'], tiles: { A: 1, B: 0, C: 3, D: 6 }, posts: [2, 4, 11, 13], rules: ['colour', 'line', 'touch'], ear: 0, marks: true },
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

// What the rules say about every square, given the posts found so far.
// `found` is the squares whose posts are open. Returns, a square each:
//   { is: 'found' }
//   { is: 'out', post, rule }  cannot hold a post: that post, by that rule, says so
//   { is: 'sure' }             must hold one: the only square its colour, row or column has left
//   { is: 'open' }             nothing known either way
// The player's own crosses are not evidence, and are not looked at.
export function read({ n, regions, rules }, found) {
  const squares = regions.map(() => ({ is: 'open' }));
  for (const post of found) {
    squares[post] = { is: 'found' };
    for (const rule of rules) {
      for (const cell of ruledOut(rule, post, n, regions)) {
        if (squares[cell].is === 'open') squares[cell] = { is: 'out', post, rule };
      }
    }
  }
  // the groups that each hold exactly one post, under the rules this place has
  const groups = [];
  const by = (key) => {
    const sets = new Map();
    squares.forEach((_, cell) => sets.set(key(cell), [...(sets.get(key(cell)) ?? []), cell]));
    groups.push(...sets.values());
  };
  if (rules.includes('colour')) by((cell) => `colour ${regions[cell]}`);
  if (rules.includes('line')) {
    by((cell) => `row ${rowOf(cell, n)}`);
    by((cell) => `column ${colOf(cell, n)}`);
  }
  for (const group of groups) {
    if (group.some((cell) => squares[cell].is === 'found')) continue;
    const left = group.filter((cell) => squares[cell].is !== 'out');
    if (left.length === 1) squares[left[0]] = { is: 'sure' };
  }
  return squares;
}

// How strongly she hears a post from `cell`, 0 to 1: 1 with a finger on one
// not yet found, less a square or two off (if her ear reaches that far here),
// nothing beyond.
export function warmth({ n, posts, ear }, found, cell) {
  let best = 0;
  for (const post of posts) {
    if (found.includes(post)) continue;
    const far = apart(cell, post, n);
    if (far > ear) continue;
    best = Math.max(best, far === 0 ? 1 : far === 1 ? 0.55 : 0.28);
  }
  return best;
}
