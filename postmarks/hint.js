// Hints. Asked for one, the game looks at the board the way a careful player
// would and points at the next squares that can be crossed out, saying why.
// It never gives a post away unless there is nothing left to cross.
//
// It reasons from what is certain (the posts already found and the wrong
// guesses), not from the player's own crosses, which may be mistaken. Each
// step of reasoning rules some squares out; the first step that rules out a
// square the player has not yet crossed is the hint. Before any of that, it
// checks the crosses already made: one sitting on a post is the most useful
// thing it can point out.

import { CROSS, EMPTY, LETTER, MISS, solve } from './game.js';

export const COLOUR_NAMES = ['coral', 'yellow', 'green', 'teal', 'sky blue', 'indigo', 'pink', 'brown', 'grey'];

const list = (numbers) => {
  const shown = numbers.map((n) => n + 1);
  return shown.length === 1 ? `${shown[0]}` : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

// state: { size, regions, cells }. Returns
//   { kind: 'uncross' | 'cross' | 'post', cells: [...], because: [...], text }
// or null when the puzzle is finished. `cells` are the squares to act on,
// `because` the squares that explain it.
export function findHint({ size, regions, cells }) {
  const n = size;
  const all = Array.from({ length: n * n }, (_, cell) => cell);
  const rowOf = (cell) => Math.floor(cell / n);
  const colOf = (cell) => cell % n;
  const touches = (a, b) => Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1;
  // would a post at `a` make one at `b` impossible?
  const blocks = (a, b) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || regions[a] === regions[b] || touches(a, b));
  const colour = (district) => COLOUR_NAMES[district] ?? 'that colour';

  const posts = all.filter((cell) => cells[cell] === LETTER);
  if (posts.length === n) return null;

  // 1. A cross sitting where a post belongs.
  const solution = solve(n, regions);
  if (solution) {
    const wrong = all.filter((cell) => cells[cell] === CROSS && solution[rowOf(cell)] === colOf(cell));
    if (wrong.length) {
      return {
        kind: 'uncross', cells: wrong, because: [],
        text: wrong.length === 1 ? 'Take another look at this cross. Nothing rules a post out here.'
          : 'Take another look at these crosses. Nothing rules a post out in them.',
      };
    }
  }

  // What is certain: squares still open to holding a post.
  const open = all.map((cell) => cells[cell] !== LETTER && cells[cell] !== MISS && !posts.some((post) => blocks(post, cell)));
  const solvedRow = new Set(posts.map(rowOf));
  const solvedCol = new Set(posts.map(colOf));
  const solvedDistrict = new Set(posts.map((cell) => regions[cell]));
  const units = () => {
    const made = [];
    for (let i = 0; i < n; i++) {
      if (!solvedRow.has(i)) made.push({ type: 'row', index: i, name: `row ${i + 1}`, cells: all.filter((cell) => rowOf(cell) === i && open[cell]) });
      if (!solvedCol.has(i)) made.push({ type: 'column', index: i, name: `column ${i + 1}`, cells: all.filter((cell) => colOf(cell) === i && open[cell]) });
      if (!solvedDistrict.has(i)) made.push({ type: 'district', index: i, name: `the ${colour(i)} district`, cells: all.filter((cell) => regions[cell] === i && open[cell]) });
    }
    return made;
  };
  const lineOf = { row: rowOf, column: colOf };

  // One step of reasoning: { remove, because, text }, or null if these rules find nothing.
  function step() {
    const now = units();
    const districts = now.filter((unit) => unit.type === 'district');
    for (const line of ['row', 'column']) {
      const lines = now.filter((unit) => unit.type === line);
      // a district whose open squares all lie in one line owns that line's post
      for (const district of districts) {
        const where = new Set(district.cells.map(lineOf[line]));
        if (where.size !== 1) continue;
        const [index] = where;
        const remove = all.filter((cell) => open[cell] && lineOf[line](cell) === index && regions[cell] !== district.index);
        if (remove.length) {
          return { remove, because: district.cells, text: `Every open ${colour(district.index)} square is in ${line} ${index + 1}, so that ${line}’s post is ${colour(district.index)}. The rest of the ${line} can be crossed.` };
        }
      }
      // a line whose open squares are all one district: the district's post is in that line
      for (const unit of lines) {
        const where = new Set(unit.cells.map((cell) => regions[cell]));
        if (where.size !== 1) continue;
        const [district] = where;
        const remove = all.filter((cell) => open[cell] && regions[cell] === district && lineOf[line](cell) !== unit.index);
        if (remove.length) {
          return { remove, because: unit.cells, text: `Every open square in ${unit.name} is ${colour(district)}, so the ${colour(district)} post is in that ${line}. The rest of ${colour(district)} can be crossed.` };
        }
      }
    }
    // a square whose post would leave some row, column or district with nowhere to put its own
    for (const unit of now) {
      if (unit.cells.length === 0) continue;
      const remove = all.filter((cell) => open[cell] && !unit.cells.includes(cell) && unit.cells.every((other) => blocks(cell, other)));
      if (remove.length) {
        return { remove, because: unit.cells, text: `A post here would rule out every open square of ${unit.name}, leaving it with nowhere to put its own.` };
      }
    }
    // two districts that fit only in the same two lines take both of those lines' posts (and the reverse)
    for (const line of ['row', 'column']) {
      const lines = now.filter((unit) => unit.type === line);
      for (let a = 0; a < districts.length; a++) {
        for (let b = a + 1; b < districts.length; b++) {
          const where = [...new Set([...districts[a].cells, ...districts[b].cells].map(lineOf[line]))];
          if (where.length !== 2) continue;
          const remove = all.filter((cell) => open[cell] && where.includes(lineOf[line](cell)) && regions[cell] !== districts[a].index && regions[cell] !== districts[b].index);
          if (remove.length) {
            return { remove, because: [...districts[a].cells, ...districts[b].cells], text: `The ${colour(districts[a].index)} and ${colour(districts[b].index)} districts fit only in ${line}s ${list(where.sort((x, y) => x - y))}, so they take both of those ${line}s’ posts. The other squares there can be crossed.` };
          }
        }
      }
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          const where = [...new Set([...lines[a].cells, ...lines[b].cells].map((cell) => regions[cell]))];
          if (where.length !== 2) continue;
          const remove = all.filter((cell) => open[cell] && where.includes(regions[cell]) && lineOf[line](cell) !== lines[a].index && lineOf[line](cell) !== lines[b].index);
          if (remove.length) {
            return { remove, because: [...lines[a].cells, ...lines[b].cells], text: `${line === 'row' ? 'Rows' : 'Columns'} ${list([lines[a].index, lines[b].index])} hold only ${colour(where[0])} and ${colour(where[1])} squares, so those two districts’ posts are there. The rest of both districts can be crossed.` };
          }
        }
      }
    }
    return null;
  }

  // 2. Reason forward until a step rules out a square the player has not crossed.
  for (let turn = 0; turn < n * n; turn++) {
    const found = step();
    if (!found) break;
    for (const cell of found.remove) open[cell] = false;
    const fresh = found.remove.filter((cell) => cells[cell] === EMPTY);
    if (fresh.length) return { kind: 'cross', cells: fresh, because: found.because.filter((cell) => !fresh.includes(cell)), text: found.text };
  }

  // 3. Nothing left to cross by those rules: a row, column or district down to one square has its post.
  const single = units().find((unit) => unit.cells.length === 1 && cells[unit.cells[0]] === EMPTY);
  const uncrossed = all.filter((cell) => cells[cell] === EMPTY);
  if (single && uncrossed.filter((cell) => open[cell]).length === uncrossed.length) {
    return { kind: 'post', cells: single.cells, because: [], text: `Only one square is left for ${single.name}. That is where its post goes.` };
  }

  // 4. The simple rules have run out, but the puzzle has one answer: point at a
  // square that cannot hold a post, even though saying why would take a while.
  if (solution) {
    const impossible = uncrossed.filter((cell) => solution[rowOf(cell)] !== colOf(cell));
    if (impossible.length) {
      // the most helpful is one in the row, column or district with the fewest squares left
      const weight = (cell) => Math.min(
        uncrossed.filter((other) => rowOf(other) === rowOf(cell)).length,
        uncrossed.filter((other) => colOf(other) === colOf(cell)).length,
        uncrossed.filter((other) => regions[other] === regions[cell]).length);
      impossible.sort((x, y) => weight(x) - weight(y));
      return { kind: 'cross', cells: [impossible[0]], because: [], text: 'This one takes a longer chain of reasoning, but a post here cannot work. It can be crossed.' };
    }
    const next = uncrossed.find((cell) => solution[rowOf(cell)] === colOf(cell));
    if (next !== undefined) return { kind: 'post', cells: [next], because: [], text: 'Everything else is crossed out. This square is a post.' };
  }
  return null;
}
