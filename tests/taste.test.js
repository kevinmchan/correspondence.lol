import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '../jam/beat.js';
import { mutate, randomBeat } from '../jam/make.js';
import { FEATURES, NEEDED, REIGN, WARMUP, begin, choose, features, fit, chance, pairVector, standing } from '../jam/taste-model.js';

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
  const trial = { pick: 'front', p: 0.7, q: 0.5, pPhantom: 0.4 };
  const lost = { pick: 'back', p: 0.7, q: 0.5, pPhantom: 0.4 };
  assert.deepEqual([standing([trial]).stake, standing([lost]).stake].map((stake) => Math.round(stake * 100) / 100), [1.3, 0.7], 'the share that rides is how far apart the two predictions are');
  const many = Array.from({ length: 12 }, () => trial);
  assert.equal(standing(many).significant, true);
  assert.equal(1.3 ** 12 >= NEEDED && 1.3 ** 11 < NEEDED, true);
  assert.equal(standing(many.slice(1)).significant, false);
  assert.equal(standing([...many, ...Array.from({ length: 30 }, () => lost)]).significant, true, 'once reached, it has been reached');
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
