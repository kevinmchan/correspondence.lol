import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '../jam/beat.js';
import { mutate, randomBeat } from '../jam/make.js';
import { readFileSync } from 'node:fs';
import { BET, FEATURES, NEEDED, ONE_PHANTOM, PHANTOMS, REIGN, TOP, WARMUP, begin, choose, features, fit, chance, meter, pairVector, standing, startOver } from '../jam/taste-model.js';

// A random number generator that can be run again: the same seed, the same run.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('made-up beats are real beats, and a changed one is changed', () => {
  const random = seeded(1);
  for (let i = 0; i < 300; i++) {
    const beat = randomBeat(random);
    assert.deepEqual(decode(encode(beat)).tempo, beat.tempo);
    assert.ok(beat.notes.some((tiles) => tiles.length > 0), 'a beat with nothing in it');
    const changed = mutate(beat, random);
    assert.ok(changed.notes.some((tiles) => tiles.length > 0));
    assert.equal(decode(encode(changed)) !== null, true);
  }
});

test('what is measured about a loop stays between 0 and 1, and says what it should', () => {
  const random = seeded(2);
  for (let i = 0; i < 300; i++) {
    const f = features(randomBeat(random));
    assert.equal(f.length, FEATURES.length);
    for (const value of f) assert.ok(value >= 0 && value <= 1 && Number.isFinite(value), String(f));
  }
  const key = (name) => FEATURES.findIndex((one) => one.key === name);
  const slow = { tempo: 0, notes: [[6], [], [], []] }; // one low bell on the first step
  const fast = { tempo: 3, notes: [[0, 7 + 6, 14], [], [6, 13], [6, 34]] }; // bells high, low, high; bass on the root; two kicks
  assert.equal(features(slow)[key('tempo')], 0);
  assert.equal(features(fast)[key('tempo')], 1);
  assert.equal(features(slow)[key('drums')], 0);
  assert.equal(features(fast)[key('drums')], 1);
  assert.equal(features(fast)[key('kick')], 0.5);
  assert.equal(features(fast)[key('root')], 1);
  assert.equal(features(slow)[key('bellsHigh')], 0);
  assert.equal(features(fast)[key('leaps')], 1, 'top to bottom and back is as far as a tune can leap');
  assert.ok(features(slow)[key('space')] > features(fast)[key('space')]);
});

test('the model learns a liking that is there, and a pair it has not seen is called the right way', () => {
  const random = seeded(3);
  const tempo = FEATURES.findIndex((one) => one.key === 'tempo');
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const [front, back] = [randomBeat(random), randomBeat(random)];
    if (front.tempo === back.tempo) continue;
    rows.push([pairVector(front, back, null, 'front'), front.tempo > back.tempo ? 1 : 0]); // always the faster one
  }
  const weights = fit(rows, { rounds: 8 });
  assert.ok(weights[tempo] > 1, `a liking for speed was not learnt: ${weights[tempo]}`);
  const fast = { tempo: 3, notes: [[0], [], [], []] };
  const slow = { tempo: 0, notes: [[0], [], [], []] };
  assert.ok(chance(weights, pairVector(fast, slow, null, 'front')) > 0.8);
  assert.ok(chance(weights, pairVector(slow, fast, null, 'front')) < 0.2);
});

// Somebody doing the experiment. `taste` is how much they like each measured
// thing; `keeps` is how far they lean towards the reigning loop whatever it is.
function person(taste, keeps, random) {
  const like = (beat) => features(beat).reduce((sum, value, i) => sum + value * (taste[i] ?? 0), 0);
  return (current) => {
    const lean = current.reigning === 'front' ? keeps : current.reigning === 'back' ? -keeps : 0;
    const z = like(current.front) - like(current.back) + lean;
    return random() < 1 / (1 + Math.exp(-z)) ? 'front' : 'back';
  };
}
function run(picks, taste, keeps, seed) {
  const random = seeded(seed);
  const pick = person(taste, keeps, seeded(seed + 1000));
  const state = begin(random);
  for (let i = 0; i < picks; i++) choose(state, pick(state.current), random);
  return standing(state.trials);
}

test('with no taste at all the test is not fooled, however strong the habit; with a real one it finds it', () => {
  // no taste, and a strong habit of keeping the reigning loop: predictable, and not by the music
  let fooled = 0;
  let calledRight = 0;
  for (let seed = 0; seed < 60; seed++) {
    const result = run(160, [], 1.5, seed * 7 + 1);
    if (result.significant) fooled += 1;
    calledRight += result.right / result.called;
  }
  assert.ok(calledRight / 60 > 0.7, 'the habit alone makes the picks easy to call');
  assert.ok(fooled <= 6, `significant ${fooled} times in 60 with no taste to find`); // 1 in 20 is allowed: 3 expected at most
  // a real taste: fast, with drums, and a low tune
  const taste = [];
  for (const [name, much] of [['tempo', 4], ['drums', 3], ['bellsHigh', -4], ['space', -3]]) taste[FEATURES.findIndex((one) => one.key === name)] = much;
  let found = 0;
  for (let seed = 0; seed < 20; seed++) {
    const result = run(220, taste, 0.3, seed * 11 + 5);
    if (result.significant) found += 1;
  }
  assert.ok(found >= 14, `a real taste was found only ${found} times in 20`);
});

test('nothing is bet before the model has had picks to learn from, and the stake is a matter of record', () => {
  const random = seeded(9);
  const state = begin(random);
  for (let i = 0; i < WARMUP; i++) choose(state, 'front', random);
  assert.equal(standing(state.trials).bets, 0);
  assert.equal(state.trials.every((trial) => trial.p === null), true);
  assert.notEqual(state.current.p, null, 'the next pick is called in advance');
  // (picks made under the rule before there were eight phantoms, with one phantom and no pPhantoms, keep it)
  const trial = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4 };
  const lost = { pick: 'back', p: 0.7, q: 0.5, pPhantom: 0.4 };
  assert.deepEqual([standing([trial]).stake, standing([lost]).stake].map((stake) => Math.round(stake * 100) / 100), [1.3, 0.7], 'the share that rides is how far apart the two predictions are');
  const many = Array.from({ length: 12 }, () => trial);
  assert.equal(standing(many).significant, true);
  assert.equal(1.3 ** 12 >= NEEDED && 1.3 ** 11 < NEEDED, true);
  assert.equal(standing(many.slice(1)).significant, false);
  assert.equal(standing([...many, ...Array.from({ length: 30 }, () => lost)]).significant, true, 'once reached, it has been reached');
  assert.equal(standing(many).reachedAt, 12, 'the pick at which it got there');
  // and picks made now, with eight phantoms: the stake rides on how much likelier the pick was with the real one
  const eight = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4, pPhantoms: Array(PHANTOMS).fill(0.4) };
  const won = 1 + BET * ((9 * 0.7) / (0.7 + 8 * 0.4) - 1);
  assert.ok(Math.abs(standing([eight]).stake - won) < 1e-15);
  assert.ok(Math.abs(standing([{ ...eight, pick: 'back' }]).stake - (1 + BET * ((9 * 0.3) / (0.3 + 8 * 0.6) - 1))) < 1e-15);
  const n = Math.ceil(Math.log(NEEDED) / Math.log(won));
  assert.deepEqual([standing(Array(n - 1).fill(eight)).significant, standing(Array(n).fill(eight)).significant, standing(Array(n).fill(eight)).reachedAt], [false, true, n]);
});

// What a pick made before there were eight phantoms did to the stake, worked out by hand: a share of it, as far
// as two fifths, on which of the two predictions gave the pick the higher chance.
const onePhantom = (trial) => {
  const front = trial.pick === 'front';
  const [real, phantom] = [front ? trial.p : 1 - trial.p, front ? trial.pPhantom : 1 - trial.pPhantom];
  if (real === phantom) return 1;
  const share = Math.min(ONE_PHANTOM, Math.abs(real - phantom));
  return real > phantom ? 1 + share : 1 - share;
};

test('the bet is fair: were the real challenger any one of the phantoms, the stake would not change on average', () => {
  // the chances nine challengers made alike give the pick; the real one is any of them, as likely one as another
  const chances = [0.7, 0.4, 0.55, 0.9, 0.1, 0.33, 0.62, 0.48, 0.2];
  for (const pick of ['front', 'back']) {
    let sum = 0;
    chances.forEach((p, i) => {
      const pPhantoms = chances.filter((_, j) => j !== i);
      sum += standing([{ pick, p, q: 0.5, pPhantom: pPhantoms[0], pPhantoms }]).stake;
    });
    assert.ok(Math.abs(sum / chances.length - 1) < 1e-12, `on average ×${sum / chances.length}`);
  }
  // and the same with chances drawn at random, a thousand times over
  const random = seeded(77);
  for (let round = 0; round < 1000; round++) {
    const nine = Array.from({ length: PHANTOMS + 1 }, () => random());
    const pick = random() < 0.5 ? 'front' : 'back';
    let sum = 0;
    nine.forEach((p, i) => { sum += standing([{ pick, p, q: 0.5, pPhantoms: nine.filter((_, j) => j !== i) }]).stake; });
    assert.ok(Math.abs(sum / nine.length - 1) < 1e-12);
  }
  // and at the very ends, where chances of 0 and 1 are kept off them: kept off alike for all nine, it is still fair
  for (const nine of [[0, 1, 1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0.5, 1, 1e-9, 1 - 1e-9, 0.3, 0, 1], [1e-7, 1e-8, 0, 0, 0, 0, 0, 0, 0]]) {
    for (const pick of ['front', 'back']) {
      let sum = 0;
      nine.forEach((p, i) => { sum += standing([{ pick, p, q: 0.5, pPhantoms: nine.filter((_, j) => j !== i) }]).stake; });
      assert.ok(Math.abs(sum / nine.length - 1) < 1e-9, `${nine} for ${pick}: on average ×${sum / nine.length}`);
    }
  }
  assert.ok(standing([{ pick: 'front', p: 1e-12, q: 0.5, pPhantom: 0.9, pPhantoms: Array(PHANTOMS).fill(0.9) }]).stake >= 1 - BET, 'one pick never takes more than its share');
  assert.equal(standing([{ pick: 'front', p: 0.6, q: 0.5, pPhantom: 0.6, pPhantoms: Array(PHANTOMS).fill(0.6) }]).bets, 0, 'nothing rides where they all say the same');
  assert.equal(standing([], 0.3).stake, 0.3, 'starting over carries the stake on');
  // the pair now up is made with eight phantoms, each called with the same weights, the same reign and the same first coin
  const state = begin(seeded(4));
  const random4 = seeded(40);
  for (let i = 0; i < WARMUP; i++) choose(state, 'front', random4);
  assert.equal(state.current.pPhantoms.length, PHANTOMS);
  assert.equal(state.current.pPhantom, state.current.pPhantoms[0]);
  const { front, back, phantom, challengerSide, reigning, first } = state.current;
  const [pf, pb] = challengerSide === 'front' ? [phantom, back] : [front, phantom];
  assert.equal(state.current.pPhantoms[0], chance(state.weights, pairVector(pf, pb, reigning, first)));
  assert.equal(state.current.p, chance(state.weights, pairVector(front, back, reigning, first)));
  assert.equal(new Set(state.current.pPhantoms).size > 1, true, 'the phantoms are eight, not one eight times');
});

test('the real challenger is one of nine made alike: among the nine chances, its own is as likely to be any of them', () => {
  // Whatever the picks, the real challenger and the eight phantoms are drawn the same way, from the same loop,
  // after the same picks; so the chance the model gives the front with the real one is as likely to be the
  // lowest of the nine as the highest, or anywhere between, and over many pairs each place comes up about as
  // often. (Were the phantoms drawn in any other way than the challenger is, it would not: so it pins that.)
  const taste = [];
  for (const [name, much] of [['tempo', 3], ['drums', 2], ['bellsHigh', -3]]) taste[FEATURES.findIndex((one) => one.key === name)] = much;
  const counts = Array(PHANTOMS + 1).fill(0);
  for (let run = 0; run < 30; run++) {
    const random = seeded(500 + run);
    const coin = seeded(900 + run);
    const pick = person(taste, 1, coin);
    const state = begin(random);
    for (let i = 0; i < 70; i++) {
      const { p, pPhantoms } = state.current;
      if (Array.isArray(pPhantoms)) { // (its place among them, ties broken by a coin)
        const below = pPhantoms.filter((f) => f < p).length;
        const same = pPhantoms.filter((f) => f === p).length;
        counts[below + Math.floor(coin() * (same + 1))] += 1;
      }
      choose(state, pick(state.current), random);
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  const chi2 = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
  assert.equal(total, 30 * (70 - WARMUP));
  assert.ok(chi2 < 26.12, `its places among the nine are not even (χ² ${chi2.toFixed(1)}, 8 degrees of freedom, 1 in 1000): ${counts}`);
});

test('the fit only climbs: it does not swing for ever between two wrong answers', () => {
  // no taste and a strong habit: on this run the fit without halving steps got stuck by the 60th pick, far from the best
  const random = seeded(5);
  const pick = person([], 1.5, seeded(1005));
  const state = begin(random);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const { front, back, reigning, first } = state.current;
    const picked = pick(state.current);
    rows.push([pairVector(front, back, reigning, first), picked === 'front' ? 1 : 0]);
    choose(state, picked, random);
  }
  const value = (w) => rows.reduce((sum, [x, y]) => sum - Math.log1p(Math.exp((y ? -1 : 1) * x.reduce((z, v, i) => z + v * w[i], 0))), 0) - w.reduce((sum, v, i) => sum + 0.5 * (i < FEATURES.length ? 6 : 0.05) * v * v, 0);
  assert.ok(value(fit(rows, { rounds: 40 })) - value(state.weights) < 0.01, `short of the best fit by ${value(fit(rows, { rounds: 40 })) - value(state.weights)}`);
  // and it never goes down, round by round
  let w = null;
  let was = -Infinity;
  for (let round = 0; round < 12; round++) {
    w = fit(rows, { from: w, rounds: 1 });
    assert.ok(value(w) >= was - 1e-9, `round ${round}: ${value(w)} after ${was}`);
    was = value(w);
  }
});

test('starting over carries the stake on, and is written down', () => {
  const random = seeded(12);
  const pick = person([], 0, seeded(1012));
  let state = begin(random);
  for (let i = 0; i < 40; i++) choose(state, pick(state.current), random);
  const before = standing(state.trials);
  assert.ok(before.stake !== 1 && before.bets > 0);
  const old = state.trials;
  const pending = state.current; // (bet on: past the warm-up, and called with eight phantoms)
  state.looked = [{ what: 'reading', after: 12, at: 1794990000000 }];
  state = startOver(state, random, { at: 1795000000000, version: 'v0.0.0', voided: { up: 'back', heard: { front: 1600, back: 2100 } } });
  const { voided, ...restart } = state.restarts[0];
  assert.deepEqual(restart, { after: 40, carried: before.stake, peak: before.peak, reachedAt: before.reachedAt, at: 1795000000000, version: 'v0.0.0' });
  // the pair that was up is written down with it, thrown away unpicked, and what the model said of it (no longer up)
  assert.deepEqual(voided, {
    front: encode(pending.front), back: encode(pending.back), phantom: encode(pending.phantom),
    challengerSide: pending.challengerSide, reigning: pending.reigning, first: pending.first,
    p: pending.p, q: pending.q, pPhantom: pending.pPhantom, pPhantoms: pending.pPhantoms, bet: true,
    up: 'back', heard: { front: 1600, back: 2100 },
  });
  assert.equal(pending.pPhantoms.length, PHANTOMS);
  assert.deepEqual(state.looked, [{ what: 'reading', after: 12, at: 1794990000000 }], 'what was looked at stays on the record');
  assert.deepEqual([state.trials.length, state.retired.length, state.weights, state.carried], [0, 0, null, before.stake]);
  assert.equal(standing(state.trials, state.carried).stake, before.stake, 'the stake is where it was');
  let m = meter(state.trials, state.carried);
  assert.deepEqual([m.warming, m.picks, m.stake], [true, 0, before.stake]);
  // the warm-up again: nothing is bet, and the stake stays where it was carried
  for (let i = 0; i < WARMUP; i++) choose(state, pick(state.current), random);
  assert.equal(standing(state.trials, state.carried).stake, before.stake);
  assert.equal(state.trials.every((trial) => trial.p === null), true);
  for (let i = 0; i < 30; i++) choose(state, pick(state.current), random);
  // one fair bet after another: the stake now is what all the picks, before and after, make of 1, multiplied in turn
  const after = standing(state.trials, state.carried);
  assert.equal(after.stake, standing([...old, ...state.trials]).stake);
  assert.equal(after.peak, Math.max(before.stake, ...state.trials.map((_, i) => standing(state.trials.slice(0, i + 1), state.carried).stake)), 'the peak counts from where it was carried');
  // and again: each time is written down
  const second = standing(state.trials, state.carried);
  state = startOver(state, random);
  assert.equal(state.restarts.length, 2);
  assert.deepEqual([state.restarts[1].after, state.restarts[1].carried, state.restarts[1].voided.bet], [40, second.stake, true]);
  // started over in the warm-up, the pair thrown away was not bet on, and is written down as not
  state = startOver(state, random);
  assert.deepEqual([state.restarts[2].after, state.restarts[2].voided.bet, state.restarts[2].voided.p], [0, false, null]);
  // carried at ×20 or more, it is significant from the start (and was reached before it was started over)
  const high = standing([], 25);
  assert.deepEqual([high.significant, high.reachedAt, high.p], [true, 0, 1 / 25]);
  m = meter([], 25);
  assert.deepEqual([m.reached, m.reachedAt, m.warming], [true, 0, true]);
});

// The owner, 25 November 2026: the carried stakes are one test martingale, so its running maximum over the whole
// history reaching ×20 is Ville's event. Once the lamp has lit it stays lit, whatever stake is carried on.
test('×20 reached at any point of the one carried test stays reached: after starting over, below ×20, the lamp stays lit', () => {
  const random = seeded(51);
  const won = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4 }; // (old picks: won is ×1.3, lost ×0.7)
  const lost = { pick: 'back', p: 0.7, q: 0.5, pPhantom: 0.4 };
  const warm = Array.from({ length: WARMUP }, () => ({ pick: 'front', p: null }));
  const first = [...warm, ...Array(12).fill(won), ...Array(5).fill(lost)];
  const was = standing(first);
  assert.ok(was.significant && was.stake < NEEDED && was.peak >= NEEDED && was.reachedAt === WARMUP + 12, JSON.stringify(was));
  // started over at less than ×20: the stake carries on as it stands, and the peak and the pick are written down
  let state = startOver({ trials: first, carried: 1, restarts: [], current: null, looked: [] }, random, { at: 1795000000000 });
  assert.deepEqual([state.carried, state.restarts[0].peak, state.restarts[0].reachedAt], [was.stake, was.peak, WARMUP + 12]);
  let now = standing(state.trials, state.carried, state.restarts);
  assert.deepEqual([now.significant, now.reachedAt, now.reached, now.stake, now.peak, now.best, now.p],
    [true, 0, { experiment: 1, pick: WARMUP + 12 }, was.stake, was.stake, was.peak, 1 / was.peak], 'significant still, for the whole history');
  let m = meter(state.trials, state.carried, state.restarts);
  assert.deepEqual([m.reached, m.reachedAt, m.since, m.warming, m.peak], [true, 0, { experiment: 1, pick: WARMUP + 12 }, true, was.stake], 'the lamp lit; the pointer this experiment\'s own');
  // without the record of the restarts it would not be (as the meter was before the owner's rule)
  assert.equal(standing(state.trials, state.carried).significant, false);
  // and it stays so however far the stake sinks in the experiments after, and however often it is started over
  const sinking = [...warm, ...Array(30).fill(lost)];
  state = startOver({ ...state, trials: sinking }, random);
  state = startOver({ ...state, trials: sinking }, random);
  now = standing(sinking, state.carried, state.restarts);
  assert.ok(now.stake < 1, 'sunk below ×1');
  assert.deepEqual([now.significant, now.reachedAt, now.reached, now.best], [true, 0, { experiment: 1, pick: WARMUP + 12 }, was.peak]);
  assert.deepEqual(state.restarts.map((one) => one.reachedAt), [WARMUP + 12, 0, 0], 'each start over after it written down as reached before');
  assert.equal(meter(sinking, state.carried, state.restarts).reached, true);
  // reached in this experiment, it is where it was reached in this experiment
  const again = [...warm, ...Array(12).fill(won)];
  now = standing(again, 1, [{ after: 30, carried: 1, peak: 3 }]);
  assert.deepEqual([now.significant, now.reachedAt, now.reached], [true, WARMUP + 12, { experiment: 2, pick: WARMUP + 12 }]);
  // never reached: not significant, and the best is the most of every experiment's peak
  now = standing(warm, 2, [{ after: 30, carried: 1, peak: 9 }, { after: 30, carried: 4, peak: 6 }]);
  assert.deepEqual([now.significant, now.reachedAt, now.reached, now.best, now.peak], [false, null, null, 9, 2]);
});

// The owner's own radio: saved on the device by Penny's Radio as it was on main (v1.1.58), before the meter and
// before there were eight phantoms (tests/fixtures/radio-saved-v1.1.58.json, written by main's radio itself).
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/radio-saved-v1.1.58.json', import.meta.url), 'utf8'));
// What jam/taste.js makes of a save when the radio comes up (restore()).
function restored(kept) {
  const unpack = (pair) => ({ ...pair, front: decode(pair.front), back: decode(pair.back), phantom: decode(pair.phantom) });
  const trials = kept.trials.map(unpack);
  const rows = trials.map((trial) => [pairVector(trial.front, trial.back, trial.reigning, trial.first), trial.pick === 'front' ? 1 : 0]);
  return {
    trials, current: unpack(kept.current), streak: kept.streak, retired: kept.retired.map(decode),
    weights: fit(rows, { rounds: 10 }), habits: fit(rows, { music: false, rounds: 10 }),
    carried: Number.isFinite(kept.carried) && kept.carried > 0 ? kept.carried : 1, restarts: Array.isArray(kept.restarts) ? kept.restarts : [],
  };
}

test('a radio saved before the meter comes up with the same stake, the same peak and the same lamp', () => {
  for (const [name, { saved, standing: was, version }] of Object.entries(FIXTURE.saves)) {
    assert.equal(version, 'v1.1.58');
    assert.equal(saved.trials.some((trial) => 'pPhantoms' in trial || 'metered' in trial), false, `${name}: not a save from before the meter`);
    const now = standing(saved.trials);
    assert.deepEqual(
      { picks: now.picks, bets: now.bets, won: now.won, stake: now.stake, peak: now.peak, p: now.p, significant: now.significant, reachedAt: now.reachedAt },
      was, `${name}: not what main made of it`,
    );
    // every pick that was bet on, as it always was
    let stake = 1;
    for (const trial of saved.trials) if (trial.p !== null) stake *= onePhantom(trial);
    assert.equal(stake, was.stake, name);
    const m = meter(saved.trials);
    assert.deepEqual([m.stake, m.peak, m.reached, m.warming], [was.stake, was.peak, was.significant, false], `${name}: the meter`);
    // and as the radio restores it (old saves have no `carried` and no restarts)
    const state = restored(saved);
    assert.deepEqual([state.carried, state.restarts], [1, []]);
    assert.equal(standing(state.trials, state.carried).stake, was.stake);
  }
  assert.equal(FIXTURE.saves.significant.standing.significant, true, 'one of them has its lamp lit');
  assert.equal(FIXTURE.saves.underWay.standing.significant, false, 'and one has not');
  assert.ok(FIXTURE.saves.significant.standing.peak > FIXTURE.saves.significant.standing.stake, 'with the needle below the peak');
});

test('a history of old picks and then new ones: each keeps its rule, and the stake carries on from where it was', () => {
  const { saved, standing: was } = FIXTURE.saves.significant;
  const state = restored(saved);
  const random = seeded(33);
  // the pair that was up when the radio was saved was called with one phantom: picked now, it keeps that rule
  assert.equal(state.current.pPhantoms, undefined);
  assert.equal(typeof state.current.pPhantom, 'number');
  const pending = { ...state.current };
  choose(state, 'front', random, { metered: true });
  assert.equal(state.trials.at(-1).pPhantoms, undefined);
  let expected = was.stake * onePhantom({ ...pending, pick: 'front' });
  assert.equal(standing(state.trials).stake, expected, 'the pick on the pair that was up, by its own rule');
  // every pair made from now on has eight phantoms, and is bet on by the new rule
  assert.equal(state.current.pPhantoms.length, PHANTOMS);
  const eight = (trial) => {
    const g = (p) => Math.min(1 - 1e-6, Math.max(1e-6, trial.pick === 'front' ? p : 1 - p));
    const [r, f] = [g(trial.p), trial.pPhantoms.map(g)];
    const sum = f.reduce((a, b) => a + b, 0);
    return r * f.length === sum ? 1 : 1 + BET * ((9 * r) / (r + sum) - 1);
  };
  const pick = person([], 0.3, seeded(1033));
  for (let i = 0; i < 25; i++) choose(state, pick(state.current), random);
  for (const trial of state.trials.slice(-25)) {
    assert.equal(trial.pPhantoms.length, PHANTOMS);
    expected *= eight(trial);
  }
  const now = standing(state.trials);
  assert.equal(now.stake, expected, 'old picks by the old rule, then new ones by the new, multiplied in turn');
  assert.ok(now.peak >= was.peak, 'the peak does not come down');
  assert.equal(now.significant, true, 'the lamp stays lit');
  assert.equal(now.reachedAt, was.reachedAt, 'and it was reached where it was');
  assert.equal(meter(state.trials).reached, true);
});

test('the meter: the stake on a scale even in multiples, from ×1 to ×20 and on; below ×1, how far; the peak held; ×20 for good', () => {
  const random = seeded(31);
  const state = begin(random);
  for (let i = 0; i < WARMUP - 1; i++) choose(state, 'front', random);
  let now = meter(state.trials);
  assert.deepEqual([now.warming, now.picks, now.warmth], [true, WARMUP - 1, (WARMUP - 1) / WARMUP], 'warming up while the model is not on record');
  assert.deepEqual([now.now, now.high, now.under, now.stake, now.peak, now.reached], [0, 0, 0, 1, 1, false]);
  choose(state, 'front', random);
  assert.equal(meter(state.trials).warming, false, 'on, once the pick to come is called in advance');
  assert.notEqual(state.current.p, null);
  // the pair now up, and what the model says of it, make no difference to it: only picks made do
  const before = meter(state.trials);
  state.current.p = 0.99;
  state.current.pPhantom = 0.01;
  state.current.pPhantoms = state.current.pPhantoms.map(() => 0.01);
  assert.deepEqual(meter(state.trials), before);
  // even in multiples: ×1 is the left stop and ×20 the mark (old picks: won is ×1.3, lost ×0.7)
  const won = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4 };
  const lost = { pick: 'back', p: 0.7, q: 0.5, pPhantom: 0.4 };
  const warm = Array.from({ length: WARMUP }, () => ({ pick: 'front', p: null }));
  const after = (trials, carried) => meter([...warm, ...trials], carried);
  const close = (a, b) => Math.abs(a - b) < 1e-12;
  assert.ok(close(after([won]).now, Math.log(1.3) / Math.log(NEEDED)));
  assert.ok(close(after(Array(6).fill(won)).now, (6 * Math.log(1.3)) / Math.log(NEEDED)), 'six wins are six times as far as one');
  assert.ok(close(meter([], 2).now, 1 / 4.3219280948873626) && close(meter([], 10).now, Math.log(10) / Math.log(20)));
  assert.equal(meter([], NEEDED).now, 1, '×20 is the mark');
  assert.equal(meter([], 1e6).now, TOP, 'and it goes no further than the right stop');
  assert.ok(Math.abs(NEEDED ** TOP - 30.7) < 0.1, `about ×31: ×${NEEDED ** TOP}`);
  // below ×1 it rests at the stop, and says how far below
  now = after([lost]);
  assert.deepEqual([now.now, now.high], [0, 0]);
  assert.ok(close(now.under, Math.log(1 / 0.7) / Math.log(NEEDED)));
  assert.equal(after(Array(30).fill(lost)).under, 1, 'as far as ×1/20, and no further');
  assert.equal(after([won]).under, 0);
  // the most it has been stays when the stake falls again, and ×20, once reached, is for good
  now = after([...Array(8).fill(won), lost, lost]);
  assert.ok(now.high > now.now && now.high < 1 && now.reached === false);
  assert.ok(close(now.high, (8 * Math.log(1.3)) / Math.log(NEEDED)));
  now = after([...Array(12).fill(won), ...Array(4).fill(lost)]);
  assert.ok(now.high > 1 && now.reached === true && now.reachedAt === WARMUP + 12);
  assert.ok(now.now < 1, 'and where it is now is shown as well');
  now = after([...Array(12).fill(won), ...Array(40).fill(lost)]);
  assert.deepEqual([now.reached, now.under > 0], [true, true], 'sunk below ×1, and the lamp still lit');
  // carried over from before a start over: where it was, warming up again
  now = meter([], 6);
  assert.deepEqual([now.warming, now.stake, now.peak, now.reached], [true, 6, 6, false]);
  assert.ok(close(now.now, Math.log(6) / Math.log(NEEDED)));
});

test('a pick keeps what it was noted with, and picks noted before the meter are still read', () => {
  const random = seeded(41);
  const state = begin(random);
  const note = { metered: true, heard: { front: 1800, back: 2400 }, decideMs: 5200, version: 'v1.2.3' };
  choose(state, 'back', random, note);
  assert.deepEqual(Object.fromEntries(Object.keys(note).map((key) => [key, state.trials[0][key]])), note);
  const old = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4 }; // noted with nothing of it
  const warm = Array.from({ length: WARMUP }, () => ({ pick: 'front', p: null }));
  assert.equal(standing([...warm, old, { ...old, ...note }]).bets, 2);
  assert.equal(meter([...warm, old, { ...old, ...note }]).warming, false);
  assert.ok(Math.abs(standing([...warm, old, { ...old, ...note }]).stake - 1.3 * 1.3) < 1e-12, 'and bet on by their own rule, whatever they were noted with');
});

test('a loop that keeps winning retires after five, and two new loops start again', () => {
  const random = seeded(21);
  const state = begin(random);
  choose(state, 'front', random); // it wins its first, and reigns
  const champion = encode(state.current.front);
  assert.equal(state.current.reigning, 'front');
  for (let i = 2; i < REIGN; i++) {
    choose(state, 'front', random);
    assert.equal(encode(state.current.front), champion, 'the reigning loop stays where it is');
    assert.equal(state.streak, i);
  }
  choose(state, 'front', random); // the fifth
  assert.equal(state.trials.length, REIGN);
  assert.equal(state.trials[REIGN - 1].retired, true);
  assert.deepEqual(state.retired.map(encode), [champion]);
  assert.equal(state.current.reigning, null, 'nobody reigns');
  assert.notEqual(encode(state.current.front), champion);
  assert.notEqual(encode(state.current.back), champion);
  assert.equal(state.streak, 0);
  // a challenger that wins starts a reign of its own from one
  choose(state, 'back', random);
  choose(state, 'front', random);
  assert.equal(state.streak, 1);
  assert.equal(state.current.reigning, 'front');
  assert.equal(state.retired.length, 1);
});
