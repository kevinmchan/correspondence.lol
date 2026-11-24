import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CORE, ECHO, GHOSTS, GLINT, NIGHT, PHRASE, PICTURE, POINTED, REST, ROWS, STEP, TALL, TURN,
  drift, flicker, frame, nameOf, nearness, often, outline, reading, roam, rowOf, shimmer, soundOf, sway,
} from '../penny/stars.js';

// The night is a picture come to life. These check that the picture is the
// one it was drawn from, that it is read as the README says it is, and that
// what makes it alive never takes it far from the picture.

const stars = PICTURE.filter((light) => light.kind === 'star');
const dots = PICTURE.filter((light) => light.kind === 'dot');
const near = (a, b, by = 1e-9) => Math.abs(a - b) <= by;
// the same chances in the same order every time, so that a walk can be walked again
function chancesFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('the picture: three stars in a falling line, each bigger than the last, and two dots beside it', () => {
  assert.equal(PICTURE.length, 5, 'five lights, and never another');
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
  for (const point of [[1, 0], [0, 1], [-1, 0], [0, -1]]) assert.ok(edge.some(([x, y]) => near(x, point[0], 1e-12) && near(y, point[1], 1e-12)), `${point}`);
  const turns = edge.map(([x, y], i) => {
    const [nx, ny] = edge[(i + 1) % edge.length];
    return x * ny - y * nx;
  });
  assert.ok(turns.every((turn) => turn > 0), 'once round, without doubling back');
  // between two points the edge comes in to a quarter of the way out: a circle's would be seven tenths
  const waist = Math.min(...edge.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(waist > 0.25 && waist < 0.29, `${waist}`);
});

test('size is nearness: the big star as near as anything gets, and a dot as far', () => {
  assert.deepEqual(PICTURE.map((light) => Math.round(nearness(light) * 100) / 100), [0.17, 0, 0.5, 0, 1]);
});

test('pitch: higher up is higher, on the five notes, and the picture reads E, G, C, D, E', () => {
  assert.deepEqual(PICTURE.map((light) => nameOf(rowOf(light.y))), ['E5', 'G4', 'C5', 'D5', 'E4']);
  // a dot is short and bright: an octave over its row
  const heard = PICTURE.map(soundOf);
  assert.ok(near(heard[1], 783.99, 0.05) && near(heard[3], 1174.66, 0.05), 'the dots sound G5 and D6');
  assert.ok(near(heard[0], 659.25, 0.05) && near(heard[2], 523.25, 0.05) && near(heard[4], 329.63, 0.05), 'the stars E5, C5, E4');
  const names = Array.from({ length: ROWS }, (_, row) => nameOf(row));
  assert.deepEqual(names, ['A5', 'G5', 'E5', 'D5', 'C5', 'A4', 'G4', 'E4', 'D4', 'C4'], 'the five notes the rest of the app keeps to, top to bottom');
});

test('time: the picture is read left to right, once a turn, and no two turns need be alike', () => {
  assert.equal(PHRASE.length, PICTURE.length);
  assert.deepEqual(PHRASE, [...PHRASE].sort((a, b) => a - b));
  // as far apart in time as they are from left to right, to within a step
  const perStep = (PICTURE[4].x - PICTURE[0].x) / (PHRASE[4] - PHRASE[0]);
  for (const [i, light] of PICTURE.entries()) assert.ok(Math.abs((light.x - PICTURE[0].x) / perStep - (PHRASE[i] - PHRASE[0])) <= 1, `light ${i}`);
  assert.ok(PHRASE.at(-1) < TURN / 2, 'and then a long quiet');
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

test('the night under it is the game\'s four chords, and no note of it rubs against the big star', () => {
  assert.deepEqual(NIGHT.map((chord) => chord.name), ['C', 'A minor', 'F', 'G']);
  const big = soundOf(PICTURE[4]);
  for (const chord of NIGHT) {
    assert.ok(chord.under.length >= 3);
    for (const [pitch, share] of chord.under) {
      assert.ok(pitch < 300 && share > 0 && share <= 1, 'held low, under everything');
      assert.ok(Math.abs(12 * Math.log2(big / pitch)) > 1.5, `${chord.name}: ${pitch} is a semitone from the big star`);
    }
    assert.ok(chord.under.some(([pitch]) => pitch >= 196), 'something of it can be heard on a phone');
  }
});

test('far dimmer than the picture: at rest under half its brightness, and never as bright even at a twinkle', () => {
  assert.ok(REST <= 0.45, 'at rest');
  assert.ok(GLINT > REST * 1.3 && GLINT <= 0.75, 'a twinkle is plainly brighter, and still well short of the picture');
  // a light is itself and its copies: together they come to its brightness at rest
  assert.ok(CORE > 0 && CORE < REST && GHOSTS >= 4);
  assert.ok(near(CORE + GHOSTS * ((REST - CORE) / GHOSTS), REST));
});

test('a light wanders, but never far from where the picture has it', () => {
  const chance = chancesFrom(7);
  // however long or short the steps it is taken in, it is found as far from its place on the whole
  for (const seconds of [1 / 240, 1 / 60, 1 / 20, 1 / 4]) {
    let at = [0, 0];
    let [sum, squares, steps, furthest] = [0, 0, 0, 0];
    for (let t = 0; t < 3000; t += seconds) {
      at = sway(at, seconds, { spread: 1, pace: 0.8 }, chance);
      sum += at[0];
      squares += at[0] ** 2;
      steps += 1;
      furthest = Math.max(furthest, Math.abs(at[0]));
    }
    const found = Math.sqrt(squares / steps - (sum / steps) ** 2);
    assert.ok(found > 0.9 && found < 1.1, `in steps of ${seconds}: found ${found} from its place on the whole`);
    assert.ok(Math.abs(sum / steps) < 0.08, 'to one side as often as the other');
    assert.ok(furthest < 6, 'and it is always pulled back');
  }
  // its path has no corners in it: from one sixtieth of a second to the next it hardly moves
  let at = [0, 0];
  let biggest = 0;
  for (let i = 0; i < 20000; i++) {
    const was = at[0];
    at = sway(at, 1 / 60, { spread: 1, pace: 0.8 }, chance);
    biggest = Math.max(biggest, Math.abs(at[0] - was));
  }
  assert.ok(biggest < 0.5, `${biggest}`);

  for (const light of PICTURE) {
    const [wander, copies] = [drift(light), shimmer(light)];
    const reach = light.kind === 'star' ? light.a : light.r;
    assert.ok(wander.spread < 0.012, 'it strays about a hundredth of the picture\'s side at most, on the whole');
    assert.ok(copies.spread <= reach * 0.2 + 1e-12, 'its copies stay well inside its own size: a small light is not lost among them');
    assert.ok(copies.pace > wander.pace * 4, 'its copies tremble; it drifts');
    assert.ok(drift(light, 1).spread > wander.spread && shimmer(light, 1).spread > copies.spread, 'warmed, further');
    assert.ok(often(light, 1) < often(light) / 4, 'and warmed, it twinkles far sooner');
  }
  // the far ones stray further, flicker more and twinkle oftener than the near one
  const [small, , , , big] = PICTURE;
  assert.ok(drift(small).spread > drift(big).spread && shimmer(small).spread > shimmer(big).spread);
  assert.ok(flicker(small).spread > flicker(big).spread * 2, 'stars twinkle; a planet hardly does');
  assert.ok(often(small) < often(big));
});

test('a mote set loose is not pulled back: the longer it is left, the further it has got', () => {
  const chance = chancesFrom(11);
  const after = (seconds) => {
    let squares = 0;
    for (let n = 0; n < 4000; n++) {
      let at = 0;
      for (let t = 0; t < seconds; t += 1 / 30) at = roam(at, 1 / 30, 1, chance);
      squares += at ** 2;
    }
    return Math.sqrt(squares / 4000);
  };
  const [one, four] = [after(1), after(4)];
  assert.ok(one > 0.9 && one < 1.1, `after a second: ${one}`);
  assert.ok(four > 1.8 && four < 2.2, `four times as long, twice as far: ${four}`);
});

test('the picture fits the window, all of its lights on the screen', () => {
  assert.deepEqual(frame(1024, 1024), { side: 1024, x: 0, y: 0 }, 'a square window is the picture itself');
  for (const [width, height] of [[390, 844], [390, 664], [360, 640], [320, 568], [844, 390], [768, 1024], [1024, 768], [1440, 900], [2560, 1440]]) {
    const { side, x, y } = frame(width, height);
    for (const light of PICTURE) {
      const [w, h] = light.kind === 'star' ? [light.a, light.b] : [light.r, light.r];
      // (with room for how far it may wander)
      assert.ok(x + (light.x - w - 0.02) * side >= 0 && x + (light.x + w + 0.02) * side <= width, `${width}x${height}: off the side`);
      assert.ok(y + (light.y - h - 0.02) * side >= 0 && y + (light.y + h + 0.02) * side <= height, `${width}x${height}: off the top or bottom`);
    }
  }
});

test('the night is on no menu: it is found', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(page.includes('<template id="screen-sky">'), 'it is a screen of the app');
  assert.equal((page.match(/href="\/\?sky"/g) ?? []).length, 0, 'and nothing on the page leads to it');
  const scene = page.slice(page.indexOf('<template id="screen-sky">'), page.indexOf('</template>', page.indexOf('<template id="screen-sky">')));
  assert.ok(!/penny-art|p-penny/.test(scene), 'Penny is not drawn in it');
  const screen = readFileSync(new URL('../penny/sky.js', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/pal\.js'|from '\/penny\/pal\.js'/.test(screen), 'and Penny is not asked to stand under it');
});
