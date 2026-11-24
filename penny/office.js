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
// The scene is a handful of screens, and each of them is a loop: it plays,
// and plays again, for as long as it is left up. No two turns of a loop are
// quite the same, and the differences are the story. Letters leave the shelves
// one at a time until there are none. Penny's call gets smaller every time
// nothing answers it. The sound comes again, and Penny works out that it is
// meant for it. A swipe up turns to the next screen at once (the up arrow does
// the same, and so does a wheel); nothing else does.
//
// Nobody is told so in words. Whoever is caught waiting on the first screen
// is shown, between turns of its loop: Penny looks out at them, then down at
// the floor, where a fingertip of light appears and slides up the room, with
// Penny's eyes on it.

import { audio, isMuted } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { ASK, HELLO, PLEASE, SAG, SIGH, THIS_WAY, createVoice } from './penny.js';
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
  function ring(at, colour, turnOf) {
    if (still || turnOf !== run) return; // (a sound from a screen that has been left)
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

  // The mail still on the shelves: the one drawn into the page, which is the
  // last to go, and four more in pigeonholes of their own. Each has a square
  // of the map to go to.
  const drawn = stage.querySelector('.o-leaving');
  const letters = [[161, 163, 1, 3], [7, 141, 4, 0], [161, 31, 0, 2], [24, 75, 2, 1]].map(([x, y, col, row]) => {
    const letter = drawn.cloneNode(true);
    letter.setAttribute('x', x);
    letter.setAttribute('y', y + 3);
    letter.setAttribute('width', 13);
    letter.setAttribute('height', 13);
    drawn.before(letter);
    return { letter, x: x + 6.5, y: y + 9.5, col, row };
  });
  letters.push({ letter: drawn, x: 177, y: 96, col: 3, row: 1 });
  // One of them goes: it lights, lifts out of its slot, and crosses the room into the map.
  function flight({ letter, x, y, col, row }, ms) {
    const to = square(col, row);
    const lift = x > 100 ? -20 : 20;
    return letter.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${lift}px, -26px) scale(1)`, offset: 0.35 },
      { transform: `translate(${to.x - x}px, ${to.y - y}px) scale(0.3)` },
    ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
  }
  function taken(mail) {
    mail.letter.classList.add('gone');
    flash(tile(mail.col, mail.row), 'took');
  }
  const light = () => { // one square of the map: the way on
    main.classList.remove('heard');
    first.classList.add('lit');
    first.setAttribute('tabindex', '0'); // only now is it something to press
    first.setAttribute('role', 'button');
    first.setAttribute('aria-label', 'Begin');
  };

  let asked = false; // a tap on the first screen: shown how at the end of this turn of the loop
  let pull = null; // a finger that is down: where it went down

  // Shown how. Penny has no hands: it looks at you, looks at the floor, and a
  // fingertip of light slides up the room from there, the room giving a little
  // under it as it will under yours.
  async function illustrate(s) {
    asked = false;
    penny.classList.remove('low');
    look(0, 0);
    act('wiggle');
    await s.rest(900);
    look(1.5, 1.7);
    await s.rest(500);
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
    s.check();
    look(0, 0);
    await s.rest(1300);
    penny.classList.add('low');
    look(0, 1.4);
    await s.rest(500);
  }

  // The screens, in order. `enter` sets a screen up, however the one before
  // was left; `turn` is one turn of its loop, and is told which (from 0). The
  // `s` it is given has the rests of the scene on it, and every one of them
  // stops dead if the screen has been swiped away meanwhile.
  const screens = [
    // The shelves empty. A letter leaves, and Penny watches it go; and another;
    // and then there are none, and Penny looks along the shelves anyway.
    {
      enter() {
        penny.classList.add('low');
        look(0, 1.4);
        stand(46);
      },
      async turn(n, s) {
        await s.wait(1400);
        const mail = letters[n];
        const last = n === letters.length - 1;
        if (mail) {
          mail.letter.classList.add('lit');
          if (last) penny.classList.remove('low'); // the last one: it gets up for it
          look(mail.x > 100 ? 1.6 : -1.2, -1.4);
          await s.wait(900);
          if (!still) await s.after(flight(mail, 1700));
          taken(mail);
          look(1, -1.7);
          seal.style.setProperty('--d', '900ms');
          flash(seal, 'sound'); // Penny's seal brightens as it watches, and dims again
          await s.wait(last ? 1800 : 1000);
          if (last) {
            await s.after(voice.sing(HELLO, 0.45)); // after it, quietly
            await s.wait(1400);
            penny.classList.add('low');
          }
          look(0, 1.4);
        } else {
          // nothing left to go: it looks all the same, one side and then the other
          look(-1.5, -1.2);
          await s.wait(1500);
          look(1.6, -1.2);
          await s.wait(1500);
          look(0, 1.4);
          if (n === letters.length) await s.after(voice.sing(SIGH, 0.45));
          await s.wait(1200);
        }
        await s.wait(700);
        if (asked || n % 2 === 0) await illustrate(s); // caught waiting
      },
    },

    // Penny tries: across the floor, under the map, and calls. Nothing lights.
    // It calls again, louder; then smaller; then it only looks.
    {
      enter() {
        // whatever was still on the shelves has gone by now, all at once
        for (const mail of letters) {
          if (mail.letter.classList.contains('gone')) continue;
          if (!still && !mail.letter.classList.contains('lit')) {
            mail.letter.classList.add('lit');
            flight(mail, 1100);
          }
          life.setTimeout(taken, still ? 0 : 1100, mail);
        }
        penny.classList.remove('low');
        look(0, -1.2);
        stand(100);
        act('wiggle');
      },
      async turn(n, s) {
        if (n === 0) {
          await s.wait(2600);
          look(0, -1.6);
          await s.after(voice.sing(HELLO, 0.85));
          await s.wait(2200);
        } else if (n === 1) {
          act('hop');
          await s.after(voice.sing(HELLO, 1.1));
          await s.wait(1900);
          penny.classList.add('low');
          look(0, 1.3);
          await s.after(voice.sing(SAG, 0.6));
          await s.wait(1600);
        } else if (n === 2) {
          look(0, -1.6);
          await s.wait(900);
          await s.after(voice.sing(HELLO, 0.4)); // hardly a call at all
          await s.wait(2400);
          look(0, 1.3);
          await s.wait(1800);
        } else {
          // it has stopped calling. Now and then it looks up; less and less
          await s.wait(1800 + Math.min(n, 8) * 500);
          look(0, -1.5);
          await s.wait(Math.max(500, 1500 - (n - 3) * 250));
          look(0, 1.3);
          await s.wait(1600);
        }
      },
    },

    // The sound: from inside the map, a long way off. The first time Penny
    // only starts at it. The second it answers, under its breath. After that
    // it has gone to stand under the place, and answers as if it were known.
    {
      enter() {
        penny.classList.add('low');
        look(0, 1.3);
        stand(100);
      },
      async turn(n, s) {
        const from = square(1, 0);
        const note = remembered(0.95);
        await s.wait(n === 0 ? 1800 : 2600);
        const turnOf = run;
        const sound = playMail(life, note, () => ring(from, '#f8d95a', turnOf));
        await s.wait(n === 0 ? 700 : 150);
        penny.classList.remove('low');
        main.classList.add('heard');
        look(-0.8, -1.7);
        if (n === 0) act('hop'); // it had not expected anything
        await s.after(sound);
        await s.wait(500);
        if (n === 0) {
          await s.wait(1800); // it does not know yet that it may answer
        } else {
          if (n === 2) {
            stand(84); // under the square it came from
            tile(1, 0).classList.add('near');
            await s.wait(2600);
          }
          await s.after(voice.sing(note.echo, n === 1 ? 0.45 : 0.8));
          if (n >= 2 && n % 2 === 0) act('hop');
          await s.wait(1600);
        }
        if (n < 2) { // and it is quiet again
          await s.wait(1200);
          look(0, 1.3);
          if (n === 0) penny.classList.add('low');
        }
      },
    },

    // And then it turns from the map, and looks at you. One step towards you;
    // one square of the map lights. From then on it is only asking.
    {
      enter() {
        penny.classList.remove('low');
        look(-0.8, -1.7);
      },
      async turn(n, s) {
        if (n === 0) {
          await s.wait(1200);
          look(0, 0);
          await s.wait(1700);
          look(0, -1.6);
          await s.wait(900);
          look(0, 0);
          await s.wait(900);
          stand(100, 1.25); // one step towards you
          await s.wait(1400);
          light();
          act('hop');
          look(0, -1.6);
          await s.wait(900);
          look(0, 0);
          await s.wait(3000);
          return;
        }
        look(0.3, -1.6); // the square,
        await s.wait(1100);
        look(0, 0); // and you
        if (n === 2) stand(100, 1.4); // nearer still
        act(n % 2 ? 'wiggle' : 'hop');
        await s.after(voice.sing(n % 2 ? PLEASE : THIS_WAY, 0.6));
        await s.wait(4200);
      },
    },
  ];

  // Which screen is up, and which turn of its loop. `run` counts the screens
  // that have been started: a rest that wakes to find it has moved on throws
  // this, and that is the end of that screen's loop.
  const LEFT = Symbol('left');
  let at = 0;
  let run = 0;
  const leave = () => go('/?walk', { quiet: true });
  async function show(index) {
    run += 1;
    const mine = run;
    const check = () => { if (mine !== run || life.over) throw LEFT; };
    const s = {
      check,
      wait: (ms) => wait(ms).then(check),
      rest: (ms) => rest(ms).then(check),
      after: (promise) => Promise.resolve(promise).then((value) => { check(); return value; }),
    };
    at = index;
    asked = false;
    air.querySelectorAll('.o-touch').forEach((touch) => touch.remove());
    if (!pull) stage.style.translate = '';
    main.dataset.screen = index;
    screens[index].enter();
    try {
      for (let n = 0; ; n += 1) {
        main.dataset.turn = n;
        await screens[index].turn(n, s);
      }
    } catch (error) {
      if (error !== LEFT) throw error;
    }
  }
  // A swipe up. Out of the last screen it goes through to the walk: once the
  // square is lit, and a swipe before that lights it.
  function turn() {
    if (life.over) return;
    if (at < screens.length - 1) show(at + 1);
    else if (first.classList.contains('lit')) leave();
    else light();
  }

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
    else if (at === 0) asked = true; // a tap, or a swipe some other way
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

  show(0);
}
