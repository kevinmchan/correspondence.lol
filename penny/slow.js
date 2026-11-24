// Scene two: what slow hands make (/?slow). No words.
//
// Scene one (penny/office.js) is about stopping. This is about why it is
// worth it: because of what can be made. The room is the same room, slowed,
// and now it is yours to draw in. The dust in the lamplight gathers where a
// finger goes, and what it makes depends on one thing only: how fast.
//
//   Fast: a thin cold scratch, straight, and gone almost as it is made.
//   Slow: a wide warm ribbon in the game's colours, that stays; and out of
//     it, shoots, which curl away and end in buds. The slower, the more.
//   Still: a flower, opening for as long as the finger is held there.
//
// Everything is drawn twice, once each side of the middle of the screen, as
// ink goes through a letter that is folded while it is wet.
//
// The clock on the wall goes at the speed of your hand. Penny watches the
// finger: it winces at a rush, and warms to anything slow, humming a note for
// it now and then. Nothing is counted and nothing is asked for. Once a little
// has been made, a portal opens, which leads on to the map (penny/walk.js);
// it does not hurry anybody through it.
//
// Whoever is caught waiting is shown, as in scene one: a fingertip of light
// crosses the room, slowly, and what it leaves behind is what there is to make.

import { go } from '/shared/nav.js';
import { A4, A5, C5, D5, E5, G4, G5, createVoice } from './penny.js';

const COLOURS = ['#f08a76', '#f8d95a', '#7cc46a', '#2aa198', '#9ad3f7', '#736dd0', '#f3b3e6'];
const NOTES = [A5, G5, E5, D5, C5, A4, G4]; // high up the screen, high in pitch
const FAST = 0.9; // pixels a millisecond: at this and over, nothing stays
const ENOUGH = 700; // how much has to have been made, slowly, before the way on opens

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.slow');
  const stage = root.querySelector('.office-stage');
  const portal = root.querySelector('#slow-portal');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rest = (ms) => new Promise((done) => life.setTimeout(done, ms));

  // Penny, as it is drawn in scene one
  const penny = document.getElementById('screen-office').content.querySelector('.p-penny').cloneNode(true);
  stage.querySelector('.o-floor').after(penny);
  const seal = penny.querySelector('.seal');
  const look = (dx, dy) => { penny.querySelector('.eyes').style.translate = `${dx}px ${dy}px`; };
  const act = (name) => {
    const body = penny.querySelector('.act');
    body.classList.remove('hop', 'wiggle');
    void body.getBoundingClientRect();
    body.classList.add(name);
  };
  const voice = createVoice(life, {
    alone: true,
    onNote(pitch, dur) {
      seal.classList.remove('sound');
      void seal.getBoundingClientRect();
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      seal.classList.add('sound');
    },
  });

  // The clock: at rest a second hand, and otherwise as fast as the hand that is drawing.
  const hand = stage.querySelector('.o-hand');
  const clock = still ? null : hand.animate([{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }], { duration: 60000, iterations: Infinity });

  // Two sheets over the room: what stays, and what passes.
  const keep = root.querySelector('.slow-keep');
  const pass = root.querySelector('.slow-pass');
  const sheets = { keep: keep.getContext('2d'), pass: pass.getContext('2d') };
  let width = 0;
  let height = 0;
  function fit() {
    const box = main.getBoundingClientRect();
    if (!box.width || (Math.round(box.width) === width && Math.round(box.height) === height)) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const before = width ? document.createElement('canvas') : null;
    if (before) {
      before.width = keep.width;
      before.height = keep.height;
      before.getContext('2d').drawImage(keep, 0, 0);
    }
    width = Math.round(box.width);
    height = Math.round(box.height);
    for (const sheet of [keep, pass]) {
      sheet.width = width * scale;
      sheet.height = height * scale;
      sheet.getContext('2d').setTransform(scale, 0, 0, scale, 0, 0);
    }
    if (before) sheets.keep.drawImage(before, 0, 0, width, height); // what was made is kept, whatever the window does
  }
  fit();
  life.on(window, 'resize', fit);

  // Whatever is drawn is drawn on both sides of the fold.
  function both(ctx, draw) {
    draw();
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    draw();
    ctx.restore();
  }
  const colourAt = (way) => COLOURS[Math.floor(way / 240) % COLOURS.length];

  let made = 0; // how much has been drawn slowly: the only thing kept count of, and only to open the way on
  let shoots = []; // growing out of a slow line
  let flower = null; // opening under a finger held still
  const pen = { on: false, ghost: false, x: 0, y: 0, at: 0, speed: 0, way: 0, heading: 0, stillFor: 0, sung: 0, id: null };

  function put(x, y, at, ghost = false) {
    pen.on = true;
    pen.ghost = ghost;
    Object.assign(pen, { x, y, at, speed: 0, stillFor: 0 });
    flower = null;
  }
  function move(x, y, at) {
    const far = Math.hypot(x - pen.x, y - pen.y);
    const took = Math.max(1, at - pen.at);
    if (far < 0.5) return;
    pen.speed += (far / took - pen.speed) * 0.35;
    const slow = Math.max(0, Math.min(1, 1 - pen.speed / FAST)); // 1: hardly moving. 0: a rush
    const from = { x: pen.x, y: pen.y };
    pen.heading = Math.atan2(y - pen.y, x - pen.x);
    pen.way += far;
    Object.assign(pen, { x, y, at, stillFor: 0 });
    flower = null;

    if (slow < 0.18) {
      // a scratch: thin, cold, and on the sheet that does not keep anything
      const ctx = sheets.pass;
      ctx.strokeStyle = 'rgb(154 211 247 / 0.75)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.shadowBlur = 0;
      both(ctx, () => { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(x, y); ctx.stroke(); });
      return;
    }
    const ctx = pen.ghost ? sheets.pass : sheets.keep;
    const colour = colourAt(pen.way);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.5 + slow * 0.4;
    ctx.lineWidth = 1.5 + slow * slow * 13;
    ctx.lineCap = 'round';
    ctx.shadowColor = colour;
    ctx.shadowBlur = slow * 12;
    both(ctx, () => { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(x, y); ctx.stroke(); });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (!pen.ghost) made += far * slow;
    // shoots: more of them, and longer lived, the slower it goes
    if (shoots.length < 90 && Math.random() < slow * slow * 0.5) {
      const side = Math.random() < 0.5 ? 1 : -1;
      shoots.push({
        x, y, ghost: pen.ghost, colour,
        angle: pen.heading + side * (0.9 + Math.random() * 0.9),
        curl: side * (0.01 + Math.random() * 0.05),
        left: 30 + slow * 110 * Math.random(),
        wide: 0.8 + slow * 1.6,
      });
    }
    // and a note for it, now and then: where on the screen says which
    if (!pen.ghost && slow > 0.6 && at - pen.sung > 620) {
      pen.sung = at;
      const pitch = NOTES[Math.max(0, Math.min(NOTES.length - 1, Math.floor((y / height) * NOTES.length)))];
      voice.sing([[pitch, 0.45]], 0.3 + slow * 0.2, { breath: 0 });
    }
  }
  function lift() {
    pen.on = false;
    pen.ghost = false;
    flower = null;
  }

  // Every frame: what passes fades, the shoots grow, a held finger's flower
  // opens, and the room keeps up with the hand.
  let idle = 0; // frames since anything was put on the sheet that passes
  let rush = 0; // how long it has been going fast: Penny minds
  function frame() {
    if (life.over) return;
    const fade = sheets.pass;
    fade.globalCompositeOperation = 'destination-out';
    fade.fillStyle = 'rgb(0 0 0 / 0.06)';
    fade.fillRect(0, 0, width, height);
    fade.globalCompositeOperation = 'source-over';
    // (a fade never quite gets to nothing: once that sheet has been left alone a few seconds, it is wiped)
    idle = (pen.on && (pen.ghost || pen.speed > FAST * 0.7)) || shoots.some((shoot) => shoot.ghost) ? 0 : idle + 1;
    if (idle === 200) fade.clearRect(0, 0, width, height);

    for (const shoot of shoots) {
      const ctx = shoot.ghost ? sheets.pass : sheets.keep;
      const x = shoot.x + Math.cos(shoot.angle) * 1.3;
      const y = shoot.y + Math.sin(shoot.angle) * 1.3;
      ctx.strokeStyle = shoot.colour;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = shoot.wide;
      ctx.lineCap = 'round';
      both(ctx, () => { ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(x, y); ctx.stroke(); });
      shoot.x = x;
      shoot.y = y;
      shoot.angle += shoot.curl;
      shoot.curl *= 1.012; // it curls in on itself as it goes
      shoot.left -= 1;
      if (shoot.left <= 0) { // and ends in a bud
        ctx.fillStyle = '#f6f1e7';
        ctx.globalAlpha = 0.8;
        both(ctx, () => { ctx.beginPath(); ctx.arc(x, y, shoot.wide * 1.3, 0, Math.PI * 2); ctx.fill(); });
      }
      ctx.globalAlpha = 1;
    }
    shoots = shoots.filter((shoot) => shoot.left > 0);

    if (pen.on) {
      pen.stillFor += 16;
      if (pen.stillFor > 60) pen.speed *= 0.8; // no longer moving: no longer fast
      if (pen.stillFor > 380 && !pen.ghost) {
        flower ??= { size: 4, petals: 5 + Math.floor(Math.random() * 4), turn: Math.random() * Math.PI, colour: colourAt(pen.way + 240), full: false };
        if (flower.size < 54) {
          flower.size += 0.22;
          made += 0.5;
          const ctx = sheets.keep;
          ctx.strokeStyle = flower.colour;
          ctx.globalAlpha = 0.09;
          ctx.lineWidth = 1.2;
          both(ctx, () => {
            for (let i = 0; i < flower.petals; i += 1) {
              const angle = flower.turn + (i / flower.petals) * Math.PI * 2;
              ctx.beginPath();
              ctx.ellipse(pen.x + Math.cos(angle) * flower.size * 0.55, pen.y + Math.sin(angle) * flower.size * 0.55, flower.size * 0.5, flower.size * 0.2, angle, 0, Math.PI * 2);
              ctx.stroke();
            }
          });
          ctx.globalAlpha = 1;
        } else if (!flower.full) {
          flower.full = true; // as open as it goes
          act('hop');
          voice.sing([[E5, 0.2], [G5, 0.2], [C5 * 2, 0.5]], 0.5);
        }
      }
    } else {
      pen.speed *= 0.85;
    }

    // the room, keeping up
    const speed = pen.on ? pen.speed : 0;
    clock?.updatePlaybackRate(1 + speed * 130);
    main.dataset.pace = speed > FAST * 0.8 ? 'fast' : speed > 0.25 ? 'slowing' : 'slow';
    rush = speed > FAST * 0.8 ? rush + 1 : 0;
    if (pen.on && !pen.ghost) {
      penny.classList.toggle('low', rush > 8);
      penny.classList.toggle('glad', speed < 0.25);
      penny.classList.toggle('warm', speed < 0.25 && made > 200);
    }
    if (pen.on) {
      const box = penny.getBoundingClientRect();
      const dx = pen.x - (box.left + box.width / 2 - main.getBoundingClientRect().left);
      const dy = pen.y - (box.top - main.getBoundingClientRect().top);
      const far = Math.hypot(dx, dy) || 1;
      look((dx / far) * 1.7, (dy / far) * 1.7);
    }
    if (portal.hidden && made > ENOUGH) {
      portal.hidden = false; // the way on: there when you want it
      main.dataset.made = 'enough';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // The hand. A finger, a pen, a mouse held down; and the arrow keys, which
  // carry a point about the room at a walk.
  let touched = false;
  const where = (event) => {
    const box = main.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const apart = (event) => event.target.closest?.('a, button');
  main.addEventListener('pointerdown', (event) => {
    if (apart(event) || pen.id !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    touched = true;
    pen.id = event.pointerId;
    put(...where(event), event.timeStamp);
  });
  life.on(window, 'pointermove', (event) => {
    if (event.pointerId !== pen.id) return;
    for (const each of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) move(...where(each), each.timeStamp || event.timeStamp);
  });
  const up = (event) => {
    if (event.pointerId !== pen.id) return;
    pen.id = null;
    lift();
  };
  life.on(window, 'pointerup', up);
  life.on(window, 'pointercancel', up);
  main.addEventListener('touchmove', (event) => { if (event.cancelable) event.preventDefault(); }, { passive: false });

  const STEPS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  let keyLift = 0;
  life.on(window, 'keydown', (event) => {
    const step = STEPS[event.key];
    if (!step || pen.id !== null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    touched = true;
    const now = performance.now();
    if (!pen.on || pen.ghost) put(width * 0.35, height * 0.5, now);
    const pace = event.shiftKey ? 26 : 5; // (shift is a rush)
    move(Math.max(4, Math.min(width - 4, pen.x + step[0] * pace)), Math.max(4, Math.min(height - 4, pen.y + step[1] * pace)), now);
    clearTimeout(keyLift);
    keyLift = life.setTimeout(lift, 2600); // left alone a while, a flower has had time to open
  });

  portal.addEventListener('click', () => go('/?walk', { quiet: true }));

  // Shown how, if caught waiting: Penny looks out at you, and a fingertip of
  // light crosses the room slowly, leaving what a slow hand leaves. It fades:
  // it was only to show. Until the first touch, and not after.
  const tip = root.querySelector('.slow-tip');
  async function illustrate() {
    if (touched || life.over) return;
    look(0, 0);
    act('wiggle');
    await rest(900);
    if (touched) return;
    const [x0, y0, x1, y1] = [width * 0.3, height * 0.56, width * 0.44, height * 0.36];
    tip.classList.add('on');
    const begun = performance.now();
    const took = 3200;
    put(x0, y0, begun, true);
    await new Promise((done) => {
      const step = () => {
        const now = performance.now();
        const t = Math.min(1, (now - begun) / took);
        if (touched || life.over) return done();
        const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * width * 0.06;
        const y = y0 + (y1 - y0) * t;
        tip.style.translate = `${x}px ${y}px`;
        move(x, y, now);
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      step();
    });
    tip.classList.remove('on');
    if (touched) return; // the pen is theirs now
    lift();
    look(0, 0);
    life.setTimeout(illustrate, 7000);
  }
  life.setTimeout(illustrate, 3600);

  look(0, 0);
  main.dataset.pace = 'slow';
}
