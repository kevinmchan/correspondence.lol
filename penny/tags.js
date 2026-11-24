// Tags: things hidden in the app, to be found and kept, as on a scavenger hunt.
//
// A tag is a mark left where nobody is told to look. Whoever notices it and
// touches it has found it: it is theirs from then on (on this device), and it
// is kept on the home page's map. There is one so far, the night
// (penny/sky.js): a picture of five lights that comes to life.
//
// Where it hides: on every screen, somewhere in what is empty of it, and
// somewhere else each visit. On the map behind the board of a game it is in
// one of the map's own faint squares, away from the board, and which square
// changes from game to game. It is printed as faintly as the map itself.
// Nothing points at it, and Penny, who gives nothing away, does not look at
// it. It glints, now and then, but only once nothing has been pressed for a
// few seconds: like everything else in Penny's world, it is found by whoever
// is not in a hurry.
//
// It is a way through, and it goes on being one after it has been found: the
// mark stays on every screen, a little plainer for being known, so that from
// anywhere there is a way out into the night. Going through is a tumble. The
// screen falls away, turning as it goes, down into the place the mark was;
// the picture comes turning up out of that place to meet you, and is the
// night by the time it is upright. The way back from the night tumbles the
// other way, to wherever it was gone from (shared/nav.js gives those moves
// their time; penny/tags.css draws them).

import { go } from '/shared/nav.js';
import { audio, isMuted, noise, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { PICTURE, REST, WARM, frame, outline } from './stars.js';

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

// --- What a tag looks like -------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';
// The picture, small: its three stars and two dots where the picture has
// them, drawn stouter than they are, or at the size of a square of the map
// there would be nothing of them to see.
const SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.2 1.8C6.2 3.8 7.65 5.8 9.1 5.8C7.65 5.8 6.2 7.8 6.2 9.8C6.2 7.8 4.75 5.8 3.3 5.8C4.75 5.8 6.2 3.8 6.2 1.8zM11.2 5.7C11.2 8.5 13.25 11.3 15.3 11.3C13.25 11.3 11.2 14.1 11.2 16.9C11.2 14.1 9.15 11.3 7.1 11.3C9.15 11.3 11.2 8.5 11.2 5.7zM17.3 10.8C17.3 14.05 19.75 17.3 22.2 17.3C19.75 17.3 17.3 20.55 17.3 23.8C17.3 20.55 14.85 17.3 12.4 17.3C14.85 17.3 17.3 14.05 17.3 10.8z"/><circle cx="15.7" cy="6.2" r="1.1"/><circle cx="6.3" cy="15.9" r="1"/></svg>';
// The picture as it is, for the way through: every light where the night
// will have it, and as bright and as warm as it will be at rest.
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
    shape.setAttribute('fill', `rgb(${WARM.join(' ')})`);
    shape.setAttribute('fill-opacity', REST);
    svg.append(shape);
  }
  return svg;
}

// --- Going through one ------------------------------------------------------------------
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const TUMBLE_MS = 1100; // how long the tumble takes (shared/nav.js waits a little longer than this)
// The tumble, from where the mark is. The screen it is on falls away into
// that place, turning (penny/tags.css does that part: it is told where the
// place is). And the picture comes up out of it, turning the other way, a
// whole turn, and growing, until it is upright exactly where the night has
// it. Then the night itself is there underneath, and this is taken away.
// What the tumble sounds like: a long breath of air, and one soft note
// falling away. (On the way back the note rises: penny/sky.js.)
function whoosh() {
  if (!audio() || isMuted() || still()) return;
  tone({ freq: 740, to: 185, dur: 1.05, type: 'sine', gain: 0.04, attack: 0.08 });
  noise({ dur: 0.95, from: 2600, to: 420, q: 0.8, gain: 0.028 });
}

function tumble(from) {
  whoosh();
  const box = from.getBoundingClientRect();
  const screen = from.closest('.screen');
  if (screen) {
    const around = screen.getBoundingClientRect();
    screen.style.setProperty('--tumble-x', `${box.left + box.width / 2 - around.left}px`);
    screen.style.setProperty('--tumble-y', `${box.top + box.height / 2 - around.top}px`);
  }
  const place = frame(window.innerWidth, window.innerHeight);
  const veil = document.createElement('div');
  veil.className = 'tag-rise';
  veil.setAttribute('aria-hidden', 'true');
  // (while the picture is on its way, the night keeps its own lights dark: penny/sky.js)
  document.documentElement.classList.add('tumbling');
  const square = document.createElement('div');
  square.append(picture());
  veil.append(square);
  document.body.append(veil);
  const quiet = still();
  const took = quiet ? 1 : TUMBLE_MS;
  const grown = square.animate([
    { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: '22%', opacity: 0.2, transform: 'rotate(0turn)' },
    { opacity: 1, offset: 0.2 },
    { left: `${place.x}px`, top: `${place.y}px`, width: `${place.side}px`, height: `${place.side}px`, borderRadius: '0%', opacity: 1, transform: `rotate(${quiet ? 0 : 1}turn)` },
  ], { duration: took, easing: 'cubic-bezier(0.55, 0, 0.3, 1)', fill: 'forwards' });
  // gone once the night has arrived under it (and in any case before long)
  let lifted = false;
  const lift = () => {
    if (lifted) return;
    lifted = true;
    document.documentElement.classList.remove('tumbling'); // the night's own lights, under this one's, exactly
    requestAnimationFrame(() => {
      veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quiet ? 1 : 360, fill: 'forwards' }).finished.catch(() => {}).then(() => veil.remove());
    });
  };
  const arrived = (event) => {
    if (event.detail?.name !== 'sky') return;
    window.removeEventListener('screen', arrived);
    grown.finished.catch(() => {}).then(() => setTimeout(lift, quiet ? 0 : 120)); // (once it is upright, and the screen that fell away has gone)
  };
  window.addEventListener('screen', arrived);
  setTimeout(() => {
    window.removeEventListener('screen', arrived);
    lift();
  }, 5000);
}

// Go to a tag from where its mark is on the page, remembering where from, so
// that the way back from it leads here again.
function goTo(tag, from) {
  try {
    sessionStorage.setItem(FROM_KEY, location.pathname + location.search);
  } catch { /* the way back will lead home */ }
  tumble(from);
  go(tag.to, { quiet: true });
}

// --- Hidden on a screen ------------------------------------------------------------------
// One number from a string, the same every time: which place a screen hides it in.
function numberFrom(text) {
  let hash = 2166136261;
  for (const letter of String(text)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
const visit = Math.floor(Math.random() * 1e9); // (somewhere else each visit)
const QUIET_MS = 5000; // how long nothing has to have been pressed before it glints
const SETTLING_MS = 1600; // how long a screen is given to settle before anything is hidden in it
// What counts as the empty ground of a screen, besides its own <main>: the
// wrappers that only lay a screen out, and the bare room of the film's scenes.
const WRAPPERS = '.walk-ground, .radio-ground';
const GROUND = `${WRAPPERS}, .office-stage`;

// Hide the mark on a screen. `main` is the screen's main. On a game's screen,
// `map` is the map behind its board (its squares are lined up by --pitch,
// --map-x and --map-y) and `board` gives the board itself: there it lies in
// one of the map's squares. `seed` tells one hiding from another; `allowed`
// says whether this is a moment it may be found in; `dark` that the screen is
// a dark one, whatever the theme. Returns { place() }: to be called when the
// screen is laid out afresh.
export function hide(life, { main, map = null, board = () => null, seed = () => '', allowed = () => true, dark = false }) {
  const tag = TAGS.find((each) => !hasFound(each.name)) ?? TAGS[0];
  const mark = document.createElement('button');
  mark.type = 'button';
  mark.className = `tag-hidden${dark ? ' on-dark' : ''}`;
  mark.classList.toggle('known', hasFound(tag.name));
  mark.hidden = true;
  mark.setAttribute('aria-label', hasFound(tag.name) ? tag.label : 'A place on the page that is not like the rest');
  mark.innerHTML = SMALL;
  // It lies on the screen's ground, under whatever else is put there after
  // it: where a wrapper lays the screen out, inside that, first; and otherwise
  // on the page itself.
  const wrapper = main.querySelector(WRAPPERS);
  if (wrapper) wrapper.prepend(mark);
  else main.append(mark);
  life.onEnd(() => mark.remove());

  let at = null; // where it is: a square of the map as [column, row], or a place on the page as [left, top]
  const since = performance.now();
  // What of the page is at a point of the window, the mark itself and Penny's layer aside.
  const under = (x, y) => document.elementsFromPoint(x, y).find((element) => !mark.contains(element) && !element.closest('.pal, .pal-air')) ?? null;
  const ground = (element) => element === main || Boolean(element?.matches?.(GROUND));

  function place() {
    if (life.over) return;
    // (not until the page has settled and Penny has come up to where it stands: or it would be put down and then moved)
    if (performance.now() - since < SETTLING_MS) return;
    if (!allowed() || document.querySelector('dialog[open]')) {
      mark.hidden = true;
      return;
    }
    const frameBox = main.getBoundingClientRect();
    const pitch = map ? parseFloat(map.style.getPropertyValue('--pitch')) : NaN;
    const squares = pitch > 0; // lined up with a map's squares, or else anywhere on the page
    const [x0, y0] = squares ? [parseFloat(map.style.getPropertyValue('--map-x')), parseFloat(map.style.getPropertyValue('--map-y'))] : [0, 0];
    const size = squares ? pitch * 0.914 : Math.min(46, Math.max(36, frameBox.width * 0.11));
    const step = squares ? pitch : size * 1.25;
    const inset = squares ? pitch * 0.043 : 10;
    const spot = ([column, row]) => [x0 + column * step + inset, y0 + row * step + inset]; // where a place is, within main
    const play = board()?.getBoundingClientRect();
    const penny = document.querySelector('.pal:not([data-height="gone"]) .pal-penny')?.getBoundingClientRect();

    // Whether the mark may stay where it is: still on the page, and nothing of the page come over it.
    const holds = (where) => {
      const [left, top] = [frameBox.left + spot(where)[0], frameBox.top + spot(where)[1]];
      if (left < 0 || top < frameBox.top || left + size > frameBox.right || top + size > frameBox.bottom) return false;
      // (scrolled out of sight it cannot be looked under, and is left where it is)
      if (top + size / 2 < 0 || top + size / 2 > window.innerHeight) return true;
      return ground(under(left + size / 2, top + size / 2));
    };
    // Whether a place is somewhere it could be put: in the window, clear of the play, of Penny, and of everything else.
    const free = (where) => {
      const [left, top] = [frameBox.left + spot(where)[0], frameBox.top + spot(where)[1]];
      if (left < 6 || top < Math.max(6, frameBox.top) || left + size > window.innerWidth - 6 || top + size > Math.min(window.innerHeight, frameBox.bottom) - 6) return false;
      // not up against the board, where a slip of the finger would be a move
      if (play && left + size > play.left - step * 0.6 && left < play.right + step * 0.6 && top + size > play.top - step * 0.6 && top < play.bottom + step * 0.6) return false;
      // not where Penny is standing, however far up it comes. (Should Penny
      // walk over it later, Penny is simply in front of it: pal.js does not
      // count it among what it must keep out of the way of.)
      if (penny && left + size > penny.left - 12 && left < penny.right + 12 && top + size > window.innerHeight - penny.height * 1.05) return false;
      // and nothing of the page's on any of it, or right beside it
      return [[0.5, 0.5], [-0.12, -0.12], [1.12, -0.12], [-0.12, 1.12], [1.12, 1.12], [0.5, -0.12], [0.5, 1.12], [-0.12, 0.5], [1.12, 0.5]].every(([across, down]) => {
        const [x, y] = [left + size * across, top + size * down];
        return x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight || ground(under(x, y));
      });
    };

    // Where it was, if it may stay: it does not hop about. Or else where this
    // hiding puts it, out of everywhere it could be.
    if (!at || !holds(at)) {
      const all = [];
      for (let row = Math.ceil(-y0 / step); y0 + (row + 1) * step <= frameBox.height; row++) {
        for (let column = Math.ceil(-x0 / step); x0 + (column + 1) * step <= frameBox.width; column++) {
          if (free([column, row])) all.push([column, row]);
        }
      }
      at = all.length ? all[numberFrom(seed()) % all.length] : null;
    }
    if (!at) {
      mark.hidden = true;
      return;
    }
    const [left, top] = spot(at);
    mark.style.left = `${left}px`;
    mark.style.top = `${top}px`;
    mark.style.width = `${size}px`;
    mark.style.height = `${size}px`;
    mark.hidden = false;
  }

  // The page changing under it: looked at again at once, not a second later.
  let looking = 0;
  const changed = new MutationObserver(() => {
    cancelAnimationFrame(looking);
    looking = requestAnimationFrame(place);
  });
  changed.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  life.onEnd(() => {
    changed.disconnect();
    cancelAnimationFrame(looking);
  });

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
    keep(tag.name); // found: it is theirs
    mark.classList.add('gone');
    goTo(tag, mark);
  });

  return { place };
}

// Every screen has it somewhere, without having to ask. (A game's screen
// hides its own, in a square of its map: postmarks/ui.js. The night has none:
// it is where they lead. And once it has been found, the home page has it
// where it is kept.)
const DARK = ['office', 'slow', 'taste'];
window.addEventListener('screen', (event) => {
  const { name, life, root } = event.detail ?? {};
  const main = root?.querySelector('main');
  if (!main || !life || name === 'game' || name === 'sky' || (name === 'home' && found().length > 0)) return;
  hide(life, { main, seed: () => `${name}:${visit}`, dark: DARK.includes(name) });
});

// --- Kept on the home page ---------------------------------------------------------------
// What has been found is on the home page's map from then on, small, in the
// corner across from the portal: a touch goes through it.
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
