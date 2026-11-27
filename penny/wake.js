// The discovery, shot one: the spark that got away (/?wake). No words.
//
// The second bar of the meadow (README, "The meadow comes alive in three
// stages") is a discovery Penny makes: the energy it has been earning is not
// only its own, it runs through everything, and by its light the things of the
// meadow are seen for what they were all along: alive, and asleep. Until now
// that has had no scene; the room was simply different the next time it was
// opened. This is the first shot of that scene, and it is a first draft.
//
// A meadow in the sun, and a stepping stone in the grass, the kind a game is
// started from. Penny stands at the edge, warm, its seal aglow with all it has
// earned, looking at the meadow with you. Nothing happens for a while.
//
// Then a spark slips off its seal, the same spark that runs along the bar, and
// falls into the grass. It does not go out. It runs away through the grass,
// slowly, winding, and Penny, startled and then curious, watches it go. It
// goes into the stone, and the stone lights from inside; and by that light,
// for as long as it lasts, the stone has petals round it, leaf hands at its
// foot, rosy cheeks and two shut eyes. It is a flower, asleep. Then the light
// fades, and it is a stone again; but now it breathes.
//
// Staying is rewarded: once the shot is over, a finger held still on the stone
// lights it again, softly, for as long as it is held, and Penny holds its breath.
// Nobody is woken: that is the third bar's (room/folk.js).
//
// With reduced motion nothing travels: the stone is lit a little, and keeps it,
// and the flower in it can be seen. /?wake&at=after goes to the end of the shot.

import { audio, isMuted, noise, tone } from '/postmarks/sound.js';
import { claim } from './pal.js';
import { GASP, LET_GO, MM, WONDER, hasDot } from './penny.js';

const REST = 2600; // the meadow, before anything happens
const RUN = 4600; // the spark's run through the grass, to the stone
const LIT = 2600; // the stone lit, before its light begins to fade
const HOLD = 450; // how long a finger has to be held still on the stone
const STEADY = 10; // px a held finger may wander and still be held

const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.wake');
  const view = root.querySelector('.wake-meadow');
  const trail = view.querySelector('.wake-trail');
  const glow = view.querySelector('.wake-trail-glow');
  const head = view.querySelector('.wake-head');
  const stone = view.querySelector('.wake-stone');
  const touch = view.querySelector('.wake-touch');
  const said = root.querySelector('#wake-said');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const after = new URLSearchParams(location.search).get('at') === 'after';
  const rest = (ms) => new Promise((done) => life.setTimeout(done, ms));
  const sounding = () => Boolean(audio()) && !isMuted() && !still;

  // Penny, at the edge, warm with all it has earned, looking at the meadow.
  const pal = claim(life, { x: 0.3, height: 'up', mood: 'calm', dot: hasDot() });
  pal.glow(0.9);

  // Where a point of the meadow is on the screen, and back.
  const toScreen = (x, y) => {
    const m = view.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m) : { x, y };
  };
  const toMeadow = (x, y) => {
    const m = view.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : { x, y };
  };
  const stoneAt = () => stone.querySelector('.wake-stone-body').getBoundingClientRect();
  const lookAtStone = () => pal.look(stoneAt());

  // The way the spark goes: from where it lands, in the grass just past Penny's
  // edge, winding up through the meadow to the foot of the stone.
  function lay() {
    const seal = pal.penny.querySelector('.seal').getBoundingClientRect();
    const paper = pal.penny.getBoundingClientRect();
    const land = toMeadow(seal.left + seal.width / 2 + paper.width * 0.28, paper.top + paper.height * 0.12);
    const [sx, sy] = [Math.max(18, Math.min(182, land.x)), Math.min(396, land.y)];
    const [ex, ey] = [125, 292];
    const [dx, dy] = [ex - sx, ey - sy];
    const far = Math.hypot(dx, dy) || 1;
    // (a point part of the way along, pushed to one side of the straight line by `side` units: it winds, as a root does)
    const along = (t, side) => [sx + dx * t - (dy / far) * side, sy + dy * t + (dx / far) * side].map((v) => v.toFixed(1)).join(' ');
    trail.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)}C${along(0.18, 22)} ${along(0.4, -26)} ${along(0.55, 0)}S${along(0.88, -14)} ${ex} ${ey}`);
    glow.setAttribute('d', trail.getAttribute('d'));
    const length = trail.getTotalLength();
    for (const line of [trail, glow]) {
      line.style.strokeDasharray = `${length}`;
      line.style.strokeDashoffset = `${length}`;
    }
    return { length, start: { x: sx, y: sy } };
  }

  // The stone lit from inside, and the flower it is seen to be by that light.
  const light = (on) => stone.classList.toggle('lit', on);
  const breathe = () => stone.classList.add('breathing');
  const say = (words) => { said.textContent = words; };

  // The end of the shot: the stone a stone again, breathing; and from now on a
  // finger held still on it lights it, for as long as it is held.
  function over() {
    main.dataset.shot = 'over';
    pal.mood('curious');
    lookAtStone();
    breathe();
    let held = null;
    let from = null;
    const letGo = () => {
      clearTimeout(held);
      held = null;
      from = null;
      if (stone.classList.contains('held')) {
        stone.classList.remove('held');
        pal.mood('curious').sing(LET_GO, 0.5);
      }
    };
    touch.addEventListener('pointerdown', (event) => {
      from = { x: event.clientX, y: event.clientY };
      try { touch.setPointerCapture(event.pointerId); } catch { /* (it is held all the same) */ }
      held = setTimeout(() => {
        stone.classList.add('held');
        pal.mood('holding').sing(MM, 0.5);
        lookAtStone();
        say('By your light, the stone is a flower again, asleep.');
      }, HOLD);
    }, { signal: ending.signal });
    touch.addEventListener('pointermove', (event) => {
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > STEADY) letGo();
    }, { signal: ending.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) touch.addEventListener(type, letGo, { signal: ending.signal });
    life.onEnd(() => clearTimeout(held));

    // Left alone, Penny glances at you now and then, as if to ask whether you saw it too, and back.
    const wonder = () => {
      if (life.over) return;
      if (!stone.classList.contains('held')) {
        pal.look(null);
        life.setTimeout(() => { if (!stone.classList.contains('held')) lookAtStone(); }, 1300);
      }
      life.setTimeout(wonder, 6000 + Math.random() * 4000);
    };
    life.setTimeout(wonder, 4500);
  }
  const ending = new AbortController();
  life.onEnd(() => ending.abort());

  // With reduced motion, or asked for the end: the end, at once.
  if (still || after) {
    if (still) stone.classList.add('kept');
    say('A stepping stone in the grass. By the light in it, it has petals, leaf hands and shut eyes: a flower, asleep.');
    life.setTimeout(over, 0);
    return;
  }

  // --- The shot ---------------------------------------------------------------------------
  let frame = 0;
  life.onEnd(() => cancelAnimationFrame(frame));
  (async () => {
    lookAtStone();
    await rest(REST);
    if (life.over) return;

    // The spark slips off its seal and falls into the grass.
    const { length, start } = lay();
    const seal = pal.penny.querySelector('.seal').getBoundingClientRect();
    const land = toScreen(start.x, start.y);
    const spark = document.createElement('span');
    spark.className = 'energy-spark wake-spark';
    spark.setAttribute('aria-hidden', 'true');
    document.body.append(spark);
    life.onEnd(() => spark.remove());
    const size = spark.getBoundingClientRect().width || 22;
    const [x0, y0] = [seal.left + seal.width / 2 - size / 2, seal.top + seal.height / 2 - size / 2];
    const [x1, y1] = [land.x - size / 2, land.y - size / 2];
    spark.style.left = `${x0}px`;
    spark.style.top = `${y0}px`;
    pal.glow(1, 200);
    if (sounding()) tone({ freq: 1320, to: 1760, dur: 0.22, gain: 0.03, attack: 0.01 });
    const fall = spark.animate([
      { transform: 'scale(0.4) rotate(0deg)', opacity: 0.6 },
      { transform: `translate(${(x1 - x0) * 0.5}px, ${(y1 - y0) * 0.5 - 40}px) scale(1) rotate(90deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(0.7) rotate(180deg)`, opacity: 1 },
    ], { duration: 1100, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
    await rest(160);
    pal.mood('surprised').gesture('start').sing(GASP, 0.6);
    pal.glow(0.55, 900); // (it has given some of it away)
    pal.look({ x: land.x, y: land.y });
    await fall.finished.catch(() => {});
    if (life.over) return;
    spark.remove();
    say('A spark has fallen from Penny’s seal into the grass. It runs away through the meadow.');

    // It does not go out: it runs through the grass, winding, to the stone.
    head.classList.add('on');
    if (sounding()) noise({ dur: RUN / 1000, from: 2600, to: 1100, q: 0.8, gain: 0.01 });
    pal.mood('curious');
    life.setTimeout(() => pal.goTo(0.38), 900);
    await new Promise((done) => {
      const began = performance.now();
      let glanced = 0;
      const step = (now) => {
        if (life.over) return done();
        const t = Math.min(1, (now - began) / RUN);
        const at = ease(t) * length;
        const p = trail.getPointAtLength(at);
        head.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        trail.style.strokeDashoffset = `${length - at}`;
        glow.style.strokeDashoffset = `${length - at}`;
        if (now - glanced > 140) {
          glanced = now;
          const s = toScreen(p.x, p.y);
          pal.look({ x: s.x, y: s.y });
        }
        if (t < 1) frame = requestAnimationFrame(step);
        else done();
      };
      frame = requestAnimationFrame(step);
    });
    if (life.over) return;

    // Into the stone: it lights from inside, and by that light it is a flower, asleep.
    head.classList.remove('on');
    light(true);
    main.dataset.shot = 'lit';
    lookAtStone();
    pal.mood('holding').sing(WONDER, 0.6);
    say('The spark goes into a stepping stone, and it lights from inside. By that light it has petals, leaf hands and shut eyes: it is a flower, asleep.');
    await rest(LIT);
    if (life.over) return;

    // The light fades, and the trail with it; and it is a stone again, breathing.
    light(false);
    view.classList.add('trail-gone');
    pal.mood('hopeful');
    await rest(2400);
    if (life.over) return;
    say('The light has gone, and it is a stone again. But it breathes.');
    over();
  })();
}
