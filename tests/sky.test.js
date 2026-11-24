import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGEST, ECHO, FAST, FULL_MS, NIGHT, OUT, PENNY_AT, PHRASE, PICTURE, POINTED, ROWS, SMALLEST, SPECK, STEP, TALL, TAP_MS, TURN,
  frame, grown, halfWidth, heldFor, keeps, nameOf, nearness, noteOf, outline, period, pitchOf, reading, rowOf, sizeOf, slowness,
  soundOf, soundings, sown,
} from '../penny/stars.js';

// The night sky is a picture that is played. These check that the picture is
// the one it was drawn from, that it is read as the README says it is, and
// that a hand's lights follow the same rules as the picture's.

const stars = PICTURE.filter((light) => light.kind === 'star');
const dots = PICTURE.filter((light) => light.kind === 'dot');
const near = (a, b, by = 1e-9) => Math.abs(a - b) <= by;

test('the picture: three stars in a falling line, each bigger than the last, and two dots beside it', () => {
  assert.deepEqual(PICTURE.map((light) => light.kind), ['star', 'dot', 'star', 'dot', 'star'], 'read left to right');
  assert.deepEqual(PICTURE.map((light) => light.x), [...PICTURE.map((light) => light.x)].sort((a, b) => a - b), 'in the order they are read');
  for (const [i, star] of stars.entries()) {
    if (i === 0) continue;
    assert.ok(star.x > stars[i - 1].x && star.y > stars[i - 1].y, 'the line falls to the right');
    assert.ok(star.a > stars[i - 1].a * 1.5, 'each a good deal bigger than the last');
  }
  // one dot above the line of the stars and one below it
  const lineAt = (x) => stars[0].y + ((x - stars[0].x) / (stars[2].x - stars[0].x)) * (stars[2].y - stars[0].y);
  assert.deepEqual(dots.map((dot) => Math.sign(dot.y - lineAt(dot.x))), [1, -1], 'the first dot is under the line, the second over it');
  // all of it inside the picture, the points of the stars included
  for (const light of PICTURE) {
    const [w, h] = light.kind === 'star' ? [light.a, light.b] : [light.r, light.r];
    assert.ok(light.x - w > 0 && light.x + w < 1 && light.y - h > 0 && light.y + h < 1);
  }
});

test('a star is 1.4 times as tall as it is wide, and its points are needles', () => {
  for (const star of stars) assert.ok(near(star.b / star.a, TALL, 0.05), `${star.b / star.a}`);
  const edge = outline();
  assert.equal(edge.length, 160);
  for (const [x, y] of edge) assert.ok(near(Math.abs(x) ** POINTED + Math.abs(y) ** POINTED, 1, 1e-9), 'every point of the outline is on the curve');
  // its four points, and nothing beyond them
  for (const point of [[1, 0], [0, 1], [-1, 0], [0, -1]]) assert.ok(edge.some(([x, y]) => near(x, point[0], 1e-12) && near(y, point[1], 1e-12)), `${point}`);
  // it goes once round, the same way all the way
  const turns = edge.map(([x, y], i) => {
    const [nx, ny] = edge[(i + 1) % edge.length];
    return x * ny - y * nx;
  });
  assert.ok(turns.every((turn) => turn > 0), 'once round, without doubling back');
  // between two points the edge comes in to a fifth of the way out: a circle's would be seven tenths
  const waist = Math.min(...edge.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(waist > 0.25 && waist < 0.29, `${waist}`);
});

test('sizes: the picture\'s own stars are what a hand can make', () => {
  assert.equal(halfWidth(1), BIGGEST);
  assert.equal(halfWidth(0), SMALLEST);
  assert.equal(BIGGEST, stars[2].a, 'the biggest a hand can make is the picture\'s big one');
  assert.ok(SMALLEST < stars[0].a, 'and it can make smaller than the picture\'s small one');
  assert.ok(SPECK >= dots[0].r && SPECK <= dots[1].r, 'a dot is the size of the picture\'s dots');
  for (const star of stars) assert.ok(near(halfWidth(sizeOf(star.a)), star.a, 1e-12));
  assert.deepEqual(stars.map((star) => Math.round(sizeOf(star.a) * 100) / 100), [0.17, 0.5, 1]);
});

test('pitch: higher up is higher, on the five notes, and the picture reads E, G, C, D, E', () => {
  const rows = PICTURE.map((light) => rowOf(light.y));
  assert.deepEqual(rows.map(nameOf), ['E5', 'G4', 'C5', 'D5', 'E4']);
  // a dot is short and bright: an octave over its row
  const heard = PICTURE.map((light, i) => soundOf({ ...light, row: rows[i] }));
  assert.ok(near(heard[1], 783.99, 0.05) && near(heard[3], 1174.66, 0.05), 'the dots sound G5 and D6');
  assert.ok(near(heard[0], 659.25, 0.05) && near(heard[2], 523.25, 0.05) && near(heard[4], 329.63, 0.05), 'the stars E5, C5, E4');
  // the same pitches the rest of the app is made of (penny/notes.js)
  for (const [row, hz] of [[9, 261.63], [8, 293.66], [7, 329.63], [6, 392], [5, 440], [4, 523.25], [0, 880], [-1, 1046.5]]) {
    assert.ok(near(pitchOf(row), hz, 0.05), `row ${row}: ${pitchOf(row)}`);
  }
  // every row, far above the picture and far below it, is one of the five, and lower than the row above
  for (let row = -12; row < 24; row++) {
    assert.ok(noteOf(row) >= 0 && noteOf(row) <= 4);
    assert.ok(pitchOf(row + 1) <= pitchOf(row));
    if (row >= -6 && row < 15) assert.ok(pitchOf(row + 1) < pitchOf(row), `row ${row}`);
  }
  assert.equal(nameOf(-40), 'C7', 'no higher than this');
  assert.equal(nameOf(40), 'A2', 'and no lower');
  assert.equal(ROWS, 10);
});

test('a tap is a dot; a finger held still grows a star, quickly at first, and the picture\'s take a beat, a breath and a long breath', () => {
  assert.equal(grown(0), null);
  assert.equal(grown(TAP_MS - 1), null, 'a tap: nothing grown');
  assert.equal(grown(TAP_MS), 0);
  assert.equal(grown(FULL_MS), 1);
  assert.equal(grown(FULL_MS * 3), 1, 'as big as they come, and no bigger');
  let last = -1;
  let lastGain = Infinity;
  for (let ms = TAP_MS; ms <= FULL_MS; ms += 100) {
    const size = grown(ms);
    assert.ok(size > last, 'the longer, the bigger');
    if (last >= 0) {
      assert.ok(size - last < lastGain, 'and more slowly the bigger it is');
      lastGain = size - last;
    }
    last = size;
  }
  const took = stars.map((star) => heldFor(sizeOf(star.a)));
  assert.ok(took[0] > 500 && took[0] < 800, `the small one: ${took[0]}`);
  assert.ok(took[1] > 1300 && took[1] < 1900, `the middle one: ${took[1]}`);
  assert.ok(near(took[2], FULL_MS, 1e-6), `the big one: ${took[2]}`);
  for (const size of [0, 0.1, 0.5, 0.9, 1]) assert.ok(near(grown(heldFor(size)), size, 1e-9), 'heldFor is grown the other way round');
});

test('what is slow stays, and what is fast does not', () => {
  assert.equal(slowness(0), 1);
  assert.equal(slowness(FAST), 0);
  assert.equal(slowness(FAST * 4), 0);
  assert.equal(sown(slowness(FAST)), null, 'a rush sows nothing');
  assert.equal(sown(slowness(FAST * 0.9)), null);
  assert.ok(sown(slowness(FAST * 0.5)) > 0);
  assert.ok(sown(1) > sown(0.6) && sown(0.6) > sown(0.3), 'the slower, the bigger');
  assert.ok(sown(1) < sizeOf(stars[1].a), 'but never as big as a finger held still can make');
});

test('time: the picture is read left to right, once a turn, and no two turns need be alike', () => {
  assert.equal(PHRASE.length, PICTURE.length);
  assert.deepEqual(PHRASE, [...PHRASE].sort((a, b) => a - b));
  // as far apart in time as they are from left to right, to within a step
  const perStep = (PICTURE[4].x - PICTURE[0].x) / (PHRASE[4] - PHRASE[0]);
  for (const [i, light] of PICTURE.entries()) assert.ok(Math.abs((light.x - PICTURE[0].x) / perStep - (PHRASE[i] - PHRASE[0])) <= 1, `light ${i}`);
  assert.ok(PHRASE.at(-1) < TURN / 2, 'and then a long quiet, for whatever a hand has made');
  assert.ok(TURN * STEP > 20 && TURN * STEP < 25, 'a turn is slow');
  assert.equal(ECHO * STEP, 0.8);

  assert.deepEqual(reading(0).map((note) => [note.index, note.step]), PHRASE.map((step, index) => [index, step]), 'as written');
  const seen = new Set();
  for (let chance = 0; chance < 1; chance += 0.01) {
    const notes = reading(chance);
    seen.add(JSON.stringify(notes));
    assert.deepEqual(notes.map((note) => note.step), [...notes.map((note) => note.step)].sort((a, b) => a - b), 'still in order');
    assert.deepEqual(notes.filter((note) => PICTURE[note.index].kind === 'star').map((note) => note.index), [0, 2, 4], 'the three stars always sound, in their order');
    assert.ok(notes.at(-1).index === 4 && notes.at(-1).step < TURN / 2, 'and the big one last');
  }
  assert.equal(seen.size, 5, 'five ways of reading it');
});

test('a light keeps its own time: the bigger, the slower round and the longer lived, and a dot is gone after three', () => {
  const star = (size, row = 4) => ({ kind: 'star', size, row });
  const dot = (row) => ({ kind: 'dot', row });
  assert.equal(nearness(dot(3)), 0);
  assert.equal(nearness(star(0.5)), 0.5);
  assert.equal(soundings(dot(3)), 3);
  assert.ok(keeps(dot(3)) ** 2 > OUT && keeps(dot(3)) ** 3 < OUT);
  let last = star(0);
  for (let size = 0.1; size <= 1.001; size += 0.1) {
    const next = star(Math.min(1, size));
    assert.ok(period(next) >= period(last), 'slower round');
    assert.ok(keeps(next) > keeps(last) && soundings(next) >= soundings(last), 'longer lived');
    last = next;
  }
  // nothing a hand makes locks to the picture's turn, or lasts for ever
  for (let size = 0; size <= 1.001; size += 0.02) {
    const light = star(Math.min(1, size));
    assert.equal(period(light) % 2, 1, 'odd, where a turn is even');
    assert.ok(keeps(light) < 1 && Number.isFinite(soundings(light)));
  }
  for (const row of [0, 1, 2, 3]) assert.equal(period(dot(row)) % 2, 1);
  assert.equal(TURN % 2, 0);
  const minutes = (light) => (soundings(light) * period(light) * STEP) / 60;
  assert.ok(minutes(star(sizeOf(stars[0].a))) < 1.5, 'a small star lasts about a minute');
  assert.ok(minutes(star(1)) > 4 && minutes(star(1)) < 9, 'the biggest, several');
});

test('the night under it is the game\'s four chords, and no note of it rubs against the big star', () => {
  assert.deepEqual(NIGHT.map((chord) => chord.name), ['C', 'A minor', 'F', 'G']);
  const big = soundOf({ kind: 'star', row: rowOf(PICTURE[4].y) });
  for (const chord of NIGHT) {
    assert.ok(chord.under.length >= 3 && chord.air.length === 3);
    for (const [pitch, share] of chord.under) {
      assert.ok(pitch < 300 && share > 0 && share <= 1, 'held low, under everything');
      assert.ok(Math.abs(12 * Math.log2(big / pitch)) > 1.5, `${chord.name}: ${pitch} is a semitone from the big star`);
    }
    assert.ok(chord.under.some(([pitch]) => pitch >= 196), 'something of it can be heard on a phone');
  }
});

test('the picture fits the window: all of its lights on the screen, and Penny\'s corner empty', () => {
  const square = frame(1024, 1024);
  assert.deepEqual(square, { side: 1024, x: 0, y: 0 }, 'a square window is the picture itself');
  const windows = [[390, 844], [390, 664], [360, 640], [320, 568], [844, 390], [768, 1024], [1024, 768], [1440, 900], [2560, 1440]];
  for (const [width, height] of windows) {
    const { side, x, y } = frame(width, height);
    for (const light of PICTURE) {
      const [w, h] = light.kind === 'star' ? [light.a, light.b] : [light.r, light.r];
      assert.ok(x + (light.x - w) * side >= 0 && x + (light.x + w) * side <= width, `${width}x${height}: off the side`);
      assert.ok(y + (light.y - h) * side >= 0 && y + (light.y + h) * side <= height, `${width}x${height}: off the top or bottom`);
    }
    assert.ok(side / ROWS >= 32, `${width}x${height}: a row is wide enough for a finger`);
    // nothing of the picture over where Penny stands, at the size Penny is drawn (penny/pal.css)
    const rem = 16;
    const palWide = Math.max(7 * rem, Math.min(0.42 * width, 0.3 * height, 13 * rem));
    const [left, right, top] = [PENNY_AT * width - palWide / 2, PENNY_AT * width + palWide / 2, height - palWide * (62 / 72)];
    for (const light of PICTURE) {
      const [w, h] = light.kind === 'star' ? [light.a, light.b] : [light.r, light.r];
      const [lx, ly] = [x + light.x * side, y + light.y * side];
      const over = lx + w * side > left && lx - w * side < right && ly + h * side > top;
      assert.ok(!over, `${width}x${height}: a light of the picture is behind Penny`);
    }
  }
});
