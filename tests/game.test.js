import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSS, EMPTY, LETTER, MISS, MAX_SIZE, MIN_SIZE,
  applyMove, canMove, countSolutions, phraseBoardSize, randomSize, tokenize, generatePuzzle, isLetterCell, newGame,
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

test('random board sizes cover every size and nothing else', () => {
  assert.equal(randomSize(() => 0), MIN_SIZE);
  assert.equal(randomSize(() => 0.999999), MAX_SIZE);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(randomSize());
  assert.deepEqual([...seen].sort(), [5, 6, 7, 8, 9]);
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

test('finding a letter crosses out its row, column, district and the squares touching it', () => {
  let s = start(6, 3);
  const cell = letterCells(s)[2];
  const row = Math.floor(cell / s.size);
  const col = cell % s.size;
  const miss = s.cells.findIndex((c, i) => !isLetterCell(s, i) && Math.floor(i / s.size) === row);
  s = play(s, 'guess', miss); // a wrong guess in the same row stays a wrong guess
  s = play(s, 'guess', cell);
  let expected = 0;
  s.cells.forEach((mark, i) => {
    const touches = Math.abs(Math.floor(i / s.size) - row) <= 1 && Math.abs((i % s.size) - col) <= 1;
    const shares = Math.floor(i / s.size) === row || i % s.size === col || s.regions[i] === s.regions[cell] || touches;
    if (i === cell) assert.equal(mark, LETTER);
    else if (i === miss) assert.equal(mark, MISS);
    else if (shares) { assert.equal(mark, CROSS, `square ${i} should be crossed`); expected++; }
    else assert.equal(mark, EMPTY, `square ${i} should be untouched`);
  });
  assert.equal(s.last.crossed, expected);
  assert.ok(expected >= 2 * (s.size - 1) - 1);
  // none of the automatic crosses landed on another letter
  for (const other of letterCells(s)) if (other !== cell) assert.equal(s.cells[other], EMPTY);
});

test('a letter away from the edge rules out all four diagonal neighbours', () => {
  // find a seed whose puzzle has a letter with four diagonal neighbours outside its row/column/district
  let s = start(7, 11);
  const cell = letterCells(s).find((c) => {
    const r = Math.floor(c / 7), col = c % 7;
    return r > 0 && r < 6 && col > 0 && col < 6;
  });
  s = play(s, 'guess', cell);
  for (const d of [-8, -6, 6, 8]) assert.equal(s.cells[cell + d], CROSS, `diagonal ${d}`);
});

test('one stroke can cross out or clear several squares as a single turn', () => {
  let s = start(6, 3);
  const free = s.cells.map((_, i) => i).filter((i) => !isLetterCell(s, i)).slice(0, 4);
  let r = applyMove(s, { player: 0, type: 'mark', cells: free.slice(0, 3) });
  assert.ok(r.ok, r.error);
  s = r.state;
  assert.deepEqual(free.map((c) => s.cells[c]), [CROSS, CROSS, CROSS, EMPTY]);
  assert.equal(s.moves, 1, 'a stroke is one turn');
  assert.deepEqual(s.last.cells, free.slice(0, 3));
  // a stroke over a mix skips squares already crossed, and repeats are ignored
  r = applyMove(s, { player: 1, type: 'mark', cells: [free[2], free[3], free[3]] });
  assert.ok(r.ok, r.error);
  s = r.state;
  assert.deepEqual(s.last.cells, [free[3]]);
  // clearing works the same way and skips squares with no cross
  r = applyMove(s, { player: 0, type: 'unmark', cells: [free[0], free[1], letterCells(s)[0]] });
  assert.ok(r.ok, r.error);
  s = r.state;
  assert.deepEqual(free.map((c) => s.cells[c]), [EMPTY, EMPTY, CROSS, CROSS]);
  // a stroke that changes nothing, leaves the board, or is empty is rejected
  assert.equal(applyMove(s, { player: 1, type: 'unmark', cells: [free[0]] }).ok, false);
  assert.equal(applyMove(s, { player: 1, type: 'mark', cells: [free[0], 999] }).ok, false);
  assert.equal(applyMove(s, { player: 1, type: 'mark', cells: [] }).ok, false);
  // guesses stay one square at a time
  assert.equal(applyMove(s, { player: 1, type: 'guess', cells: [free[0], free[1]] }).ok, false);
});

test('a crossed square can still be guessed', () => {
  let s = start();
  const cell = letterCells(s)[0];
  s = play(s, 'mark', cell);
  s = play(s, 'guess', cell);
  assert.equal(s.cells[cell], LETTER);
});

test('a solo player takes every turn', () => {
  let s = newGame({ size: 5, seed: 1, players: ['You'] });
  assert.equal(canMove(s, 0), true);
  s = play(s, 'mark', emptyNonLetter(s), 0);
  assert.equal(canMove(s, 0), true, 'no waiting for anyone else');
  s = play(s, 'guess', emptyNonLetter(s), 0);
  assert.equal(s.hearts, 2);
  for (const cell of letterCells(s)) s = play(s, 'guess', cell, 0);
  assert.equal(s.status, 'won');
  assert.equal(canMove(s, 0), false, 'the game is over');
});

test('a time trial has no turns, and a phrase author sits out', () => {
  const trial = { ...start(5, 1), free: true };
  let s = play(trial, 'mark', emptyNonLetter(trial), 0);
  assert.equal(canMove(s, 0), true, 'same player again in a time trial');
  s = play(s, 'mark', emptyNonLetter(s), 0);
  assert.equal(s.moves, 2);

  // Ada wrote the phrase: Bo, the only solver, plays every turn
  const phrase = { ...start(5, 1), author: 0 };
  assert.equal(canMove(phrase, 0), false);
  assert.equal(applyMove(phrase, { player: 0, type: 'mark', cell: emptyNonLetter(phrase) }).ok, false);
  s = play(phrase, 'mark', emptyNonLetter(phrase), 1);
  assert.equal(canMove(s, 1), true);
  s = play(s, 'mark', emptyNonLetter(s), 1);

  // with two solvers, turns alternate between them and still skip the author
  const three = { ...newGame({ size: 5, seed: 1, players: ['Ada', 'Bo', 'Cy'] }), author: 0 };
  s = play(three, 'mark', emptyNonLetter(three), 1);
  assert.deepEqual([0, 1, 2].map((p) => canMove(s, p)), [false, false, true]);
});

test('players who have left no longer count towards turn-taking', () => {
  // Ada, Bo and Cy; Bo has left. Ada and Cy alternate; Bo cannot move.
  const three = { ...newGame({ size: 5, seed: 1, players: ['Ada', 'Bo', 'Cy'] }), absent: [1] };
  assert.deepEqual([0, 1, 2].map((p) => canMove(three, p)), [true, false, true]);
  let s = play(three, 'mark', emptyNonLetter(three), 0);
  assert.deepEqual([0, 1, 2].map((p) => canMove(s, p)), [false, false, true]);
  // Cy leaves as well: Ada is alone and may move again straight away
  s = { ...s, absent: [1, 2] };
  assert.equal(canMove(s, 0), true);
  s = play(s, 'mark', emptyNonLetter(s), 0);
  assert.equal(s.moves, 2);
});

const show = (tokens) => tokens.map((x) => x.t + (x.gap ? ' ' : '|')).join('');

test('a phrase always becomes exactly one token per board letter', () => {
  // as many words as letters: tokens are the words
  assert.equal(show(tokenize('meet me by the fountain', 5)), 'meet me by the fountain|');
  // too few words: the longest tokens are split in half until there are enough
  assert.equal(show(tokenize('meet me', 5)), 'm|e|e|t me|');
  assert.equal(show(tokenize('kindness costs nothing', 5)), 'kind|ness costs noth|ing|');
  assert.equal(show(tokenize('Hello, dear friend!', 5)), 'Hel|lo, dear fri|end!|');
  // too many words: the shortest neighbours are joined
  assert.equal(show(tokenize('a b c d e f', 5)), 'a b c d e f|');
  assert.equal(tokenize('one two three four five six seven eight nine ten eleven', 9).length, 9);
  for (const phrase of ['wish you were here', 'a penny for your thoughts', 'good things come to those who wait', 'hi mum']) {
    for (let n = 5; n <= 9; n++) {
      const tokens = tokenize(phrase, n);
      if (phrase.replace(/[^a-z]/g, '').length >= n) assert.equal(tokens.length, n, `${phrase} into ${n}`);
      // put back together, the tokens are the phrase
      assert.equal(tokens.map((x) => x.t + (x.gap ? ' ' : '')).join(''), phrase);
      assert.ok(tokens.every((x) => /[a-z0-9]/i.test(x.t)), 'every token has something to hide');
      assert.equal(tokens[tokens.length - 1].gap, false);
    }
  }
  // fewer letters than board letters: as many tokens as there are letters, no more
  assert.equal(tokenize('hi', 5).length, 2);
  assert.deepEqual(tokenize('   ', 5), []);
  assert.equal(phraseBoardSize('meet me'), 5);
  assert.equal(phraseBoardSize('a b c d e f g'), 7);
  assert.equal(phraseBoardSize('one two three four five six seven eight nine ten eleven'), 9);
});

test('newGame validates players and size', () => {
  assert.throws(() => newGame({ size: 6, seed: 1, players: [] }));
  assert.throws(() => newGame({ size: 6, seed: 1, players: ['a', 'b', 'c', 'd', 'e'] }));
  assert.throws(() => newGame({ size: 4, seed: 1, players: ['a', 'b'] }));
});
