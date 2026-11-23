// Penny's story (/?penny), told without a word: no captions, no instructions.
// The only sound on this screen is Penny's voice, a closed-mouth hum from its
// seal, and the seal brightens with every note so the voice can be seen too.
//
// What happens: Penny is alone in the rain; feels something warm inside; calls
// out, and nothing comes back; morning comes, and a post box with it; Penny
// hums into the post, and then waits. (Penny is alone in all of this: Dot is
// met later, a quarter of the way through what follows.) Until the screen is
// touched Penny goes on waiting, calling less and less often; a touch lets the
// story go on, and an answer comes. Where the answer comes from, and who sent
// it, the story does not say: it is a light from a long way off, and after it
// Penny is glad. That one answer is why Penny is searching now
// (penny/mail.js). Afterwards a touch has Penny write again, and nothing more
// comes back.

import { audio, isMuted } from '/postmarks/sound.js';
import { A4, ASK, C5, C6, D5, E5, G4, G5, A5, HELLO, SAG, TRILL, createVoice } from './penny.js';

const SVG = 'http://www.w3.org/2000/svg';

// The phrases only the story uses (the rest are in penny.js).
const LONELY = [[A4, 0.75], [G4, 1.3]];
const INSIDE = [[E5, 1.5]];
const INSIDE_SURER = [[C5, 0.45], [E5, 1.7]];
const LETTER = [[D5, 0.28], [G5, 0.5], [0, 0.18], [E5, 1.1], [0, 0.12], [D5, 0.36], [C5, 1.2]];
const ANYONE = [[D5, 0.22], [E5, 0.45]];
const MISSING = [[E5, 0.5], [C5, 1.3]];
const GASP = [[C5, 0.16, A5]];
const JOY = [[D5, 0.24], [G5, 0.42], [0, 0.12], [E5, 0.8], [0, 0.1], [G5, 0.3], [A5, 0.3], [C6, 1.3]];
const GLAD = [HELLO, [[E5, 0.2], [G5, 0.2], [A5, 0.45]], TRILL];

const GROUND = 262; // where feet stand, in the drawing's own units
const SEAL_UP = 25.8; // its seal, above its feet
const SLOT = { x: 58, y: 208.5 }; // the post box's slot
const BOX_TOP = { x: 46, y: 186 };
const STAR = { x: 160, y: 50 };

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.penny-story');
  const stage = root.querySelector('.penny-stage');
  const rain = root.querySelector('.penny-rain');
  const penny = stage.querySelector('.p-penny');
  const box = stage.querySelector('.p-box');
  const star = stage.querySelector('.p-star');
  const seal = stage.querySelector('.seal');
  const air = stage.querySelector('.p-air');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms));
  let pennyX = 118;

  // --- The rain ------------------------------------------------------------------
  for (let i = 0; i < 26; i++) {
    const drop = document.createElement('i');
    drop.style.left = `${Math.random() * 100}%`;
    if (still) drop.style.top = `${Math.random() * 90}%`;
    drop.style.setProperty('--t', `${0.7 + Math.random() * 0.5}s`);
    drop.style.setProperty('--wait', `${-Math.random() * 1.2}s`);
    rain.append(drop);
  }

  // --- What the voice looks like -------------------------------------------------
  const sealAt = () => ({ x: pennyX, y: GROUND - SEAL_UP });
  function mote(colour, r = 2.2) {
    const circle = document.createElementNS(SVG, 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', colour);
    air.append(circle);
    return circle;
  }
  // Move a mote through some points, then take it away. Resolves when it lands.
  function fly(circle, points, ms, { fade = false } = {}) {
    const frames = points.map((p, i) => ({
      transform: `translate(${p.x}px, ${p.y}px) scale(${p.s ?? 1})`,
      opacity: fade && i === points.length - 1 ? 0 : 1,
    }));
    const flight = circle.animate(frames, { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    return Promise.race([flight.finished.catch(() => {}), wait(ms + 50)]).then(() => circle.remove());
  }
  // Each note it hums: the seal brightens, and the note leaves it, either up
  // into the air or across into the post.
  function show(freq, dur, into) {
    seal.classList.remove('sound');
    void seal.getBoundingClientRect();
    seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
    seal.classList.add('sound');
    if (still) return;
    const from = sealAt();
    const lift = 14 + 26 * Math.log2(freq / G4); // higher notes rise further
    if (into === 'post') {
      fly(mote('#c8442e'), [from, { x: (from.x + SLOT.x) / 2, y: from.y - 24 - lift / 2 }, { ...SLOT, s: 0.5 }], 900).then(() => flash(box));
    } else {
      const lean = (Math.random() - 0.5) * 16;
      fly(mote('#c8442e'), [from, { x: from.x + lean, y: from.y - 18 - lift, s: 0.6 }], 700 + dur * 500, { fade: true });
    }
  }
  function flash(what) {
    what.classList.remove('flash');
    void what.getBoundingClientRect();
    what.classList.add('flash');
  }

  // The app's music stands aside here: nothing sounds but it.
  const voice = createVoice(life, { onNote: show, alone: true });
  const sing = (phrase, level = 1, { into = 'air', breath = 1 } = {}) => voice.sing(phrase, level, { breath, tag: into });

  // --- What they do ---------------------------------------------------------------
  const act = (who, name) => {
    const body = who.querySelector('.act');
    body.classList.remove('hop', 'wiggle');
    void body.getBoundingClientRect();
    body.classList.add(name);
  };
  const look = (who, dx, dy) => { who.querySelector('.eyes').style.translate = `${dx}px ${dy}px`; };
  const stand = (who, x) => { who.style.translate = `${x}px ${GROUND}px`; };
  function hearts(n) {
    if (still) return;
    for (let i = 0; i < n; i++) {
      const heart = document.createElementNS(SVG, 'text');
      heart.textContent = '♥';
      air.append(heart);
      const x = pennyX + (i - (n - 1) / 2) * 16;
      const y = GROUND - 58;
      heart.animate([
        { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 8}px) scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${x + (i - 1) * 4}px, ${y - 34}px) scale(1.15)`, opacity: 0 },
      ], { duration: 1500, delay: i * 140, easing: 'ease-out', fill: 'both' });
      life.setTimeout(() => heart.remove(), 1800 + i * 140);
    }
  }
  // What it posted leaves the box for somewhere far away.
  function away() {
    star.classList.add('lit');
    if (still) return wait(600).then(() => flash(star));
    return fly(mote('#f8d95a', 2.6), [BOX_TOP, { x: 96, y: 96 }, { ...STAR, s: 0.5 }], 1700).then(() => flash(star));
  }
  // And an answer comes back the same way. It is the colour of the star it
  // comes from and of nothing else: nothing about it says whose it is.
  async function answer() {
    const colour = '#f8d95a';
    flash(star);
    if (still) {
      await wait(700);
      flash(box);
      await wait(500);
      return;
    }
    await fly(mote(colour, 2.8), [{ ...STAR, s: 0.5 }, { x: 96, y: 96 }, BOX_TOP], 1500);
    flash(box);
    const to = sealAt();
    await fly(mote(colour, 2.8), [SLOT, { x: (SLOT.x + to.x) / 2, y: to.y - 26 }, to], 800);
  }

  // --- A touch ---------------------------------------------------------------------
  let touched = 0; // when the screen was first touched
  let waiting = null; // while it waits: what to call when an answer is sent
  let settled = false; // the story has been told; it is glad
  let busy = false;
  async function touch(onPenny) {
    touched ||= performance.now();
    if (waiting) {
      const sent = waiting;
      waiting = null;
      sent();
    } else if (settled && !busy) {
      busy = true;
      if (onPenny) {
        act(penny, 'hop');
        hearts(1);
        await sing(HELLO);
      } else {
        // it writes again, and it goes; this time nothing comes back
        look(penny, -1.2, -0.6);
        await sing(GLAD[Math.floor(Math.random() * GLAD.length)], 1, { into: 'post' });
        await away();
        look(penny, 0, 0);
      }
      busy = false;
    }
  }
  main.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.target.closest('.penny-back')) return;
    touch(Boolean(event.target.closest('.p-penny')));
  });
  life.on(window, 'keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') touch(false);
  });

  // Sound needs a first touch. Arriving from the home page has given one;
  // opened directly, the story holds its breath until the screen is touched.
  const ready = () => new Promise((go) => {
    const check = () => {
      if (isMuted() || audio() || (touched && performance.now() - touched > 700)) go();
      else life.setTimeout(check, 120);
    };
    check();
  });

  // --- The story --------------------------------------------------------------------
  async function story() {
    main.dataset.sky = 'night';
    penny.classList.add('low');
    look(penny, 0, 1.4);
    await ready();

    // alone, in the rain
    await wait(1500);
    await sing(LONELY, 0.6);
    await wait(1800);

    // something warm inside it, that it cannot read
    rain.classList.add('thin');
    penny.classList.add('warm');
    await wait(1500);
    await sing(INSIDE, 0.55);
    await wait(800);
    penny.classList.remove('low');
    look(penny, 0, 0);
    await sing(INSIDE_SURER, 0.75);
    await wait(1000);

    // it calls out, one way and the other, and nothing comes back
    rain.classList.add('gone');
    look(penny, -1.5, -0.8);
    await sing(HELLO, 0.9);
    await wait(1600);
    look(penny, 1.5, -0.8);
    await sing(HELLO, 1.1);
    await wait(2000);
    penny.classList.add('low');
    look(penny, 0, 1.3);
    await sing(SAG, 0.6);
    await wait(1400);

    // Morning comes anyway, and with it something it has not seen before: a post box
    main.dataset.sky = 'dawn';
    await wait(1500);
    box.classList.add('here');
    await wait(1100);
    penny.classList.remove('low');
    look(penny, -1.6, -0.3);
    await wait(800);
    await sing(ASK, 0.8);
    await wait(600);
    pennyX = 106;
    stand(penny, pennyX);
    act(penny, 'wiggle');
    await wait(1400);

    // it hums what it carries into the post
    await sing(LETTER, 1, { into: 'post' });
    await wait(900);
    await away();

    // and waits
    look(penny, 1.2, -1.2);
    const answered = new Promise((sent) => { waiting = sent; });
    (async () => {
      let pause = 4200;
      let calls = 0;
      while (waiting) {
        await wait(pause);
        if (!waiting) break;
        if (calls >= 2) penny.classList.add('low');
        await sing(calls % 2 ? MISSING : ANYONE, Math.max(0.35, 0.7 - calls * 0.07));
        calls += 1;
        pause = Math.min(pause * 1.35, 16000);
      }
    })();
    await answered;

    // an answer
    await answer();
    penny.classList.remove('low');
    penny.classList.add('glad');
    look(penny, 0, 0);
    act(penny, 'hop');
    await sing(GASP, 0.9, { breath: 3 });
    await wait(350);
    hearts(3);
    await sing(TRILL);
    main.dataset.sky = 'day';
    await wait(1200);

    // and it writes back
    await sing(JOY, 1.05, { into: 'post' });
    await wait(700);
    await away();
    settled = true;
  }
  story();
}
