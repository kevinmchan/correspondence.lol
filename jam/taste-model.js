// What the reading of Penny's Radio (jam/taste.js) reports, the taste test: what is measured about a loop, the
// model of what you like, and the test of whether that model can really tell.
//
// THE EXPERIMENT. Two loops at a time. You pick the one you prefer; it stays,
// and a new challenger takes the other's place. Every pick is one label. A
// loop that wins five times running retires undefeated, and two new loops
// start again.
//
// THE MODEL. A loop is turned into fifteen numbers (how fast, how busy each
// instrument is, how high the tune sits, how much it leaps, and so on). The
// model is a logistic regression on the difference between the two loops'
// numbers: a weight for each, learnt from your picks, saying how much more
// likely you are to pick the loop that has more of it. Three more terms soak
// up habits that have nothing to do with the music: a leaning towards one
// side of the card, towards the loop already reigning, and towards whichever
// was heard first.
//
// THE TEST. "The model predicts my picks" is easy to fool oneself about.
// Whoever always keeps the reigning loop is perfectly predictable, and has
// shown no taste at all. So the test is built on a coin the experiment itself
// tosses. Each time a challenger is needed, TWO are made, in exactly the same
// way, and one is thrown away unheard: the phantom. Before you choose, the
// model says how likely your pick is with the real challenger, and how likely
// it would be had the phantom been there instead. If the music makes no
// difference to what you pick, the real challenger is no better a guide to
// your pick than the phantom was: which of the two predictions gives your
// actual pick the higher chance is a fair coin, whatever your habits, your
// mood or the hour. If the model has caught something true about your taste,
// the real one wins more than half the time.
//
// That coin is bet on. A stake starts at 1, and each time a share of it rides
// on the real challenger: more the further apart the two predictions are, up
// to two fifths. Against a fair coin such a stake grows to twenty times its
// size less than one time in twenty, however long one plays and whenever one
// stops to look (Ville's inequality). So the stake reaching 20 is
// significance at the 5% level, and looking at it after every pick costs
// nothing: there is no number of labels to fix in advance.
//
// In simulation (tests/taste.test.js) someone with a marked taste is found out
// in about 160 picks, someone with a mild one in about 400, and someone with
// none, however strong their habits, about as often as the 1 in 20 allows.

import { ROWS, STEPS } from './beat.js';
import { mutate, randomBeat } from './make.js';

const BELLS = 0;
const KEYS = 1;
const BASS = 2;
const DRUMS = 3;

// What is measured about a loop. Each is between 0 and 1. `more` and `less`
// are how a liking for it, or against it, is put into words.
export const FEATURES = [
  { key: 'tempo', more: 'a faster tempo', less: 'a slower tempo' },
  { key: 'bells', more: 'plenty of bells', less: 'few bells' },
  { key: 'keys', more: 'plenty of keys', less: 'few keys' },
  { key: 'bass', more: 'a busy bass', less: 'a sparse bass' },
  { key: 'kick', more: 'more kick drum', less: 'less kick drum' },
  { key: 'snare', more: 'more snare and clap', less: 'less snare and clap' },
  { key: 'hats', more: 'busy hats', less: 'sparse hats' },
  { key: 'offbeat', more: 'notes off the beat', less: 'notes on the beat' },
  { key: 'bellsHigh', more: 'a high tune', less: 'a low tune' },
  { key: 'leaps', more: 'a tune that leaps', less: 'a tune that moves by step' },
  { key: 'root', more: 'a bass that stays on the root', less: 'a bass that wanders' },
  { key: 'thick', more: 'a lot happening at once', less: 'a thin texture' },
  { key: 'space', more: 'silences', less: 'something on every step' },
  { key: 'keysHigh', more: 'high keys', less: 'low keys' },
  { key: 'drums', more: 'drums', less: 'no drums' },
];
const D = FEATURES.length;
const NUISANCE = 3; // the side of the card, the reigning loop, the one heard first
const SCALE = 4; // differences between loops are small numbers: this puts a weight of 1 at "it matters"

const stepOf = (tile) => Math.floor(tile / ROWS);
const rowOf = (tile) => tile % ROWS;
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const heightOf = (tiles) => (tiles.length ? mean(tiles.map((tile) => (ROWS - 1 - rowOf(tile)) / (ROWS - 1))) : 0.5);

export function features(beat) {
  const [bells, keys, bass, drums] = [BELLS, KEYS, BASS, DRUMS].map((index) => beat.notes[index] ?? []);
  const tuned = [...bells, ...keys, ...bass];
  const perStep = Array.from({ length: STEPS }, () => 0);
  for (const tiles of beat.notes) for (const tile of tiles) perStep[stepOf(tile)] += 1;
  // the tune, in the order it is played: the highest bell of each step that has one
  const tune = [];
  for (let step = 0; step < STEPS; step++) {
    const here = bells.filter((tile) => stepOf(tile) === step).map(rowOf);
    if (here.length) tune.push(Math.min(...here));
  }
  const leaps = tune.slice(1).map((row, i) => Math.abs(row - tune[i]) / (ROWS - 1));
  const count = (rows) => drums.filter((tile) => rows.includes(rowOf(tile))).length;
  return [
    beat.tempo / 3,
    Math.min(1, bells.length / STEPS),
    Math.min(1, keys.length / STEPS),
    Math.min(1, bass.length / STEPS),
    Math.min(1, count([5, 6]) / 4),
    Math.min(1, count([3, 4]) / 4),
    Math.min(1, count([0, 1, 2]) / STEPS),
    tuned.length ? tuned.filter((tile) => stepOf(tile) % 2 === 1).length / tuned.length : 0,
    heightOf(bells),
    mean(leaps),
    bass.length ? bass.filter((tile) => rowOf(tile) === ROWS - 1).length / bass.length : 0.5,
    perStep.filter((n) => n >= 3).length / STEPS,
    perStep.filter((n) => n === 0).length / STEPS,
    heightOf(keys),
    drums.length ? 1 : 0,
  ];
}

// One pair, as the model sees it: the front loop's numbers less the back
// loop's, and then the three habits. reigning and first are 'front', 'back' or null.
const signed = (side) => (side === 'front' ? 1 : side === 'back' ? -1 : 0);
export function pairVector(front, back, reigning, first) {
  const f = features(front);
  const b = features(back);
  return [...f.map((value, i) => (value - b[i]) * SCALE), 1, signed(reigning), signed(first)];
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const chance = (weights, x) => sigmoid(x.reduce((sum, value, i) => sum + value * weights[i], 0));

// Solve A x = b (A symmetric, positive definite here), by elimination.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[best][col])) best = row;
    [M[col], M[best]] = [M[best], M[col]];
    for (let row = col + 1; row < n; row++) {
      const by = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= by * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let k = row + 1; k < n; k++) sum -= M[row][k] * x[k];
    x[row] = sum / M[row][row];
  }
  return x;
}

// Learn the weights from the picks so far: rows are [x, y], y 1 where the front
// loop was picked. `music: false` learns the habits alone, with nothing about
// the loops themselves. Starts from `from`, the weights as they last were.
export function fit(rows, { music = true, from = null, rounds = 4 } = {}) {
  const size = D + NUISANCE;
  const penalty = Array.from({ length: size }, (_, i) => (i < D ? 6 : 0.05)); // pulled gently towards "it makes no difference"
  let w = from && from.length === size ? [...from] : new Array(size).fill(0);
  if (!music) w = w.map((value, i) => (i < D ? 0 : value));
  const use = Array.from({ length: size }, (_, i) => i).filter((i) => music || i >= D);
  for (let round = 0; round < rounds; round++) {
    const gradient = use.map((i) => -penalty[i] * w[i]);
    const hessian = use.map((i, a) => use.map((j, b) => (a === b ? penalty[i] : 0)));
    for (const [x, y] of rows) {
      const p = chance(w, x);
      const spread = Math.max(p * (1 - p), 1e-4);
      for (let a = 0; a < use.length; a++) {
        const xa = x[use[a]];
        if (xa === 0) continue;
        gradient[a] += (y - p) * xa;
        for (let b = 0; b < use.length; b++) hessian[a][b] += spread * xa * x[use[b]];
      }
    }
    const step = solve(hessian, gradient);
    use.forEach((i, a) => { w[i] += Math.max(-2, Math.min(2, step[a])); });
  }
  return w;
}

// --- The experiment, one pick at a time ----------------------------------------------------
export const WARMUP = 10; // picks before the model's word is worth betting on
export const BET = 0.4; // the most of the stake that rides on one pick
export const NEEDED = 20; // the stake at which it is significant: 1 in 20
export const REIGN = 5; // wins in a row after which a loop retires, undefeated
const other = (side) => (side === 'front' ? 'back' : 'front');
// A challenger for the reigning loop: more often something new, sometimes the
// reigning loop changed a little. (It was once mostly the second, the more so
// the longer a loop had reigned, as the harder test of a favourite. To listen
// to, that was the same thing over and over.) How it is drawn never depends on
// the pick to come, and the phantom is drawn the same way.
const draw = (reigning, random) => (random() < 0.4 ? mutate(reigning, random) : randomBeat(random));

// A new pair. With a reigning loop on `reigningSide`, the other side gets a
// challenger; with none (the very start) both are new, and the back one is
// counted as the challenger. A phantom is made beside the challenger, and
// (once there have been enough picks) the model is put on record.
function pair(state, front, back, reigningSide, random) {
  const challengerSide = reigningSide ? other(reigningSide) : 'back';
  const reigning = reigningSide ? (reigningSide === 'front' ? front : back) : null;
  const phantom = reigning ? draw(reigning, random) : randomBeat(random);
  const first = random() < 0.5 ? 'front' : 'back';
  const current = { front, back, phantom, challengerSide, reigning: reigningSide, first, p: null, q: null, pPhantom: null };
  if (state.trials.length >= WARMUP) {
    current.p = chance(state.weights, pairVector(front, back, reigningSide, first));
    current.q = chance(state.habits, pairVector(front, back, reigningSide, first));
    const [pf, pb] = challengerSide === 'front' ? [phantom, back] : [front, phantom];
    current.pPhantom = chance(state.weights, pairVector(pf, pb, reigningSide, first));
  }
  return current;
}

export function begin(random = Math.random) {
  const state = { trials: [], weights: null, habits: null, streak: 0, retired: [], current: null };
  state.current = pair(state, randomBeat(random), randomBeat(random), null, random);
  return state;
}

// A pick: 'front' or 'back'. It is written down with what the model had said,
// the model learns from it, and the loser's place is taken by a new challenger.
export function choose(state, pick, random = Math.random, note = {}) {
  const was = state.current;
  state.trials.push({ ...was, pick, ...note });
  state.streak = was.reigning === pick ? state.streak + 1 : 1;
  const rows = state.trials.map((trial) => [pairVector(trial.front, trial.back, trial.reigning, trial.first), trial.pick === 'front' ? 1 : 0]);
  state.weights = fit(rows, { from: state.weights });
  state.habits = fit(rows, { music: false, from: state.habits });
  const winner = was[pick];
  if (state.streak >= REIGN) {
    // It has won as often as a loop may. It retires, undefeated, and two new
    // loops start again: so that no early favourite sits there for ever,
    // winning picks that teach nothing.
    state.trials[state.trials.length - 1].retired = true;
    (state.retired ??= []).push(winner);
    state.streak = 0;
    state.current = pair(state, randomBeat(random), randomBeat(random), null, random);
    return state;
  }
  const challenger = draw(winner, random);
  state.current = pick === 'front' ? pair(state, winner, challenger, 'front', random) : pair(state, challenger, winner, 'back', random);
  return state;
}

// Where the experiment stands.
//   picks: labels so far. called/right: picks the model called in advance,
//   and how many it got right; habitsRight: the same for the habits alone.
//   bets/won: tosses of the phantom's coin, and how many went the model's way.
//   stake: the stake now; peak: the most it has been; p: the chance of a peak
//   that high were the music making no difference; significant: peak >= 20.
export function standing(trials) {
  const out = { picks: trials.length, called: 0, right: 0, habitsRight: 0, bets: 0, won: 0, stake: 1, peak: 1, reachedAt: null };
  for (const trial of trials) {
    if (trial.p === null || trial.p === undefined) continue;
    const front = trial.pick === 'front';
    if (trial.p !== 0.5) {
      out.called += 1;
      if ((trial.p > 0.5) === front) out.right += 1;
      if ((trial.q >= 0.5) === front) out.habitsRight += 1;
    }
    const real = front ? trial.p : 1 - trial.p;
    const phantom = front ? trial.pPhantom : 1 - trial.pPhantom;
    if (real === phantom) continue; // no difference between them: no bet
    out.bets += 1;
    if (real > phantom) out.won += 1;
    const share = Math.min(BET, Math.abs(real - phantom)); // (the same whichever of the two is the real one: so the game stays fair)
    out.stake *= real > phantom ? 1 + share : 1 - share;
    out.peak = Math.max(out.peak, out.stake);
    if (out.reachedAt === null && out.peak >= NEEDED) out.reachedAt = trials.indexOf(trial) + 1; // the pick at which it became significant
  }
  out.p = Math.min(1, 1 / out.peak);
  out.significant = out.peak >= NEEDED;
  return out;
}

// What the model has learnt, in words: the strongest leanings, most marked first.
export function leanings(weights, most = 4) {
  if (!weights) return [];
  return FEATURES.map((feature, i) => ({ weight: weights[i], words: weights[i] > 0 ? feature.more : feature.less }))
    .filter((one) => Math.abs(one.weight) > 0.15)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, most);
}
