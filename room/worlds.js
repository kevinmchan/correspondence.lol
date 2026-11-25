// Two worlds, on a room's screen (and nowhere else).
//
// The room is a cartoon: a building on the map seen from above, its walls in
// the room's colour, tokens at a wooden table. In its top bar, for a member,
// there is a portal: a ring of light like the one on the home page. Through it
// is the room's other self: the same room, the same people, the same games,
// shot as live action, a drama, at night. The room stays soothing for anybody
// who does not step through; stepping through is the story turning from
// soothing to wrestling with the dark, on purpose.
//
// Stepping in is a passage. A seam opens from the portal: a hairline of light
// drawn down out of it, whose two edges then sweep apart across the room with
// the drama between them, until they meet again above the portal and the drama
// has it all. Inside, the drama is the room, and the cartoon breaks back
// through it now and then: a seam crosses the room, travels, waits, sometimes
// takes the whole screen, and goes back. The portal is the way back, and
// stepping out is as much a passage as stepping in: the seam opens from the
// portal again and sweeps back the other way, the cartoon opening above the
// portal and the drama closing into the seam below it, until it is gone. Then
// everything stops. A press on the way through turns the person round; a press
// while the cartoon is breaking through lets the seam go on and give the
// cartoon the room. Nothing of this is kept: every visit begins outside.
//
// How it is drawn, without disturbing anything:
//   - The serious world is paint, never geometry (room/worlds.css): colours,
//     textures, shadows, filters, a few labels in another face with their line
//     heights held. Every button, link and field keeps its box, to the pixel,
//     in either world and on the way between them, so nothing moves under a
//     finger.
//   - The page itself is only ever in one world: data-paint="serious" on its
//     header and main says which. Focus, what is being typed, where the chat is
//     scrolled to, and games and messages arriving are all simply the page.
//   - Where both worlds are seen, the other is a copy of the page laid exactly
//     over it: inert, hidden from screen readers, never pressed (taps go
//     through to the page), clipped to its part of the window, made afresh for
//     each crossing and each passage, kept up to date while it is there, and
//     taken away after. When the other world has the whole window the page
//     itself changes world, between two frames, and the copy goes. The copy has
//     a hole where the portal is, so the portal seen is always the page's own,
//     belonging to neither world; and one where a field is being typed in.
//   - The film over the serious part (grain, the dark at the edges, the bars) is
//     one small layer fixed to the window; its grain is a small tile moved in
//     steps, and stops when the page is hidden.
//   - The copy has the page's ids too. It comes after the page, so anything
//     looked for by its id is found on the page; but a query over the whole
//     screen finds the copy's things as well, so look on the page itself
//     (`:scope > :is(header, main)`), never over the whole screen.
//   - Never more than three changes in any second, and no part of the window
//     changes more often than that: a world, or the way a passage is going, is
//     kept at least DWELL before a press changes it, and a press waits while
//     three changes (a turn of a passage is one) have come in the last second,
//     however often the portal is pressed. With reduced motion there is no seam
//     and no flicker: a passage is a slow cross-fade that never turns round,
//     each world is kept a while before the next, and inside nothing moves.
//   - The way out is always within reach: while the portal is out of sight (the
//     page scrolled down to the chat), the cartoon does not break through, and
//     if it was breaking through it goes back, gently, and leaves the drama.
//   - Nothing jumps: each frame moves things on by the time since the last, but
//     never more than STEP_MS, and not at all for the first frame after the
//     page has been hidden; so a stall or a sleep slows a movement, never cuts it.
//   - Leaving the room stops it all where it is, and what is fixed to the window
//     goes with the screen as it slides away.
//
// The root says where things stand: data-world is 'playful', 'serious', 'split'
// (a seam is on the screen) or 'fade' (reduced motion, on the way); and
// data-passage is 'in' or 'out' while somebody is passing through the portal.

const still = matchMedia('(prefers-reduced-motion: reduce)');

const between = (a, b) => a + Math.random() * (b - a);
const either = () => (Math.random() < 0.5 ? -1 : 1);
const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const arrive = (t) => 1 - (1 - t) ** 3;
const gently = (t) => (1 - Math.cos(Math.PI * t)) / 2;
// the lean of a seam: sometimes straight down, mostly on a slant (across per down)
const lean = () => (Math.random() < 0.25 ? 0 : either() * between(0.09, 0.2));

const CUT_MS = 140; // a cut to the other world and back to half of it: one flash
const PASS_MS = 1200; // a passage through the portal, either way (with reduced motion, the cross-fade)
const OPEN_MS = 260; // the seam drawing itself out of the portal, as a passage begins
// The least a world, or the way a passage is going, is kept before a press changes it. Half a second: any part of the
// window changes at most once each way a passage goes, so no second can hold more than three of them.
const DWELL = 500;
const STILL_DWELL = 1500; // ...and with reduced motion, the least a world is kept before it fades to the other
const SECOND = 1030; // (a second, as the changes in it are counted; and a little over, for a busy page)
const STEP_MS = 100; // the most one frame moves anything on (see frames)
const STEPS = 96; // how finely the opening of a passage is worked out (see opening)
const DRAMA_TINT = '#050505'; // the browser's own bars, while the page is the drama (as the film's bars are)

// --- Shapes ------------------------------------------------------------------------------------
// A clip-path polygon, with holes in it (even-odd: the way in to a hole and back out again cancel).
const at = (points) => points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ');
const polygon = (points, holes = []) => {
  const solid = holes.filter((hole) => hole.length > 2);
  return solid.length
    ? `polygon(evenodd, ${[at(points), ...solid.map((hole) => at([points[0], ...hole, hole[0]]))].join(', ')})`
    : `polygon(${at(points)})`;
};
// The part of a convex shape where `gap` (linear across the plane) is not negative.
function cut(points, gap) {
  const kept = [];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    const [gp, gq] = [gap(p), gap(q)];
    if (gp >= 0) kept.push(p);
    if ((gp >= 0) !== (gq >= 0)) { // the edge crosses the line
      const t = gp / (gp - gq);
      kept.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return kept;
}
// A wedge from `o`, from the angle `from` round to `to` (clockwise on the screen, at most a whole turn),
// out to `far`: far enough that its outer edges (a quarter turn at most each) stay off the window.
function fan(o, from, to, far) {
  const n = Math.max(1, Math.ceil((to - from) / (Math.PI / 2) - 1e-9));
  const points = [[o.x, o.y]];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    points.push([o.x + far * Math.cos(a), o.y + far * Math.sin(a)]);
  }
  return points;
}
// The part of a convex shape inside that wedge, as convex pieces (one for a half turn or less, else two).
function within(points, o, from, to) {
  const side = (a, [x, y]) => Math.cos(a) * (y - o.y) - Math.sin(a) * (x - o.x); // ≥ 0 clockwise of the ray at a
  const halves = to - from <= Math.PI ? [[from, to]] : [[from, (from + to) / 2], [(from + to) / 2, to]];
  return halves.map(([a, b]) => cut(cut(points, (p) => side(a, p)), (p) => -side(b, p))).filter((piece) => piece.length > 2);
}
// How much of the window a wedge from `o` holds as it opens, facing `c` with its two edges `h` either side of
// that, h from 0 to π: the share at each of STEPS even steps of h. With it a passage opens at an even pace over
// the window: quickly where there is little of it (above the portal), slowly where there is a lot.
function opening(o, c) {
  const [W, H] = [innerWidth, innerHeight];
  // the window along a ray from o: what a thin wedge about the ray holds of it, per radian
  const along = (a) => {
    const d = [Math.cos(a), Math.sin(a)];
    let [near, far] = [0, Infinity];
    for (const [p, v, size] of [[o.x, d[0], W], [o.y, d[1], H]]) {
      if (Math.abs(v) < 1e-9) {
        if (p < 0 || p > size) return 0;
        continue;
      }
      const [t0, t1] = [-p / v, (size - p) / v].sort((x, y) => x - y);
      near = Math.max(near, t0);
      far = Math.min(far, t1);
    }
    return far > near ? (far * far - near * near) / 2 : 0;
  };
  const shares = [0];
  for (let i = 1; i <= STEPS; i++) {
    const h = ((i - 0.5) / STEPS) * Math.PI;
    shares.push(shares[i - 1] + along(c - h) + along(c + h));
  }
  const all = shares[STEPS] || 1;
  return shares.map((share) => share / all);
}
// ...and, back the other way, how far apart the edges are when the wedge holds `share` of the window.
function apart(shares, share) {
  if (share >= 1) return Math.PI;
  let i = 1;
  while (i < STEPS && shares[i] < share) i += 1;
  const [a, b] = [shares[i - 1], shares[i]];
  const t = b > a ? Math.min(1, Math.max(0, (share - a) / (b - a))) : 1;
  return ((i - 1 + t) / STEPS) * Math.PI;
}

// `portal` is the way in and out (a button in the top bar). Returns { member(yes) }: the page says when a
// member is in the room, which is the only time the portal is there.
export function twoWorlds(root, life, portal) {
  let member = false; // a member is in the room
  let want = false; // where the person has asked to be: inside (true), or out
  let where = 'outside'; // where they are: 'outside', 'passing' or 'inside'
  let page = 'playful'; // the world the page itself is painted in
  let run = 0; // bumped to stop whatever is under way
  let conducting = false; // a way through the portal is being taken (see conduct)
  let crossing = false; // the cartoon is breaking through (or going back: see recede)
  let receding = false; // ...going back, because the portal has gone out of sight
  let next = null; // the timer for the next time it does
  let reachable = false; // the portal is in sight, to be pressed (see sight)
  let frozen = false; // the room is being left: everything stays where it is
  const changes = []; // when the screen last changed (the last three times): a change of world, or a passage turning round
  let sleeps = 0; // how many times the page has been hidden (see frames)
  let tinted = null; // the browser's bars as they were, while the page is the drama (see paint)
  let copy = null; // the other world, laid over this one
  let over = null; // the layer over the window, for the film and the seam
  let film = null; // grain, the dark at the edges, the bars: over the serious part
  let splice = null; // a crossing's seam, the line where the two meet
  let edges = null; // a passage's seam: its two edges, drawn out of the portal
  let seam = null; // a crossing's seam: { s: where it crosses the middle of the window, k: its lean, side: +1 if the copy is to its right }
  let gap = null; // a passage's opening: { c: the way it faces from the portal, h: its edges either side of that (0 to π), reach: how far the seam is drawn out (0 to 1), shares }
  let fading = false; // a passage, for somebody who has asked for less motion
  let drawing = 0;
  let refilling = null;
  let through = null; // what shows through the copy from the page (see sync)
  const waking = []; // the waits under way, so that stopping can end them

  const own = () => [...root.children].filter((part) => part.matches('header, main'));
  const note = () => {
    changes.push(performance.now());
    if (changes.length > 3) changes.shift();
  };
  const state = (world) => {
    if (root.dataset.world !== world) note();
    root.dataset.world = world;
  };
  // How long before a press may change the screen again: once it has been as it is for at least `least`, and fewer
  // than three changes have come in the last second.
  const due = (least = still.matches ? STILL_DWELL : DWELL) => {
    const now = performance.now();
    return Math.max(0, least - (now - (changes.at(-1) ?? -Infinity)), changes.length < 3 ? 0 : SECOND - (now - changes.at(-3)));
  };

  // --- The page in one world or the other --------------------------------------------
  // A change made between two frames, with nothing easing into it.
  function snap() {
    root.dataset.cut = '';
    requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.cut));
  }
  function paint(world) {
    snap();
    page = world;
    for (const part of own()) {
      if (world === 'serious') part.dataset.paint = 'serious';
      else delete part.dataset.paint;
    }
    tint(world === 'serious');
  }
  // The browser's own bars (Safari's, round the page) go dark with the drama, as the film's do; and back after, unless
  // the theme has changed them meanwhile.
  function tint(dark) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    if (dark && tinted === null) {
      tinted = meta.content;
      meta.content = DRAMA_TINT;
    } else if (!dark && tinted !== null) {
      if (meta.content === DRAMA_TINT) meta.content = tinted;
      tinted = null;
    }
  }

  // --- The other world, as a copy laid over the page ------------------------------------
  // The way down from the screen to `el` (null if it is not on the page itself); and the same place in the copy.
  const route = (el) => {
    const steps = [];
    for (let up = el; up && up !== root; up = up.parentElement) steps.unshift(up);
    return steps[0] && own().includes(steps[0]) ? steps : null;
  };
  const twinOf = (el) => {
    const steps = route(el);
    if (!steps || !copy) return null;
    let up = copy.children[own().indexOf(steps[0])];
    for (const step of steps.slice(1)) up = up?.children[[...step.parentElement.children].indexOf(step)];
    return up ?? null;
  };

  function fill() {
    const world = copy.dataset.paint;
    copy.replaceChildren(...own().map((part) => {
      const twin = part.cloneNode(true); // (fields keep what is typed in them)
      if (world === 'serious') twin.dataset.paint = 'serious';
      else delete twin.dataset.paint;
      return twin;
    }));
    sync();
  }
  // What scrolls by itself is scrolled to the same place; and a field being
  // typed in (or whatever the keyboard has brought the focus to) shows through
  // the copy from the page, live, caret and all: the copy has a hole there.
  function sync() {
    if (!copy) {
      if (film) redraw(); // (the portal's hole in it, a little wider while the keyboard is on the portal)
      return;
    }
    for (const log of own().flatMap((part) => [...part.querySelectorAll('.chat-log')])) {
      const twin = twinOf(log);
      if (twin) twin.scrollTop = log.scrollTop;
    }
    const focused = document.activeElement;
    through = focused && route(focused) && (focused.matches('input, textarea, select') || focused.matches(':focus-visible')) ? focused : null;
    draw();
  }
  // Whether something the page did changed what it looks like. (Every few seconds the room's poll puts back what is
  // already there: the same people, the same games. Copying the whole page again for that is all cost and no change.)
  const real = (change) => {
    if (change.type === 'attributes') {
      return !(change.attributeName === 'data-paint' && own().includes(change.target)) && change.target.getAttribute(change.attributeName) !== change.oldValue;
    }
    if (change.type === 'characterData') return change.target.data !== change.oldValue;
    const [gone, come] = [change.removedNodes, change.addedNodes];
    return gone.length !== come.length || [...come].some((node, i) => !node.isEqualNode(gone[i]));
  };
  // The night's hidden mark (penny/tags.js) is put down, and glints, on its own clock: what changes on it is put on its
  // twin in the copy as it changes, rather than the whole page being copied again for it.
  const mirror = (change) => {
    if (change.type !== 'attributes' || !change.target.closest?.('.tag-hidden')) return false;
    const twin = twinOf(change.target);
    if (!twin) return false; // (not in the copy yet: it is copied with the rest)
    const value = change.target.getAttribute(change.attributeName);
    if (twin.getAttribute(change.attributeName) !== value) {
      if (value === null) twin.removeAttribute(change.attributeName);
      else twin.setAttribute(change.attributeName, value);
    }
    return true;
  };
  const watch = new MutationObserver((seen) => {
    if (copy && seen.filter((change) => !mirror(change)).some(real)) refill();
  });
  function refill() {
    if (refilling || !copy) return;
    refilling = life.setTimeout(() => {
      refilling = null;
      if (copy) fill();
    }, 50);
  }

  function bring(world) {
    drop();
    copy = document.createElement('div');
    copy.className = 'worlds-copy';
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.dataset.paint = world;
    root.append(copy); // (after the page: anything looked for by its id is found on the page first)
    fill();
    for (const part of own()) watch.observe(part, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, characterDataOldValue: true });
  }
  function drop() {
    watch.disconnect();
    clearTimeout(refilling);
    refilling = null;
    copy?.remove();
    copy = null;
  }
  // The layer over the window that the film and the seam are laid on (there while either is).
  const layer = () => {
    if (!over) {
      over = document.createElement('div');
      over.className = 'worlds-over';
      over.setAttribute('aria-hidden', 'true');
      root.append(over);
    }
    return over;
  };
  const unlayer = () => {
    if (over && !over.firstChild) {
      over.remove();
      over = null;
    }
  };
  function roll() {
    if (film) return;
    film = document.createElement('div');
    film.className = 'worlds-film';
    film.setAttribute('aria-hidden', 'true');
    film.innerHTML = '<i class="grain"></i><i class="dark"></i><i class="bars"></i>';
    layer().prepend(film);
  }
  function unroll() {
    film?.remove();
    film = null;
    unlayer();
  }
  const hairline = (kind) => {
    const it = document.createElement('i');
    it.className = `worlds-splice${kind ? ` ${kind}` : ''}`;
    it.setAttribute('aria-hidden', 'true');
    layer().append(it);
    return it;
  };
  function line() {
    splice ??= hairline('');
  }
  function unline() {
    splice?.remove();
    splice = null;
    edges?.forEach((edge) => edge.remove());
    edges = null;
    unlayer();
  }

  // --- Drawing it ----------------------------------------------------------------------
  // Where the portal is in the window: its middle, and how far its ring reaches.
  const pivot = () => {
    const r = portal.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };
  // Lay the copy, the film and the seam over the window as things stand. In a crossing the seam is a line on the
  // window: through `s` at the middle of the window, leaning `k` across for every pixel down. In a passage it is
  // a wedge from the portal. The copy scrolls with the page, so its shape is worked out from where it is in the
  // window; the film and the seam are fixed to the window. Neither the copy nor the film covers the portal, which
  // is the page's own and no world's: both have a hole there (and the copy one where a field is being typed in).
  function draw() {
    drawing = 0;
    if (!copy && !seam && !gap && !film) return;
    const [W, H] = [innerWidth, innerHeight];
    const box = root.getBoundingClientRect();
    const o = pivot();
    const home = ([x, y]) => [x - box.left, y - box.top]; // from the window to the copy's own corner
    let shape = null; // the copy's part (in the copy)
    let only = (points) => [points]; // a convex shape (in the copy), cut to that part, as convex pieces
    let dark = [[0, 0], [W, 0], [W, H], [0, H]]; // the serious part, for the film (in the window)
    let darkOnly = (points) => [points]; // ...and a convex shape (in the window) cut to that
    if (gap) {
      const far = (Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - o.x, y - o.y))) + 64) * Math.SQRT2;
      const serious = [gap.c - gap.h, gap.c + gap.h];
      const [from, to] = copy?.dataset.paint === 'playful' ? [gap.c + gap.h, gap.c + 2 * Math.PI - gap.h] : serious;
      shape = fan(o, from, to, far).map(home);
      only = (points) => within(points, { x: o.x - box.left, y: o.y - box.top }, from, to);
      dark = fan(o, ...serious, far);
      darkOnly = (points) => within(points, o, ...serious);
      // the two edges of the seam, from the rim of the portal
      edges?.forEach((edge, i) => {
        const a = i ? gap.c + gap.h : gap.c - gap.h;
        edge.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) rotate(${(a - Math.PI / 2).toFixed(4)}rad) translateY(${(o.r + 3).toFixed(1)}px) scaleY(${gap.reach.toFixed(3)})`;
      });
    } else if (seam) {
      const across = (y) => seam.s + (y - H / 2) * seam.k;
      const far = W + Math.abs(seam.k) * H + 64;
      // the part on one side of the seam (+1 its right) of a box whose top left is at (left, top) in the window
      const part = (on, left, top, high) => {
        const [a, b] = [across(top) - left, across(top + high) - left];
        return on > 0 ? [[a, 0], [far, 0], [far, high], [b, high]] : [[-far, 0], [a, 0], [b, high], [-far, high]];
      };
      const darkSide = copy?.dataset.paint === 'playful' ? -seam.side : seam.side;
      shape = copy ? part(seam.side, box.left, box.top, copy.offsetHeight) : null;
      only = (points) => [cut(points, ([x, y]) => (x - (across(y + box.top) - box.left)) * seam.side)];
      dark = part(darkSide, 0, 0, H);
      darkOnly = (points) => [cut(points, ([x, y]) => (x - across(y)) * darkSide)];
      if (splice) splice.style.transform = `translateX(${seam.s}px) rotate(${-Math.atan(seam.k)}rad)`;
    } else if (copy) {
      shape = [[0, 0], [box.width, 0], [box.width, copy.offsetHeight], [0, copy.offsetHeight]];
    }
    // the portal's hole (a little wider while the keyboard is on it, for its ring of focus), while it is near the window
    const reach = o.r + (document.activeElement === portal && portal.matches(':focus-visible') ? 7 : 2);
    const ring = !portal.hidden && o.y + reach > 0 && o.y - reach < H
      ? Array.from({ length: 20 }, (_, i) => [o.x + reach * Math.cos((i * Math.PI) / 10), o.y + reach * Math.sin((i * Math.PI) / 10)])
      : null;
    if (copy) {
      const holes = ring ? [ring.map(home)] : [];
      if (through?.isConnected && through !== portal) {
        const r = through.getBoundingClientRect();
        holes.push([[r.left - 6, r.top - 6], [r.right + 6, r.top - 6], [r.right + 6, r.bottom + 6], [r.left - 6, r.bottom + 6]].map(home));
      }
      copy.style.clipPath = polygon(shape, holes.flatMap(only));
    }
    if (film) film.style.clipPath = polygon(dark, ring ? darkOnly(ring) : []);
  }
  const redraw = () => {
    if ((seam || copy || gap || film) && !drawing) drawing = requestAnimationFrame(draw);
  };
  // where a crossing's seam is when the copy's side has all of the window (to: -side) or none of it (to: side)
  const edge = (to) => (to > 0 ? innerWidth + (Math.abs(seam.k) * innerHeight) / 2 + 8 : -(Math.abs(seam.k) * innerHeight) / 2 - 8);

  // --- Time ---------------------------------------------------------------------------
  // Each of these settles true when it has run its course, or false when everything was stopped first; and then
  // what it was waiting on (a timer, a frame) is called off with it, so that stopping leaves nothing behind.
  function hold(begin) {
    return new Promise((resolve) => {
      const one = { done: null, off: null };
      one.done = (value) => {
        const i = waking.indexOf(one);
        if (i >= 0) waking.splice(i, 1);
        if (!value) one.off?.();
        resolve(value);
      };
      waking.push(one);
      one.off = begin(one.done);
    });
  }
  function wait(ms) {
    const mine = run;
    return hold((done) => {
      const id = life.setTimeout(() => done(mine === run), ms);
      return () => clearTimeout(id);
    });
  }
  // A frame at a time, until `step(dt)` says it is done: `dt` is the time since the last frame (or, for the first, since
  // it was asked for), but never more than STEP_MS, and nothing for the first frame after the page has been hidden. So
  // a stalled frame, or a page put away and taken out again, slows a movement down and never skips part of it.
  function frames(step) {
    const mine = run;
    let last = performance.now();
    let woke = sleeps;
    return hold((done) => {
      let id = 0;
      const tick = (now) => {
        if (mine !== run) return done(false);
        const dt = woke === sleeps ? Math.min(STEP_MS, Math.max(0, now - last)) : 0;
        [last, woke] = [now, sleeps];
        if (step(dt)) done(true);
        else id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(id);
    });
  }
  function glide(to, ms, curve = smooth) {
    const from = seam.s;
    let t = 0;
    return frames((dt) => {
      t = Math.min(1, t + dt / ms);
      seam.s = from + (to - from) * curve(t);
      draw();
      return t >= 1;
    });
  }
  // Until a press may change the screen again (see due).
  function settled() {
    const left = due();
    return left > 0 ? wait(left) : Promise.resolve(true);
  }

  // The page becomes `world`, whole: the copy, the seam and (for the cartoon) the film go.
  function whole(world) {
    paint(world);
    drop();
    seam = null;
    gap = null;
    fading = false;
    unline();
    if (world === 'serious') {
      roll();
      film.style.opacity = '';
      draw();
    } else unroll();
    state(world);
  }

  // --- Through the portal ------------------------------------------------------------------
  // A passage. The page stays in its world, the other is laid over it as a copy, and the seam opens from the
  // portal: the drama in a wedge below the portal between its two edges, opening up and round until they meet
  // above it (in), or closing back down into the seam (out). With reduced motion the copy only fades in. `p` is
  // how far through the person is, 0 outside and 1 inside; each frame it goes towards where they have asked to
  // be, so a press on the way turns them round: a turn is a change like any other (see due). A fade never turns
  // round: it goes on, and the person is taken back once it is done. Settles true once they are through, whichever
  // way, and false if everything was stopped first.
  async function pass() {
    const into = page === 'playful';
    let p = into ? 0 : 1;
    let heading = p ? 0 : 1;
    let gone = 0; // how long it has been under way
    where = 'passing';
    if (still.matches) {
      fading = true;
      roll();
      film.style.opacity = String(p);
      bring(into ? 'serious' : 'playful'); // (and drawn)
      copy.style.opacity = '0';
      state('fade');
    } else {
      const c = Math.PI / 2 + (Math.random() < 0.25 ? 0 : either() * between(0.07, 0.16));
      gap = { c, h: p * Math.PI, reach: 0, shares: opening(pivot(), c) };
      roll();
      edges = [hairline('edge'), hairline('edge')];
      bring(into ? 'serious' : 'playful'); // (and drawn, before anything is painted)
      state('split');
    }
    root.dataset.passage = heading ? 'in' : 'out';
    const arrived = await frames((dt) => {
      gone += dt;
      if (!fading && want !== Boolean(heading) && !due()) { // turned round
        heading = want ? 1 : 0;
        note();
        root.dataset.passage = heading ? 'in' : 'out';
      }
      p = Math.min(1, Math.max(0, p + ((heading ? 1 : -1) * dt) / PASS_MS));
      const q = gently(p); // how much of the window is in the drama
      if (fading) {
        copy.style.opacity = String(into ? q : 1 - q);
        film.style.opacity = String(q);
      } else {
        gap.h = apart(gap.shares, q);
        gap.reach = arrive(Math.min(1, gone / OPEN_MS));
        draw();
      }
      return p === heading;
    });
    if (!arrived) return false;
    delete root.dataset.passage;
    whole(heading ? 'serious' : 'playful');
    where = heading ? 'inside' : 'outside';
    return true;
  }

  // Whatever a press asks for is done here, one thing at a time; presses that come meanwhile only change where
  // the person wants to be, and are taken up as it goes (a passage turns round) or after it.
  async function conduct() {
    if (conducting) return;
    conducting = true;
    const there = () => (want ? where === 'inside' : where === 'outside');
    while (member && !life.over && !frozen && !there()) {
      if (where === 'inside') {
        // stepping out: whatever the cartoon is doing is stopped where it is, and taken on from there
        calm();
        if (seam || page === 'playful') { // the cartoon is breaking through: its seam goes on, and gives it the room
          if (!await giveAll('playful')) break;
          where = 'outside';
        } else {
          if (!await settled()) break;
          if (!there() && !await pass()) break; // (unless pressed back again meanwhile)
        }
      } else {
        if (!await settled()) break;
        if (!there() && !await pass()) break;
      }
    }
    conducting = false;
    if (!member || life.over || frozen) return;
    if (where === 'outside') rest();
    else if (free() && !next) plan(between(7000, 11000)); // soon after stepping in: the cartoon breaks back through
  }

  // `world` is given the room, gently: the seam on the screen goes on the way that gives it all of the window; or, if
  // the page is the other world whole, `world` comes in from a side and takes it. Settles true once it has the room,
  // false if everything was stopped first.
  async function giveAll(world) {
    if (seam) {
      const to = edge(copy?.dataset.paint === world ? -seam.side : seam.side);
      const far = Math.abs(to - seam.s);
      if (far > 2) {
        state('split');
        if (!await glide(to, Math.min(900, Math.max(380, (far / innerWidth) * 900)))) return false;
      }
    } else if (page !== world) {
      if (!await settled()) return false;
      cutIn(world, 1);
      state('split');
      if (!await glide(edge(-seam.side), 1100)) return false;
    }
    whole(world);
    return true;
  }

  // --- Inside: the cartoon breaking back through --------------------------------------------
  // A seam on a slant (or not), with the copy of `world` on one side of it, starting at `from` (see edge).
  function cutIn(world, from) {
    seam = { s: 0, k: lean(), side: either() };
    seam.s = edge(from * seam.side);
    bring(world);
    roll();
    line();
    draw();
  }
  // How long the cartoon has the room, when it takes it whole: a few seconds, sometimes longer.
  const stay = () => (Math.random() < 0.3 ? between(8000, 12000) : between(3000, 6000));

  async function breakThrough() {
    const kind = ['splice', 'pov', 'pov', 'takeover'][Math.floor(Math.random() * 4)];
    if (kind === 'splice') {
      // a cut to the cartoon, and straight back to half of it
      cutIn('playful', -1);
      state('playful');
      if (!await wait(CUT_MS)) return;
      seam.s = innerWidth * between(0.4, 0.6);
      draw();
      state('split');
      if (!await wait(between(1400, 3000))) return;
    } else {
      // the cartoon comes in from one side
      cutIn('playful', 1);
      state('split');
      if (kind === 'takeover') {
        if (!await glide(edge(-seam.side), between(1300, 1800))) return;
      } else {
        if (!await glide(innerWidth * between(0.38, 0.62), 950, arrive)) return;
        if (!await wait(between(2200, 4800))) return;
      }
    }
    if (kind !== 'takeover' && Math.random() < 0.55) {
      // it travels, and waits again
      if (!await glide(innerWidth * between(0.25, 0.75), 1000)) return;
      if (!await wait(between(600, 1600))) return;
    }
    if (kind === 'pov') {
      // and goes back where it came from, without ever having the whole screen
      if (!await glide(edge(seam.side), 800)) return;
      whole('serious');
      return;
    }
    if (kind === 'splice' && !await glide(edge(-seam.side), 750)) return;
    whole('playful');
    if (!await wait(stay())) return;

    // and the drama has it back: by a cut, sometimes; or it comes in from a side, waits, and has it all again
    if (Math.random() < 0.3) {
      whole('serious');
      return;
    }
    cutIn('serious', 1);
    state('split');
    if (!await glide(innerWidth * between(0.35, 0.65), 850, arrive)) return;
    if (!await wait(between(800, 2000))) return;
    if (!await glide(edge(-seam.side), 700)) return;
    whole('serious');
  }

  // Whether the cartoon may break through now: the person is inside and means to stay, the page is on screen, the
  // portal is in sight (so that the way out is always within reach), and not for anybody who has asked for less motion.
  const free = () => where === 'inside' && want && member && !conducting && !crossing && !frozen && !life.over && !document.hidden && reachable && !still.matches;

  async function cross() {
    next = null;
    if (!free()) return; // (taken up again when the page, or the portal, is back)
    crossing = true;
    const mine = run;
    if (await settled()) await breakThrough();
    if (mine !== run || life.over) return; // (stopped: whoever stopped it has taken over)
    crossing = false;
    plan(between(15000, 60000));
  }
  function plan(ms) {
    clearTimeout(next);
    next = life.setTimeout(cross, ms);
  }

  // The portal has gone out of sight (the page scrolled down, to the games or the chat), so the way out is not within
  // reach: whatever the cartoon was doing goes back, gently, with no cut, and leaves the drama the room. Nothing breaks
  // through again until the portal is back in sight.
  async function recede() {
    if (receding) return;
    calm();
    crossing = receding = true;
    const mine = run;
    await giveAll('serious');
    if (mine !== run) return; // (stopped: whoever stopped it has taken over)
    crossing = receding = false;
    if (free()) plan(between(15000, 60000));
  }
  const sight = new IntersectionObserver(([one]) => {
    const was = reachable;
    reachable = one.isIntersecting && one.intersectionRatio >= 0.5;
    if (reachable === was || frozen) return;
    if (!reachable) {
      clearTimeout(next);
      next = null;
      if (crossing) recede();
    } else if (free() && !next) plan(between(15000, 60000));
  }, { threshold: [0, 0.5, 1] });
  sight.observe(portal);

  // Whatever is under way stops where it is.
  function calm() {
    run += 1;
    crossing = receding = false;
    clearTimeout(next);
    next = null;
    for (const one of waking.splice(0)) one.done(false);
  }
  // Back outside: every timer stops.
  function rest() {
    calm();
    cancelAnimationFrame(drawing);
    drawing = 0;
    clearTimeout(refilling);
    refilling = null;
  }
  // Everything stops, at once, and the page is the cartoon again.
  function reset() {
    rest();
    delete root.dataset.passage;
    drop();
    unroll();
    unline();
    seam = null;
    gap = null;
    fading = false;
    if (page !== 'playful' || own().some((part) => part.dataset.paint)) paint('playful');
    state('playful');
    where = 'outside';
  }

  // The room is being left (shared/nav.js slides it away, and ends it after): everything stops where it is. The layer
  // fixed to the window (the film, the seam) is pinned where the window is on the screen, so that it goes with it; for
  // the screen is moved by a transform, and would otherwise take the layer for its own and lay it out against itself.
  function freeze() {
    if (frozen) return;
    frozen = true;
    rest();
    watch.disconnect();
    sight.disconnect();
    tint(false);
    if (over) {
      const box = root.getBoundingClientRect(); // (not yet moved: the slide begins on the next frame)
      Object.assign(over.style, { position: 'absolute', inset: 'auto', top: `${-box.top}px`, left: `${-box.left}px`, width: `${innerWidth}px`, height: `${innerHeight}px` });
    }
  }
  const leaving = new MutationObserver(() => {
    if (root.classList.contains('leaving')) freeze();
  });
  leaving.observe(root, { attributes: true, attributeFilter: ['class'] });

  // The portal is a toggle: its name stays the same, and whether it is pressed says where the person has asked to be.
  function show() {
    portal.setAttribute('aria-pressed', String(want));
  }
  portal.addEventListener('click', () => {
    if (!member || frozen) return;
    want = !want;
    show();
    conduct();
  });

  // The copy keeps up with the page while it is there. (What is typed is put in the same field of the copy, and that
  // is all: while it has the focus, the copy has a hole there anyway.)
  life.on(root, 'input', (event) => {
    if (!copy || copy.contains(event.target) || !event.target.matches?.('input, textarea, select')) return;
    const twin = twinOf(event.target);
    if (twin?.tagName === event.target.tagName) twin.value = event.target.value;
  }, true);
  life.on(root, 'scroll', (event) => {
    if (copy && !copy.contains(event.target)) sync();
  }, true);
  life.on(root, 'focusin', () => sync());
  life.on(root, 'focusout', () => {
    if (copy || film) life.setTimeout(sync, 0);
  });
  life.on(window, 'scroll', redraw, { passive: true });
  life.on(window, 'resize', () => {
    if (gap) gap.shares = opening(pivot(), gap.c);
    redraw();
  });
  life.on(document, 'visibilitychange', () => {
    root.toggleAttribute('data-asleep', document.hidden); // (the grain stops)
    if (document.hidden) {
      sleeps += 1;
      clearTimeout(next);
      next = null;
    } else if (free() && !next) plan(between(15000, 60000));
  });
  life.onEnd(() => {
    run += 1;
    clearTimeout(next);
    clearTimeout(refilling);
    cancelAnimationFrame(drawing);
    watch.disconnect();
    sight.disconnect();
    leaving.disconnect();
    tint(false);
    for (const one of waking.splice(0)) one.done(false);
  });

  root.dataset.world = 'playful';
  show();
  return {
    // Whether a member is in the room (and so whether the portal is there at all). Out of it, or no longer a
    // member, the person is back outside at once.
    member(yes) {
      portal.hidden = !yes;
      if (yes === member) return;
      member = yes;
      if (!yes) {
        want = false;
        show();
        reset();
      }
    },
  };
}
