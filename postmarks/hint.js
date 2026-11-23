// Hints. Asked for one, the game looks at the board the way a careful player
// would and points at the next thing that can be worked out, saying why.
//
// It reasons from what is certain (the posts already found and the wrong
// guesses), not from the player's own crosses, which may be mistaken. Each
// step of reasoning rules some squares out, or places a post; the first step
// that tells the player something they have not already marked is the hint.
// Before any of that, it checks the crosses already made: one sitting on a
// post is the most useful thing it can point out.
//
// The reasoning, simplest first:
//   1. a district confined to one row or column, or a row or column confined
//      to one district;
//   2. a square whose post would leave some row, column or district empty;
//   3. a row, column or district with one square left: its post;
//   4. the same as (1) for groups: N districts that fit only in N rows take
//      those rows' posts, and so on;
//   5. "suppose a post went here": following (1) to (4) from that supposition
//      until something is left with nowhere for its post.
// Every puzzle the game makes can be finished this way (the tests follow the
// hints through hundreds of them), so a hint always comes with its reason.

import { CROSS, EMPTY, LETTER, MISS, solve } from './game.js';

export const COLOUR_NAMES = ['coral', 'yellow', 'green', 'teal', 'sky blue', 'indigo', 'pink', 'brown', 'grey'];

const list = (words) => (words.length <= 1 ? `${words[0]}` : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

// state: { size, regions, cells }. Returns
//   { kind: 'uncross' | 'cross' | 'post', cells: [...], because: [...], text, rule }
// or null when the puzzle is finished. `cells` are the squares to act on,
// `because` the squares that explain it, `rule` which kind of reasoning it was.
export function findHint({ size, regions, cells }) {
  const n = size;
  const all = Array.from({ length: n * n }, (_, cell) => cell);
  const rowOf = (cell) => Math.floor(cell / n);
  const colOf = (cell) => cell % n;
  const where = (cell) => `row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;
  const colour = (district) => COLOUR_NAMES[district] ?? 'that colour';
  // would a post at `a` make one at `b` impossible?
  const blocks = (a, b) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || regions[a] === regions[b]
    || (Math.abs(rowOf(a) - rowOf(b)) <= 1 && Math.abs(colOf(a) - colOf(b)) <= 1));
  const blocked = all.map((a) => all.filter((b) => blocks(a, b)));
  const lineOf = { row: rowOf, column: colOf };
  const KINDS = ['row', 'column', 'district'];
  const unitOf = { row: rowOf, column: colOf, district: (cell) => regions[cell] };
  const unitName = (kind, index) => (kind === 'district' ? `the ${colour(index)} district` : `${kind} ${index + 1}`);

  const posts = all.filter((cell) => cells[cell] === LETTER);
  if (posts.length === n) return null;

  // --- A cross sitting where a post belongs -------------------------------------------
  const solution = solve(n, regions);
  if (solution) {
    const wrong = all.filter((cell) => cells[cell] === CROSS && solution[rowOf(cell)] === colOf(cell));
    if (wrong.length) {
      return {
        kind: 'uncross', rule: 'mistake', cells: wrong, because: [],
        text: wrong.length === 1 ? 'Take another look at this cross. Nothing rules a post out here.'
          : 'Take another look at these crosses. Nothing rules a post out in them.',
      };
    }
  }

  // --- A position: which squares are still open, and which units have their post ---------
  function start() {
    const position = { open: new Uint8Array(n * n).fill(1), done: { row: new Uint8Array(n), column: new Uint8Array(n), district: new Uint8Array(n) } };
    for (const cell of all) if (cells[cell] === MISS) position.open[cell] = 0;
    for (const post of posts) place(position, post);
    return position;
  }
  const copy = (position) => ({
    open: position.open.slice(),
    done: { row: position.done.row.slice(), column: position.done.column.slice(), district: position.done.district.slice() },
  });
  function place(position, cell) {
    position.open[cell] = 0;
    for (const other of blocked[cell]) position.open[other] = 0;
    for (const kind of KINDS) position.done[kind][unitOf[kind](cell)] = 1;
  }
  // the units still waiting for their post, each with its open squares
  function waiting(position) {
    const units = [];
    for (const kind of KINDS) {
      for (let index = 0; index < n; index++) {
        if (!position.done[kind][index]) units.push({ kind, index, name: unitName(kind, index), cells: [] });
      }
    }
    const at = new Map(units.map((unit) => [`${unit.kind}${unit.index}`, unit]));
    for (const cell of all) {
      if (!position.open[cell]) continue;
      for (const kind of KINDS) at.get(`${kind}${unitOf[kind](cell)}`)?.cells.push(cell);
    }
    return units;
  }

  // --- One step of plain reasoning ------------------------------------------------------
  // Returns { remove, because, text, rule }, or { post, because, text, rule },
  // or { dead: text } when the position cannot be completed, or null.
  // `depth` limits how far it looks: 1 = rules 1 to 3, 2 = also groups.
  function step(position, depth) {
    const units = waiting(position);
    const empty = units.find((unit) => unit.cells.length === 0);
    if (empty) return { dead: `${empty.name} would have nowhere for its post`, unit: empty };
    const districts = units.filter((unit) => unit.kind === 'district');

    for (const line of ['row', 'column']) {
      // a district whose open squares all lie in one line owns that line's post
      for (const district of districts) {
        const index = lineOf[line](district.cells[0]);
        if (!district.cells.every((cell) => lineOf[line](cell) === index)) continue;
        const remove = all.filter((cell) => position.open[cell] && lineOf[line](cell) === index && regions[cell] !== district.index);
        if (remove.length) {
          return { rule: 'confined', remove, because: district.cells, brief: `every open ${colour(district.index)} square would be in ${line} ${index + 1}, which clears the rest of that ${line}`, text: `Every open ${colour(district.index)} square is in ${line} ${index + 1}, so that ${line}’s post is ${colour(district.index)}. The rest of the ${line} can be crossed.` };
        }
      }
      // a line whose open squares are all one district: the district's post is in that line
      for (const unit of units.filter((u) => u.kind === line)) {
        const district = regions[unit.cells[0]];
        if (!unit.cells.every((cell) => regions[cell] === district)) continue;
        const remove = all.filter((cell) => position.open[cell] && regions[cell] === district && lineOf[line](cell) !== unit.index);
        if (remove.length) {
          return { rule: 'confined', remove, because: unit.cells, brief: `${unit.name} would be left with only ${colour(district)} squares, which clears the rest of ${colour(district)}`, text: `Every open square in ${unit.name} is ${colour(district)}, so the ${colour(district)} post is in that ${line}. The rest of ${colour(district)} can be crossed.` };
        }
      }
    }
    // a square whose post would leave some unit with nowhere to put its own
    for (const unit of units) {
      const remove = all.filter((cell) => position.open[cell] && !unit.cells.includes(cell) && unit.cells.every((other) => blocks(cell, other)));
      if (remove.length) {
        return { rule: 'squeeze', remove, because: unit.cells, brief: `the squares that would crowd out ${unit.name} go too`, text: `A post here would rule out every open square of ${unit.name}, leaving it with nowhere to put its own.` };
      }
    }
    // a unit with one square left has its post there
    const single = units.find((unit) => unit.cells.length === 1);
    if (single) {
      return { rule: 'single', post: single.cells[0], because: [], text: `Only one square is left for ${single.name}. That is where its post goes.` };
    }
    if (depth < 2) return null;

    // groups: N districts that fit only in N lines take those lines' posts, and
    // N lines that hold only N districts hold those districts' posts
    for (let size = 2; size < n; size++) {
      for (const line of ['row', 'column']) {
        const lines = units.filter((u) => u.kind === line);
        if (lines.length <= size) continue;
        const span = (district) => { let mask = 0; for (const cell of district.cells) mask |= 1 << lineOf[line](cell); return mask; };
        const spans = districts.map(span);
        const waitingLines = lines.reduce((mask, u) => mask | (1 << u.index), 0);
        for (let mask = 1; mask < (1 << n); mask++) {
          if ((mask & waitingLines) !== mask) continue; // only lines still waiting
          let count = 0;
          for (let bits = mask; bits; bits &= bits - 1) count++;
          if (count !== size) continue;
          const inside = districts.filter((district, i) => (spans[i] & ~mask) === 0);
          const touching = districts.filter((district, i) => (spans[i] & mask) !== 0);
          const names = [];
          for (let i = 0; i < n; i++) if (mask & (1 << i)) names.push(i + 1);
          const these = `${line}s ${list(names)}`;
          if (inside.length > size) return { dead: `${list(inside.map((d) => colour(d.index)))} would all have to fit in ${these}` };
          if (touching.length < size) return { dead: `${these} would have too few districts to share` };
          if (inside.length === size) {
            const keep = new Set(inside.map((d) => d.index));
            const remove = all.filter((cell) => position.open[cell] && (mask & (1 << lineOf[line](cell))) && !keep.has(regions[cell]));
            if (remove.length) {
              return { rule: 'group', remove, because: inside.flatMap((d) => d.cells), brief: `the ${list(inside.map((d) => colour(d.index)))} districts would take ${these} between them`, text: `The ${list(inside.map((d) => colour(d.index)))} districts fit only in ${these}, so between them they take those ${line}s’ posts. The other squares there can be crossed.` };
            }
          }
          if (touching.length === size) {
            const keep = new Set(touching.map((d) => d.index));
            const remove = all.filter((cell) => position.open[cell] && keep.has(regions[cell]) && !(mask & (1 << lineOf[line](cell))));
            if (remove.length) {
              return { rule: 'group', remove, because: all.filter((cell) => position.open[cell] && (mask & (1 << lineOf[line](cell)))), brief: `${these} would be left to the ${list(touching.map((d) => colour(d.index)))} districts alone`, text: `${these[0].toUpperCase()}${these.slice(1)} hold only ${list(touching.map((d) => colour(d.index)))} squares, so those districts’ posts are there. The rest of those districts can be crossed.` };
            }
          }
        }
      }
    }
    return null;
  }

  // --- "Suppose a post went here" -----------------------------------------------------------
  // Follow the plain reasoning from that supposition. If something ends up with
  // nowhere for its post, the supposition was wrong. Returns the steps it took
  // to get there (in words), or null if nothing went wrong.
  function suppose(position, cell, depth, limit) {
    const trial = copy(position);
    place(trial, cell);
    const chain = [];
    for (let turn = 0; turn <= limit; turn++) {
      const next = step(trial, depth);
      if (!next) return null;
      if (next.dead) return { chain, dead: next.dead, unit: next.unit ?? null };
      if (turn === limit) return null;
      if (next.post !== undefined) {
        chain.push(`${unitName(...ownerOf(trial, next.post))}’s post would have to go in ${where(next.post)}`);
        place(trial, next.post);
      } else {
        chain.push(next.brief);
        for (const other of next.remove) trial.open[other] = 0;
      }
    }
    return null;
  }
  // the unit that a forced post belongs to: one down to its last square
  function ownerOf(position, cell) {
    const unit = waiting(position).find((u) => u.cells.length === 1 && u.cells[0] === cell);
    return unit ? [unit.kind, unit.index] : ['row', rowOf(cell)];
  }
  function trial(position) {
    // shortest explanation first: a few forced posts with the simple rules, then longer and deeper
    for (const [depth, limit] of [[1, 2], [1, 6], [2, 6], [2, n * n]]) {
      let best = null;
      for (const cell of all) {
        if (!position.open[cell]) continue;
        const found = suppose(position, cell, depth, limit);
        if (found && (!best || found.chain.length < best.found.chain.length)) best = { cell, found };
      }
      if (best) {
        const { cell, found } = best;
        const steps = found.chain.length > 3 ? [...found.chain.slice(0, 2), 'so it goes on, each step forcing the next'] : found.chain;
        const text = steps.length === 0
          ? `Suppose a post went here. Then ${found.dead}. So it cannot.`
          : `Suppose a post went here. Then ${steps.join('; then ')}; and ${found.dead}. So it cannot.`;
        // point at what would be left stranded: the squares it has open now
        const stranded = found.unit ? all.filter((other) => position.open[other] && other !== cell && unitOf[found.unit.kind](other) === found.unit.index) : [];
        return { rule: 'suppose', remove: [cell], because: stranded, text };
      }
    }
    return null;
  }

  // --- Reason forward until something is new to the player ----------------------------------
  const position = start();
  for (let turn = 0; turn < n * n * 2; turn++) {
    const next = step(position, 2) ?? trial(position);
    if (!next || next.dead) break;
    if (next.post !== undefined) {
      // a post the player has not opened yet is the hint; nothing further can be assumed past it
      return { kind: 'post', rule: next.rule, cells: [next.post], because: [], text: next.text };
    }
    for (const cell of next.remove) position.open[cell] = 0;
    const fresh = next.remove.filter((cell) => cells[cell] === EMPTY);
    if (fresh.length) {
      return { kind: 'cross', rule: next.rule, cells: fresh, because: next.because.filter((cell) => !fresh.includes(cell)), text: next.text };
    }
  }

  // --- A safety net, which the tests show is never reached -------------------------------------
  if (solution) {
    const uncrossed = all.filter((cell) => cells[cell] === EMPTY);
    const impossible = uncrossed.filter((cell) => solution[rowOf(cell)] !== colOf(cell));
    if (impossible.length) return { kind: 'cross', rule: 'fallback', cells: [impossible[0]], because: [], text: 'A post here cannot work, though the reason is a long one. It can be crossed.' };
    const next = uncrossed.find((cell) => solution[rowOf(cell)] === colOf(cell));
    if (next !== undefined) return { kind: 'post', rule: 'fallback', cells: [next], because: [], text: 'Everything else is crossed out. This square is a post.' };
  }
  return null;
}
