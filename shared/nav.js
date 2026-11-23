// Moving between screens. Each screen is its own page, so a move is two halves:
// this page slides away (with a sound, which has to finish before the page is
// gone), and the next one slides in from the side it was headed for. Going
// deeper (home, then a room, then a game) moves one way; coming back, the other.
//
// The next page learns the direction from a note left in the session (read by
// a line in each page's head, before anything is painted).

import { play } from '/postmarks/sound.js';

const NAV_KEY = 'correspondence:nav';
const LEAVE_MS = 190;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const depth = (path) => (path.startsWith('/postmarks') ? 2 : path.startsWith('/room') ? 1 : 0);

let going = false;

// Go to another screen of the app. `replace` keeps this page out of the history.
export function go(url, { replace = false } = {}) {
  const to = new URL(url, location.href);
  const move = () => (replace ? location.replace(to) : location.assign(to));
  if (going) return;
  if (to.origin !== location.origin) {
    move();
    return;
  }
  going = true;
  const direction = depth(to.pathname) < depth(location.pathname) ? 'back' : 'forth';
  try {
    sessionStorage.setItem(NAV_KEY, direction);
  } catch { /* the next page just arrives plainly */ }
  play(direction);
  if (still.matches) {
    move();
    return;
  }
  document.documentElement.classList.add('leaving', direction);
  setTimeout(move, LEAVE_MS);
}

// Links inside the app go the same way.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== '_self') return;
  const to = new URL(link.href, location.href);
  if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
  event.preventDefault();
  go(to.href);
});

// Coming back to a page the browser kept as it was left: undo the leaving.
window.addEventListener('pageshow', () => {
  going = false;
  document.documentElement.classList.remove('leaving', 'back', 'forth');
});

// Sheets and dialogs open and close with a sound of their own.
const showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function open(...args) {
  play('sheet');
  return showModal.apply(this, args);
};
document.addEventListener('close', (event) => {
  if (event.target instanceof HTMLDialogElement && !going) play('shut');
}, true);
