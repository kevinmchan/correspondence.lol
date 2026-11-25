// A room is a place: a building on the map, drawn in room/room.css. What is
// drawn of it on more than one screen is made here: the colour it keeps, its
// roof (the home page, and the room as seen by somebody not in it), a game as
// a small board lying on its table, the line that says something went wrong
// there, and the way in at its door.

const SVG = 'http://www.w3.org/2000/svg';

// A number from a string, the same every time (FNV-1a).
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A room keeps one of the game's seven colours, and one of three roofs, by its
// id: the same building wherever it is drawn. (Classes r0 to r6 and k0 to k2.)
export function roomLook(id) {
  const h = hash(String(id).toLowerCase());
  return { colour: h % 7, kind: (h >>> 8) % 3 };
}
export const roomClass = (id) => `r${roomLook(id).colour}`;

function draw(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

// A roof, seen from above: a soft slab in the room's colour (its shadow is
// room/room.css's), and a mat at its door. `kind` is how it is built: 0 a
// ridge from end to end, 1 hipped, 2 flat, with a parapet. Drawn `wide` by
// `high`, in units of about a pixel. `lit` is its skylight with the lights
// on; `bare` leaves the skylight and the mat off, for where the page puts its
// own there.
export function roof({ kind = 0, wide = 160, high = 92, lit = false, bare = false } = {}) {
  const svg = draw('svg', { viewBox: `0 0 ${wide} ${high}`, class: `roof k${kind}${lit ? ' lit' : ''}`, 'aria-hidden': 'true' });
  const s = high / 92; // everything on it is sized from its height
  const [x, y, w, h, r] = [1, 1, wide - 9 * s - 2, high - 18 * s - 2, 13 * s];
  const mid = y + h / 2;
  // the mat at its door, and the roof itself
  if (!bare) svg.append(draw('rect', { x: x + w / 2 - 15 * s, y: y + h + 1 * s, width: 30 * s, height: 11 * s, rx: 2.5 * s, class: 'doormat' }));
  svg.append(draw('rect', { x, y, width: w, height: h, rx: r, class: 'top' }));
  const top = `M${x} ${mid}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${mid}Z`;
  if (kind === 2) {
    // flat: a parapet round it
    svg.append(draw('rect', { x: x + 7 * s, y: y + 7 * s, width: w - 14 * s, height: h - 14 * s, rx: r - 5 * s, class: 'well' }));
  } else {
    // two slopes: the far one catches the light
    svg.append(draw('path', { d: top, class: 'far' }));
    const [a, b] = kind === 1 ? [x + h / 2, x + w - h / 2] : [x + 9 * s, x + w - 9 * s];
    if (kind === 1) {
      // hipped: the ridge stops short, and a hip runs from each end of it to the corners
      svg.append(
        draw('path', { d: `M${x + w} ${y + r}L${b} ${mid}L${x + w} ${y + h - r}Z`, class: 'near' }),
        draw('path', { d: `M${x + 3 * s} ${y + 3 * s}L${a} ${mid}L${x + 3 * s} ${y + h - 3 * s}M${x + w - 3 * s} ${y + 3 * s}L${b} ${mid}L${x + w - 3 * s} ${y + h - 3 * s}`, class: 'hip', 'stroke-width': 2 * s }),
      );
    }
    svg.append(draw('path', { d: `M${a} ${mid}H${b}`, class: 'ridge', 'stroke-width': 4 * s }));
    // a chimney
    const [cx, cy, c] = [x + w - 36 * s, y + 9 * s, 13 * s];
    svg.append(
      draw('rect', { x: cx, y: cy, width: c, height: c, rx: 3 * s, class: 'pot' }),
      draw('rect', { x: cx + 3.6 * s, y: cy + 3.6 * s, width: c - 7.2 * s, height: c - 7.2 * s, rx: 1.6 * s, class: 'flue' }),
    );
  }
  if (bare) return svg;
  // a skylight: dark, or lit when somebody is waiting on you inside
  const [lx, ly] = kind === 2 ? [x + w - 46 * s, y + h - 36 * s] : [x + 15 * s, mid + 9 * s];
  svg.append(
    draw('rect', { x: lx, y: ly, width: 28 * s, height: 19 * s, rx: 4.5 * s, class: 'pane' }),
    draw('path', { d: `M${lx + 5 * s} ${ly + 13 * s}L${lx + 13 * s} ${ly + 5 * s}M${lx + 13 * s} ${ly + 14 * s}L${lx + 19 * s} ${ly + 8 * s}`, class: 'gleam', 'stroke-width': 1.8 * s }),
  );
  return svg;
}

// Something went wrong there (the server said no, or could not be reached):
// a short line of its words beside what was tried, for as long as it stands,
// and what was tried shakes, gently, once. (The owner's choice, 25 November
// 2026: the words while they apply, not behind a mark to press.) `holder` is
// the page's own role="alert" element, beside the thing that was tried and
// after it, so that what was tried does not move for them (room/room.css says
// where each lies); a screen reader says them at once too. `shake` is what
// was tried (for somebody who has asked for less motion, nothing moves: the
// words simply come). An empty `text` takes the line away again (once the
// thing is tried again, or what was typed is changed); the same text again
// changes nothing.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function oops(holder, text, { shake = null } = {}) {
  const said = text ?? '';
  if (holder.textContent === said) return; // (nothing new to say, or nothing to take away: the page is left as it is)
  holder.classList.add('oops');
  holder.textContent = said;
  // (a shake of the head: a few pixels either way, settling, in half a second)
  if (said && shake && !still()) {
    shake.animate([{ translate: '0' }, { translate: '-0.22rem 0' }, { translate: '0.18rem 0' }, { translate: '-0.1rem 0' }, { translate: '0' }], { duration: 480, easing: 'ease-in-out' });
  }
}

// A way in (opening a room, joining one, a name at a room's door): its button
// is held back until what it needs is there, `whole(value)` (so it is never
// pressed for nothing, and nothing has to be said about that), and while it is
// being tried; and what went wrong the last time goes once what was typed is
// changed. Returns going(on), to say when it is being tried.
export function door(form, input, error, whole) {
  const button = form.querySelector('button[type="submit"]');
  let trying = false;
  const check = () => {
    button.disabled = trying || !whole(input.value);
  };
  input.addEventListener('input', () => {
    check();
    oops(error, '');
  });
  check();
  return (on) => {
    trying = on;
    check();
  };
}

// A random number generator from a seed (mulberry32).
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let v = Math.imul(t ^ (t >>> 15), 1 | t);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// Districts for a board of `size`, grown from one square each. Not the game's
// own (a room is not told them: they would give the game away), but the same
// from one look to the next, so a game keeps its face.
function districts(size, rand) {
  const cells = new Array(size * size).fill(-1);
  const open = [];
  const beside = (cell) => {
    const [row, col] = [Math.floor(cell / size), cell % size];
    return [row > 0 && cell - size, row < size - 1 && cell + size, col > 0 && cell - 1, col < size - 1 && cell + 1].filter((n) => n !== false);
  };
  for (let d = 0; d < size; d++) {
    let cell = Math.floor(rand() * size * size);
    while (cells[cell] !== -1) cell = (cell + 1) % (size * size);
    cells[cell] = d;
    open.push(cell);
  }
  while (open.length) {
    const at = Math.floor(rand() * open.length);
    const free = beside(open[at]).filter((n) => cells[n] === -1);
    if (free.length === 0) {
      open.splice(at, 1);
      continue;
    }
    const next = free[Math.floor(rand() * free.length)];
    cells[next] = cells[open[at]];
    open.push(next);
  }
  return cells;
}

// One square a row and a column, no two touching: where posts could be.
function posts(size, rand) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const cols = Array.from({ length: size }, (_, i) => i);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    if (cols.every((col, row) => row === 0 || Math.abs(col - cols[row - 1]) > 1)) return cols;
  }
  return Array.from({ length: size }, (_, i) => (i * 2 + 1) % size);
}

// A board as it will be played, drawn ahead at the desk where a game is set
// up: its own districts, in their colours, and nothing of where the posts are.
export function boardPreview(size, regions) {
  const holder = document.createElement('span');
  holder.className = 'mini';
  holder.setAttribute('aria-hidden', 'true');
  const svg = draw('svg', { viewBox: `0 0 ${size} ${size}` });
  regions.forEach((district, cell) => {
    svg.append(draw('rect', { x: (cell % size) + 0.06, y: Math.floor(cell / size) + 0.06, width: 0.88, height: 0.88, rx: 0.2, class: `d${district}` }));
  });
  holder.append(svg);
  return holder;
}

// A game as it lies on the room's table: its board, in the game's own district
// colours, with the posts found so far on it. `state` is where it stands for
// whoever is looking: 'go' (theirs to play), 'wait', 'won' or 'lost'.
export function miniBoard(game, state) {
  const size = Math.max(4, Math.min(9, Number(game.size) || 6));
  const rand = rng(hash(String(game.id)));
  const cells = districts(size, rand);
  const where = posts(size, rand);
  const found = state === 'won' && game.mode === 'coop' ? size : Math.max(0, Math.min(size, Number(game.found) || 0));
  const rows = Array.from({ length: size }, (_, i) => i).sort((a, b) => hash(`${game.id}:${a}`) - hash(`${game.id}:${b}`)).slice(0, found);

  const holder = document.createElement('span');
  holder.className = 'mini';
  holder.dataset.state = state;
  holder.dataset.kind = game.mode ?? 'coop';
  holder.setAttribute('aria-hidden', 'true');
  const svg = draw('svg', { viewBox: `0 0 ${size} ${size}` });
  cells.forEach((district, cell) => {
    svg.append(draw('rect', { x: (cell % size) + 0.06, y: Math.floor(cell / size) + 0.06, width: 0.88, height: 0.88, rx: 0.2, class: `d${district}` }));
  });
  for (const row of rows) {
    const col = where[row];
    svg.append(
      draw('rect', { x: col + 0.16, y: row + 0.25, width: 0.68, height: 0.5, rx: 0.07, class: 'post' }),
      draw('circle', { cx: col + 0.5, cy: row + 0.53, r: 0.11, class: 'seal' }),
    );
  }
  holder.append(svg);
  return holder;
}
