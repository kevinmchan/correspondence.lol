// Marcus Pell, in the world (the owner, 27 November 2026: "add the ability to
// follow Marcus from the reel. If you follow him, he gets added to the world
// and can roam about in the background").
//
// Followed from his reel (penny/reel.js, FOLLOW_KEY in penny/marcus.js), he is
// on the map the home page is drawn on: small, behind everything on it, the
// way a passer-by is behind a shop window. He wanders from one clear patch of
// ground to another (a gap between tiles, the margin, the open ground at the
// foot), mostly where you can see him, at a stroll: a ladder has no legs, so
// he walks the way a ladder is walked, rocking from one rail onto the other.
// At each stop he rests a while, blinks, and now and then does his tell, the
// one from his reel: he hauls his lower section up after him. He still has his
// phone in his hand. Nothing to press, nothing said: he is only there.
//
// With reduced motion he does not walk: he is standing somewhere clear when
// the page opens, and stays.
//
//   wander(root, life): the home page calls it while he is followed.

import { body } from './marcus.js';

const VIEW = { x: 30, y: 236, w: 236, h: 548 }; // his body, in the reel's own picture (penny/marcus.js)
const SPEED = 26; // px a second: a stroll
const between = (a, b) => a + Math.random() * (b - a);
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

// What is on the page, which he keeps out from behind when he stops.
const SOLID = [
  '.mark', 'h1', '.building', '#me:not([hidden])', '.play-wide:not([hidden])', '.home-energy:not([hidden])',
  '.tabs:not([hidden])', '.feed-item', '.feed-empty:not([hidden])', '.menu-button', '.street li', '#welcome:not([hidden]) form',
  '#portal', '.version', '.tag-kept', '.tag-hidden:not([hidden])', '.install-banner',
].join(', ');

export function wander(root, life) {
  const main = root.querySelector(':scope > main');
  if (!main) return null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'wander';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<svg class="wander-marcus" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">${body({ named: false })}</svg>`;
  main.prepend(layer);
  const him = layer.firstElementChild;
  const [torso, head] = him.children;
  const base = torso.firstElementChild;
  const lids = [...him.querySelectorAll('.lid')];
  life.onEnd?.(() => layer.remove());

  const size = () => ({ w: him.getBoundingClientRect().width || 38, h: him.getBoundingClientRect().height || 88 });
  // Somewhere clear of everything on the page, on the part of it that can be seen if there is room there.
  function clearSpot() {
    const frame = main.getBoundingClientRect();
    const { w, h } = size();
    const pad = 8;
    const boxes = [...main.querySelectorAll(SOLID)].map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height);
    const free = (x, y) => boxes.every((b) => x + w + pad < b.left - frame.left || x - pad > b.right - frame.left || y + h + pad < b.top - frame.top || y - pad > b.bottom - frame.top);
    const seenTop = Math.max(pad, -frame.top + pad);
    const seenBottom = Math.min(frame.height - h - pad, window.innerHeight - frame.top - h - pad);
    for (const [top, bottom] of [[seenTop, seenBottom], [pad, frame.height - h - pad]]) {
      if (bottom <= top) continue;
      for (let n = 0; n < 80; n += 1) {
        const x = between(pad, Math.max(pad, frame.width - w - pad));
        const y = between(top, bottom);
        if (free(x, y)) return { x, y };
      }
    }
    return null;
  }

  // Where he is (his top left, on the page), which way he faces, and what he is doing.
  const at = clearSpot() ?? { x: 12, y: Math.max(12, main.getBoundingClientRect().height - size().h - 12) };
  let facing = Math.random() < 0.5 ? 1 : -1;
  let to = null;
  let restUntil = performance.now() + between(1500, 3500);
  let step = 0; // how far into his rocking walk
  let tellAt = -1e9;
  let nextTell = performance.now() + between(6000, 12000);
  let blinkAt = -1e9;
  let nextBlink = performance.now() + between(1500, 4000);
  const place = (rock = 0, lift = 0) => {
    him.style.transform = `translate(${at.x}px, ${at.y - lift}px) scaleX(${facing}) rotate(${rock}deg)`;
  };
  place();
  layer.classList.add('here');
  if (still) return { at };

  let last = performance.now();
  function frame(now) {
    if (life.over) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
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
    place(rock, lift);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { at };
}
