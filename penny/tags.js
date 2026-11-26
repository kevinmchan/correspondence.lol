// Tags: things hidden in the app, to be found and kept, as on a scavenger hunt.
//
// A tag is a mark left where nobody is told to look. Whoever notices it and
// touches it has found it: it is theirs from then on (on this device), and it
// is kept on the home page's map. There is one so far, the night
// (penny/sky.js): a picture of five lights that comes to life.
//
// Where it hides: on a screen, somewhere in what is empty of it, and
// somewhere else each visit. On the map behind the board of a game it is in
// one of the map's own faint squares, away from the board, and which square
// changes from game to game. It is printed as faintly as the map itself.
// (Only where there is room for it. It is something to press, and on a phone
// that asks for more room than it is drawn in: see FINGER, below.)
// Nothing points at it, and Penny, who gives nothing away, does not look at
// it. It glints, now and then, but only once nothing has been pressed for a
// few seconds: like everything else in Penny's world, it is found by whoever
// is not in a hurry.
//
// It is a way through, and it goes on being one after it has been found: the
// mark stays wherever it has room, a little plainer for being known, so that
// from nearly anywhere there is a way out into the night. Going through is a tumble. The
// screen falls away, turning as it goes, down into the place the mark was;
// the picture comes turning up out of that place to meet you, and is the
// night by the time it is upright. The way back from the night tumbles the
// other way, to wherever it was gone from (shared/nav.js gives those moves
// their time; penny/tags.css draws them).

import { go } from '/shared/nav.js';
import { audio, isMuted, noise, tone } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { PICTURE, REST, SKY, WARM, frame, starPath } from './stars.js';

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
// The picture as the night has it before it wakes, for the way through:
// every light where the night will have it, the shape it will be (the same
// path the night draws: penny/stars.js) and the colour it will be against the
// night's black. When the night is there underneath, taking this away is to
// change nothing that can be seen. `side` is how big it is going to be on the
// screen.
function picture(side) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('aria-hidden', 'true');
  // (the night adds a light's colour to its black, as light adds to dark: penny/sky.js)
  const black = [1, 3, 5].map((at) => parseInt(SKY.slice(at, at + 2), 16));
  svg.setAttribute('fill', `rgb(${WARM.map((part, i) => Math.min(255, Math.round(black[i] + part * REST))).join(' ')})`);
  for (const light of PICTURE) {
    const shape = document.createElementNS(SVG, light.kind === 'dot' ? 'circle' : 'path');
    if (light.kind === 'dot') {
      shape.setAttribute('cx', light.x);
      shape.setAttribute('cy', light.y);
      shape.setAttribute('r', light.r);
    } else {
      shape.setAttribute('d', starPath(light, side));
      shape.setAttribute('transform', `translate(${light.x} ${light.y})`);
    }
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
  const box = (from.querySelector('svg') ?? from).getBoundingClientRect(); // (what is drawn of it, not the room it has round it for a finger)
  const screen = from.closest('.screen');
  if (screen) {
    const around = screen.getBoundingClientRect();
    screen.style.setProperty('--tumble-x', `${box.left + box.width / 2 - around.left}px`);
    screen.style.setProperty('--tumble-y', `${box.top + box.height / 2 - around.top}px`);
  }
  // Where the night will have the picture: the night is the size of the window.
  const place = frame(window.innerWidth, window.innerHeight);
  const veil = document.createElement('div');
  veil.className = 'tag-rise';
  veil.setAttribute('aria-hidden', 'true');
  // (while the picture is on its way, the night keeps its own lights dark: penny/sky.js)
  document.documentElement.classList.add('tumbling');
  // The square is laid out once, where the picture is going to be and as big
  // as it is going to be, and drawn once. All the way from the mark to there
  // it is only moved, turned and scaled, and made less see-through: nothing
  // is laid out or drawn again on the way, which is what a phone can do
  // smoothly. (Its corners are a tile's the whole way: penny/tags.css.)
  const square = document.createElement('div');
  const put = ({ x, y, side }) => Object.assign(square.style, { left: `${x}px`, top: `${y}px`, width: `${side}px`, height: `${side}px` });
  put(place);
  square.append(picture(place.side));
  veil.append(square);
  document.body.append(veil);
  const quiet = still();
  const took = quiet ? 1 : TUMBLE_MS;
  const [across, down] = [box.left + box.width / 2 - (place.x + place.side / 2), box.top + box.height / 2 - (place.y + place.side / 2)];
  const grown = square.animate([
    { transform: `translate(${across}px, ${down}px) rotate(0turn) scale(${box.width / place.side})`, opacity: 0.2 },
    { opacity: 1, offset: 0.2 },
    { transform: `translate(0px, 0px) rotate(${quiet ? 0 : 1}turn) scale(1)`, opacity: 1 },
  ], { duration: took, easing: 'cubic-bezier(0.55, 0, 0.3, 1)', fill: 'forwards' });
  // gone once the night has arrived under it (and in any case before long)
  let lifted = false;
  const lift = () => {
    if (lifted) return;
    lifted = true;
    // The night is there now, and can be asked where it has the picture. That
    // is where the square was sent, the night being the size of the window.
    // Should it ever not be, the square is put where the night has it before
    // it is taken away, so that what is under it is what it shows.
    const view = document.querySelector('.screen-sky:not(.going) .sky-view');
    if (view?.clientWidth) {
      const [room, real] = [view.getBoundingClientRect(), frame(view.clientWidth, view.clientHeight)];
      const landed = { x: room.left + real.x, y: room.top + real.y, side: real.side };
      if (['x', 'y', 'side'].some((part) => Math.abs(landed[part] - place[part]) > 0.5)) put(landed);
    }
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
const NOWHERE_MS = 2500; // how long a screen that had no place for it is left alone before it is looked over again
// What counts as the empty ground of a screen, besides its own <main>: the
// wrappers that only lay a screen out, the bare room of the film's scenes,
// and the plot of map a room's building stands on (where it is the map
// outside the door, beside the path, that is empty).
const GROUND = '.walk-ground, .radio-ground, .office-stage, .jam, .plot';
// And what is drawn on that ground but lets a finger straight through it, so
// that looking under a point does not find it: the places already walked,
// lying below the one Penny is at. The mark is not put on those either.
const THROUGH = '.walk-known .cell';
// It is small, and it is still something to press: so it is held to what
// everything to press on a phone is held to (tests/browser/mini.e2e.cjs). It
// is never smaller to a finger than a finger needs, however small it is
// drawn; its box never overlaps the box of anything else there is to press;
// and it is never under a phone's notch or its home bar.
const FINGER = 44; // the least a thing to press may be, each way
const APART = 8; // how far it is put from anything else to press
const PRESSED = 'a[href], button:not(:disabled), input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="tab"], [role="radio"], [tabindex]:not([tabindex="-1"])';

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
  // It is the last thing on the page: whoever goes through the page by
  // keyboard comes to everything else first. It is printed over the page's
  // ground, and lies under whatever the page raises above that: a board, a
  // portal, the light of the day.
  main.append(mark);
  life.onEnd(() => mark.remove());

  let at = null; // where it is: a square of the map as [column, row], or a place on the page as [column, row] of a grid of its own
  let nowhere = -Infinity; // when the screen was last looked over and found to have no place for it
  const since = performance.now();
  // What of the page is at a point of the window, the mark itself and Penny's layer aside; and whatever is inert, which
  // is not the page but a picture laid over it (a room's other world, laid over the room as a copy of it while the two
  // are crossing: room/worlds.js), with nothing there to press.
  const under = (x, y) => document.elementsFromPoint(x, y).find((element) => !mark.contains(element) && !element.closest('.pal, .pal-air, [inert]')) ?? null;
  const ground = (element) => element === main || Boolean(element?.matches?.(GROUND));

  function place() {
    if (life.over || mark.classList.contains('gone')) return; // (touched, it is on its way through: nothing more is asked of the page)
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
    const drawing = squares ? pitch * 0.914 : Math.min(46, Math.max(36, frameBox.width * 0.11)); // how big it is drawn
    const size = Math.max(FINGER, drawing); // and how big it is to a finger
    const step = squares ? pitch : size * 1.25;
    const inset = squares ? (pitch - size) / 2 : 10; // (in the middle of its square, where there are squares)
    const spot = ([column, row]) => [x0 + column * step + inset, y0 + row * step + inset]; // where a place is, within main
    const play = board()?.getBoundingClientRect();
    const penny = document.querySelector('.pal:not([data-height="gone"]) .pal-penny')?.getBoundingClientRect();
    const drawn = [...main.querySelectorAll(THROUGH)].map((each) => each.getBoundingClientRect());
    // everything else there is to press, as a finger has it: by its box. (Not what is inert: nothing there can be
    // pressed. A copy of the page laid over it holds a copy of the mark, exactly over the mark: counted, it would
    // move the mark off itself every second.)
    const pressed = [...document.querySelectorAll(PRESSED)]
      .filter((each) => each !== mark && !each.closest('.pal, .pal-air, template, .screen.leaving, [inert]') && getComputedStyle(each).visibility !== 'hidden')
      .map((each) => each.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    const over = (left, top, box, by) => Math.min(left + size, box.right) - Math.max(left, box.left) > by && Math.min(top + size, box.bottom) - Math.max(top, box.top) > by;
    // how much of the window is under the notch, and under the home bar (the mark's own stylesheet measures them)
    const safe = { top: parseFloat(getComputedStyle(mark).scrollMarginTop) || 0, bottom: parseFloat(getComputedStyle(mark).scrollMarginBottom) || 0 };

    // Whether the mark may stay where it is: still on the page, and nothing of the page come over it.
    const holds = (where) => {
      const [left, top] = [frameBox.left + spot(where)[0], frameBox.top + spot(where)[1]];
      if (left < 0 || top < frameBox.top || left + size > frameBox.right || top + size > frameBox.bottom) return false;
      // (scrolled out of sight it cannot be looked under, and is left where it is)
      if (top + size / 2 < 0 || top + size / 2 > window.innerHeight) return true;
      // (something to press that has come over any of it moves it: a finger could no longer tell the two apart)
      if (pressed.some((box) => over(left, top, box, 1))) return false;
      return ground(under(left + size / 2, top + size / 2));
    };
    // Whether a place is somewhere it could be put: in the window, clear of the play, of Penny, and of everything else.
    const free = (where) => {
      const [left, top] = [frameBox.left + spot(where)[0], frameBox.top + spot(where)[1]];
      if (left < 6 || top < Math.max(6, frameBox.top, safe.top) || left + size > window.innerWidth - 6 || top + size > Math.min(window.innerHeight - Math.max(6, safe.bottom), frameBox.bottom - 6)) return false;
      // not within reach of anything else there is to press
      if (pressed.some((box) => over(left, top, box, -APART))) return false;
      // not up against the board, where a slip of the finger would be a move
      if (play && left + size > play.left - step * 0.6 && left < play.right + step * 0.6 && top + size > play.top - step * 0.6 && top < play.bottom + step * 0.6) return false;
      // not where Penny is standing, however far up it comes. (Should Penny
      // walk over it later, Penny is simply in front of it: pal.js does not
      // count it among what it must keep out of the way of.)
      if (penny && left + size > penny.left - 12 && left < penny.right + 12 && top + size > window.innerHeight - penny.height * 1.05) return false;
      // nor on anything drawn there that a finger goes through
      if (drawn.some((box) => box.width > 0 && left + size > box.left - 4 && left < box.right + 4 && top + size > box.top - 4 && top < box.bottom + 4)) return false;
      // and nothing of the page's on any of it, or right beside it
      return [[0.5, 0.5], [-0.12, -0.12], [1.12, -0.12], [-0.12, 1.12], [1.12, 1.12], [0.5, -0.12], [0.5, 1.12], [-0.12, 0.5], [1.12, 0.5]].every(([across, down]) => {
        const [x, y] = [left + size * across, top + size * down];
        return x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight || ground(under(x, y));
      });
    };

    // Where it was, if it may stay: it does not hop about. Or else where this
    // hiding puts it, out of everywhere it could be. Everywhere is a grid of
    // places: a map's squares, or else places a step apart; and where not
    // one of those is free, the same grid shifted by quarters of a step,
    // since on a crowded screen the only room may lie between them. (A
    // screen with no room at all for it is not looked over again at once.)
    if (!at || !holds(at)) {
      at = null;
      if (performance.now() - nowhere > NOWHERE_MS) {
        const shifts = squares ? [[0, 0]] : [0, 1, 2, 3].flatMap((down) => [0, 1, 2, 3].map((across) => [across / 4, down / 4]));
        for (const [across, down] of shifts) {
          const all = [];
          for (let row = Math.ceil(-y0 / step) + down; y0 + (row + 1) * step <= frameBox.height; row++) {
            for (let column = Math.ceil(-x0 / step) + across; x0 + (column + 1) * step <= frameBox.width; column++) {
              if (free([column, row])) all.push([column, row]);
            }
          }
          if (all.length) at = all[numberFrom(seed()) % all.length];
          if (at) break;
        }
        if (!at) nowhere = performance.now();
      }
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
    mark.style.setProperty('--drawn', `${drawing}px`);
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
  // (another part of the page in the window, or a window of another size: there may be room for it now)
  for (const type of ['scroll', 'resize']) life.on(window, type, () => { nowhere = -Infinity; }, { passive: true });
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
// What has been found is on the home page's map from then on, small, at its
// foot, beside the portal: a touch goes through it.
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
