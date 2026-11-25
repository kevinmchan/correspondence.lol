// What the meter on Penny's Radio shows and its reading reports (jam/taste.js), the taste test: what is
// measured about a loop, the model of what you like, and the test of whether that model can really tell.
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
// shown no taste at all. So the test is built on a lottery the experiment
// itself holds. Each time a challenger is needed, NINE are made, in exactly
// the same way (the same call, fresh randomness), and eight are thrown away
// unheard: the phantoms. Before you choose, the model says how likely your
// pick would be with the real challenger, and with each phantom in its place,
// all with the same weights, the same loop reigning and the same coin for
// which is heard first. If the music makes no difference to what you pick,
// the real challenger is no better a guide to your pick than any phantom: it
// is one of nine made alike, as likely to be any of them, whatever your
// habits, your mood or the hour. If the model has caught something true about
// your taste, the real one gives your actual pick a higher chance than the
// phantoms do, more often than not.
//
// That is bet on. A stake starts at 1, and each pick it is multiplied by
//   0.1 + 0.9 × 9r / (r + f1 + ... + f8),
// r the chance the model gave your actual pick with the real challenger, and
// f1..f8 with each phantom: nine tenths of it ride on how much likelier the
// pick was with the real one than with the nine on average (a likelihood
// ratio), and a tenth is held back, so that one confident mistake never takes
// it all. Were the real one any of the nine, that ratio would be 1 on
// average, exactly, whatever r and the f's are and however the model came by
// them (it learns from everything, habits and all): a fair bet. Against a fair
// bet such a stake grows to twenty times its size less than one time in
// twenty, however long one plays and whenever one stops to look (Ville's
// inequality). So the stake reaching 20 is significance at the 5% level, and
// looking at it after every pick costs nothing: there is no number of labels
// to fix in advance. That is why the meter on the radio can be looked at all
// the time, and why it can move only after a pick: it is worked out from
// picks already made, and never from the model's call on the pair that is up.
//
// Starting over carries the stake on (standing(trials, carried, restarts),
// startOver()): the product of one experiment's stake and the next is still a
// fair bet. Without that, someone with no taste who started over whenever the
// stake sagged would reach 20 about one time in five or more. And so the
// carried stakes are one test, and its reaching 20 at any point of it, in any
// experiment, is the event Ville's inequality bounds: once reached, it has been
// reached, whatever the stake is carried at afterwards (the owner, 25 November
// 2026). The restarts' record of each experiment's peak gives it.
//
// Each pick keeps the rule it was made under, fixed when its pair came up,
// before it was made. Before v1.1.60 (25 November 2026) there was one phantom,
// and a share of the stake, as far as two fifths, rode on which of the two
// predictions gave the pick the higher chance: those picks, which have no
// `pPhantoms`, are worked out as they always were, to the last digit, so the
// stake and the peak anybody had then are what they have now, and the stake
// carries on from there. (A fair bet, then another, is still a fair bet.)
//
// These three (eight phantoms, the carry, and the halving steps in fit()) were
// decided by simulation alone, before anybody's real picks were looked at (24
// November 2026, README), and are not to be tuned on real picks. In that
// simulation a marked taste reaches 20 in about 51 picks (87 with one
// phantom), a mild one in about 87 (148), and someone with none, however
// strong their habits, no more often than the 1 in 20 allows.

import { ROWS, STEPS, encode } from './beat.js';
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
  // what the fit climbs: how likely the picks are under w, less the pull towards "no difference"
  const softplus = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
  const value = (weights) => {
    let sum = 0;
    for (const [x, y] of rows) {
      const z = x.reduce((s, v, i) => s + v * weights[i], 0);
      sum -= softplus(y ? -z : z);
    }
    for (const i of use) sum -= 0.5 * penalty[i] * weights[i] * weights[i];
    return sum;
  };
  let now = value(w);
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
    // A whole step can overshoot. Clamped, it could then swing for ever between two wrong answers, the
    // same two after every pick (it did, early on, in up to one run in fourteen, and that model never
    // learnt). So the step is halved until the fit is no worse than it was: the fit only ever climbs.
    for (let k = 0; k < 12; k++) {
      const next = [...w];
      use.forEach((i, a) => { next[i] += 2 ** -k * Math.max(-2, Math.min(2, step[a])); });
      const v = value(next);
      if (v >= now) {
        w = next;
        now = v;
        break;
      }
    }
  }
  return w;
}

// --- The experiment, one pick at a time ----------------------------------------------------
export const WARMUP = 10; // picks before the model's word is worth betting on
export const PHANTOMS = 8; // challengers made beside the real one, in the same way, and never heard
export const BET = 0.9; // how much of the stake rides on each pick (the tenth left is held back)
export const NEEDED = 20; // the stake at which it is significant: 1 in 20
export const REIGN = 5; // wins in a row after which a loop retires, undefeated
// (Picks made before there were eight phantoms, which have one, kept their own bet: the most of the
// stake that rode on one of them. See standing().)
export const ONE_PHANTOM = 0.4;
const other = (side) => (side === 'front' ? 'back' : 'front');
// A challenger for the reigning loop: more often something new, sometimes the
// reigning loop changed a little. (It was once mostly the second, the more so
// the longer a loop had reigned, as the harder test of a favourite. To listen
// to, that was the same thing over and over.) How it is drawn never depends on
// the pick to come, and the phantoms are drawn the same way.
const draw = (reigning, random) => (random() < 0.4 ? mutate(reigning, random) : randomBeat(random));

// A new pair. With a reigning loop on `reigningSide`, the other side gets a
// challenger; with none (the very start) both are new, and the back one is
// counted as the challenger. Eight phantoms are made beside the challenger,
// each as it was made, and (once there have been enough picks) the model is
// put on record: p with the real pair, pPhantoms with each phantom in the
// challenger's place, all with the same weights, the same loop reigning and
// the same coin for which is heard first; and q, the habits alone. (`phantom`
// and `pPhantom` are the first of them, under the names they always had.)
function pair(state, front, back, reigningSide, random) {
  const challengerSide = reigningSide ? other(reigningSide) : 'back';
  const reigning = reigningSide ? (reigningSide === 'front' ? front : back) : null;
  const phantoms = Array.from({ length: PHANTOMS }, () => (reigning ? draw(reigning, random) : randomBeat(random)));
  const first = random() < 0.5 ? 'front' : 'back';
  const current = { front, back, phantom: phantoms[0], challengerSide, reigning: reigningSide, first, p: null, q: null, pPhantom: null, pPhantoms: null };
  if (state.trials.length >= WARMUP) {
    current.p = chance(state.weights, pairVector(front, back, reigningSide, first));
    current.q = chance(state.habits, pairVector(front, back, reigningSide, first));
    current.pPhantoms = phantoms.map((phantom) => {
      const [pf, pb] = challengerSide === 'front' ? [phantom, back] : [front, phantom];
      return chance(state.weights, pairVector(pf, pb, reigningSide, first));
    });
    current.pPhantom = current.pPhantoms[0];
  }
  return current;
}

// A new experiment. `carried`: the stake the one before it was left at (see
// startOver()); `restarts`: each time it has been started over, for the record;
// `looked`: each time the model was looked at (the reading opened, the data
// copied out), for the record too, so that picks made after looking at it can
// be told from picks made without.
export function begin(random = Math.random, { carried = 1, restarts = [], looked = [] } = {}) {
  const state = { trials: [], weights: null, habits: null, streak: 0, retired: [], current: null, carried, restarts, looked };
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

// Starting over: the picks, the model and the presets go, and a new experiment
// begins, warming up again; but the stake carries on from where it stood, so
// that starting over never wipes out a loss. That it was started over is
// written down (`note` adds to it: when, and the app's version), so that it is
// never invisible in the data: after: the picks of the experiment that was
// started over; carried: the stake carried on; peak: the most it had been in
// that experiment; reachedAt: the pick of it at which it reached 20, as
// standing() has it (null: it did not; 0: it had been reached before);
// voided: the pair that was up, thrown away unpicked, with what the model had
// said of it (no longer up, so nothing is given away by keeping it) and
// whether it was bet on (`note.voided` adds to it: which side was tuned in,
// and how long each had been heard). Throwing away a pair that is bet on is a
// way to dodge a loss, if it is done when the pick looks like a losing one:
// the record lets whoever studies the data see whether it was.
export function startOver(state, random = Math.random, { voided: seen = {}, ...note } = {}) {
  const now = standing(state.trials, state.carried ?? 1, state.restarts ?? []);
  const up = state.current;
  const voided = up ? {
    front: encode(up.front), back: encode(up.back), phantom: up.phantom ? encode(up.phantom) : null,
    challengerSide: up.challengerSide, reigning: up.reigning, first: up.first,
    p: up.p, q: up.q, pPhantom: up.pPhantom, pPhantoms: up.pPhantoms, bet: Array.isArray(up.pPhantoms), ...seen,
  } : null;
  const restarts = [...(state.restarts ?? []), { after: state.trials.length, carried: now.stake, peak: now.peak, reachedAt: now.reachedAt, voided, ...note }];
  return begin(random, { carried: now.stake, restarts, looked: state.looked ?? [] });
}

// What one pick does to the stake, as [factor, won], or null if nothing rode
// on it, by the rule it was made under, which its record shows.
//
// Eight phantoms (pPhantoms): nine tenths of the stake ride on L = 9r / (r +
// f1 + ... + f8), and it is multiplied by 1 + 0.9 (L - 1), that is 0.1 + 0.9 L:
// r is the chance the model gave the actual pick with the real challenger, the
// f's with each phantom in its place. Were the music making no difference, the
// real one would be no different from a phantom, as likely to be any of the
// nine, and L would be 1 on average, however r and the f's came about: a fair
// bet. (The chances are kept off 0 and 1, alike for all nine, so it stays so.)
// It went the model's way (won) if r is more than the f's on average.
function eightPhantoms(trial, front) {
  const given = (p) => Math.min(1 - 1e-6, Math.max(1e-6, front ? p : 1 - p));
  const real = given(trial.p);
  const phantoms = trial.pPhantoms.map(given);
  const sum = phantoms.reduce((a, b) => a + b, 0);
  if (real * phantoms.length === sum) return null; // no difference between them: nothing rides
  return [1 + BET * (((phantoms.length + 1) * real) / (real + sum) - 1), real * phantoms.length > sum];
}
// One phantom (picks made before v1.1.60, which have no pPhantoms): a share of
// the stake rode on which of the two predictions gave the actual pick the
// higher chance, the further apart they were the more, as far as two fifths.
// (The same whichever of the two is the real one: a fair coin.) Worked out as
// it always was, to the last digit.
function onePhantom(trial, front) {
  if (typeof trial.pPhantom !== 'number') return null;
  const real = front ? trial.p : 1 - trial.p;
  const phantom = front ? trial.pPhantom : 1 - trial.pPhantom;
  if (real === phantom) return null; // no difference between them: no bet
  const share = Math.min(ONE_PHANTOM, Math.abs(real - phantom));
  return [real > phantom ? 1 + share : 1 - share, real > phantom];
}

// Where the experiment stands.
//   picks: labels so far. called/right: picks the model called in advance,
//   and how many it got right; habitsRight: the same for the habits alone.
//   bets/won: picks with something riding on them, and how many went the
//   model's way (the real challenger gave the pick a higher chance than the
//   phantoms did).
//   stake: the stake now; peak: the most it has been in this experiment
//   (from where it was carried); best: the most it has been in the whole
//   history, this experiment and every one before it was started over; p: the
//   chance of a best that high were the music making no difference;
//   significant: best >= 20, so that once reached it stays reached, whatever
//   stake is carried on (the carried stakes are one test martingale, and its
//   running maximum reaching 20 is Ville's event); reachedAt: the pick of this
//   experiment at which it got there (0: it had got there before this
//   experiment was started; null: it has not); reached: where in the whole
//   history it first got there, { experiment, pick } (experiment 1 is the
//   first, and this one is restarts.length + 1; pick null if the record does
//   not say), or null.
// `carried` is the stake an experiment started over was left at, and it starts
// from that (startOver()): so starting over never wipes out a loss, and the
// stakes of one experiment after another are one fair bet after another.
// `restarts` is the record of each time it was started over (startOver()),
// whose peaks say whether it got to 20 before.
export function standing(trials, carried = 1, restarts = []) {
  const before = Array.isArray(restarts) ? restarts : [];
  let reached = null;
  let best = carried;
  before.forEach((restart, index) => {
    const peak = Number(restart?.peak);
    if (!Number.isFinite(peak)) return;
    best = Math.max(best, peak);
    if (reached === null && peak >= NEEDED) reached = { experiment: index + 1, pick: restart.reachedAt > 0 ? restart.reachedAt : null };
  });
  if (reached === null && carried >= NEEDED) reached = { experiment: null, pick: null }; // (carried there, with no record of where)
  const out = { picks: trials.length, called: 0, right: 0, habitsRight: 0, bets: 0, won: 0, stake: carried, peak: carried, best, reachedAt: reached ? 0 : null, reached, carried };
  trials.forEach((trial, index) => {
    if (trial.p === null || trial.p === undefined) return;
    const front = trial.pick === 'front';
    if (trial.p !== 0.5) {
      out.called += 1;
      if ((trial.p > 0.5) === front) out.right += 1;
      if ((trial.q >= 0.5) === front) out.habitsRight += 1;
    }
    const bet = Array.isArray(trial.pPhantoms) ? eightPhantoms(trial, front) : onePhantom(trial, front);
    if (!bet) return;
    out.bets += 1;
    if (bet[1]) out.won += 1;
    out.stake *= bet[0];
    out.peak = Math.max(out.peak, out.stake);
    out.best = Math.max(out.best, out.stake);
    if (out.reachedAt === null && out.peak >= NEEDED) { // the pick at which it became significant
      out.reachedAt = index + 1;
      out.reached = { experiment: before.length + 1, pick: index + 1 };
    }
  });
  out.p = Math.min(1, 1 / out.best);
  out.significant = out.best >= NEEDED;
  return out;
}

// What the meter on the face of the radio shows (jam/taste.js maps it to angles), worked out from the picks
// already made and from nothing else: so it cannot move before a pick, and says nothing of the one to come.
// Its scale is a log scale, even in multiples: 0 is ×1, 1 is ×20, and it goes on to TOP, the right-hand
// stop (×20 to the 8/7, about ×31).
//   warming: the model is not on record yet (fewer than WARMUP picks in this experiment), and warmth is how
//   far through that it is, 0 to 1 (picks: how many pips are lit).
//   stake, peak: as standing() has them; now and high: where they are on the scale, from 0 (×1 or less) to
//   TOP; under: how far below ×1 the stake has sunk, 0 (×1 or more) to 1 (×1/20 or less).
//   (high is this experiment's own: the brass pointer shows the most it has been since it was last started over.)
//   reached: it has been to ×20 at some point of the whole history, in this experiment or one before it was
//   started over (for good: it does not go out, whatever stake was carried on); reachedAt the pick of this
//   experiment at which it got there (0: before this experiment began); since: where in the whole history it
//   first did, { experiment, pick }, as standing() has it (its `reached`).
export const TOP = 8 / 7;
const scale = (value) => Math.log(value) / Math.log(NEEDED);
export function meter(trials, carried = 1, restarts = []) {
  const now = standing(trials, carried, restarts);
  const on = (value) => Math.max(0, Math.min(TOP, scale(value)));
  return {
    picks: trials.length,
    warming: trials.length < WARMUP,
    warmth: Math.min(1, trials.length / WARMUP),
    stake: now.stake,
    peak: now.peak,
    now: on(now.stake),
    high: on(now.peak),
    under: Math.max(0, Math.min(1, scale(1 / now.stake))),
    reached: now.significant,
    reachedAt: now.reachedAt,
    since: now.reached,
  };
}

// What the model has learnt, in words: the strongest leanings, most marked first.
export function leanings(weights, most = 4) {
  if (!weights) return [];
  return FEATURES.map((feature, i) => ({ weight: weights[i], words: weights[i] > 0 ? feature.more : feature.less }))
    .filter((one) => Math.abs(one.weight) > 0.15)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, most);
}
