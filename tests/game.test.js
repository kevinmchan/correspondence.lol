import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSS, EMPTY, LETTER, MISS, MAX_SIZE, MIN_SIZE,
  applyMove, canMove, countSolutions, generatePuzzle, isLetterCell, newGame,
} from '../postmarks/game.js';

const start = (size = 5, seed = 1) => newGame({ size, seed, players: ['Ada', 'Bo'] });
const letterCells = (s) => s.solution.map((col, row) => row * s.size + col);
const emptyNonLetter = (s) => s.cells.findIndex((c, i) => c === EMPTY && !isLetterCell(s, i));
// The player who would move next if everyone simply took turns in order.
const next = (s) => (s.last ? (s.last.player + 1) % s.players.length : 0);
const play = (s, type, cell, player = next(s)) => {
  const result = applyMove(s, { player, type, cell });
  assert.ok(result.ok, result.error);
  return result.state;
};

test('generated puzzles are valid and have exactly one solution', () => {
  for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
    for (let seed = 1; seed <= 15; seed++) {
      const { regions, solution } = generatePuzzle(size, seed);
      assert.equal(countSolutions(size, regions, 2), 1, `size ${size} seed ${seed}`);
      assert.equal(new Set(solution).size, size, 'one letter per column');
      for (let id = 0; id < size; id++) assert.ok(regions.filter((r) => r === id).length >= 2, 'no one-square districts');
      assert.equal(new Set(solution.map((c, r) => regions[r * size + c])).size, size, 'one per district');
      for (let r = 1; r < size; r++) assert.ok(Math.abs(solution[r] - solution[r - 1]) > 1, 'no touching');
      // every district is one orthogonally connected piece
      for (let id = 0; id < size; id++) {
        const cells = regions.flatMap((r, i) => (r === id ? [i] : []));
        const seen = new Set([cells[0]]);
        const queue = [cells[0]];
        while (queue.length) {
          const cell = queue.pop();
          const next = [cell - size, cell + size];
          if (cell % size > 0) next.push(cell - 1);
          if (cell % size < size - 1) next.push(cell + 1);
          for (const n of next) {
            if (regions[n] === id && !seen.has(n)) { seen.add(n); queue.push(n); }
          }
        }
        assert.equal(seen.size, cells.length, `district ${id} connected (size ${size} seed ${seed})`);
      }
    }
  }
});

test('the same seed gives the same puzzle', () => {
  assert.deepEqual(generatePuzzle(7, 42), generatePuzzle(7, 42));
  assert.notDeepEqual(generatePuzzle(7, 42).regions, generatePuzzle(7, 43).regions);
});

test('a turn is one action, and the last mover cannot go again', () => {
  let s = start();
  const cell = emptyNonLetter(s);
  s = play(s, 'mark', cell, 0);
  assert.equal(s.cells[cell], CROSS);
  assert.equal(s.last.player, 0);
  assert.equal(applyMove(s, { player: 0, type: 'unmark', cell }).ok, false, 'Ada cannot move twice running');
  s = play(s, 'unmark', cell, 1);
  assert.equal(s.cells[cell], EMPTY);
  assert.equal(s.moves, 2);
  assert.equal(canMove(s, 0), true);
  assert.equal(canMove(s, 1), false);
});

test('anyone may open the game, and with three players any other player may follow', () => {
  const fresh = newGame({ size: 5, seed: 1, players: ['Ada', 'Bo', 'Cy'] });
  for (const player of [0, 1, 2]) assert.equal(canMove(fresh, player), true);
  let s = play(fresh, 'mark', emptyNonLetter(fresh), 2);
  assert.deepEqual([0, 1, 2].map((p) => canMove(s, p)), [true, true, false]);
  s = play(s, 'mark', emptyNonLetter(s), 0);
  s = play(s, 'mark', emptyNonLetter(s), 2); // Cy again, having skipped Bo
  assert.deepEqual([0, 1, 2].map((p) => canMove(s, p)), [true, true, false]);
});

test('moves by unknown players or on the wrong kind of square are rejected', () => {
  const s = start();
  const cell = emptyNonLetter(s);
  assert.equal(applyMove(s, { player: 2, type: 'mark', cell }).ok, false);
  assert.equal(applyMove(s, { player: -1, type: 'mark', cell }).ok, false);
  assert.equal(applyMove(s, { player: 0, type: 'unmark', cell }).ok, false);
  assert.equal(applyMove(s, { player: 0, type: 'mark', cell: 999 }).ok, false);
  assert.equal(applyMove(s, { player: 0, type: 'dance', cell }).ok, false);
  const marked = play(s, 'mark', cell);
  assert.equal(applyMove(marked, { player: 1, type: 'mark', cell }).ok, false);
});

test('applyMove does not mutate the state it is given', () => {
  const s = start();
  const snapshot = JSON.stringify(s);
  applyMove(s, { player: 0, type: 'guess', cell: emptyNonLetter(s) });
  assert.equal(JSON.stringify(s), snapshot);
});

test('finding every letter wins', () => {
  let s = start();
  for (const cell of letterCells(s)) s = play(s, 'guess', cell);
  assert.equal(s.status, 'won');
  assert.equal(s.hearts, 3);
  assert.equal(applyMove(s, { player: next(s), type: 'mark', cell: emptyNonLetter(s) }).ok, false);
});

test('wrong guesses cost hearts, are permanent, and three lose the game', () => {
  let s = start();
  const first = emptyNonLetter(s);
  s = play(s, 'guess', first);
  assert.equal(s.cells[first], MISS);
  assert.equal(s.hearts, 2);
  assert.equal(s.last.correct, false);
  assert.equal(applyMove(s, { player: next(s), type: 'unmark', cell: first }).ok, false);
  assert.equal(applyMove(s, { player: next(s), type: 'guess', cell: first }).ok, false);
  s = play(s, 'guess', emptyNonLetter(s));
  s = play(s, 'guess', emptyNonLetter(s));
  assert.equal(s.hearts, 0);
  assert.equal(s.status, 'lost');
});

test('a crossed square can still be guessed', () => {
  let s = start();
  const cell = letterCells(s)[0];
  s = play(s, 'mark', cell);
  s = play(s, 'guess', cell);
  assert.equal(s.cells[cell], LETTER);
});

test('newGame validates players and size', () => {
  assert.throws(() => newGame({ size: 6, seed: 1, players: ['Solo'] }));
  assert.throws(() => newGame({ size: 6, seed: 1, players: ['a', 'b', 'c', 'd', 'e'] }));
  assert.throws(() => newGame({ size: 4, seed: 1, players: ['a', 'b'] }));
});
