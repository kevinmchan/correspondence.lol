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
//
// The scene is a handful of screens, and nothing moves on by itself: a swipe
// up is what turns to the next (the up arrow does the same, and so does a
// wheel). Nobody is told so in words. Whoever is caught waiting on the first
// screen is shown: Penny looks out at them, then down at the floor, where a
// fingertip of light appears and slides up the room, with Penny's eyes on it.

import { audio, isMuted } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { ASK, HELLO, SAG, createVoice } from './penny.js';
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
  // The rests between the beats of the scene are written at their full length
  // and played at a little over half of it: the scene was slow.
  const PACE = 0.55;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms * PACE));
  const rest = (ms) => new Promise((done) => life.setTimeout(done, ms)); // (not part of the scene: at its own length)
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

  // Sound needs a first touch, and the first swipe is one: until then the
  // scene is silent, and Penny's seal beats slowly, the one sign that there
  // is something to hear.
  const quiet = () => main.classList.toggle('silent', !isMuted() && !audio());
  quiet();
  main.addEventListener('pointerdown', () => life.setTimeout(quiet, 150));
  life.setInterval(quiet, 1000);

  // The screens of the scene, in order. The first is only Penny, as it is
  // found; each of the others is what a swipe up sets going.
  const screens = [
    // A letter leaves: it lights, lifts out of its slot, and crosses the room into the map
    async () => {
      penny.classList.add('low');
      leaving.classList.add('lit');
      look(1.6, -1.4);
      await wait(900);
      const to = square(3, 1);
      if (!still) {
        await leaving.animate([
          { transform: 'translate(0, 0) scale(1)' },
          { transform: 'translate(-20px, -26px) scale(1)', offset: 0.35 },
          { transform: `translate(${to.x - 177}px, ${to.y - 96}px) scale(0.3)` },
        ], { duration: 1700, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
      }
      leaving.classList.add('gone');
      flash(tile(3, 1), 'took');
      seal.style.setProperty('--d', '900ms');
      flash(seal, 'sound'); // Penny's seal brightens as it watches, and dims again
      await wait(1200);
      look(0, 1.4);
    },

    // Penny tries: across the floor, under the map, and calls. Nothing lights
    async () => {
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
      await wait(600);
    },

    // The sound: from inside the map, one note, a long way off. Penny answers,
    // and waits, as it has always waited
    async () => {
      const from = square(1, 0);
      penny.classList.remove('low');
      main.classList.add('heard');
      look(-0.8, -1.7);
      const note = remembered(0.95);
      await playMail(life, note, () => ring(from, '#f8d95a'));
      if (life.over) return;
      await wait(500);
      await voice.sing(note.echo, 0.8);
      await wait(1200);
    },

    // And then it turns from the map, and looks at you. One square of the map lights
    async () => {
      look(0, 0);
      await wait(1700);
      look(0, -1.6);
      await wait(900);
      look(0, 0);
      await wait(900);
      stand(100, 1.25); // one step towards you
      await wait(1400);
      main.classList.remove('heard');
      first.classList.add('lit');
      first.setAttribute('tabindex', '0'); // only now is it something to press
      first.setAttribute('role', 'button');
      first.setAttribute('aria-label', 'Begin');
      act('hop');
      look(0, -1.6);
      await wait(900);
      look(0, 0);
    },
  ];

  // Which screen is up, and whether it is still playing. A swipe made while
  // one plays is kept, and turns to the next as soon as it has finished:
  // except out of the last, which is not to be left by accident.
  let at = 0;
  let playing = false;
  let kept = false;
  const mark = () => {
    main.dataset.screen = at;
    main.classList.toggle('playing', playing);
  };
  const leave = () => go('/?walk', { quiet: true });
  async function turn() {
    if (life.over) return;
    if (playing) { kept = true; return; }
    if (at === screens.length) return leave(); // the lit square is the first place of the walk
    playing = true;
    kept = false;
    air.querySelectorAll('.o-touch').forEach((touch) => touch.remove());
    const play = screens[at];
    at += 1;
    mark();
    await play();
    if (life.over) return;
    playing = false;
    mark();
    if (kept && at < screens.length) turn();
    kept = false;
  }

  // Shown how, if caught waiting on the first screen. Penny has no hands: it
  // looks at you, looks at the floor, and a fingertip of light slides up the
  // room from there, the room giving a little under it as it will under yours.
  const waiting = () => at === 0 && !playing && !life.over;
  let showing = false;
  let pull = null; // a finger that is down: where, and since when
  async function illustrate() {
    if (!waiting() || showing || pull) return;
    showing = true;
    try {
      penny.classList.remove('low');
      look(0, 0);
      act('wiggle');
      await rest(900);
      if (!waiting()) return;
      look(1.5, 1.7);
      await rest(500);
      if (!waiting()) return;
      const touch = document.createElementNS(SVG, 'circle');
      touch.setAttribute('class', 'o-touch');
      touch.setAttribute('cx', 100);
      touch.setAttribute('cy', 284);
      touch.setAttribute('r', 8);
      air.append(touch);
      look(1.6, -1.6);
      act('hop');
      voice.sing(ASK, 0.5); // one note that turns up at the end, as the finger does
      if (!still && !pull) stage.style.translate = '0 -16px';
      await touch.animate([
        { transform: 'translateY(0)', opacity: 0 },
        { transform: 'translateY(-12px)', opacity: 0.95, offset: 0.18 },
        { transform: 'translateY(-110px)', opacity: 0.8, offset: 0.8 },
        { transform: 'translateY(-128px)', opacity: 0 },
      ], { duration: 1300, easing: still ? 'steps(5, end)' : 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' }).finished.catch(() => {});
      touch.remove();
      if (!pull) stage.style.translate = '';
      if (!waiting()) return;
      look(0, 0);
      await rest(1300);
      if (!waiting()) return;
      penny.classList.add('low');
      look(0, 1.4);
    } finally {
      showing = false;
      if (waiting()) life.setTimeout(illustrate, 5200);
    }
  }
  life.setTimeout(illustrate, 3800);

  // A swipe up: a finger (or a mouse held down) that travels up the screen
  // further than it travels across. The room follows it a little way, and
  // settles back when it is let go.
  const SWIPE = 44;
  const apart = (event) => event.target.closest?.('a, button, [role="button"]');
  main.addEventListener('pointerdown', (event) => {
    if (apart(event) || pull || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pull = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.classList.add('held');
  });
  life.on(window, 'pointermove', (event) => {
    if (!pull || event.pointerId !== pull.id) return;
    const up = pull.y - event.clientY;
    if (!still) stage.style.translate = `0 ${-Math.max(0, Math.min(up * 0.22, 26))}px`;
  });
  const letGo = (event, cancelled) => {
    if (!pull || event.pointerId !== pull.id) return;
    const up = pull.y - event.clientY;
    const across = Math.abs(event.clientX - pull.x);
    pull = null;
    stage.classList.remove('held');
    stage.style.translate = '';
    if (cancelled) return;
    if (up >= SWIPE && up > across) turn();
    else if (waiting()) life.setTimeout(illustrate, 250); // a tap, or a swipe some other way: shown at once
  };
  life.on(window, 'pointerup', (event) => letGo(event, false));
  life.on(window, 'pointercancel', (event) => letGo(event, true));

  // The same by wheel (once a gesture, however long it rolls on) and by key.
  let rolled = 0;
  main.addEventListener('wheel', (event) => {
    if (event.deltaY < 12 || Date.now() - rolled < 900) return;
    rolled = Date.now();
    turn();
  }, { passive: true });
  life.on(window, 'keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const pressed = event.key === 'Enter' || event.key === ' ';
    if (pressed && apart(event)) return; // the door, or the lit square: theirs
    if (!pressed && !['ArrowUp', 'ArrowDown', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    turn();
  });

  // The lit square is the first place of the walk.
  first.addEventListener('click', () => {
    if (first.classList.contains('lit')) leave();
  });
  first.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && first.classList.contains('lit')) leave();
  });

  // The first screen: Penny, low, on the floor of the room. It waits.
  penny.classList.add('low');
  look(0, 1.4);
  stand(46);
  mark();
}
