// The pal: Penny at life size.
//
// The screen is a map seen from far above, and Penny is not on the map. Penny
// stands at the bottom edge of the window, in the viewer's own space, as big
// as a letter held up next to you, looking up at the map with you. Penny is
// one layer over the whole app, not part of any screen: screens slide past,
// Penny stays.
//
// Penny cannot speak, so everything Penny has to say is a feeling, and Penny
// feels things hard. A mood sets its face and how it holds itself; a gesture
// is one movement; it looks at things, leans towards them, walks along the
// edge to stand under them, comes further up or ducks down; its seal glows
// with how warm it is; and it hums. Where a screen asks for it, the feeling
// goes further than Penny and colours the world it is looking at.
//
// Penny sets out alone. Dot, a stamp, is found a quarter of the way through
// (penny/walk.js), and from then on stands tucked in beside Penny.
//
// A screen that wants Penny asks with claim(). Penny goes back under the edge
// when that screen has gone and no other has asked.

import { createVoice } from './penny.js';

const SVG = 'http://www.w3.org/2000/svg';

// A mood is a face and a way of standing. Numbers are multipliers on its
// resting face: `eye` the size of its eyes, `brow` how far the point of its
// flap comes down (it works as a brow: up is open and glad, down is troubled),
// `cheek` how pink, `glow` how warm the seal. `eyes` picks the eye drawing,
// `mouth` the mouth, `idle` what it does while nothing else is happening.
const MOODS = {
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
  listening: { mouth: 'o', eyes: 'closed', eye: 1, brow: 0.95, cheek: 0.5, glow: 0.2, idle: 'still', tilt: 8 },
  holding: { mouth: 'o', eyes: 'open', eye: 1.25, brow: 0.84, cheek: 0.8, glow: 0.5, idle: 'tiptoe', tilt: 0 }, // its breath
  sure: { mouth: 'grin', eyes: 'open', eye: 1.15, brow: 0.86, cheek: 0.8, glow: 0.85, idle: 'breathe', tilt: 0 },
  pleading: { mouth: 'wavy', eyes: 'big', eye: 1.3, brow: 0.9, cheek: 0.8, glow: 0.4, idle: 'bob', tilt: 0 },
  surprised: { mouth: 'o', eyes: 'open', eye: 1.25, brow: 0.8, cheek: 0.6, glow: 0.9, idle: 'still', tilt: 0 },
  dancing: { mouth: 'grin', eyes: 'happy', eye: 1.05, brow: 0.86, cheek: 1, glow: 0.8, idle: 'still', tilt: 0 }, // every move it makes is on the beat (jam/jam.js)
  sleepy: { mouth: 'flat', eyes: 'closed', eye: 1, brow: 1.02, cheek: 0.4, glow: 0.05, idle: 'breathe', tilt: 0 },
};

// Penny feels things hard, and what it feels gets into what it sees. Where a
// screen asks for it (the map does), its mood colours the world: a light the
// colour of the feeling rises from where it stands, and for the strongest
// feelings the map itself goes richer, or drains. Each is [the colour, how
// strong, how much colour the world keeps, how bright it stays].
const AIR = {
  hopeful: ['248 196 90', 0.2, 1, 1],
  warm: ['248 186 80', 0.34, 1.08, 1],
  sure: ['248 186 80', 0.3, 1.05, 1],
  holding: ['255 214 130', 0.3, 1, 1],
  thrilled: ['255 176 84', 0.5, 1.25, 1.02],
  glad: ['255 190 100', 0.4, 1.15, 1.01],
  surprised: ['255 250 230', 0.42, 1.05, 1.04],
  listening: ['34 48 60', 0.12, 0.88, 0.98],
  unsure: ['120 150 190', 0.14, 0.94, 1],
  no: ['110 130 160', 0.12, 0.9, 1],
  worried: ['70 110 190', 0.3, 0.72, 0.97],
  sad: ['64 84 128', 0.36, 0.42, 0.94],
  sleepy: ['96 84 150', 0.16, 0.9, 0.97],
};

// How far up Penny comes: all of it standing on the edge; its whole face; its
// eyes over it; the top of its flap only; or gone. Coming up is itself a
// feeling, so it rests low and rises for what matters.
const HEIGHTS = ['up', 'face', 'peek', 'low', 'gone'];
const SHOWING = { up: 1, face: 0.81, peek: 0.68, low: 0.44, gone: 0 }; // how much of its drawing each leaves above the edge
const GESTURES = ['hop', 'jump', 'shake', 'nod', 'wiggle', 'sink', 'start'];

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

let layer = null; // the one pal, made the first time a screen asks for it
let air = null; // the light its mood throws up the screen
let owner = null; // the life of the screen it is with
let typing = false; // someone is typing: it keeps out of the way

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
  // the two of them stand together: where it goes along the edge, Dot goes, tucked in behind it
  const stand = document.createElement('div');
  stand.className = 'pal-stand';
  stand.append(dot, penny);
  layer.append(stand);
  air = document.createElement('div');
  air.className = 'pal-air';
  air.setAttribute('aria-hidden', 'true');
  document.body.append(air, layer);

  // A screen that has not asked for it does not get it: it is gone as soon
  // as it arrives, not when the one before it has finished leaving.
  // While something is being typed it ducks right under: on phones that
  // shrink the window for the keyboard it would otherwise sit on the field.
  const field = (target) => target instanceof HTMLElement && target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]');

  // A change of screen. A field that was being typed in may have gone with
  // the old screen without ever saying it had lost the focus, so that is
  // looked at afresh. And a screen that has not asked for Penny does not get
  // it: Penny is gone as soon as that screen arrives, and the screen before
  // has no more say, though it takes a moment longer to finish leaving.
  window.addEventListener('screen', (event) => {
    typing = field(document.activeElement);
    layer.classList.toggle('typing', typing);
    if (owner === event.detail?.life) return;
    owner = null;
    layer.dataset.height = 'gone';
    air.style.opacity = 0;
    document.documentElement.classList.remove('pal-tinted', 'has-pal');
  });

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

// What of the page can be pressed: it keeps out of its way.
const PRESSABLE = 'a[href], button:not([disabled]), input, textarea, select, summary, label';
// The thing of the page's under a point of the window, if it can be pressed.
const beneath = (x, y) => document.elementsFromPoint(x, y).find((element) => !element.closest('.pal'))?.closest(PRESSABLE) ?? null;
// Would it, standing where it is with `share` of its drawing above the edge,
// be over something to press?
function crowded(penny, share) {
  const box = penny.getBoundingClientRect();
  const top = window.innerHeight - box.height * share;
  const [left, right] = [box.left + box.width * 0.08 - 8, box.right - box.width * 0.08 + 8]; // its paper, and a little either side
  return [...document.querySelectorAll('#screens .screen:not(.leaving) :is(' + PRESSABLE + ')')].some((element) => {
    const it = element.getBoundingClientRect();
    return it.width > 0 && it.bottom > top + 8 && it.top < window.innerHeight && it.right > left && it.left < right;
  });
}

const again = (element, name, all) => {
  element.classList.remove(...all);
  void element.getBoundingClientRect(); // so the same movement can play twice running
  element.classList.add(name);
};

// Ask for the pal, for as long as `life` lasts. Returns the handle the screen
// moves it with. Options: where it starts (x: 0 to 1 across the window;
// height: one of HEIGHTS), its first mood, and whether Dot is with it.
export function claim(life, { x = 0.7, height = 'peek', mood = 'calm', dot = false, colours = false } = {}) {
  const root = layer ?? build();
  const penny = root.querySelector('.pal-penny');
  const dotEl = root.querySelector('.pal-dot');
  const seal = penny.querySelector('.seal');
  const mine = () => owner === life;
  const dotHere = () => !root.classList.contains('alone'); // until Dot is found there is nothing of Dot's to move
  // Dot where it belongs, at its own size: whatever an arrival left on it is taken off.
  const settleDot = () => {
    dotEl.getAnimations().forEach((flight) => flight.cancel());
    dotEl.style.transform = '';
    dotEl.style.zIndex = '';
  };
  owner = life;
  const world = document.documentElement;
  const uncolour = () => {
    air.style.opacity = 0;
    world.classList.remove('pal-tinted');
  };
  life.onEnd(() => {
    if (!mine()) return; // another screen has it now
    owner = null;
    root.dataset.height = 'gone';
    uncolour();
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
    air.style.setProperty('--x', at);
    root.classList.toggle('dot-right', at < 0.34); // Dot keeps to its left unless there is no room there
  };

  const handle = {
    penny,
    dot: dotEl,
    voice,
    get mine() { return mine(); },
    get x() { return at; },

    // Its face and how it holds itself.
    mood(name) {
      if (!mine()) return handle;
      const m = MOODS[name] ?? MOODS.calm;
      root.dataset.mood = name;
      root.dataset.mouth = m.mouth;
      root.dataset.eyes = m.eyes;
      root.dataset.idle = m.idle;
      root.style.setProperty('--glow-ms', '500ms');
      for (const key of ['eye', 'brow', 'cheek', 'glow']) root.style.setProperty(`--${key}`, m[key]);
      root.style.setProperty('--tilt', `${m.tilt}deg`);
      // and, where the screen has asked for it, the world takes the colour of the feeling
      const [colour, strength, keeps, bright] = (colours && AIR[name]) || ['0 0 0', 0, 1, 1];
      if (strength) air.style.setProperty('--air', colour);
      air.style.opacity = strength;
      world.style.setProperty('--world-sat', keeps);
      world.style.setProperty('--world-lum', bright);
      world.classList.toggle('pal-tinted', keeps !== 1 || bright !== 1);
      return handle;
    },
    // The seal alone, 0 to 1: how warm it is, whatever its mood. Given a
    // time, it gets there over that many milliseconds.
    glow(level, over = 0) {
      if (!mine()) return handle;
      root.style.setProperty('--glow-ms', `${still ? 0 : over}ms`);
      root.style.setProperty('--glow', Math.max(0, Math.min(1, level)));
      return handle;
    },
    // One movement, of its or (who: 'dot') Dot's.
    gesture(name, who = 'penny') {
      if (!mine() || !GESTURES.includes(name) || (who === 'dot' && !dotHere())) return handle;
      again((who === 'dot' ? dotEl : penny).querySelector('.act'), name, GESTURES);
      return handle;
    },
    height(name) {
      if (mine() && HEIGHTS.includes(name)) root.dataset.height = name;
      return handle;
    },
    // Come up to be seen: all the way if that covers nothing there is to
    // press, otherwise only as far as its eyes.
    rise() {
      return handle.height(crowded(penny, SHOWING.up) ? 'peek' : 'up');
    },
    // Go back to waiting, at `name` if that covers nothing there is to press,
    // and otherwise ducked down to the top of its flap.
    settle(name = 'peek') {
      return handle.height(crowded(penny, SHOWING[name]) ? 'low' : name);
    },
    // Whether it is over something of the page's at the height it is at.
    get inTheWay() {
      return crowded(penny, SHOWING[root.dataset.height] ?? 0);
    },
    // Walk along the edge to stand at x (0 to 1 across the window).
    goTo(to) {
      if (!mine()) return handle;
      const next = Math.max(0.12, Math.min(0.88, to));
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
      if (!mine() || (who === 'dot' && !dotHere())) return handle;
      if (target instanceof Element && !target.isConnected) return handle; // something that has since gone from the page
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
      // and it leans a little towards it
      if (who === 'penny') root.style.setProperty('--lean', `${Math.max(-6, Math.min(6, (dx / window.innerWidth) * 16))}deg`);
      return handle;
    },
    // Lean to one side (-1 left, 1 right, 0 upright), without looking there.
    lean(side) {
      if (mine()) root.style.setProperty('--lean', `${side * 4}deg`);
      return handle;
    },
    // Stand under something and look up at it: the nearest it has to pointing.
    pointAt(target) {
      handle.goTo(handle.under(target));
      setTimeout(() => handle.look(target), still ? 0 : 350);
      return handle;
    },
    sing(phrase, level, options) {
      return voice.sing(phrase, level, options);
    },
    // Dot, found. It comes out of a place on the map (`from`, a rectangle of
    // the window) as small as the map is, waits there a moment, and then
    // crosses over to stand beside it, life size. From then on it is with
    // it. Resolves when it has landed.
    async arrive(from, linger = 1200) {
      if (!mine()) return;
      settleDot(); // (an arrival may have been cut short before, by the screen being left)
      root.classList.remove('alone');
      if (still) return;
      const box = dotEl.getBoundingClientRect();
      const scale = Math.max(0.12, (from.width * 0.72) / box.width);
      const dx = from.left + from.width / 2 - (box.left + box.width / 2);
      const dy = from.top + from.height / 2 - (box.top + box.height / 2);
      const small = `translate(${dx}px, ${dy}px) scale(${scale})`;
      dotEl.style.transform = small;
      dotEl.style.zIndex = 2; // over it, until it has come down beside it
      await new Promise((done) => life.setTimeout(done, linger));
      const flight = dotEl.animate([
        { transform: small },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.5 - 46}px) scale(${(scale + 1) / 2})`, offset: 0.5 },
        { transform: 'none' },
      ], { duration: 950, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' });
      dotEl.style.transform = '';
      await flight.finished.catch(() => {});
      dotEl.style.zIndex = '';
    },
    // Hearts rising from one of them.
    hearts(n = 1, who = 'penny') {
      if (!mine() || still || (who === 'dot' && !dotHere())) return handle;
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
    // What a tap on it, or on Dot, does while this screen has it.
    // (It is never in the way of the page: a tap that lands on it where
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
    penny.classList.remove('walking'); // (or it would go on rocking on the next screen, and nothing else could move it)
  });

  root.classList.toggle('alone', !dot);
  if (!colours) uncolour();
  document.documentElement.classList.add('has-pal');
  life.onEnd(() => { if (owner === null) document.documentElement.classList.remove('has-pal'); });
  root.classList.toggle('typing', typing);
  root.style.setProperty('--walk', '0ms');
  penny.classList.remove('walking');
  settleDot();
  place();
  handle.mood(mood).look(null).look(null, 'dot');
  root.style.setProperty('--lean', '0deg');
  root.dataset.height = height;
  return handle;
}
