// Marcus Pell, in the world (the owner, 27 November 2026: "add the ability to
// follow Marcus from the reel. If you follow him, he gets added to the world
// and can roam about in the background"; and then, "add the ladder to the Room
// rather than the Home Screen").
//
// Followed from his reel (penny/reel.js, FOLLOW_KEY in penny/marcus.js), he is
// in your rooms: small, on the floor of the house, behind everything in it
// (the table, the tiles, the rug), the way somebody is in the background of a
// room. A house is mostly furniture, so where he stops only his face has to
// be clear: he stands behind the table or the rug and looks over it, beside
// the people at its head, or in a corner. He wanders from one such place to
// another, mostly where you can see him,
// at a stroll: a ladder has no legs, so he walks the way a ladder is walked,
// rocking from one rail onto the other. At each stop he rests a while, blinks,
// and now and then does his tell, the one from his reel: he hauls his lower
// section up after him. He still has his phone in his hand. Nothing to press,
// nothing said: he is only there. He is in the room's own world only: through
// its portal, in the night, he is not (room/room.css).
//
// With reduced motion he does not walk: he is standing somewhere clear once
// the room is drawn, and stays.
//
//   wander({ root, life, place, after, solid }): `place` is the element he is
//   on (the house), placed as one of its layers just after `after`; `solid`
//   is a selector, inside `place`, for what he keeps out from behind when he
//   stops. The room calls it while he is followed.

import { body } from './marcus.js';

const VIEW = { x: 30, y: 236, w: 236, h: 548 }; // his body, in the reel's own picture (penny/marcus.js)
const SPEED = 24; // px a second: a stroll
const EDGE = 18; // px he keeps inside the edge of where he is (clear of the house's walls)
const FACE = 0.42; // how much of him, from the top, has to be clear where he stops: the rest may be behind something
const between = (a, b) => a + Math.random() * (b - a);
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

export function wander({ root, life, place, after = null, solid = '' }) {
  if (!place) return null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'wander';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<svg class="wander-marcus" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">${body({ named: false })}</svg>`;
  if (after?.parentElement === place) after.after(layer);
  else place.prepend(layer);
  const him = layer.firstElementChild;
  const [torso, head] = him.children;
  const base = torso.firstElementChild;
  const lids = [...him.querySelectorAll('.lid')];
  life.onEnd(() => layer.remove());

  const size = () => {
    const box = him.getBoundingClientRect();
    return { w: box.width || 38, h: box.height || 88 };
  };
  // Somewhere clear of everything in the place, on the part of it that can be seen if there is room there.
  function clearSpot() {
    const frame = place.getBoundingClientRect();
    if (!frame.width || !frame.height) return null; // (not drawn yet, or put away)
    const { w, h } = size();
    const pad = 8;
    const boxes = solid ? [...place.querySelectorAll(solid)].map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height) : [];
    const face = h * FACE;
    const free = (x, y) => boxes.every((b) => x + w + pad < b.left - frame.left || x - pad > b.right - frame.left || y + face + pad < b.top - frame.top || y - pad > b.bottom - frame.top);
    const left = EDGE;
    const right = frame.width - w - EDGE;
    const seenTop = Math.max(EDGE, -frame.top + pad);
    const seenBottom = Math.min(frame.height - h - EDGE, window.innerHeight - frame.top - h - pad);
    for (const [top, bottom] of [[seenTop, seenBottom], [EDGE, frame.height - h - EDGE]]) {
      if (bottom <= top || right <= left) continue;
      for (let n = 0; n < 80; n += 1) {
        const x = between(left, right);
        const y = between(top, bottom);
        if (free(x, y)) return { x, y };
      }
    }
    return null;
  }

  // Where he is (his top left, in the place), which way he faces, and what he is doing.
  let at = null;
  let facing = Math.random() < 0.5 ? 1 : -1;
  let to = null;
  let restUntil = 0;
  let step = 0; // how far into his rocking walk
  let tellAt = -1e9;
  let nextTell = performance.now() + between(6000, 12000);
  let blinkAt = -1e9;
  let nextBlink = performance.now() + between(1500, 4000);
  const show = (rock = 0, lift = 0) => {
    him.style.transform = `translate(${at.x}px, ${at.y - lift}px) scaleX(${facing}) rotate(${rock}deg)`;
  };
  // He arrives once the place has been drawn and there is somewhere clear for him.
  function arrive(now) {
    at = clearSpot();
    if (!at) return false;
    show();
    layer.classList.add('here');
    restUntil = now + between(1500, 3500);
    return true;
  }

  if (still) { // (drawn at rest: once there is somewhere for him, he is there, and stays)
    const look = life.setInterval(() => { if (arrive(performance.now())) clearInterval(look); }, 500);
    arrive(performance.now());
    return { layer };
  }

  let last = performance.now();
  function frame(now) {
    if (life.over) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!at) {
      if (now > restUntil && !arrive(now)) restUntil = now + 500;
      requestAnimationFrame(frame);
      return;
    }
    let rock = 0;
    let lift = 0;
    if (to) {
      const dx = to.x - at.x;
      const dy = to.y - at.y;
      const far = Math.hypot(dx, dy);
      if (far < 1.5) {
        to = null;
        restUntil = now + between(3500, 8000);
      } else {
        const go = Math.min(far, SPEED * dt);
        at.x += (dx / far) * go;
        at.y += (dy / far) * go;
        if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
        step += dt * 3.2; // a rock onto one rail, and then the other, about one and a half a second
        rock = Math.sin(step * Math.PI) * 6 * Math.min(1, far / 12);
        lift = Math.abs(Math.sin(step * Math.PI)) * 2.5;
      }
    } else if (now > restUntil) {
      to = clearSpot();
      if (!to) restUntil = now + 4000; // nowhere clear just now: he stays, and looks again in a while
    } else if (now > nextTell) {
      tellAt = now;
      nextTell = now + between(9000, 16000);
    }
    // His tell, at rest: he hauls his lower section up after him, and lets it down again.
    const k = (now - tellAt) / 1000;
    const g = k < 0.3 ? ease(k / 0.3) : k < 1 ? 1 : 1 - ease((k - 1) / 0.3);
    base.style.transform = `translateY(${-58 * g}px)`;
    head.style.transform = `translateY(${Math.sin(now / 700) * 2}px)`;
    if (now > nextBlink) {
      blinkAt = now;
      nextBlink = now + between(2200, 5600);
    }
    const b = (now - blinkAt) / 1000;
    const shut = b < 0.07 ? b / 0.07 : b < 0.18 ? 1 - (b - 0.07) / 0.11 : 0;
    for (const lid of lids) lid.style.transform = `scaleY(${shut})`;
    show(rock, lift);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { layer };
}
