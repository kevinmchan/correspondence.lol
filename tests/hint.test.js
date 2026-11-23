import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROSS, EMPTY, LETTER, generatePuzzle, solve } from '../postmarks/game.js';
import { findHint } from '../postmarks/hint.js';

const blank = (puzzle) => ({ size: puzzle.size, regions: puzzle.regions, cells: new Array(puzzle.size ** 2).fill(EMPTY) });
const isPost = (puzzle, cell) => puzzle.solution[Math.floor(cell / puzzle.size)] === cell % puzzle.size;

test('solve finds the puzzle’s own solution', () => {
  const puzzle = generatePuzzle(7, 42);
  assert.deepEqual(solve(7, puzzle.regions), [...puzzle.solution]);
});

// Follow the hints from an empty board to the end, on several puzzles: every
// cross it suggests must be right, it must always have something to say, and
// it must get there.
test('following the hints solves the puzzle without ever crossing a post', () => {
  for (const [size, seed] of [[5, 1], [6, 7], [7, 3], [8, 11], [9, 5]]) {
    const puzzle = generatePuzzle(size, seed);
    const state = blank(puzzle);
    for (let turn = 0; turn < size * size * 2; turn++) {
      const hint = findHint(state);
      if (!hint) break;
      assert.ok(hint.cells.length > 0, 'a hint points at something');
      assert.ok(hint.text.length > 10, 'and says why');
      if (hint.kind === 'cross') {
        for (const cell of hint.cells) {
          assert.equal(state.cells[cell], EMPTY, 'only squares not yet marked');
          assert.ok(!isPost(puzzle, cell), `size ${size} seed ${seed}: told to cross a post (${hint.text})`);
          state.cells[cell] = CROSS;
        }
      } else {
        assert.equal(hint.kind, 'post');
        assert.ok(isPost(puzzle, hint.cells[0]), `size ${size} seed ${seed}: called a post where there is none`);
        state.cells[hint.cells[0]] = LETTER;
      }
    }
    assert.equal(state.cells.filter((mark) => mark === LETTER).length, size, `size ${size} seed ${seed}: finished`);
    assert.equal(findHint(state), null, 'nothing more to say once solved');
  }
});

test('a cross on a post is the first thing pointed out', () => {
  const puzzle = generatePuzzle(6, 9);
  const state = blank(puzzle);
  const post = puzzle.solution[2] + 2 * 6;
  state.cells[post] = CROSS;
  const hint = findHint(state);
  assert.equal(hint.kind, 'uncross');
  assert.deepEqual(hint.cells, [post]);
});

test('hints do not lean on the player’s own crosses', () => {
  // crossing a harmless square must not change what is true about the others
  const puzzle = generatePuzzle(7, 21);
  const state = blank(puzzle);
  const harmless = [...state.cells.keys()].find((cell) => !isPost(puzzle, cell));
  state.cells[harmless] = CROSS;
  const hint = findHint(state);
  for (const cell of hint.cells) if (hint.kind === 'cross') assert.ok(!isPost(puzzle, cell));
});
