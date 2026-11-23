// The pal: Penny at life size, with Dot beside her.
//
// The screen is a map seen from far above. Penny is not on it. She stands at
// the bottom edge of the window, in the viewer's own space, as big as a letter
// held up next to you, looking up at the map with you. She is one layer over
// the whole app, not part of any screen: screens slide past and she stays.
//
// She cannot speak, so everything she has to say is a feeling: a mood (which
// sets her face and how she holds herself), a gesture (one movement), where
// she looks, where along the edge she stands and how far up she comes, how
// brightly her seal glows, and a hum. A screen that wants her asks for her
// with claim(); she goes back under the screen when that screen has gone and
// no other has asked.

import { createVoice } from './penny.js';

const SVG = 'http://www.w3.org/2000/svg';

// A mood is a face and a way of standing. Numbers are multipliers on her
// resting face: `eye` the size of her eyes, `brow` how far the point of her
// flap comes down (it works as a brow: up is open and glad, down is troubled),
// `cheek` how pink, `glow` how warm the seal. `eyes` picks the eye drawing,
// `mouth` the mouth, `idle` what she does while nothing else is happening.
export const MOODS = {
  calm: { mouth: 'smile', eyes: 'open', eye: 1, brow: 1, cheek: 0.5, glow: 0.15, idle: 'breathe', tilt: 0 },
  curious: { mouth: 'o', eyes: 'open', eye: 1.1, brow: 0.93, cheek: 0.5, glow: 0.25, idle: 'breathe', tilt: 5 },
  unsure: { mouth: 'wavy', eyes: 'open', eye: 1, brow: 1.03, cheek: 0.4, glow: 0.12, idle: 'sway', tilt: -4 },
  hopeful: { mouth: 'smile', eyes: 'open', eye: 1.12, brow: 0.9, cheek: 0.7, glow: 0.45, idle: 'bob', tilt: 0 },
  warm: { mouth: 'grin', eyes: 'open', eye: 1.18, brow: 0.86, cheek: 0.9, glow: 0.75, idle: 'bounce', tilt: 0 },
  thrilled: { mouth: 'grin', eyes: 'happy', eye: 1.1, brow: 0.84, cheek: 1, glow: 1, idle: 'bounce', tilt: 0 },
  glad: { mouth: 'smile', eyes: 'happy', eye: 1, brow: 0.92, cheek: 1, glow: 0.8, idle: 'sway', tilt: 0 },
  no: { mouth: 'flat', eyes: 'open', eye: 0.92, brow: 1.06, cheek: 0.3, glow: 0.05, idle: 'still', tilt: 0 },
  worried: { mouth: 'wavy', eyes: 'open', eye: 1.2, brow: 1.05, cheek: 0.25, glow: 0.08, idle: 'tremble', tilt: 0 },
  sad: { mouth: 'frown', eyes: 'half', eye: 1, brow: 1.05, cheek: 0.25, glow: 0, idle: 'droop', tilt: 0 },
  listening: { mouth: 'o', eyes: 'open', eye: 1.08, brow: 0.95, cheek: 0.5, glow: 0.3, idle: 'still', tilt: 8 },
  pleading: { mouth: 'wavy', eyes: 'big', eye: 1.3, brow: 0.9, cheek: 0.8, glow: 0.4, idle: 'bob', tilt: 0 },
  surprised: { mouth: 'o', eyes: 'open', eye: 1.25, brow: 0.8, cheek: 0.6, glow: 0.9, idle: 'still', tilt: 0 },
  sleepy: { mouth: 'flat', eyes: 'closed', eye: 1, brow: 1.02, cheek: 0.4, glow: 0.05, idle: 'breathe', tilt: 0 },
};

// How far up she comes: all of her standing on the edge, her eyes over it, the
// point of her flap only, or gone.
const HEIGHTS = ['up', 'peek', 'low', 'gone'];
const GESTURES = ['hop', 'hop2', 'jump', 'shake', 'nod', 'wiggle', 'sink'];

const PENNY = `
  <ellipse class="shade" cx="90" cy="78.6" rx="27" ry="3"/>
  <g class="lean"><g class="act">
    <path class="foot" d="M76 76.6 q4 -4 8 0z"/><path class="foot" d="M96 76.6 q4 -4 8 0z"/>
    <g class="idle">
      <rect class="paper" x="60" y="32" width="60" height="42" rx="5"/>
      <path class="flap" d="M61.5 34 L90 55 L118.5 34"/>
      <g class="sealed"><circle class="warmth" cx="90" cy="54.5" r="9.5"/><circle class="seal" cx="90" cy="54.5" r="4.6"/></g>
      <circle class="cheek" cx="71" cy="62.6" r="3.4"/><circle class="cheek" cx="109" cy="62.6" r="3.4"/>
      <g class="eyes">
        <g class="eye"><ellipse class="ball" cx="78" cy="58.6" rx="2.4" ry="3"/><circle class="shine" cx="78.9" cy="57.3" r="0.8"/><circle class="shine two" cx="77" cy="59.8" r="0.55"/><path class="arc" d="M75.3 59.8 q2.7 -3.6 5.4 0"/></g>
        <g class="eye"><ellipse class="ball" cx="102" cy="58.6" rx="2.4" ry="3"/><circle class="shine" cx="102.9" cy="57.3" r="0.8"/><circle class="shine two" cx="101" cy="59.8" r="0.55"/><path class="arc" d="M99.3 59.8 q2.7 -3.6 5.4 0"/></g>
      </g>
      <path class="mouth m-smile" d="M86.5 65.6 q3.5 3 7 0"/>
      <path class="mouth m-grin" d="M85.6 64.9 q4.4 5.4 8.8 0 z"/>
      <path class="mouth m-flat" d="M87.2 66.5 h5.6"/>
      <path class="mouth m-frown" d="M87 67.5 q3 -2.4 6 0"/>
      <path class="mouth m-wavy" d="M86.2 66.7 q1.9 -1.9 3.8 0 t3.8 0"/>
      <circle class="mouth m-o" cx="90" cy="66.5" r="1.7"/>
    </g>
  </g></g>`;

const DOT = `
  <ellipse class="shade" cx="33" cy="78.6" rx="15" ry="2.6"/>
  <g class="act"><g class="idle">
    <rect class="stamp" x="17" y="43" width="32" height="34" rx="3"/>
    <rect class="perf" x="17" y="43" width="32" height="34" rx="3"/>
    <rect class="frame" x="22.5" y="48.5" width="21" height="23" rx="1.5"/>
    <g class="eyes"><circle cx="28" cy="58" r="1.9"/><circle cx="38" cy="58" r="1.9"/></g>
    <path class="mouth" d="M30 63.5 q3 2.6 6 0"/>
  </g></g>`;

let layer = null; // the one pal, made the first time a screen asks for her
let owner = null; // the life of the screen she is with
let typing = false; // someone is typing: she keeps out of the way

function build() {
  layer = document.createElement('div');
  layer.className = 'pal';
  layer.dataset.height = 'gone';
  layer.setAttribute('aria-hidden', 'true');
  const dot = document.createElementNS(SVG, 'svg');
  dot.setAttribute('class', 'pal-dot');
  dot.setAttribute('viewBox', '13 34 40 48');
  dot.innerHTML = DOT;
  const penny = document.createElementNS(SVG, 'svg');
  penny.setAttribute('class', 'pal-penny');
  penny.setAttribute('viewBox', '54 20 72 62');
  penny.innerHTML = PENNY;
  layer.append(dot, penny);
  document.body.append(layer);

  // While something is being typed she ducks right under: on phones that
  // shrink the window for the keyboard she would otherwise sit on the field.
  const field = (target) => target instanceof HTMLElement && target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]');
  document.addEventListener('focusin', (event) => {
    if (field(event.target)) {
      typing = true;
      layer.classList.add('typing');
    }
  });
  document.addEventListener('focusout', () => {
    typing = false;
    layer.classList.remove('typing');
  });
  return layer;
}

// What of the page can be pressed: she keeps out of its way.
const PRESSABLE = 'a[href], button:not([disabled]), input, textarea, select, summary, label';
// The thing of the page's under a point of the window, if it can be pressed.
const beneath = (x, y) => document.elementsFromPoint(x, y).find((element) => !element.closest('.pal'))?.closest(PRESSABLE) ?? null;
// Would she, standing `share` of her height above the edge, be over something to press?
function crowded(penny, share) {
  const top = window.innerHeight - penny.getBoundingClientRect().height * share;
  return [...document.querySelectorAll('#screens .screen:not(.leaving) :is(' + PRESSABLE + ')')].some((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.bottom > top + 8 && box.top < window.innerHeight;
  });
}

const again = (element, name, all) => {
  element.classList.remove(...all);
  void element.getBoundingClientRect(); // so the same movement can play twice running
  element.classList.add(name);
};

// Ask for the pal, for as long as `life` lasts. Returns the handle the screen
// moves her with. Options: where she starts (x: 0 to 1 across the window;
// height: one of HEIGHTS), her first mood, and whether Dot is with her.
export function claim(life, { x = 0.7, height = 'peek', mood = 'calm', dot = true } = {}) {
  const root = layer ?? build();
  const penny = root.querySelector('.pal-penny');
  const dotEl = root.querySelector('.pal-dot');
  const seal = penny.querySelector('.seal');
  const mine = () => owner === life;
  owner = life;
  life.onEnd(() => {
    if (!mine()) return; // another screen has her now
    owner = null;
    root.dataset.height = 'gone';
  });

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const voice = createVoice(life, {
    onNote(pitch, dur) {
      if (!mine()) return;
      seal.style.setProperty('--d', `${Math.max(260, dur * 1000)}ms`);
      again(seal, 'sound', ['sound']);
    },
  });

  let at = x;
  let walking = null;
  const eyesOf = (who) => who.querySelector('.eyes');
  const place = () => {
    root.style.setProperty('--x', at);
    root.style.setProperty('--dot-x', at - 0.3 < 0.12 ? at + 0.28 : at - 0.3); // Dot keeps to her left unless there is no room
  };

  const handle = {
    penny,
    dot: dotEl,
    voice,
    get mine() { return mine(); },
    get x() { return at; },

    // Her face and how she holds herself.
    mood(name) {
      if (!mine()) return handle;
      const m = MOODS[name] ?? MOODS.calm;
      root.dataset.mood = name;
      root.dataset.mouth = m.mouth;
      root.dataset.eyes = m.eyes;
      root.dataset.idle = m.idle;
      for (const key of ['eye', 'brow', 'cheek', 'glow']) root.style.setProperty(`--${key}`, m[key]);
      root.style.setProperty('--tilt', `${m.tilt}deg`);
      return handle;
    },
    // The seal alone, 0 to 1: how warm she is, whatever her mood.
    glow(level) {
      if (mine()) root.style.setProperty('--glow', Math.max(0, Math.min(1, level)));
      return handle;
    },
    // One movement, of hers or (who: 'dot') Dot's.
    gesture(name, who = 'penny') {
      if (!mine() || !GESTURES.includes(name)) return handle;
      again((who === 'dot' ? dotEl : penny).querySelector('.act'), name, GESTURES);
      return handle;
    },
    height(name) {
      if (mine() && HEIGHTS.includes(name)) root.dataset.height = name;
      return handle;
    },
    // Come up to be seen: all the way if that covers nothing there is to
    // press, otherwise only as far as her eyes.
    rise() {
      return handle.height(crowded(penny, 1) ? 'peek' : 'up');
    },
    // Walk along the edge to stand at x (0 to 1 across the window).
    goTo(to) {
      if (!mine()) return handle;
      const next = Math.max(0.2, Math.min(0.8, to));
      const far = Math.abs(next - at);
      at = next;
      if (far < 0.01) return handle;
      const ms = still ? 0 : 500 + far * 1600;
      root.style.setProperty('--walk', `${ms}ms`);
      penny.classList.add('walking');
      clearTimeout(walking);
      walking = setTimeout(() => penny.classList.remove('walking'), ms);
      place();
      return handle;
    },
    // Where a point of the window is, as an x for goTo.
    under(target) {
      const box = target instanceof Element ? target.getBoundingClientRect() : { left: target.x, width: 0 };
      return (box.left + box.width / 2) / window.innerWidth;
    },
    // Look at a point of the window, an element, or (nothing given) the viewer.
    look(target, who = 'penny') {
      if (!mine()) return handle;
      const eyes = eyesOf(who === 'dot' ? dotEl : penny);
      if (!target) {
        eyes.style.translate = '0px 0px';
        if (who === 'penny') root.style.setProperty('--lean', '0deg');
        return handle;
      }
      const box = target instanceof Element ? target.getBoundingClientRect() : { left: target.x, top: target.y, width: 0, height: 0 };
      const me = eyes.getBoundingClientRect();
      const dx = box.left + box.width / 2 - (me.left + me.width / 2);
      const dy = box.top + box.height / 2 - (me.top + me.height / 2);
      const far = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, far / 90); // something close by needs only a small glance
      eyes.style.translate = `${(dx / far) * 2.3 * reach}px ${(dy / far) * 1.7 * reach}px`;
      // and she leans a little towards it
      if (who === 'penny') root.style.setProperty('--lean', `${Math.max(-6, Math.min(6, (dx / window.innerWidth) * 16))}deg`);
      return handle;
    },
    // Stand under something and look up at it: the nearest she has to pointing.
    pointAt(target) {
      handle.goTo(handle.under(target));
      setTimeout(() => handle.look(target), still ? 0 : 350);
      return handle;
    },
    sing(phrase, level, options) {
      return voice.sing(phrase, level, options);
    },
    // Hearts rising from one of them.
    hearts(n = 1, who = 'penny') {
      if (!mine() || still) return handle;
      const box = (who === 'dot' ? dotEl : penny).getBoundingClientRect();
      for (let i = 0; i < n; i++) {
        const heart = document.createElement('span');
        heart.className = 'pal-heart';
        heart.textContent = '♥';
        heart.style.left = `${box.left + box.width / 2 + (i - (n - 1) / 2) * 22}px`;
        heart.style.top = `${box.top + box.height * 0.12}px`;
        heart.style.animationDelay = `${i * 130}ms`;
        root.append(heart);
        setTimeout(() => heart.remove(), 1700 + i * 130);
      }
      return handle;
    },
    // What a tap on her, or on Dot, does while this screen has her.
    // (She is never in the way of the page: a tap that lands on her where
    // something of the page's can be pressed goes to that instead.)
    onTap(run, who = 'penny') {
      (who === 'dot' ? dotEl : penny).addEventListener('click', (event) => {
        if (!mine()) return;
        const under = beneath(event.clientX, event.clientY);
        if (under) under.click();
        else run(event);
      }, { signal: ending.signal });
      return handle;
    },
  };

  const ending = new AbortController();
  life.onEnd(() => {
    ending.abort();
    clearTimeout(walking);
  });

  root.classList.toggle('alone', !dot);
  root.classList.toggle('typing', typing);
  root.style.setProperty('--walk', '0ms');
  place();
  handle.mood(mood).look(null).look(null, 'dot');
  root.style.setProperty('--lean', '0deg');
  root.dataset.height = height;
  return handle;
}
