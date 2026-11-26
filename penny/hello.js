// The introduction (/?hello): the first time Penny is seen. No words.
//
// It begins with Penny alone, on plain ground, large, in the middle of the
// screen, going through what it can feel, one feeling after another: at
// rest, curious, glad, shy, startled, sad, listening, excited. This is where
// Penny's character is worked out (what each feeling does to its face, its
// paper and how it moves), for use everywhere Penny goes; one feeling can be
// held there to be looked at (/?hello&emote=sad). Nothing happens until Penny
// is touched. A touch knocks it back, startled, all the way down the street,
// and it hides; and the street is there.
//
// A quiet street, and a mailbox. Penny is behind it, and shy: it leans out
// round one side, and back; then the other side, for longer. Then Penny
// comes out, and comes towards you, cautious and curious at once, all the way
// up to the glass, until it is wider than the screen, and looks you over from
// the other side of it: one eye up close, a breath that fogs the glass, a tap
// on it. Its eyes follow a finger.
//
// Then a portal opens behind it. The sound is heard first, and its light
// comes round Penny's edges, because Penny is in the way. Penny starts, and
// jumps back, and there it is. Penny looks at it, and at you, and jumps in.
// The portal stays; you are expected to follow, and nothing hurries you. It
// leads to scene one (penny/office.js).
//
// HOW PENNY MOVES. It has no legs (the owner, 26 November 2026: legs asked
// for more realism than the rest of it has). It never slides and it never
// just grows. It moves by its own effort, a step at a time, and is still
// between steps; and how it moves is how it feels:
//
//   rock     shy: it tips onto one bottom corner, swings the other round,
//            and lands; then the other corner. A card edging along. (edge is
//            the same, smaller and quicker: creeping.)
//   bounce   getting braver: a low spring off its bottom edge, a sway in the
//            air, and its paper squashing as it lands.
//   hop      excited, or startled: a crouch, a spring, and a landing.
//
// Its paper bends as it goes, and its corners curl, which is the most of what
// it says: top corners folded forward when it is shy, flared when it is
// startled, lifted a little when it is glad; the corner that leaves the ground
// in a rock lifts with it; it crouches before a hop and trails after it.
//
// Where it is, is on the street: the camera is at the height of Penny's
// eyes, so its eyes are always on the horizon, and where it stands follows
// from how near it is. Nearer is bigger and lower, together, and only ever
// by walking.
//
// Which way it comes up the street is still being played with, and so is how
// it moves, so both can be chosen in the address:
//
//   gait=tiptoe   (as it is unless asked) straight up the middle, losing its
//                 nerve once and going back a step before it comes on
//   gait=zigzag   from one side of the street to the other, nearer each time
//   gait=edges    round the outside of the screen itself
//   walk=rock, walk=bounce, walk=hop   every step that way, whatever it feels
//
// It is shy of being touched while it is on its way: a touch sends it back a
// step (twice at most: after that it has got used to you). Up at the glass a
// touch is welcome, and it comes to look at the finger.
//
// A beat can be gone to directly, for looking at it (/?hello&at=street,
// &at=glass, or &at=portal).

import { audio, isMuted, noise } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { ASK, GASP, HELLO, PLEASE, THIS_WAY, YES, createVoice } from './penny.js';

const SVG = 'http://www.w3.org/2000/svg';
// The horizon, in the scene's units: Penny's eyes are always on it. It stands
// on the bottom edge of its paper, 15.4 of its own units below its eyes, so at
// size s that is at H + 15.4 s.
const H = 168;
const EYE_HEIGHT = 15.4;
const ground = (s) => H + EYE_HEIGHT * s;
const HIDE = { x: 140, s: 0.33 }; // behind the mailbox
const LEFT_EYE = { x: -12 };
// Its paper, in its own units (as it was drawn when it stood on feet, 2.6
// below it; it stands on its bottom edge now, and is drawn 2.6 lower: draw()).
const PAPER = { left: -30, right: 30, top: -44.6, bottom: -2.6 };
const SINK = 2.6;
// The ways it moves: how long a step takes, and how far it goes in one
// (towards you, as a share of how near it is; across, in its own units).
const STEP = {
  bounce: { ms: 400, depth: 0.17, stride: 26, gap: 70 },
  edge: { ms: 300, depth: 0.08, stride: 10, gap: 40 },
  rock: { ms: 560, depth: 0.13, stride: 20, gap: 90 },
  hop: { ms: 600, depth: 0.24, stride: 34, gap: 140 },
};
// What each feeling does to its paper: a corner above 0 is folded forward,
// below 0 flared; an edge above 0 bows outward.
const FLAT = { tl: 0, tr: 0, br: 0, bl: 0, t: 0, r: 0, b: 0, l: 0 };
const SHAPES = {
  shy: { tl: 0.38, tr: 0.38, t: -0.4 },
  curious: { tl: -0.3, tr: -0.3, t: 0.7 },
  startled: { tl: -0.9, tr: -0.9, br: -0.5, bl: -0.5, t: 1.1, l: 0.5, r: 0.5 },
  glad: { tl: -0.35, tr: -0.35, bl: -0.15, br: -0.15, b: 0.3 },
  sad: { tl: 0.22, tr: 0.22, t: -1, l: -0.35, r: -0.35, squash: 0.6 },
  listening: { t: 0.35 },
  excited: { tl: -0.65, tr: -0.65, bl: -0.3, br: -0.3, t: 0.9, l: 0.3, r: 0.3 },
};
// What it goes through, alone, at the start: each a face (mood, eyes, mouth),
// where its eyes go, and a movement. (`watch`: its eyes are on your finger.)
const EMOTES = [
  { mood: 'calm', eyes: 'open', mouth: 'smile', watch: true, said: 'Penny, at rest' },
  { mood: 'curious', eyes: 'open', mouth: 'o', look: [0.6, -0.6], move: 'tilt', said: 'Penny, curious' },
  { mood: 'glad', eyes: 'happy', mouth: 'grin', move: 'bounce', said: 'Penny, glad' },
  { mood: 'shy', eyes: 'open', mouth: 'wavy', look: [-1.2, 1.1], move: 'sway', said: 'Penny, shy' },
  { mood: 'startled', eyes: 'open', mouth: 'o', move: 'start', said: 'Penny, startled' },
  { mood: 'sad', eyes: 'half', mouth: 'frown', look: [0, 1.2], said: 'Penny, sad' },
  { mood: 'listening', eyes: 'closed', mouth: 'o', move: 'tilt', said: 'Penny, listening' },
  { mood: 'excited', eyes: 'happy', mouth: 'grin', watch: true, move: 'hops', said: 'Penny, excited' },
];

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const r2 = (n) => Math.round(n * 100) / 100;

// --- Its paper, as a path -----------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const pt = (a) => `${r2(a[0])} ${r2(a[1])}`;
const KEYS = ['tl', 'tr', 'br', 'bl'];
const OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // the outward side of the edge after each corner: top, right, bottom, left
const DIAG = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(unit);
// Gives the outline, the folds (a corner folded forward shows the back of
// the paper, a triangle), and the flap, from one corner to the seal to the other.
function paperOf(shape) {
  const { left: L, right: R, top: T, bottom: B } = PAPER;
  const at = [[L, T], [R, T], [R, B], [L, B]];
  const corners = at.map((p, i) => {
    const before = unit(sub(p, at[(i + 3) % 4]));
    const after = unit(sub(at[(i + 1) % 4], p));
    const k = shape[KEYS[i]];
    if (k > 0.03) {
      const size = 3 + k * 14;
      const e = sub(p, mul(before, size));
      const x = add(p, mul(after, size));
      const u = unit(sub(x, e));
      const across = add(e, mul(u, dot(sub(p, e), u)));
      return { e, x, fold: sub(mul(across, 2), p), inner: add(mul(add(e, x), 0.5), mul(DIAG[i], -1.6)) };
    }
    const c = add(p, mul(DIAG[i], -Math.min(0, k) * 3.6));
    const r = 5 - Math.min(0, k) * 1.6;
    return { e: sub(c, mul(before, r)), x: add(c, mul(after, r)), c, inner: add(c, mul(DIAG[i], -2.1)) };
  });
  const bows = [shape.t, shape.r, shape.b, shape.l];
  let d = `M${pt(corners[0].x)}`;
  for (let i = 0; i < 4; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % 4];
    const middle = mul(add(from.x, to.e), 0.5);
    d += `Q${pt(add(middle, mul(OUT[i], bows[i] * 2.6)))} ${pt(to.e)}`;
    d += to.fold ? `L${pt(to.x)}` : `Q${pt(to.c)} ${pt(to.x)}`;
  }
  const folds = corners.map((c) => (c.fold ? `M${pt(c.e)}L${pt(c.fold)}L${pt(c.x)}Z` : ''));
  const flap = `M${pt(corners[0].inner)}L0 ${r2(-21.6 - shape.t * 0.8)}L${pt(corners[1].inner)}`;
  return { d: `${d}Z`, folds, flap };
}

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const main = root.querySelector('.hello');
  const far = root.querySelector('.hello-far');
  const near = root.querySelector('.hello-near');
  const behind = far.querySelector('.h-behind');
  const box = far.querySelector('.h-box');
  const penny = near.querySelector('.h-penny');
  const act = penny.querySelector('.act');
  const body = penny.querySelector('.body');
  const paper = penny.querySelector('.paper');
  const flap = penny.querySelector('.flap');
  const folds = [...penny.querySelectorAll('.fold')];
  const shade = penny.querySelector('.shade');
  const seal = penny.querySelector('.seal');
  const glass = near.querySelector('.h-glass');
  const portal = root.querySelector('#hello-portal');
  const tap = root.querySelector('#hello-penny');
  const said = root.querySelector('#hello-said');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const query = new URLSearchParams(location.search);
  const gait = ['tiptoe', 'zigzag', 'edges'].includes(query.get('gait')) ? query.get('gait') : 'tiptoe';
  const asked = query.get('walk') === 'feet' ? 'bounce' : query.get('walk'); // (feet are gone: their walk was the nearest thing to a bounce)
  const forced = ['rock', 'bounce', 'hop'].includes(asked) ? asked : null;
  const from = ['street', 'glass', 'portal'].includes(query.get('at')) ? query.get('at') : 'model';
  const held = EMOTES.find((one) => one.mood === query.get('emote')) ?? null;
  main.dataset.gait = gait;
  if (forced) main.dataset.walk = forced;

  const voice = createVoice(life, {
    onNote(pitch, dur) {
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      seal.classList.remove('sound');
      void seal.getBoundingClientRect();
      seal.classList.add('sound');
    },
  });
  const say = (words) => { if (said.textContent !== words) said.textContent = words; };

  // A rest. Whatever was waiting on it when the scene is left never goes on.
  class Left extends Error {}
  const rest = (ms) => new Promise((done, stop) => {
    if (life.over) { stop(new Left()); return; }
    life.setTimeout(done, still ? Math.min(ms, 60) : ms);
    life.onEnd(() => stop(new Left()));
  });

  // --- Where things are on the glass ---------------------------------------------------------
  // A point of the window, in the scene's own units.
  function inScene(x, y) {
    const matrix = near.getScreenCTM();
    if (!matrix) return { x: 100, y: 150 };
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }
  // The window's left edge and width, in the scene's units.
  const edges = () => {
    const frame = main.getBoundingClientRect();
    const [a, b] = [inScene(frame.left, frame.top), inScene(frame.right, frame.bottom)];
    return { left: a.x, wide: b.x - a.x };
  };
  // A place given as `across` (0 the left edge of the window, 1 the right) is put in the scene's units.
  const placed = ({ across, ...rest }) => {
    if (across === undefined) return rest;
    const { left, wide } = edges();
    return { ...rest, x: left + wide * across };
  };
  // Up against the glass it is half as wide again as the screen, whatever the screen.
  const glassAt = () => ({ x: 100, s: (edges().wide * 1.5) / 60 });
  const portalAt = () => {
    const spot = portal.getBoundingClientRect();
    if (!spot.width) { // (not shown yet: where it will be)
      const frame = main.getBoundingClientRect();
      return inScene(frame.left + frame.width * 0.56, frame.top + frame.height * 0.58);
    }
    return inScene(spot.left + spot.width / 2, spot.top + spot.height / 2);
  };

  // --- Its body: drawn afresh every frame ----------------------------------------------------
  // `pose` is what the step under way says, and is back at rest when it ends.
  // `feel` is what its feelings ask of its paper, and its lean, how hard it
  // presses on the glass and how heavily it sits: those are eased towards
  // (`want`), never jumped to.
  const pose = { x: HIDE.x, s: HIDE.s, y: null, lift: 0, rot: 0, pivot: 0, sx: 1, sy: 1, bend: {} };
  const feel = { shape: { ...FLAT }, lean: 0, press: 0, squash: 0 };
  const want = { shape: { ...FLAT }, lean: 0, press: 0, squash: 0 };
  let motion = null; // { start, ms, run(p), done }
  let last = performance.now();
  function draw() {
    const y = pose.y ?? ground(pose.s);
    penny.setAttribute('transform', `translate(${pt([pose.x, y])}) scale(${Math.round(pose.s * 1000) / 1000})`);
    const leanAt = feel.lean < 0 ? PAPER.left : PAPER.right;
    const press = 1 + feel.press * 0.035;
    const low = 1 + feel.squash * 0.07; // (heavy-hearted, it settles lower and wider)
    body.setAttribute('transform', `translate(0 ${r2(SINK - pose.lift)}) rotate(${r2(feel.lean)} ${leanAt} ${PAPER.bottom}) rotate(${r2(pose.rot)} ${pose.pivot} ${PAPER.bottom}) translate(0 ${PAPER.bottom}) scale(${r2(pose.sx * press * low)} ${r2(pose.sy / press / low)}) translate(0 ${-PAPER.bottom})`);
    const shape = Object.fromEntries(Object.keys(FLAT).map((key) => [key, feel.shape[key] + (pose.bend[key] ?? 0)]));
    const drawn = paperOf(shape);
    paper.setAttribute('d', drawn.d);
    flap.setAttribute('d', drawn.flap);
    drawn.folds.forEach((d, i) => folds[i].setAttribute('d', d));
    const up = Math.max(0, pose.lift);
    shade.setAttribute('rx', r2(27 / (1 + up / 14)));
    shade.style.opacity = String(r2(1 / (1 + up / 10)));
  }
  function frame(now) {
    if (life.over) return;
    const dt = Math.min(64, now - last);
    last = now;
    if (motion) {
      const p = Math.min(1, (now - motion.start) / motion.ms);
      motion.run(p);
      if (p >= 1) {
        const { done } = motion;
        motion = null;
        penny.classList.remove('moving');
        done();
      }
    }
    const k = 1 - Math.exp(-dt / 140);
    for (const key of Object.keys(FLAT)) feel.shape[key] += (want.shape[key] - feel.shape[key]) * k;
    for (const key of ['lean', 'press', 'squash']) feel[key] += (want[key] - feel[key]) * k;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // One movement: `run` is given how far through it is (0 to 1). With less
  // motion asked for, it is over at once.
  function animate(ms, run) {
    return new Promise((done, stop) => {
      if (life.over) { stop(new Left()); return; }
      life.onEnd(() => stop(new Left()));
      if (still) {
        run(1);
        Object.assign(feel, { ...want, shape: { ...want.shape } });
        draw();
        done();
        return;
      }
      penny.classList.add('moving');
      if (motion) { motion.run(1); motion.done(); } // (one movement cut short by the next: it ends where it was going)
      motion = { start: performance.now(), ms, run, done };
    });
  }
  // Where it is now, as a place.
  const here = () => ({ x: pose.x, s: pose.s, y: pose.y });
  // Somewhere between two places: across is straight; nearer is by how many times bigger.
  const between = (a, b, t) => ({
    x: lerp(a.x, b.x, t),
    s: a.s * (b.s / a.s) ** t,
    y: a.y == null && b.y == null ? null : lerp(a.y ?? ground(a.s), b.y ?? ground(b.s), t),
  });
  const stand = (place) => {
    Object.assign(pose, { y: null, ...place });
    if (pose.y != null && Math.abs(pose.y - ground(pose.s)) < 0.01) pose.y = null; // (landed on the street: it is on the street, and stays there)
  };

  // One step, of one kind, from one place to the next.
  let paces = 0; // steps taken: which foot, or which corner, is next
  function stride(kind, a, b, { height = 9, ms = STEP[kind].ms, tilt = 13 } = {}) {
    const side = paces++ % 2 ? 1 : -1;
    return animate(ms, (p) => {
      const arc = Math.sin(Math.PI * p);
      const bend = {};
      if (kind === 'hop' || kind === 'bounce') {
        // a crouch, a spring and a landing; it goes all the way in the air.
        // (A bounce is a low one, quick, that sways as it goes.)
        const low = kind === 'bounce';
        const up0 = low ? 0.16 : 0.22;
        const down = low ? 0.76 : 0.8;
        const air = Math.min(1, Math.max(0, (p - up0) / (down - up0)));
        stand(between(a, b, ease(air)));
        const crouch = p < up0 ? Math.sin((Math.PI / 2) * (p / up0)) : p < up0 + 0.1 ? 1 - (p - up0) / 0.1 : 0;
        const land = p > down ? Math.sin(Math.PI * ((p - down) / (1 - down))) : 0;
        const up = air > 0 && air < 1 ? 4 * air * (1 - air) : 0;
        pose.lift = (low ? 4 : height) * up;
        const stretch = up > 0 ? Math.sin(Math.PI * Math.min(1, air * 1.6)) * (low ? 0.05 : 0.08) : 0;
        pose.sy = 1 - crouch * (low ? 0.08 : 0.12) - land * (low ? 0.09 : 0.1) + stretch;
        pose.sx = 1 + crouch * (low ? 0.05 : 0.07) + land * 0.06 - stretch * 0.6;
        pose.pivot = 0;
        pose.rot = low ? side * 5 * up : 0;
        bend.tl = crouch * 0.18;
        bend.tr = crouch * 0.18;
        bend.bl = -up * (low ? 0.25 : 0.35); // its bottom corners trail
        bend.br = -up * (low ? 0.25 : 0.35);
        bend.t = -crouch * 0.6 + up * 0.5;
        bend.b = up * 0.6 - land * 0.5; // and its bottom edge gives as it lands
      } else {
        // over onto one bottom corner, the other swung round, and down. (An edge is a small quick one.)
        const small = kind === 'edge';
        stand(between(a, b, ease(p)));
        pose.lift = 0;
        pose.pivot = side * PAPER.right;
        pose.rot = side * (small ? 6 : tilt) * arc;
        const land = p > 0.82 ? Math.sin(Math.PI * ((p - 0.82) / 0.18)) : 0;
        pose.sx = 1 + land * 0.03;
        pose.sy = 1 - land * 0.045;
        bend[side > 0 ? 'bl' : 'br'] = -(small ? 0.3 : 0.55) * arc; // the corner that leaves the ground lifts
        bend[side > 0 ? 'tr' : 'tl'] = 0.12 * arc;
        bend.b = 0.35 * arc;
      }
      if (p >= 1) {
        Object.assign(pose, { lift: 0, rot: 0, sx: 1, sy: 1, bend: {} });
      } else {
        pose.bend = bend;
      }
    });
  }
  // From where it is to `to`, as many steps as it takes. How it moves is how
  // it feels, unless the address says otherwise.
  async function travel(to, how = 'bounce') {
    const kind = forced && how !== 'edge' ? forced : how; // (creeping behind the mailbox is always creeping)
    const a = here();
    const b = placed(to);
    const { depth, stride: reach, gap } = STEP[kind];
    const nearer = Math.abs(Math.log(b.s / a.s)) / depth;
    const across = Math.abs(b.x - a.x) / (reach * Math.sqrt(a.s * b.s));
    const n = Math.max(1, Math.ceil(Math.max(nearer, across) - 0.2));
    let at = a;
    for (let i = 1; i <= n; i++) {
      const next = between(a, b, i / n);
      await stride(kind, at, next);
      at = next;
      if (i < n) await rest(gap);
    }
  }
  // One jump, however far, whatever it feels: a jump is a jump.
  const leap = (to, options = {}) => stride('hop', here(), placed(to), options);
  // Not a step: it leans in, or rises from under the glass.
  const glide = (to, ms) => {
    const a = here();
    const b = placed(to);
    return animate(ms, (p) => stand(between(a, b, ease(p))));
  };
  const put = (to) => { stand(placed(to)); draw(); };

  const mood = (name, mouth = 'smile', eyes = 'open') => {
    penny.dataset.mood = name;
    penny.dataset.mouth = mouth;
    penny.dataset.eyes = eyes;
    const { squash = 0, ...shape } = SHAPES[name] ?? {};
    want.shape = { ...FLAT, ...shape };
    want.squash = squash;
  };
  const look = (x = 0, y = 0) => { penny.style.setProperty('--look-x', x); penny.style.setProperty('--look-y', y); };
  function gesture(name) {
    act.classList.remove('start', 'tilt');
    void act.getBoundingClientRect();
    act.classList.add(name);
  }
  // Behind the mailbox, or in front of it: it is drawn in the street until it comes out.
  const hide = () => behind.append(penny);
  const comeOut = () => near.prepend(penny);

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
    const [dx, dy] = [point.x - pose.x, point.y - H];
    const away = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, away / 30);
    look((dx / away) * 1.7 * reach, (dy / away) * 1.3 * reach);
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
  let flinched = false; // touched since the last stretch
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
  // At first: alone, on plain ground, large, in the middle of the screen,
  // going through what it can feel, until it is touched.
  const modelAt = () => {
    const s = (edges().wide * 0.6) / 60; // three fifths of the screen wide
    return { x: 100, s, y: 150 + 21 * s }; // the middle of its paper (21 of its units up) in the middle of the screen
  };
  // Where it is to be pressed: over it, and as big as it is.
  function laid() {
    const box = paper.getBoundingClientRect();
    const frame = main.getBoundingClientRect();
    Object.assign(tap.style, { left: `${box.left - frame.left}px`, top: `${box.top - frame.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  }
  life.on(window, 'resize', () => { if (beat === 'model') { put(modelAt()); laid(); } });
  async function emote(one) {
    mood(one.mood, one.mouth, one.eyes);
    watch(Boolean(one.watch));
    if (!one.watch) look(...(one.look ?? [0, 0]));
    say(one.said);
    if (one.move === 'tilt') gesture('tilt');
    else if (one.move === 'start') { gesture('start'); voice.sing(GASP, 0.4); }
    else if (one.move === 'bounce') { await leap(here(), { height: 4, ms: 420 }); await leap(here(), { height: 4, ms: 420 }); }
    else if (one.move === 'hops') { for (let n = 0; n < 3; n++) await leap(here(), { height: 11, ms: 520 }); }
    else if (one.move === 'sway') { await stride('rock', here(), here(), { tilt: 7, ms: 700 }); await stride('rock', here(), here(), { tilt: 7, ms: 700 }); }
  }
  async function model() {
    beat = 'model';
    main.classList.remove('in-street');
    comeOut();
    put(modelAt());
    tap.hidden = false;
    laid();
    for (let n = 0; beat === 'model'; n++) {
      await emote(held ?? EMOTES[n % EMOTES.length]);
      if (beat !== 'model') return;
      await rest(held ? 3200 : 2400);
    }
  }
  // Touched: it starts, is knocked back all the way down the street, and hides.
  let knocked = null;
  tap.addEventListener('click', (event) => {
    if (beat !== 'model') return;
    beat = 'knocked';
    tap.hidden = true;
    if (event.clientX || event.clientY) { const at = inScene(event.clientX, event.clientY); ring(at.x, at.y, 22); }
    knocked?.();
  });
  async function knockedBack() {
    watch(false);
    mood('startled', 'o');
    look(0, 0);
    gesture('start');
    voice.sing(GASP, 0.8);
    say('Penny is knocked back, startled, all the way down the street');
    await rest(260);
    main.classList.add('in-street');
    await leap({ x: 168, s: 0.4 }, { height: 30, ms: 1000 });
    // and it scurries behind the mailbox
    mood('shy', 'wavy');
    look(-1.4, 0);
    hide(); // (clear of the mailbox still, on its right: so nothing jumps as it goes behind)
    await travel(HIDE, 'edge');
    box.classList.add('bumped');
    look(0, 0);
    say('It hides behind a mailbox');
  }

  // Behind the mailbox: it leans out round one side, and back; then the other side, for longer.
  async function peeking(knocked = false) {
    beat = 'hiding';
    main.classList.add('in-street');
    hide();
    mood('shy', 'o');
    if (!knocked) {
      put(HIDE);
      say('A quiet street, and a mailbox');
    }
    await rest(1500);
    look(-1.2, 0);
    want.lean = -9;
    await travel({ x: 129, s: HIDE.s }, 'edge');
    say('Somebody looks out from behind the mailbox, and hides again');
    await rest(900);
    want.lean = 0;
    await leap(HIDE, { height: 3, ms: 340 });
    box.classList.add('bumped'); // (it knocked it, going back)
    await rest(1100);
    look(1.2, 0);
    want.lean = 9;
    await travel({ x: 152, s: HIDE.s }, 'edge');
    voice.sing(ASK, 0.35);
    await rest(1500);
    look(0, 0);
    want.lean = 0;
    await rest(700);
    // out it comes, round the side, and stands where it can be seen
    await travel({ x: 163, s: 0.36 }, 'edge');
    comeOut();
    mood('shy', 'wavy');
    await travel({ x: 150, s: 0.42 }, 'edge');
    say('Penny, a letter, comes out, shyly');
    gesture('tilt');
    await rest(1300);
  }

  // Up the street. Each way of coming is a list of stretches; between them it
  // stops and looks, and a touch sends it back to where it last stood. Shy, it
  // rocks on its corners; braver, it walks.
  const GAITS = {
    tiptoe: [
      { to: { x: 134, s: 0.52 }, how: 'rock', then: 'look' },
      { to: { x: 114, s: 0.74 }, how: 'rock', then: 'tilt' },
      { to: { x: 100, s: 1.0 }, how: 'bounce', then: 'look' },
      { to: { x: 104, s: 0.86 }, how: 'rock', then: 'nerve' }, // it loses its nerve, and goes back a step
      { to: { x: 100, s: 1.45 }, how: 'bounce', then: 'tilt' },
      { to: { x: 100, s: 2.15 }, how: 'bounce', then: 'look' },
    ],
    zigzag: [
      { to: { across: 0.06, s: 0.5 }, how: 'bounce', then: 'edge' },
      { to: { across: 0.94, s: 0.74 }, how: 'bounce', then: 'edge' },
      { to: { across: 0.04, s: 1.05 }, how: 'bounce', then: 'edge' },
      { to: { across: 0.96, s: 1.5 }, how: 'bounce', then: 'edge' },
      { to: { across: 0.5, s: 2.15 }, how: 'bounce', then: 'look' },
    ],
    edges: [
      { to: { across: -0.3, s: 0.5 }, how: 'bounce', then: 'gone' }, // off down the street, and out of sight
      { jump: { across: 1.68, s: 1.5 }, to: { across: 1.2, s: 1.5 }, how: 'edge', then: 'peep' }, // in at the right edge
      { to: { across: 1.68, s: 1.5 }, how: 'hop', then: 'gone' },
      { jump: { across: -0.88, s: 2.2 }, to: { across: -0.14, s: 2.2 }, how: 'edge', then: 'peep' }, // in at the left, bigger
      { to: { across: -0.88, s: 2.2 }, how: 'hop', then: 'gone' },
      { jump: { across: 0.5, s: 3.2, y: 400 }, to: { across: 0.5, s: 3.2 }, how: 'rise', then: 'peep' }, // up from under the glass, eyes first
    ],
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
      look(pose.x < 100 ? 1.4 : -1.4, 0);
      await rest(850);
    } else if (kind === 'peep') {
      mood('curious', 'o');
      look(pose.x < 70 ? 1.3 : pose.x > 130 ? -1.3 : 0, 0);
      await rest(1100);
    } else if (kind === 'gone') {
      await rest(650);
    }
  }
  async function coming() {
    beat = 'coming';
    watch(false);
    const steps = GAITS[gait];
    const stood = [here()]; // where it has stopped, to go back to
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.jump) put(step.jump); // (round the outside of the screen, unseen)
      flinched = false;
      if (step.how === 'rise') await glide(step.to, 1100);
      else await travel(step.to, step.how);
      await pause(step.then);
      if (flinched && !step.jump && step.then !== 'gone') {
        // touched: it starts, and is back where it last stood before you could say so
        flinches += 1;
        flinched = false;
        mood('startled', 'o');
        gesture('start');
        voice.sing(GASP, 0.5);
        say('Penny starts, and goes back a step');
        await leap(stood.at(-1), { height: 5, ms: 400 });
        mood('shy', 'wavy');
        await rest(1200);
        i -= 1; // and tries that stretch again
        continue;
      }
      if (!step.jump && step.then !== 'gone' && step.then !== 'nerve') stood.push(here());
    }
  }

  // Up against the glass: wider than the screen, and looking you over.
  async function atGlass(straight = false) {
    beat = 'glass';
    comeOut();
    say('Penny comes right up to the glass, bigger than the screen, and looks you over');
    mood('curious', 'o');
    const GLASS = glassAt();
    if (straight) put(GLASS);
    else await travel(GLASS, 'bounce');
    penny.classList.add('pressed');
    want.press = 1; // its paper flattens a little where it touches
    watch(true);
    await rest(900);
    // one eye, up close: it leans right in, and looks all round the inside of the screen
    watch(false);
    const close = GLASS.s * 1.6;
    await glide({ x: 100 - LEFT_EYE.x * close, s: close }, 1100);
    for (const [x, y] of [[-1.6, -0.6], [1.6, -0.4], [0.4, 1.2], [0, 0]]) {
      look(x, y);
      await rest(620);
    }
    await glide(GLASS, 900);
    // a breath on the glass, and it taps: is anybody there?
    fog(100, H + 9 * GLASS.s);
    await rest(900);
    for (let n = 0; n < 2; n++) {
      gesture('start');
      ring(100, H + 6, 14);
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
    if (straight) {
      put(glassAt());
      want.press = 1;
    }
    portal.hidden = false;
    portal.disabled = true; // (it is Penny's first: nobody goes through before it)
    const spot = portalAt();
    main.style.setProperty('--px', '56%');
    main.style.setProperty('--py', '58%');
    whoosh();
    main.classList.add('opened');
    say('A portal opens behind Penny');
    await rest(500);
    // it stops dead; its corners flare; its eyes go as far round as they can
    mood('startled', 'o');
    gesture('start');
    look(1.8, 0);
    await rest(900);
    // back, and to one side, in one jump: and there it is
    penny.classList.remove('pressed');
    want.press = 0;
    const { left, wide } = edges();
    await leap({ x: left + wide * 0.215, s: (wide * 0.34) / 60 }, { height: 16, ms: 720 }); // (clear of the edge, even with its corners flared, and clear of the portal)
    main.classList.add('revealed');
    say('Penny jumps back, and there it is');
    await rest(700);
    const toPortal = () => look(1.7, spot.y > H ? 0.6 : -0.9);
    toPortal();
    mood('curious', 'o');
    await rest(1100);
    look(0, 0);
    mood('glad', 'smile');
    await rest(800);
    toPortal();
    await leap(here(), { height: 6, ms: 480 }); // a little hop where it stands
    voice.sing(THIS_WAY, 0.8);
    await rest(700);
    // and in
    mood('glad', 'grin');
    await leap({ x: spot.x, s: 0.5, y: spot.y + 9 }, { height: 20, ms: 640 });
    await glide({ x: spot.x, s: 0.06, y: spot.y }, 240);
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

  draw();
  (async () => {
    if (from === 'model') {
      const touched = new Promise((done) => { knocked = done; });
      model().catch((error) => { if (!(error instanceof Left)) console.error(error); });
      await touched;
      await knockedBack();
      await peeking(true);
      await coming();
    } else if (from === 'street') {
      await peeking();
      await coming();
    }
    if (from !== 'portal') await atGlass(from === 'glass');
    await opening(from === 'portal');
  })().catch((error) => { if (!(error instanceof Left)) console.error(error); });
}
