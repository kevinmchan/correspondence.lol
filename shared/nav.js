// The app's one page, and the moves between its screens.
//
// There are three screens: home (/), a room (/room/?id=…) and a game
// (/postmarks/…). Each is a template in the page and a module with a
// mount(root, life) function. Going from one to another swaps what is on the
// page without loading a new one, so the music keeps playing, and the two
// screens can be on stage together for a moment: the one being left slides
// off as the next slides in. Deeper into the app moves one way; back, the other.
//
// The address bar and the browser's back button work as they always did, and
// every address still opens directly (each path serves this same page).

import { play } from '/postmarks/sound.js';
import { newLife } from './screen.js';

const SCREENS = [
  { name: 'home', depth: 0, match: (path) => path === '/' || path === '/index.html', load: () => import('/home.js') },
  { name: 'room', depth: 1, match: (path) => path.startsWith('/room'), load: () => import('/room/room.js') },
  { name: 'game', depth: 2, match: (path) => path.startsWith('/postmarks'), load: () => import('/postmarks/ui.js') },
];
const screenFor = (path) => SCREENS.find((screen) => screen.match(path)) ?? SCREENS[0];
const keyOf = (url) => url.pathname + url.search;

const MOVE_MS = 360;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = document.getElementById('screens');

let current = null; // { key, screen, root, life }
let moving = false;
let queued = null; // a move asked for while another was under way

async function show(url, { announce }) {
  const screen = screenFor(url.pathname);
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
  module.mount(root, life);

  if (!leaving) return;
  if (announce) play(direction);
  if (still.matches) {
    leaving.life.end();
    leaving.root.remove();
    return;
  }
  leaving.root.classList.add('leaving', direction);
  root.classList.add('entering', direction);
  await new Promise((done) => setTimeout(done, MOVE_MS));
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

// Go to another screen of the app. `replace` keeps this one out of the history.
export function go(target, { replace = false } = {}) {
  const url = new URL(target, location.href);
  if (url.origin !== location.origin) {
    location.assign(url);
    return;
  }
  if (keyOf(url) === keyOf(new URL(location.href)) && current) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  move(url, { announce: true });
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
