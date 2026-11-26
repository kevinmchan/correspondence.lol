// The introduction (/?hello): the first time Penny is seen. No words.
//
// A quiet street, and a mailbox. Penny is behind it, and shy: an eye comes
// round one side, and goes back; then the other side, for longer. Then Penny
// comes out, and comes towards you, cautious and curious at once, all the way
// up to the glass, until it is bigger than the screen is wide, and looks you
// over from the other side of it: one eye up close, a breath that fogs the
// glass, a tap on it. Its eyes follow a finger.
//
// Then a portal opens behind it. The sound is heard first, and its light
// comes round Penny's edges, because Penny is in the way. Penny starts,
// looks round, and jumps back, and there it is. Penny looks at it, and at
// you, and jumps in. The portal stays; you are expected to follow, and
// nothing hurries you. It leads to scene one (penny/office.js).
//
// How Penny comes up the street is still being played with, so there are
// three ways of it, chosen in the address (/?hello&gait=zigzag):
//
//   tiptoe   (as it is unless asked) straight up the middle, a few steps at a
//            time, stopping to look, losing its nerve once and going back a
//            step before it comes on
//   zigzag   from one side of the street to the other, nearer each time, half
//            out of sight at each edge before it dares the next crossing
//   edges    it leaves the street altogether and comes back round the screen
//            itself: in at one edge, bigger; in at the other, bigger still; up
//            from underneath, eyes first
//
// It is shy of being touched while it is on its way: a touch then sends it
// back a step (twice at most: after that it has got used to you). Up at the
// glass a touch is welcome, and it comes to look at the finger.
//
// A beat can be gone to directly, for looking at it (/?hello&at=glass, or
// &at=portal).

import { audio, isMuted, noise } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { ASK, GASP, HELLO, PLEASE, THIS_WAY, YES, createVoice } from './penny.js';

const SVG = 'http://www.w3.org/2000/svg';
const HIDE = { x: 140, y: 186, s: 0.33 }; // behind the mailbox
// How far its eyes are from its feet, in its own units: where a look, or the glass, is measured from.
const EYES = { y: -18 };
const LEFT_EYE = { x: -12, y: -18 };

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.hello');
  const far = root.querySelector('.hello-far');
  const near = root.querySelector('.hello-near');
  const behind = far.querySelector('.h-behind');
  const box = far.querySelector('.h-box');
  const penny = near.querySelector('.h-penny');
  const act = penny.querySelector('.act');
  const seal = penny.querySelector('.seal');
  const glass = near.querySelector('.h-glass');
  const portal = root.querySelector('#hello-portal');
  const said = root.querySelector('#hello-said');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const query = new URLSearchParams(location.search);
  const gait = ['tiptoe', 'zigzag', 'edges'].includes(query.get('gait')) ? query.get('gait') : 'tiptoe';
  const from = ['glass', 'portal'].includes(query.get('at')) ? query.get('at') : 'start';
  main.dataset.gait = gait;

  const voice = createVoice(life, {
    onNote(pitch, dur) {
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      seal.classList.remove('sound');
      void seal.getBoundingClientRect();
      seal.classList.add('sound');
    },
  });
  const say = (words) => { if (said.textContent !== words) said.textContent = words; };
  // Up against the glass it is half as wide again as the screen, whatever the
  // screen: its eyes a third of the way in from each side, and a little below the middle
  // (so that it covers the place where the portal will open).
  const glassAt = () => {
    const frame = main.getBoundingClientRect();
    const [a, b] = [inScene(frame.left, frame.top), inScene(frame.right, frame.bottom)];
    const s = ((b.x - a.x) * 1.5) / 60;
    return { x: 100, y: a.y + (b.y - a.y) * 0.56 - EYES.y * s, s };
  };

  // A rest. Whatever was waiting on it when the scene is left never goes on.
  class Left extends Error {}
  const rest = (ms) => new Promise((done, stop) => {
    if (life.over) { stop(new Left()); return; }
    life.setTimeout(done, still ? Math.min(ms, 60) : ms);
    life.onEnd(() => stop(new Left()));
  });

  // --- Penny: where it is, and its face ---------------------------------------------------
  const at = { ...HIDE };
  function put(to, ms = 0, ease = 'cubic-bezier(0.45, 0, 0.3, 1)') {
    Object.assign(at, to);
    penny.style.setProperty('--ms', `${still ? 0 : ms}ms`);
    penny.style.setProperty('--ease', ease);
    penny.style.setProperty('--x', at.x);
    penny.style.setProperty('--y', at.y);
    penny.style.setProperty('--s', at.s);
    return rest(ms);
  }
  // On foot: it rocks from one foot to the other for as long as it takes. (The nearer it is, the longer its stride.)
  async function walk(to, ms, how = 'walking') {
    penny.style.setProperty('--step', `${Math.round(300 + Math.min(at.s, 3) * 60)}ms`);
    penny.classList.add(how);
    await put(to, ms).finally(() => penny.classList.remove(how));
  }
  const mood = (name, mouth = 'smile') => { penny.dataset.mood = name; penny.dataset.mouth = mouth; };
  const look = (x = 0, y = 0) => { penny.style.setProperty('--look-x', x); penny.style.setProperty('--look-y', y); };
  function gesture(name) {
    act.classList.remove('hop', 'start', 'tilt');
    void act.getBoundingClientRect();
    act.classList.add(name);
  }
  // In front of the mailbox, or behind it: it is drawn in the street until it comes out.
  const hide = () => behind.append(penny);
  const comeOut = () => near.prepend(penny);

  // --- Where things are on the glass ---------------------------------------------------------
  // A point of the window, in the scene's own units; and the other way.
  function inScene(x, y) {
    const matrix = near.getScreenCTM();
    if (!matrix) return { x: 100, y: 150 };
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }
  const portalAt = () => {
    const spot = portal.getBoundingClientRect();
    if (!spot.width) { // (not shown yet: where it will be)
      const frame = main.getBoundingClientRect();
      return inScene(frame.left + frame.width * 0.56, frame.top + frame.height * 0.62);
    }
    return inScene(spot.left + spot.width / 2, spot.top + spot.height / 2);
  };

  // Its eyes follow a finger, or a pointer, when it is letting them.
  let watching = false;
  const watch = (now) => { watching = now; main.toggleAttribute('data-watching', now); };
  let finger = null; // where the glass was last touched, in the scene's units
  let followed = 0; // when its eyes last went after a finger
  const follow = (event) => {
    const point = inScene(event.clientX, event.clientY);
    finger = point;
    if (!watching) return;
    followed = performance.now();
    const eyes = { x: at.x, y: at.y + EYES.y * at.s };
    const [dx, dy] = [point.x - eyes.x, point.y - eyes.y];
    const far = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, far / 30);
    look((dx / far) * 1.7 * reach, (dy / far) * 1.3 * reach);
  };
  life.on(window, 'pointermove', follow);

  // A mark on the glass: a ring where it was tapped, or a patch of breath.
  function ring(x, y, r = 16) {
    const mark = document.createElementNS(SVG, 'circle');
    mark.setAttribute('class', 'h-tap on');
    for (const [name, value] of [['cx', x], ['cy', y], ['r', r]]) mark.setAttribute(name, value);
    glass.append(mark);
    life.setTimeout(() => mark.remove(), 700);
  }
  function fog(x, y) {
    const breath = document.createElementNS(SVG, 'ellipse');
    breath.setAttribute('class', 'h-fog on');
    for (const [name, value] of [['cx', x], ['cy', y], ['rx', 36], ['ry', 22]]) breath.setAttribute(name, value);
    glass.append(breath);
    life.setTimeout(() => breath.remove(), 4300);
  }
  const knock = () => { if (audio() && !isMuted()) noise({ dur: 0.06, from: 420, to: 180, q: 1.2, gain: 0.16 }); };
  // The portal opening: a breath of air that rises, and a tone that rises under it.
  function whoosh() {
    const live = audio();
    if (!live || isMuted()) return;
    noise({ dur: 1.1, from: 180, to: 2200, q: 1.4, gain: 0.07 });
    const { ctx } = live;
    const tone = ctx.createOscillator();
    const amp = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(196, ctx.currentTime);
    tone.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.9);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.25);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.3);
    tone.connect(amp).connect(live.mix);
    tone.start();
    tone.stop(ctx.currentTime + 1.4);
  }

  // --- Being touched ---------------------------------------------------------------------------
  // On its way up the street it is shy of it: a touch sends it back a step,
  // twice at most. At the glass it is glad of it, and comes to look.
  let beat = 'hiding'; // 'hiding' | 'coming' | 'glass' | 'portal' | 'waiting'
  let flinches = 0;
  let flinched = false; // touched since the last step
  life.on(main, 'pointerdown', (event) => {
    if (event.target.closest?.('a, button')) return;
    follow(event);
    if (beat === 'coming' && flinches < 2) flinched = true;
    if (beat === 'glass') {
      ring(finger.x, finger.y, 20);
      mood('glad', 'grin');
      gesture('start');
      voice.sing(YES, 0.6);
    }
  });

  // --- The scene ---------------------------------------------------------------------------------
  // Behind the mailbox: an eye round one side, and back; then the other side, for longer.
  async function peeking() {
    beat = 'hiding';
    hide();
    mood('shy', 'o');
    put(HIDE);
    say('A quiet street, and a mailbox');
    await rest(1500);
    look(-1.2, 0);
    await put({ x: 127 }, 700);
    say('Somebody looks out from behind the mailbox, and hides again');
    await rest(900);
    await put({ x: 140 }, 380, 'cubic-bezier(0.5, 0, 0.8, 0.4)');
    box.classList.add('bumped'); // (it knocked it, going back)
    await rest(1100);
    look(1.2, 0);
    await put({ x: 154 }, 800);
    voice.sing(ASK, 0.35);
    await rest(1500);
    look(0, 0);
    await rest(700);
    // out it comes, round the side, and stands where it can be seen
    comeOut();
    mood('shy', 'wavy');
    await walk({ x: 163, y: 190, s: 0.35 }, 800, 'tiptoe');
    await walk({ x: 150, y: 197, s: 0.4 }, 800, 'tiptoe');
    say('Penny, a letter, comes out, shyly');
    gesture('tilt');
    await rest(1300);
  }

  // Up the street. Each way of coming is a list of steps; between them it
  // stops and looks, and a touch sends it back to the step before.
  const GAITS = {
    tiptoe: [
      { to: { x: 132, y: 206, s: 0.52 }, ms: 1100, how: 'tiptoe', then: 'look' },
      { to: { x: 112, y: 219, s: 0.76 }, ms: 1200, how: 'tiptoe', then: 'tilt' },
      { to: { x: 98, y: 236, s: 1.05 }, ms: 1300, how: 'walking', then: 'look' },
      { to: { x: 104, y: 228, s: 0.92 }, ms: 520, how: 'tiptoe', then: 'nerve' }, // it loses its nerve, and goes back a step
      { to: { x: 100, y: 252, s: 1.5 }, ms: 1300, how: 'walking', then: 'tilt' },
      { to: { x: 100, y: 268, s: 2.3 }, ms: 1300, how: 'walking', then: 'look' },
    ],
    // (across: how far over the screen its middle is, 0 the left edge and 1 the right, whatever the screen's shape)
    zigzag: [
      { to: { across: 0.02, y: 204, s: 0.5 }, ms: 1000, how: 'walking', then: 'edge' },
      { to: { across: 0.99, y: 216, s: 0.74 }, ms: 1100, how: 'walking', then: 'edge' },
      { to: { across: -0.01, y: 234, s: 1.05 }, ms: 1100, how: 'walking', then: 'edge' },
      { to: { across: 1.02, y: 252, s: 1.5 }, ms: 1100, how: 'walking', then: 'edge' },
      { to: { across: 0.5, y: 268, s: 2.3 }, ms: 1200, how: 'walking', then: 'look' },
    ],
    edges: [
      { to: { across: -0.45, y: 204, s: 0.5 }, ms: 1300, how: 'walking', then: 'gone' }, // off down the street, and out of sight
      { jump: { across: 1.68, y: 246, s: 1.5 }, to: { across: 1.2, y: 246, s: 1.5 }, ms: 900, how: 'tiptoe', then: 'peep' }, // in at the right edge
      { to: { across: 1.68, y: 246, s: 1.5 }, ms: 500, how: 'tiptoe', then: 'gone' },
      { jump: { across: -0.88, y: 262, s: 2.2 }, to: { across: -0.14, y: 262, s: 2.2 }, ms: 900, how: 'tiptoe', then: 'peep' }, // in at the left, bigger
      { to: { across: -0.88, y: 262, s: 2.2 }, ms: 500, how: 'tiptoe', then: 'gone' },
      { jump: { across: 0.5, y: 420, s: 3.4 }, to: { across: 0.5, y: 318, s: 3.4 }, ms: 1100, how: 'tiptoe', then: 'peep' }, // up from underneath, eyes first
    ],
  };
  const placed = ({ across, ...rest }) => {
    if (across === undefined) return rest;
    const frame = main.getBoundingClientRect();
    const [a, b] = [inScene(frame.left, frame.top), inScene(frame.right, frame.bottom)];
    return { ...rest, x: a.x + (b.x - a.x) * across };
  };
  async function pause(kind) {
    if (kind === 'look') {
      mood('curious', 'o');
      look(0, 0);
      await rest(750);
    } else if (kind === 'tilt') {
      mood('curious', 'smile');
      gesture('tilt');
      await rest(1400);
    } else if (kind === 'nerve') {
      mood('shy', 'wavy');
      look(0.6, 0.8);
      await rest(900);
      look(0, 0);
      await rest(500);
    } else if (kind === 'edge') {
      // half out of sight, an eye on you, before it dares the next crossing
      mood('shy', 'o');
      look(at.x < 100 ? 1.4 : -1.4, 0);
      await rest(850);
    } else if (kind === 'peep') {
      mood('curious', 'o');
      look(at.x < 70 ? 1.3 : at.x > 130 ? -1.3 : 0, at.y > 300 ? -1 : 0);
      await rest(1100);
    } else if (kind === 'gone') {
      await rest(650);
    }
  }
  async function coming() {
    beat = 'coming';
    watch(false);
    const steps = GAITS[gait];
    const stood = [{ ...at }]; // where it has stopped, to go back to
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.jump) put(placed(step.jump), 0); // (round the outside of the screen, unseen)
      flinched = false;
      await walk(placed(step.to), step.ms, step.how);
      await pause(step.then);
      if (flinched && !step.jump && step.then !== 'gone') {
        // touched: it starts, and is back where it last stood before you could say so
        flinches += 1;
        flinched = false;
        mood('startled', 'o');
        gesture('start');
        voice.sing(GASP, 0.5);
        say('Penny starts, and goes back a step');
        await put(stood.at(-1), 420, 'cubic-bezier(0.2, 0.8, 0.3, 1)');
        mood('shy', 'wavy');
        await rest(1200);
        i -= 1; // and tries that step again
        continue;
      }
      if (!step.jump && step.then !== 'gone' && step.then !== 'nerve') stood.push({ ...at });
    }
  }

  // Up against the glass: bigger than the screen is wide, and looking you over.
  async function atGlass(straight = false) {
    beat = 'glass';
    comeOut();
    say('Penny comes right up to the glass, bigger than the screen, and looks you over');
    mood('curious', 'o');
    const GLASS = glassAt();
    if (straight) put(GLASS, 0);
    else await walk(GLASS, 1500, 'walking');
    penny.classList.add('pressed');
    watch(true);
    await rest(900);
    // one eye, up close: it looks all round the inside of the screen
    watch(false);
    const close = GLASS.s * 1.75;
    await put({ x: 100 - LEFT_EYE.x * close, y: GLASS.y + EYES.y * GLASS.s - LEFT_EYE.y * close, s: close }, 1000);
    for (const [x, y] of [[-1.6, -0.6], [1.6, -0.4], [0.4, 1.2], [0, 0]]) {
      look(x, y);
      await rest(620);
    }
    await put(GLASS, 900);
    // a breath on the glass, and it taps: is anybody there?
    fog(100, GLASS.y - 9 * GLASS.s);
    await rest(900);
    for (let n = 0; n < 2; n++) {
      gesture('start');
      ring(100, GLASS.y + EYES.y * GLASS.s + 6, 14);
      knock();
      await rest(330);
    }
    mood('glad', 'smile');
    voice.sing(HELLO, 0.7);
    watch(true); // and now its eyes are yours: they follow a finger
    await rest(3200);
    // (for as long as there is a finger to follow it stays, a few seconds more at most: it is in no hurry to look away)
    for (let more = 0; more < 6000 && performance.now() - followed < 1500; more += 300) await rest(300);
  }

  // The portal: heard, and its light seen round Penny's edges; then Penny jumps back, and there it is.
  async function opening(straight = false) {
    beat = 'portal';
    watch(false);
    comeOut();
    if (straight) put(glassAt(), 0);
    portal.hidden = false;
    portal.disabled = true; // (it is Penny's first: nobody goes through before it)
    const spot = portalAt();
    main.style.setProperty('--px', '56%');
    main.style.setProperty('--py', '62%');
    whoosh();
    main.classList.add('opened');
    say('A portal opens behind Penny');
    await rest(500);
    // it stops dead; its eyes go as far round as they can
    mood('startled', 'o');
    gesture('start');
    look(1.8, 0);
    await rest(900);
    // back, and to one side: and there it is
    penny.classList.remove('pressed');
    gesture('hop');
    const frame = main.getBoundingClientRect();
    const [a, b] = [inScene(frame.left, frame.top), inScene(frame.right, frame.bottom)];
    const aside = { x: a.x + (b.x - a.x) * 0.27, y: a.y + (b.y - a.y) * 0.86, s: ((b.x - a.x) * 0.42) / 60 }; // (wholly on the screen, whatever the screen)
    await put(aside, 460, 'cubic-bezier(0.2, 0.8, 0.3, 1)');
    main.classList.add('revealed');
    say('Penny jumps back, and there it is');
    await rest(700);
    const toPortal = () => look(1.7, (spot.y - (at.y + EYES.y * at.s)) > 0 ? 0.6 : -0.9);
    toPortal();
    mood('curious', 'o');
    await rest(1100);
    look(0, 0);
    mood('glad', 'smile');
    await rest(800);
    toPortal();
    gesture('hop');
    voice.sing(THIS_WAY, 0.8);
    await rest(1000);
    // and in
    mood('glad', 'grin');
    await put({ x: (at.x + spot.x) / 2, y: Math.min(at.y, spot.y) - 30, s: 0.8 }, 300, 'cubic-bezier(0.3, 0, 0.6, 1)');
    await put({ x: spot.x, y: spot.y + 4, s: 0.1 }, 380, 'cubic-bezier(0.5, 0, 0.9, 0.6)');
    penny.classList.add('gone');
    portal.classList.add('took');
    say('Penny jumps in. The portal is still open');
    portal.disabled = false;
    beat = 'waiting';
  }

  // Left alone, the portal calls now and then, and Penny from inside it; nothing hurries.
  let alone = 0;
  life.on(window, 'pointerdown', () => { alone = 0; });
  life.setInterval(() => {
    if (beat !== 'waiting' || document.visibilityState !== 'visible') return;
    alone += 1;
    if (alone % 9 !== 5 || alone > 60) return;
    portal.classList.remove('called');
    void portal.getBoundingClientRect();
    portal.classList.add('called');
    voice.sing(alone > 9 ? PLEASE : THIS_WAY, 0.45);
  }, 1000);
  portal.addEventListener('click', () => {
    if (portal.disabled || beat !== 'waiting') return;
    go('/?office');
  });

  (async () => {
    if (from === 'start') {
      await peeking();
      await coming();
    }
    if (from !== 'portal') await atGlass(from === 'glass');
    await opening(from === 'portal');
  })().catch((error) => { if (!(error instanceof Left)) console.error(error); });
}
