import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as reel from '../reels/inflection.js';

const voiced = reel.LINES.filter((line) => line.kind === 'voice');
const count = (text) => text.split(/\s+/).filter(Boolean).length;

test('every word the reel shows or says is in the script, once, and every entry in the script is used', () => {
  const used = [
    ...reel.LINES.map((line) => line.slot), ...reel.COMMENTS.map((one) => one.slot), ...reel.AD_WORDS.map((one) => one.slot), ...Object.values(reel.CHROME),
    ...Object.keys(reel.SCRIPT).filter((key) => Object.values(reel.DRAWINGS).some((drawing) => drawing.includes(`[${key}]`) || drawing.includes(reel.words(key)))),
  ];
  for (const key of used) assert.ok(key in reel.SCRIPT, `"${key}" is used but is not in the script`);
  assert.equal(new Set(used).size, used.length, 'an entry is used twice');
  for (const key of Object.keys(reel.SCRIPT)) assert.ok(used.includes(key), `"${key}" is in the script but nowhere in the reel`);
});

test('a blank shows its name in brackets; a voice line written in is broken where it says, or every two words', () => {
  const key = voiced[0].slot;
  const was = reel.SCRIPT[key];
  try {
    reel.SCRIPT[key] = '';
    assert.deepEqual(reel.pieces(key), [`[${key}]`]);
    reel.SCRIPT[key] = 'one two three four five';
    assert.deepEqual(reel.pieces(key), ['one two', 'three four five'], 'no word is left on its own at the end');
    reel.SCRIPT[key] = 'one / two three / four';
    assert.deepEqual(reel.pieces(key), ['one', 'two three', 'four']);
  } finally {
    reel.SCRIPT[key] = was;
  }
});

test('each voice line, as written, is said a few words at a time, and all of it before it goes', () => {
  for (const line of voiced) {
    const parts = reel.pieces(line.slot);
    if (!reel.blank(line.slot)) for (const part of parts) assert.ok(count(part) <= 4, `"${part}" (in "${line.slot}") is more than a few words: break it with " / "`);
    assert.ok(reel.VOICES[line.who], `nobody called ${line.who} has a voice`);
    const { gap } = reel.VOICES[line.who];
    assert.ok(line.at + gap * parts.length < line.end, `"${line.slot}" is too long to be said in the ${(line.end - line.at).toFixed(1)} s it is up: ${parts.length} pieces`);
  }
});

test('the lines come one after another, each over a single shot', () => {
  let after = 0;
  for (const line of reel.LINES) {
    assert.ok(line.at >= after, `"${line.slot}" starts before the line before it has ended`);
    const over = reel.SHOTS.filter((shot) => shot.ranges.some(([a, b]) => line.at >= a && line.end <= b));
    assert.equal(over.length, 1, `"${line.slot}" runs across a cut`);
    after = line.end;
  }
});

test('the shots cover the whole reel without overlapping, and each has a drawing or is drawn by the page', () => {
  const ranges = reel.SHOTS.flatMap((shot) => shot.ranges).sort((a, b) => a[0] - b[0]);
  assert.equal(ranges[0][0], 0);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][0], ranges[i - 1][1], `a gap or an overlap at ${ranges[i][0]} s`);
  assert.equal(ranges.at(-1)[1], reel.LENGTH);
  for (const shot of reel.SHOTS) assert.ok(reel.DRAWINGS[shot.name] || shot.name === 'comments', `the ${shot.name} shot has no drawing`);
});

test('nothing in the sponsored clip is hurried: nobody speaks in it, and its words come slowly', () => {
  assert.equal(reel.SHOTS.find((shot) => shot.name === 'ad').ranges[0][0], reel.AD_AT);
  assert.ok(reel.LINES.every((line) => line.end <= reel.AD_AT), 'nobody speaks in the sponsored clip: Penny only hums');
  for (let i = 1; i < reel.AD_WORDS.length; i++) assert.ok(reel.AD_WORDS[i].at - reel.AD_WORDS[i - 1].at >= 3, 'the sponsor’s words come at least three seconds apart');
  assert.ok(reel.CTA_AT > reel.AD_WORDS.at(-1).at, 'the way to play is offered last');
});

test('making a reel stops at every blank in turn, each where it can be seen', () => {
  assert.deepEqual([...reel.ORDER].sort(), Object.keys(reel.SCRIPT).sort());
  for (const key of reel.ORDER) {
    const at = reel.seenAt(key);
    assert.ok(at >= 0 && at <= reel.LENGTH, `"${key}" is never stopped at`);
    assert.ok(reel.startOf(key) <= at, `"${key}" is played from after where it is seen`);
  }
  for (let i = 1; i < reel.ORDER.length; i++) assert.ok(reel.seenAt(reel.ORDER[i]) >= reel.seenAt(reel.ORDER[i - 1]), 'in the order they are met');
});
