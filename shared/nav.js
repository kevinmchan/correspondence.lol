// The app's one page, and the moves between its screens.
//
// The screens: home (/), opening and joining a room (/?open, /?join), the map walked with Penny and its story (/?walk, /?penny), a room
// (/room/?id=…), a game (/postmarks/…) and the music maker (/jam/). Each is a template in the page and a module with a
// mount(root, life) function. Going from one to another swaps what is on the
// page without loading a new one, so the music keeps playing, and the two
// screens can be on stage together for a moment: the one being left slides
// off as the next slides in. Deeper into the app moves one way; back, the other.
//
// The address bar and the browser's back button work as they always did, and
// every address still opens directly (each path serves this same page).

import { play } from '/postmarks/sound.js';
import { newLife } from './screen.js';

// (Opening and joining a room live at the home address with a word after the
// question mark, so that they need no page of their own on the server.)
const isHome = (path) => path === '/' || path === '/index.html';
const asks = (url, word) => isHome(url.pathname) && url.searchParams.has(word);
const SCREENS = [
  { name: 'open', depth: 1, match: (path, url) => asks(url, 'open'), load: () => import('/rooms.js'), mount: 'mountOpen' },
  { name: 'join', depth: 1, match: (path, url) => asks(url, 'join'), load: () => import('/rooms.js'), mount: 'mountJoin' },
  { name: 'penny', depth: 1, match: (path, url) => asks(url, 'penny'), load: () => import('/penny/story.js') },
  { name: 'office', depth: 1, match: (path, url) => asks(url, 'office'), load: () => import('/penny/office.js') },
  { name: 'walk', depth: 1, match: (path, url) => asks(url, 'walk'), load: () => import('/penny/walk.js') },
  { name: 'home', depth: 0, match: isHome, load: () => import('/home.js') },
  { name: 'room', depth: 1, match: (path) => path.startsWith('/room'), load: () => import('/room/room.js') },
  { name: 'game', depth: 2, match: (path) => path.startsWith('/postmarks'), load: () => import('/postmarks/ui.js') },
  { name: 'jam', depth: 1, match: (path) => path.startsWith('/jam'), load: () => import('/jam/jam.js') },
];
const screenFor = (url) => SCREENS.find((screen) => screen.match(url.pathname, url)) ?? SCREENS.find((screen) => screen.name === 'home');
const keyOf = (url) => url.pathname + url.search;

const MOVE_MS = 360;
// Between the home page and the map the move is through a portal, not a slide,
// and is given longer (penny/walk.css).
const PORTAL_MS = 950;
const throughPortal = (a, b) => [a, b].sort().join() === 'home,walk';
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = document.getElementById('screens');

let current = null; // { key, screen, root, life }
let moving = false;
let queued = null; // a move asked for while another was under way

async function show(url, { announce }) {
  const screen = screenFor(url);
  const module = await screen.load();

  // nothing left open over the screen that is going
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();

  const root = document.createElement('div');
  // 'opening' marks the screen the app starts on, whose contents rise into place
  root.className = `screen screen-${screen.name}${screen.depth > 0 ? ' page' : ''}${current ? '' : ' opening'}`;
  root.append(document.getElementById(`screen-${screen.name}`).content.cloneNode(true));
  const life = newLife();
  const leaving = current;
  const direction = leaving && screen.depth < leaving.screen.depth ? 'back' : 'forth';

  // the old screen stays where it was scrolled to while the page goes back to the top
  if (leaving) {
    leaving.root.style.marginTop = `${-window.scrollY}px`;
    leaving.root.inert = true;
  }
  stage.append(root);
  window.scrollTo(0, 0);
  current = { key: keyOf(url), screen, root, life };
  module[screen.mount ?? 'mount'](root, life);
  // (Penny, who stands over all the screens, wants to know whose turn it is: penny/pal.js)
  window.dispatchEvent(new CustomEvent('screen', { detail: { name: screen.name, life } }));

  if (!leaving) return;
  if (announce) play(direction);
  if (still.matches) {
    leaving.life.end();
    leaving.root.remove();
    return;
  }
  leaving.root.classList.add('leaving', direction);
  root.classList.add('entering', direction);
  await new Promise((done) => setTimeout(done, throughPortal(leaving.screen.name, screen.name) ? PORTAL_MS : MOVE_MS));
  leaving.life.end();
  leaving.root.remove();
  root.classList.remove('entering', direction);
}

async function move(url, options) {
  if (moving) {
    queued = [url, options]; // the latest wish wins
    return;
  }
  moving = true;
  try {
    await show(url, options);
  } finally {
    moving = false;
    if (queued) {
      const [nextUrl, nextOptions] = queued;
      queued = null;
      if (keyOf(nextUrl) !== current?.key) move(nextUrl, nextOptions);
    }
  }
}

// Go to another screen of the app. `replace` keeps this one out of the history;
// `quiet` makes the move without its sound.
export function go(target, { replace = false, quiet = false } = {}) {
  const url = new URL(target, location.href);
  if (url.origin !== location.origin) {
    location.assign(url);
    return;
  }
  if (keyOf(url) === keyOf(new URL(location.href)) && current) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  move(url, { announce: !quiet });
}

// Links inside the app go the same way.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== '_self') return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  go(url.href);
});

// The browser's back and forward buttons. (A screen may also use the part of
// the address after # for a step of its own: that is not a move.)
window.addEventListener('popstate', () => {
  const url = new URL(location.href);
  if (current && keyOf(url) === current.key) return;
  move(url, { announce: true });
});

// Sheets and dialogs open and close with a sound of their own.
const showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function open(...args) {
  play('sheet');
  return showModal.apply(this, args);
};
document.addEventListener('close', (event) => {
  if (event.target instanceof HTMLDialogElement && !moving) play('shut');
}, true);

// The first screen: whichever one the address asks for.
move(new URL(location.href), { announce: false });
