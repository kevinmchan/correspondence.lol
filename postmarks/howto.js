// How to play: four small cards, each a 3 × 3 picture of one idea with a few
// words beside it. The pictures animate gently on a loop (CSS only).

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

// Each picture is nine squares, read left to right, top to bottom:
//   L post     x crossed out (digits give the order crosses appear in)
//   c part of the highlighted colour   . plain   T a post being double-tapped
// A lowercase letter after a cross keeps that square in the highlighted colour.
const CARDS = [
  { caption: '1 post per colour', tint: '#f2a391', cells: ['0c', '1c', '2c', '3c', 'Lc', '.', '4c', '.', '.'] },
  { caption: '1 post per row and column', tint: '#8ec9ef', cells: ['0', 'L', '1', '.', '2', '.', '.', '3', '.'] },
  { caption: 'Posts can’t touch', tint: '#bcdc8a', cells: ['0', '1', '2', '3', 'L', '4', '5', '6', '7'] },
  { caption: 'Drag to cross out several', tint: '#a9a7ee', drag: true, cells: ['.', '.', '.', '0', '1', '2', '.', '.', '.'] },
  { caption: 'Double-tap to open a post', tint: '#f5cf6e', cells: ['.', '.', '.', '.', 'T', '.', '.', '.', '.'] },
];

let dialog = null;

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

  dialog.append(list, start);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // a tap on the backdrop
  });
  document.body.append(dialog);
}

export function openHowTo() {
  if (!dialog) build();
  if (dialog.open) return;
  dialog.showModal();
  dialog.querySelector('.start').focus();
}
