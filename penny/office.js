// Scene one: the last one left (/?office). No words.
//
// The Dead Letter Office, at night: where mail goes that cannot be delivered.
// Shelves of pigeonholes, nearly all empty; one lamp; and on the far wall the
// map, by which mail is sorted. Penny has been here longer than anything.
//
// A letter leaves. Penny tries to, and cannot. Then a sound comes out of the
// map, a long way off, and Penny knows it is meant for it. It answers, and
// waits, as it always has. And then, for the first time, it turns away from
// the map and looks at whoever is watching. One square of the map lights. That
// square is where the walk begins (penny/walk.js).

import { audio, isMuted } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { HELLO, SAG, createVoice } from './penny.js';
import { playMail, remembered } from './mail.js';

const SVG = 'http://www.w3.org/2000/svg';
const FLOOR = 262;
// the map on the wall: five squares by five, and where each is
const MAP = { x: 58, y: 44, pitch: 17, side: 14 };
const square = (col, row) => ({ x: MAP.x + col * MAP.pitch + MAP.side / 2, y: MAP.y + row * MAP.pitch + MAP.side / 2 });

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.office');
  const stage = root.querySelector('.office-stage');
  const penny = stage.querySelector('.p-penny');
  const seal = penny.querySelector('.seal');
  const air = stage.querySelector('.o-air');
  const leaving = stage.querySelector('.o-leaving');
  const first = stage.querySelector('.o-first');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms));
  let pennyX = 46;

  const voice = createVoice(life, {
    alone: true,
    onNote(pitch, dur) {
      seal.classList.remove('sound');
      void seal.getBoundingClientRect();
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      seal.classList.add('sound');
    },
  });
  const act = (name) => {
    const body = penny.querySelector('.act');
    body.classList.remove('hop', 'wiggle');
    void body.getBoundingClientRect();
    body.classList.add(name);
  };
  const look = (dx, dy) => { penny.querySelector('.eyes').style.translate = `${dx}px ${dy}px`; };
  const stand = (x, size = 1) => {
    pennyX = x;
    penny.style.translate = `${x}px ${FLOOR}px`;
    penny.style.scale = size;
  };
  const tile = (col, row) => stage.querySelector(`.o-map rect[data-at="${col},${row}"]`);
  const flash = (element, name) => {
    element.classList.remove(name);
    void element.getBoundingClientRect();
    element.classList.add(name);
  };
  // a ring spreading from a point of the map: a sound, seen
  function ring(at, colour) {
    if (still) return;
    const circle = document.createElementNS(SVG, 'circle');
    circle.setAttribute('cx', at.x);
    circle.setAttribute('cy', at.y);
    circle.setAttribute('r', 3);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', colour);
    circle.setAttribute('stroke-width', 1.2);
    air.append(circle);
    circle.animate([{ r: 3, opacity: 0.9 }, { r: 34, opacity: 0 }], { duration: 1500, easing: 'ease-out', fill: 'forwards' });
    life.setTimeout(() => circle.remove(), 1600);
  }

  // Sound needs a first touch; until there has been one the room simply waits.
  let touched = 0;
  main.addEventListener('pointerdown', () => { touched ||= performance.now(); });
  const ready = () => new Promise((begin) => {
    const check = () => {
      if (isMuted() || audio() || (touched && performance.now() - touched > 700)) begin();
      else life.setTimeout(check, 120);
    };
    check();
  });

  async function scene() {
    penny.classList.add('low');
    look(0, 1.4);
    stand(46);
    await ready();
    await wait(1600);

    // A letter leaves: it lights, lifts out of its slot, and crosses the room into the map
    leaving.classList.add('lit');
    look(1.6, -1.4);
    await wait(900);
    const to = square(3, 1);
    if (!still) {
      await leaving.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: 'translate(-20px, -26px) scale(1)', offset: 0.35 },
        { transform: `translate(${to.x - 177}px, ${to.y - 96}px) scale(0.3)` },
      ], { duration: 2600, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
    }
    leaving.classList.add('gone');
    flash(tile(3, 1), 'took');
    seal.style.setProperty('--d', '900ms');
    flash(seal, 'sound'); // Penny's seal brightens as it watches, and dims again
    await wait(1700);

    // Penny tries: across the floor, under the map, and calls. Nothing lights
    penny.classList.remove('low');
    stand(100);
    act('wiggle');
    await wait(1500);
    look(0, -1.6);
    await voice.sing(HELLO, 0.85);
    await wait(1500);
    act('hop');
    await voice.sing(HELLO, 1.1);
    await wait(1900);
    penny.classList.add('low');
    look(0, 1.3);
    await voice.sing(SAG, 0.6);
    await wait(1600);

    // The sound: from inside the map, one note, a long way off
    const from = square(1, 0);
    penny.classList.remove('low');
    main.classList.add('heard');
    look(-0.8, -1.7);
    const note = remembered(0.95);
    await playMail(life, note, () => ring(from, '#f8d95a'));
    if (life.over) return;
    await wait(500);

    // Penny answers, and waits, as it has always waited
    await voice.sing(note.echo, 0.8);
    await wait(2600);

    // And then it turns from the map, and looks at you
    look(0, 0);
    await wait(1700);
    look(0, -1.6);
    await wait(900);
    look(0, 0);
    await wait(900);
    stand(100, 1.25); // one step towards you
    await wait(1400);

    // One square of the map lights
    main.classList.remove('heard');
    first.classList.add('lit');
    first.setAttribute('tabindex', '0'); // only now is it something to press
    first.setAttribute('role', 'button');
    first.setAttribute('aria-label', 'Begin');
    act('hop');
    look(0, -1.6);
    await wait(900);
    look(0, 0);
  }

  // The lit square is the first place of the walk.
  first.addEventListener('click', () => {
    if (first.classList.contains('lit')) go('/?walk', { quiet: true });
  });
  first.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && first.classList.contains('lit')) go('/?walk', { quiet: true });
  });

  scene();
}
