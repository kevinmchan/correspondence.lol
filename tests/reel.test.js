import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as reel from '../reels/inflection.js';

const words = (text) => text.split(/\s+/).filter(Boolean).length;

test('a reel’s people speak as Dot does: a few words at a time, three pieces at most to a line', () => {
  for (const line of reel.LINES) {
    assert.ok(line.said.length >= 1 && line.said.length <= 3, `"${line.said.join(' ')}" is in ${line.said.length} pieces`);
    for (const piece of line.said) assert.ok(words(piece) <= 3, `"${piece}" is more than a few words`);
    assert.ok(reel.VOICES[line.who], `nobody called ${line.who} has a voice`);
  }
});

test('each line is said in time, one after another, and over a single shot', () => {
  let after = 0;
  for (const line of reel.LINES) {
    assert.ok(line.at >= after, `"${line.said.join(' ')}" starts before the line before it has ended`);
    const { gap } = reel.VOICES[line.who];
    assert.ok(line.at + gap * line.said.length < line.end, `"${line.said.join(' ')}" is not all said before it goes`);
    const over = reel.SHOTS.filter((shot) => shot.ranges.some(([a, b]) => line.at >= a && line.end <= b));
    assert.equal(over.length, 1, `"${line.said.join(' ')}" runs across a cut`);
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

test('nothing in the sponsored clip is hurried: it begins at the cut, and its words come slowly', () => {
  const ad = reel.SHOTS.find((shot) => shot.name === 'ad').ranges[0];
  assert.equal(ad[0], reel.AD_AT);
  assert.ok(reel.LINES.every((line) => line.end <= reel.AD_AT), 'nobody speaks in the sponsored clip: Penny only hums');
  for (let i = 1; i < reel.AD_WORDS.length; i++) assert.ok(reel.AD_WORDS[i].at - reel.AD_WORDS[i - 1].at >= 3, 'the sponsor’s words come at least three seconds apart');
  assert.ok(reel.CTA_AT > reel.AD_WORDS.at(-1).at, 'the way to play is offered last');
});
