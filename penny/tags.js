// Tags: things hidden in the game, to be found and kept, as on a scavenger hunt.
//
// A tag is a mark left somewhere in the game where nobody is told to look.
// Whoever notices it and touches it has found it. It is theirs from then on
// (on this device): it is not hidden from them again, and it is kept on the
// home page's map, from where it can be gone back to.
//
// There is one so far, the night (penny/sky.js): a picture of five lights
// that comes to life when it is found.
//
// Where it hides: on the map behind the board of a game (postmarks/ui.js), in
// one of the faint squares away from the board, and which square changes from
// game to game. It is printed there as faintly as the map itself. Nothing
// points at it, and Penny, who gives nothing away in the game, does not look
// at it. It glints, now and then, but only once nothing has been pressed for
// a few seconds: like everything else in Penny's world, it is found by
// whoever is not in a hurry. Found, the square turns to night and grows until
// the night is all there is.

import { go } from '/shared/nav.js';
import { load, save } from '/shared/identity.js';
import { LIGHT, PICTURE, REST, frame, outline } from './stars.js';

export const TAGS = [
  { name: 'night', to: '/?sky', label: 'The night' },
];

// --- What has been found ------------------------------------------------------------
const FOUND_KEY = 'tags:found:v1'; // the names of those found, on this device
export const FROM_KEY = 'tags:from'; // where a tag was gone to from, for the way back (for this visit)
const known = (name) => TAGS.some((tag) => tag.name === name);
export function found() {
  const kept = load(FOUND_KEY);
  return Array.isArray(kept) ? kept.filter(known) : []; // whatever has got into storage
}
export const hasFound = (name) => found().includes(name);
export function keep(name) {
  if (known(name) && !hasFound(name)) save(FOUND_KEY, [...found(), name]);
}
const stillHidden = () => TAGS.filter((tag) => !hasFound(tag.name));

// --- What a tag looks like -------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';
// The picture, small: its three stars and two dots where the picture has
// them, drawn stouter than they are, or at the size of a square of the map
// there would be nothing of them to see.
const SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.2 1.8C6.2 3.8 7.65 5.8 9.1 5.8C7.65 5.8 6.2 7.8 6.2 9.8C6.2 7.8 4.75 5.8 3.3 5.8C4.75 5.8 6.2 3.8 6.2 1.8zM11.2 5.7C11.2 8.5 13.25 11.3 15.3 11.3C13.25 11.3 11.2 14.1 11.2 16.9C11.2 14.1 9.15 11.3 7.1 11.3C9.15 11.3 11.2 8.5 11.2 5.7zM17.3 10.8C17.3 14.05 19.75 17.3 22.2 17.3C19.75 17.3 17.3 20.55 17.3 23.8C17.3 20.55 14.85 17.3 12.4 17.3C14.85 17.3 17.3 14.05 17.3 10.8z"/><circle cx="15.7" cy="6.2" r="1.1"/><circle cx="6.3" cy="15.9" r="1"/></svg>';
// The picture as it is, for when the square grows into the night: every
// light where the night will have it, and as bright as it will be at rest.
function picture() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('aria-hidden', 'true');
  const edge = outline(24);
  for (const light of PICTURE) {
    const shape = document.createElementNS(SVG, light.kind === 'dot' ? 'circle' : 'path');
    if (light.kind === 'dot') {
      shape.setAttribute('cx', light.x);
      shape.setAttribute('cy', light.y);
      shape.setAttribute('r', light.r);
    } else {
      shape.setAttribute('d', `${edge.map(([x, y], i) => `${i ? 'L' : 'M'}${(light.x + x * light.a).toFixed(5)} ${(light.y + y * light.b).toFixed(5)}`).join('')}z`);
    }
    shape.setAttribute('fill', LIGHT);
    shape.setAttribute('fill-opacity', REST);
    svg.append(shape);
  }
  return svg;
}

// --- Going to one --------------------------------------------------------------------------
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The square it was found in turns to night, and grows until the night is all
// there is: the picture in it lands exactly where the night has it. Then the
// night itself is there underneath, and this is taken away.
function rise(from) {
  const box = from.getBoundingClientRect();
  const place = frame(window.innerWidth, window.innerHeight);
  const veil = document.createElement('div');
  veil.className = 'tag-rise';
  veil.setAttribute('aria-hidden', 'true');
  const dark = document.createElement('i');
  const square = document.createElement('div');
  square.append(picture());
  veil.append(dark, square);
  document.body.append(veil);
  const took = still() ? 1 : 640;
  dark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: took * 0.85, easing: 'ease-in', fill: 'forwards' });
  const grown = square.animate([
    { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: '22%', opacity: 0.2 },
    { opacity: 1, offset: 0.25 },
    { left: `${place.x}px`, top: `${place.y}px`, width: `${place.side}px`, height: `${place.side}px`, borderRadius: '0%', opacity: 1 },
  ], { duration: took, easing: 'cubic-bezier(0.6, 0, 0.25, 1)', fill: 'forwards' });
  // gone once the night has arrived under it (and in any case before long)
  const lift = () => {
    veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still() ? 1 : 320, fill: 'forwards' }).finished.catch(() => {}).then(() => veil.remove());
  };
  const arrived = (event) => {
    if (event.detail?.name !== 'sky') return;
    window.removeEventListener('screen', arrived);
    setTimeout(lift, still() ? 0 : 420); // (the screens change places underneath first)
  };
  window.addEventListener('screen', arrived);
  setTimeout(() => {
    window.removeEventListener('screen', arrived);
    if (veil.isConnected && veil.getAnimations().length === 0) lift();
  }, 4000);
  return grown.finished.catch(() => {});
}

// Go to a tag from where it is on the page: remembering where from, so that
// the way back from it leads here again.
async function goTo(tag, from) {
  try {
    sessionStorage.setItem(FROM_KEY, location.pathname + location.search);
  } catch { /* the way back will lead home */ }
  await rise(from);
  go(tag.to, { quiet: true });
}

// --- Hidden in a game ------------------------------------------------------------------
// One number from a string, the same every time: which square a game hides it in.
function numberFrom(text) {
  let hash = 2166136261;
  for (const letter of String(text)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
const QUIET_MS = 5000; // how long nothing has to have been pressed before it glints
const SETTLING_MS = 1600; // how long a game's screen is given to settle before it is hidden in it

// Hide what is still to be found in a game's screen. `main` is the screen's
// main, `map` the map behind its board (its squares are lined up by --pitch,
// --map-x and --map-y), `board` the board itself, `seed` what tells one game
// from another, and `allowed` says whether this is a moment it may be found
// in. Returns { place() }: to be called when the board or the window changes.
export function hide(life, { main, map, board, seed, allowed }) {
  const tag = stillHidden()[0];
  if (!tag) return { place() {} }; // nothing left to find
  const mark = document.createElement('button');
  mark.type = 'button';
  mark.className = 'tag-hidden';
  mark.hidden = true;
  mark.setAttribute('aria-label', 'A square of the map that is not like the others');
  mark.innerHTML = SMALL;
  main.append(mark);
  life.onEnd(() => mark.remove());

  let at = null; // the square it is in: [column, row] of the map
  const since = performance.now();
  function place() {
    if (life.over || hasFound(tag.name)) {
      mark.hidden = true;
      return;
    }
    // (not until the page has settled and Penny has come up to where it stands: or it would be put down and then moved)
    if (performance.now() - since < SETTLING_MS) return;
    const pitch = parseFloat(map.style.getPropertyValue('--pitch'));
    const [x0, y0] = [parseFloat(map.style.getPropertyValue('--map-x')), parseFloat(map.style.getPropertyValue('--map-y'))];
    const grid = board();
    if (!allowed() || !(pitch > 0) || !grid || document.querySelector('dialog[open]')) {
      mark.hidden = true;
      return;
    }
    const frameBox = main.getBoundingClientRect();
    const play = grid.getBoundingClientRect();
    const penny = document.querySelector('.pal:not([data-height="gone"]) .pal-penny')?.getBoundingClientRect();
    const size = pitch * 0.914;
    // Whether a square of the map is somewhere it could be.
    const free = ([column, row]) => {
      const [left, top] = [frameBox.left + x0 + column * pitch + pitch * 0.043, frameBox.top + y0 + row * pitch + pitch * 0.043];
      // all of it in the window, with a little to spare
      if (left < 6 || top < 6 || left + size > window.innerWidth - 6 || top + size > window.innerHeight - 6) return false;
      // not up against the board, where a slip of the finger would be a move
      if (left + size > play.left - pitch * 0.6 && left < play.right + pitch * 0.6 && top + size > play.top - pitch * 0.6 && top < play.bottom + pitch * 0.6) return false;
      // not where Penny stands, however far up it comes
      if (penny && left + size > penny.left - 12 && left < penny.right + 12 && top + size > window.innerHeight - penny.height * 1.05) return false;
      // and nothing of the page's over any of it
      return [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].every(([across, down]) => {
        const over = document.elementFromPoint(left + size * across, top + size * down);
        return over === main || mark.contains(over);
      });
    };
    // Where it was, if that will still do: it does not hop about as the page
    // settles. Or else where this game hides it, out of everywhere it could be.
    if (!at || !free(at)) {
      const all = [];
      for (let row = Math.ceil(-y0 / pitch); y0 + (row + 1) * pitch <= frameBox.height; row++) {
        for (let column = Math.ceil(-x0 / pitch); x0 + (column + 1) * pitch <= frameBox.width; column++) {
          if (free([column, row])) all.push([column, row]);
        }
      }
      at = all.length ? all[numberFrom(seed()) % all.length] : null;
    }
    if (!at) {
      mark.hidden = true;
      return;
    }
    mark.style.left = `${x0 + at[0] * pitch + pitch * 0.043}px`;
    mark.style.top = `${y0 + at[1] * pitch + pitch * 0.043}px`;
    mark.style.width = `${size}px`;
    mark.style.height = `${size}px`;
    mark.hidden = false;
  }

  // It glints only for whoever has stopped.
  let pressed = performance.now();
  let nextGlint = 0;
  const press = () => { pressed = performance.now(); };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'scroll']) life.on(window, type, press, { passive: true });
  life.setInterval(() => {
    place(); // (the page may have changed under it; and it may only now be allowed)
    const now = performance.now();
    if (mark.hidden || document.hidden || now - pressed < QUIET_MS || now < nextGlint) return;
    nextGlint = now + 6000 + Math.random() * 6000;
    mark.classList.remove('glint');
    void mark.offsetWidth;
    mark.classList.add('glint');
  }, 1000);

  mark.addEventListener('click', () => {
    if (hasFound(tag.name)) return;
    keep(tag.name); // found: it is theirs
    mark.classList.add('found');
    goTo(tag, mark);
  });

  return { place };
}

// --- Kept on the home page ---------------------------------------------------------------
// What has been found is on the home page's map from then on, small, in the
// corner across from the portal: a touch goes back to it.
export function showKept(root) {
  const main = root.querySelector('main');
  for (const [index, tag] of TAGS.filter((each) => hasFound(each.name)).entries()) {
    const link = document.createElement('a');
    link.className = 'tag-kept';
    link.href = tag.to;
    link.setAttribute('aria-label', tag.label);
    link.style.setProperty('--nth', index);
    link.innerHTML = SMALL;
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // (a new tab is a new tab)
      event.preventDefault();
      goTo(tag, link);
    });
    main.append(link);
  }
}
