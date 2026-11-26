// How to play: four small cards, each a 3 × 3 picture of one idea with a few
// words beside it. The pictures animate gently on a loop (CSS only).

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

// Each picture is nine squares, read left to right, top to bottom:
//   L post     x crossed out (digits give the order crosses appear in)
//   c part of the highlighted colour   . plain   T a post being double-tapped
// A lowercase letter after a cross keeps that square in the highlighted colour.
const CARDS = [
  { caption: '1 post per colour', tint: '#f08a76', cells: ['0c', '1c', '2c', '3c', 'Lc', '.', '4c', '.', '.'] },
  { caption: '1 post per row and column', tint: '#9ad3f7', cells: ['0', 'L', '1', '.', '2', '.', '.', '3', '.'] },
  { caption: 'Posts can’t touch', tint: '#7cc46a', cells: ['0', '1', '2', '3', 'L', '4', '5', '6', '7'] },
  { caption: 'Drag to cross out several', tint: '#f3b3e6', drag: true, cells: ['.', '.', '.', '0', '1', '2', '.', '.', '.'] },
  { caption: 'Double-tap to open a post', tint: '#f8d95a', cells: ['.', '.', '.', '.', 'T', '.', '.', '.', '.'] },
];

let dialog = null;
let askFeedback = null; // set by whoever opens the how-to, if feedback can be given from it

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'howto';
  dialog.setAttribute('aria-label', 'How to play');

  const list = document.createElement('ul');
  list.className = 'cards';
  for (const card of CARDS) {
    const item = document.createElement('li');
    item.className = 'card';
    item.style.setProperty('--tint', card.tint);

    const picture = document.createElement('div');
    picture.className = card.drag ? 'mini drag' : 'mini';
    picture.setAttribute('aria-hidden', 'true');
    for (const code of card.cells) {
      const square = document.createElement('span');
      const order = Number.parseInt(code, 10);
      if (code.startsWith('L') || code.startsWith('T')) {
        square.className = code.startsWith('T') ? 'letter tapped' : 'letter';
        square.innerHTML = ENVELOPE;
      } else if (!Number.isNaN(order)) {
        square.className = 'cross';
        square.style.setProperty('--i', order);
      }
      if (code.endsWith('c')) square.classList.add('tinted');
      picture.append(square);
    }
    if (card.drag) {
      const finger = document.createElement('i');
      finger.className = 'finger';
      picture.append(finger);
    }

    const caption = document.createElement('p');
    caption.textContent = card.caption;
    item.append(picture, caption);
    list.append(item);
  }

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'start';
  start.setAttribute('aria-label', 'Start playing');
  start.innerHTML = PLAY;
  start.addEventListener('click', () => dialog.close());

  const feedback = document.createElement('button');
  feedback.type = 'button';
  feedback.className = 'feedback-link';
  feedback.textContent = 'Give feedback';
  feedback.addEventListener('click', () => {
    dialog.close();
    askFeedback?.();
  });

  dialog.append(list, start, feedback);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // a tap on the backdrop
  });
  document.body.append(dialog);
}

export function openHowTo(onFeedback = null) {
  if (!dialog) build();
  askFeedback = onFeedback;
  dialog.querySelector('.feedback-link').hidden = !onFeedback;
  if (dialog.open) return;
  dialog.showModal();
  dialog.querySelector('.start').focus();
}

// What is particular to each kind of game played in a room: a few cards, each a
// picture on a tile of its colour and a line of words (the owner's choice, 25
// November 2026). Shown at a room's desk before a game is set up, and for a
// game together, the first time it is opened, in place of how to play (which is
// always there under the question mark).
const PEOPLE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.8 19c.5-3.3 2.8-5.2 5.7-5.2s5.2 1.9 5.7 5.2M15.2 14.3c.4-.1.9-.2 1.3-.2 2.3 0 4.2 1.5 4.7 4.4"/></svg>';
const TURNS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.5a7.5 7.5 0 0 1 13.2-3.2L19.5 8.5M19.5 4v4.5H15M19.5 14.5a7.5 7.5 0 0 1-13.2 3.2L4.5 15.5M4.5 20v-4.5H9"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="heart" d="M12 20.3l-1.2-1.1C6.4 15.2 3.5 12.6 3.5 9.3 3.5 6.7 5.6 4.6 8.2 4.6c1.5 0 2.9.7 3.8 1.8.9-1.1 2.3-1.8 3.8-1.8 2.6 0 4.7 2.1 4.7 4.7 0 3.3-2.9 5.9-7.3 9.9z" fill="currentColor"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="7"/><path d="M12 9.5v4l2.5 2M10 3h4M12 3v3.5M18.2 7.3l1.3-1.3"/></svg>';
const BOARD = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/></svg>';
const LETTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const KEY = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15.5" r="4"/><path d="M11 12.5L20 3.5M16.5 7l2.5 2.5M14 9.5l2 2"/></svg>';
const DIE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8.6" cy="8.6" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.4" fill="currentColor" stroke="none"/></svg>';
export const MODE_CARDS = {
  coop: [
    { caption: 'One board for the whole room', tint: '#f08a76', icon: PEOPLE },
    { caption: 'Take turns: after your move, someone else goes next', tint: '#9ad3f7', icon: TURNS },
    { caption: 'Three hearts, shared by everyone', tint: '#f3b3e6', icon: HEART },
  ],
  trial: [
    { caption: 'Everyone solves the same board on their own', tint: '#f8d95a', icon: BOARD },
    { caption: 'Your clock starts when you press start; the quickest comes first, just for fun', tint: '#9ad3f7', icon: CLOCK },
    { caption: 'Three wrong guesses and you\u2019re out', tint: '#f3b3e6', icon: HEART },
  ],
  phrase: [
    { caption: 'Hide a message in the board for the room to find', tint: '#9ad3f7', icon: KEY },
    { caption: 'Each post someone opens shows them one piece of it', tint: '#f8d95a', icon: LETTER },
    { caption: 'Or let the die pick one: kept secret from you too, so you can play', tint: '#7cc46a', icon: DIE },
  ],
};

// The cards for a kind of game, as a list.
export function modeCards(mode, list = document.createElement('ul')) {
  list.classList.add('cards', 'mode-cards');
  list.replaceChildren(...(MODE_CARDS[mode] ?? []).map((card) => {
    const item = document.createElement('li');
    item.className = 'card';
    item.style.setProperty('--tint', card.tint);
    const tile = document.createElement('span');
    tile.className = 'glyph';
    tile.innerHTML = card.icon;
    const caption = document.createElement('p');
    caption.textContent = card.caption;
    item.append(tile, caption);
    return item;
  }));
  return list;
}

// The last room game this device showed its first sheet for (how to play, or playing together). Whoever starts a game
// together has just read those cards at the desk, so the desk marks the game as shown: they are not told twice.
export const HOWTO_KEY = 'postmarks:howto:v1';

let together = null;
export function openTogether() {
  if (!together) {
    together = document.createElement('dialog');
    together.className = 'howto together';
    together.setAttribute('aria-label', 'Playing together');
    const list = modeCards('coop');
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'start';
    start.setAttribute('aria-label', 'Start playing');
    start.innerHTML = PLAY;
    start.addEventListener('click', () => together.close());
    together.append(list, start);
    together.addEventListener('click', (event) => {
      if (event.target === together) together.close();
    });
    document.body.append(together);
  }
  if (together.open) return;
  together.showModal();
  together.querySelector('.start').focus();
}
