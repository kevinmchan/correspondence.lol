// The app's one page, and the moves between its screens.
//
// The screens: the introduction to Penny (/?hello), scene one of the film (/?office) and scene two (/?slow), home (/), opening and joining a room (/?open, /?join), the map walked with Penny (/?walk), the night sky (/?sky), a room
// (/room/?id=…), a game (/postmarks/…) the music maker (/jam/) and its radio (/jam/?taste). Each is a template in the page and a module with a
// mount(root, life) function. Going from one to another swaps what is on the
// page without loading a new one, so the music keeps playing, and the two
// screens can be on stage together for a moment: the one being left slides
// off as the next slides in. Deeper into the app moves one way; back, the other.
//
// The address bar and the browser's back button work as they always did, and
// every address still opens directly (each path serves this same page).

import { play } from '/postmarks/sound.js';
import { screenUp } from './profile.js';
import { newLife } from './screen.js';
// (what is hidden on every screen, and the way through it: it listens for each screen as it arrives)
import '/penny/tags.js';

// (Opening and joining a room live at the home address with a word after the
// question mark, so that they need no page of their own on the server.)
const isHome = (path) => path === '/' || path === '/index.html';
const asks = (url, word) => isHome(url.pathname) && url.searchParams.has(word);
const SCREENS = [
  { name: 'open', depth: 1, match: (path, url) => asks(url, 'open'), load: () => import('/rooms.js'), mount: 'mountOpen' },
  { name: 'join', depth: 1, match: (path, url) => asks(url, 'join'), load: () => import('/rooms.js'), mount: 'mountJoin' },
  { name: 'hello', depth: 1, match: (path, url) => asks(url, 'hello'), load: () => import('/penny/hello.js') },
  { name: 'office', depth: 1, match: (path, url) => asks(url, 'office') || asks(url, 'penny'), load: () => import('/penny/office.js') },
  { name: 'slow', depth: 1, match: (path, url) => asks(url, 'slow'), load: () => import('/penny/slow.js') },
  { name: 'walk', depth: 1, match: (path, url) => asks(url, 'walk'), load: () => import('/penny/walk.js') },
  { name: 'sky', depth: 1, match: (path, url) => asks(url, 'sky'), load: () => import('/penny/sky.js') },
  { name: 'home', depth: 0, match: isHome, load: () => import('/home.js') },
  { name: 'room', depth: 1, match: (path) => path.startsWith('/room'), load: () => import('/room/room.js') },
  { name: 'game', depth: 2, match: (path) => path.startsWith('/postmarks'), load: () => import('/postmarks/ui.js') },
  { name: 'taste', depth: 2, match: (path, url) => path.startsWith('/jam') && url.searchParams.has('taste'), load: () => import('/jam/taste.js') },
  { name: 'jam', depth: 1, match: (path) => path.startsWith('/jam'), load: () => import('/jam/jam.js') },
];
const screenFor = (url) => SCREENS.find((screen) => screen.match(url.pathname, url)) ?? SCREENS.find((screen) => screen.name === 'home');
const keyOf = (url) => url.pathname + url.search;

const MOVE_MS = 360;
// Between the home page and the map the move is through a portal, not a slide,
// and is given longer (penny/walk.css).
const PORTAL_MS = 950;
const throughPortal = (a, b) => ['home,walk', 'hello,home'].includes([a, b].sort().join());
// Between any screen and the night the move is a tumble, and is given longer
// still (penny/tags.js, penny/tags.css).
const TUMBLE_MS = 1180;
const tumbling = (a, b) => a === 'sky' || b === 'sky';
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stage = document.getElementById('screens');

let current = null; // { key, screen, root, life }
let moving = false;
let queued = null; // a move asked for while another was under way
let heading = null; // the address of the screen being moved to, until it is up

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
    // and as wide as it was, whatever room is kept for a scrollbar once it is out of the layout (styles.css)
    leaving.root.style.width = getComputedStyle(leaving.root).width;
    leaving.root.inert = true;
    // And it is out of the layout from here on (styles.css), before the new
    // screen is put on the page at all: a screen that measures itself as it
    // arrives has to find itself the size it is going to be, not held open
    // to the length of a longer one on its way out.
    leaving.root.classList.add('going');
  }
  stage.append(root);
  window.scrollTo(0, 0);
  current = { key: keyOf(url), screen, root, life };
  screenUp(screen.name); // (the browser's bars, for the ground it stands on)
  module[screen.mount ?? 'mount'](root, life);
  // (Penny, who stands over all the screens, wants to know whose turn it is: penny/pal.js)
  window.dispatchEvent(new CustomEvent('screen', { detail: { name: screen.name, life, root } }));

  if (!leaving) return;
  if (announce) play(direction);
  if (still.matches) {
    leaving.life.end();
    leaving.root.remove();
    return;
  }
  leaving.root.classList.add('leaving', direction);
  root.classList.add('entering', direction);
  await new Promise((done) => setTimeout(done, throughPortal(leaving.screen.name, screen.name) ? PORTAL_MS : tumbling(leaving.screen.name, screen.name) ? TUMBLE_MS : MOVE_MS));
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
  heading = keyOf(url);
  try {
    await show(url, options);
  } finally {
    moving = false;
    heading = null;
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
  // (Back, pressed while the next screen is still on its way: where it is
  // heading is what counts, not what is still up, or the screen that then
  // arrives would be left standing at the address of the one gone back to.)
  if (current && keyOf(url) === (heading ?? current.key)) return;
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

// The first screen: whichever one the address asks for. (The story is not
// where the app opens: it is reached from the home page, by the portal, which
// goes back to its beginning, penny/hello.js, or by play, which goes on from
// wherever it was left.)
move(new URL(location.href), { announce: false });
