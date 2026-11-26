// Meadow folk: the things of a world, alive (room/folk.css).
//
// Given an element and what kind of thing it is, this gives it a body: eyes
// that blink and look about, a mouth, cheeks, hands, feet, petals, wings,
// spines, a tail. A tile that starts a game is a flower-head on its stem with
// leaf hands; a game's small board is a cartoon of the old rubber-hose kind,
// with pie-cut eyes, a white glove and big shoes; the send button is a little bird; a chat note is a butterfly at rest;
// the code on the mat is a sleepy hedgehog; the bell is a bluebell that rings
// itself; the name sign is held up by a field mouse; the portal is a
// caterpillar curled into a ring; the people's tokens get feet.
//
// What it keeps to:
// - The element is never moved or resized. The body is drawn in two layers
//   inside it (`.ff-back`, behind its face, and `.ff-front`), absolutely
//   placed, aria-hidden, and pressed through (pointer-events: none). A layer
//   is drawn to the element's measured size, and again only when that changes.
// - Alive, not frantic: blinks at irregular times, breathing, glances at
//   neighbours and at whoever walks by, now and then a fidget of its own kind,
//   never more than two at once. A finger or pointer near it and it stops and
//   looks at it (and does not dodge); a press is a squash and a pleased face.
//   The game that waits on you waves and hops, gently, now and then. While
//   anything is typed every one of them holds still, looking at what is
//   written. Nothing flashes.
// - Cheap: CSS animations on transform and opacity, run only for what is on
//   the screen; the decisions (when to blink, where to look) are taken ten
//   times a second in tick(), which the world calls from its own one loop;
//   none of it runs while the page is hidden; end() takes all of it away.
// - With reduced motion the bodies are drawn at rest and nothing moves.
//
// To carry it to another layout: troupe({ root, life }) and then
// scan([[kind, selector, options], ...]) after each time the place is drawn.
// A kind only needs the element; where its face is drawn on a ::before (as the
// meadow does with the things to press) the back layer goes behind the face.

const STILL = matchMedia('(prefers-reduced-motion: reduce)');
const STEP = 100; // how often the folk decide what to do next, in ms
const NEAR = 76; // how near a finger has to come, in px from the element's edge, to be looked at

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const f = (v) => Math.round(v * 10) / 10; // a number for a drawing

// --- The parts every face is made of --------------------------------------------------------
// An eye: a white with a pupil that looks where --lx/--ly say (-1 to 1, as far as it can
// reach), a glint; and two other ways of drawing it: glad (^) and shut (a sleepy curve).
function eye(x, y, r, { pupil = 0.62, tall = 1.1 } = {}) {
  const p = r * pupil;
  const reach = Math.max(0.5, r - p - r * 0.08);
  const line = `style="stroke-width:${f(Math.max(1.1, r * 0.42))}px"`;
  return `<g class="ff-eye" style="--reach:${f(reach)}px"><ellipse class="ff-white" cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * tall)}"/>`
    + `<g class="ff-pupil"><circle class="ff-iris" cx="${f(x)}" cy="${f(y + r * 0.08)}" r="${f(p)}"/><circle class="ff-glint" cx="${f(x + p * 0.36)}" cy="${f(y - p * 0.3)}" r="${f(p * 0.36)}"/></g></g>`
    + `<path class="ff-glad" ${line} d="M${f(x - r * 0.9)} ${f(y + r * 0.35)}Q${f(x)} ${f(y - r * 1.05)} ${f(x + r * 0.9)} ${f(y + r * 0.35)}"/>`
    + `<path class="ff-shut" ${line} d="M${f(x - r * 0.9)} ${f(y - r * 0.05)}Q${f(x)} ${f(y + r * 0.8)} ${f(x + r * 0.9)} ${f(y - r * 0.05)}"/>`;
}
const eyes = (x1, x2, y, r, o) => eye(x1, y, r, o) + eye(x2, y, r, o);
// A mouth: a smile at rest, open when glad, an "o" when singing.
function mouth(x, y, w, { stroke = Math.max(1.1, w * 0.2) } = {}) {
  return `<path class="ff-mouth ff-m-rest" style="stroke-width:${f(stroke)}px" d="M${f(x - w / 2)} ${f(y)}Q${f(x)} ${f(y + w * 0.5)} ${f(x + w / 2)} ${f(y)}"/>`
    + `<path class="ff-m-open" d="M${f(x - w * 0.58)} ${f(y - w * 0.08)}Q${f(x)} ${f(y + w * 0.95)} ${f(x + w * 0.58)} ${f(y - w * 0.08)}Z"/>`
    + `<ellipse class="ff-m-o" cx="${f(x)}" cy="${f(y + w * 0.18)}" rx="${f(w * 0.2)}" ry="${f(w * 0.27)}"/>`;
}
const cheek = (x, y, rx, ry = rx * 0.6) => `<ellipse class="ff-cheek" cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
const cheeks = (x1, x2, y, rx, ry) => cheek(x1, y, rx, ry) + cheek(x2, y, rx, ry);
// a group that turns or swings about a point of its own
const at = (x, y) => `style="transform-origin:${f(x)}px ${f(y)}px"`;
// where a part of the element is, inside it, as laid out (not as it sways just now)
function inside(el, face) {
  if (!el) return null;
  const [a, b] = [el.getBoundingClientRect(), face.getBoundingClientRect()];
  const [tx = 0, ty = 0] = (getComputedStyle(el).translate.match(/-?[\d.]+/g) ?? []).map(Number);
  return { x: a.left - b.left - tx, y: a.top - b.top - ty, w: a.width, h: a.height };
}

// --- The kinds ------------------------------------------------------------------------------
// Each kind: how far its body reaches past the element (margin), how it is drawn at a size
// (draw: { back, front }), its resting mood, the fidgets it has (name, ms), how often.

// A flower-head: petals round the tile behind it, leaf hands at its foot, eyes either side of
// the picture on it, and rosy cheeks.
function tile({ w, h, face }) {
  const icon = inside(face.querySelector('.icon'), face) ?? { x: w / 2 - 16, y: 12, w: 32, h: 32 };
  const [ix, iy] = [icon.x + icon.w / 2, icon.y + icon.h / 2];
  const gap = Math.min(icon.w / 2 + 12, w / 2 - 10);
  // petals, all the way round, sticking out further at the sides than over the top (where the heading is)
  const petals = [];
  const n = Math.max(12, Math.round((w + h) / 11));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const sx = Math.sign(c) * Math.abs(c) ** 0.42;
    const sy = Math.sign(s) * Math.abs(s) ** 0.42;
    const out = s < 0 ? 3.2 : 5.2;
    const [x, y] = [w / 2 + sx * (w / 2 + out - 3.5), h / 2 + sy * (h / 2 + out - 3.5)];
    const turn = (Math.atan2(sy * (w / 2), sx * (h / 2)) * 180) / Math.PI;
    petals.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="6.6" transform="rotate(${f(turn)} ${f(x)} ${f(y)})"/>`);
  }
  const leaf = (x, y, dir) => {
    const d = `M${f(x)} ${f(y)}C${f(x + dir * 7)} ${f(y + 1)} ${f(x + dir * 15)} ${f(y + 6)} ${f(x + dir * 18)} ${f(y + 13)}C${f(x + dir * 10)} ${f(y + 14)} ${f(x + dir * 3)} ${f(y + 8)} ${f(x)} ${f(y)}Z`;
    const vein = `M${f(x + dir * 2)} ${f(y + 1.5)}Q${f(x + dir * 10)} ${f(y + 5)} ${f(x + dir * 16)} ${f(y + 12)}`;
    return `<g class="ff-hand ${dir < 0 ? 'ff-l' : 'ff-r'}" ${at(x, y)}><path class="ff-leaf" d="${d}"/><path class="ff-vein" d="${vein}"/></g>`;
  };
  return {
    back: `<g class="ff-breath" ${at(w / 2, h / 2)}><g class="ff-petals" ${at(w / 2, h / 2)}>${petals.join('')}</g></g>${leaf(12, h - 9, -1)}${leaf(w - 12, h - 9, 1)}`,
    front: `<g class="ff-nod" ${at(ix, iy)}>${cheeks(ix - gap, ix + gap, iy + 9, 4.6, 2.7)}${eyes(ix - gap, ix + gap, iy - 1.5, 5.6)}</g>`,
  };
}

// A game's small board, as a cartoon of the old rubber-hose kind: tall eyes with pie-cut pupils over its top
// edge, two short bendy legs in big shoes under it, and one bendy arm at its side with a white glove, to wave with.
function board({ w, h }) {
  const [ex, ey, rx, ry] = [w * 0.6, -1.5, 4.6, 6.2];
  const pieEye = (x) => {
    const [px, py, prx, pry] = [x + rx * 0.12, ey + ry * 0.18, rx * 0.5, ry * 0.56];
    const on = (deg) => `${f(px + prx * Math.cos((deg * Math.PI) / 180))} ${f(py + pry * Math.sin((deg * Math.PI) / 180))}`;
    const line = `style="stroke-width:1.5px"`;
    return `<g class="ff-eye" style="--reach:${f(rx - prx - 0.7)}px"><ellipse class="ff-white" cx="${f(x)}" cy="${f(ey)}" rx="${rx}" ry="${ry}"/>`
      + `<g class="ff-pupil"><path class="ff-iris" d="M${f(px)} ${f(py)}L${on(-78)}A${f(prx)} ${f(pry)} 0 1 0 ${on(-36)}Z"/></g></g>`
      + `<path class="ff-glad" ${line} d="M${f(x - rx * 0.8)} ${f(ey + ry * 0.2)}Q${f(x)} ${f(ey - ry * 0.95)} ${f(x + rx * 0.8)} ${f(ey + ry * 0.2)}"/>`
      + `<path class="ff-shut" ${line} d="M${f(x - rx * 0.8)} ${f(ey)}Q${f(x)} ${f(ey + ry * 0.6)} ${f(x + rx * 0.8)} ${f(ey)}"/>`;
  };
  const leg = (x, dir, k) => {
    const y = h - 1;
    const hose = `M${f(x)} ${f(y)}q${f(dir * 1.2)} 2 0 4.2`;
    const shoe = `M${f(x - dir * 2.2)} ${f(y + 3.4)}c0 -1.6 ${f(dir * 3.6)} -1.9 ${f(dir * 5.8)} -1.3c${f(dir * 2.9)} 0.7 ${f(dir * 4.6)} 2.2 ${f(dir * 4)} 3.8c${f(dir * -0.6)} 1.4 ${f(dir * -8.8)} 1.6 ${f(dir * -9.8)} 0.3c${f(dir * -0.4)} -0.7 ${f(dir * -0.3)} -2.1 0 -2.8Z`;
    return `<g class="ff-leg${k}" ${at(x, y)}><path class="ff-hose" d="${hose}"/><path class="ff-shoe" d="${shoe}"/><path class="ff-shine" d="M${f(x + dir * 3.4)} ${f(y + 3.3)}q${f(dir * 1.7)} -0.5 ${f(dir * 2.9)} 0.6"/></g>`;
  };
  const [sx, sy] = [1.5, h * 0.52];
  const arm = `<g class="ff-arm" ${at(sx, sy)}><path class="ff-hose" d="M${f(sx)} ${f(sy)}c-3.3 -2.4 -6.6 2.4 -10.4 -0.4"/>`
    + `<path class="ff-glove" d="M${f(sx - 10)} ${f(sy - 3.4)}c-2.2 -2.4 -7.6 -2.2 -9.2 1.2c-1.4 3 0.6 6.6 4.2 6.6c2.2 0 3.9 -0.8 5 -2Z"/>`
    + `<path class="ff-glove" d="M${f(sx - 12.2)} ${f(sy - 3.6)}c0.6 -3.6 -3.2 -4.6 -4 -1.6l-0.2 1Z"/>`
    + `<path class="ff-dart" d="M${f(sx - 14.2)} ${f(sy - 0.8)}q-1.6 -0.5 -3 0m3 2.4q-1.6 0.5 -3 0"/></g>`;
  return {
    back: '',
    front: `<g class="ff-legs">${leg(w * 0.32, -1, 0)}${leg(w * 0.68, 1, 1)}</g>${arm}`
      + `<g class="ff-breath" ${at(ex, 3)}>${pieEye(ex - rx - 0.8)}${pieEye(ex + rx + 0.8)}</g>`,
  };
}

// A little bird, facing the way a message goes: its head over the corner, an eye and a beak,
// a tail, a wing, and legs under it.
function send({ w, h }) {
  const [hx, hy] = [w - 14, 0];
  return {
    back: `<g class="ff-tail" ${at(7, 6)}><path class="ff-feather" d="M9 7C3 3 -2 -2 -4 -8C1 -6 6 -2 10 3Z"/><path class="ff-feather" d="M12 5C9 -1 8 -6 9 -11C12 -7 14 -2 15 3Z"/></g>`
      + `<g class="ff-breath"><g class="ff-head" ${at(hx, hy + 8)}><circle class="ff-body" cx="${f(hx)}" cy="${f(hy)}" r="12.2"/></g></g>`
      + `<g class="ff-feet"><path class="ff-shank" d="M${f(w * 0.3)} ${f(h - 2)}v13.4m-4 0l4 -2.6l4 2.6M${f(w * 0.56)} ${f(h - 2)}v13.4m-4 0l4 -2.6l4 2.6"/></g>`,
    front: `<g class="ff-breath"><g class="ff-head" ${at(hx, hy + 8)}>`
      + `<g class="ff-beak" ${at(w - 2, hy + 1)}><path class="ff-bill ff-top" d="M${f(w - 3.5)} ${f(hy - 3.6)}L${f(w + 5.6)} ${f(hy + 0.6)}L${f(w - 3.5)} ${f(hy + 2)}Z"/><path class="ff-bill ff-under" d="M${f(w - 3.5)} ${f(hy + 1.4)}L${f(w + 3.8)} ${f(hy + 2.2)}L${f(w - 3.5)} ${f(hy + 4.8)}Z"/></g>`
      + `${cheek(hx + 3.5, hy + 6.4, 3, 1.8)}${eye(hx + 1, hy - 3.4, 4.3)}</g></g>`
      + `<g class="ff-song"><path class="ff-note" d="M${f(w + 6)} ${f(hy - 6)}v-7.5l4.5 -1.2v6.4"/><circle class="ff-note-head" cx="${f(w + 4.9)}" cy="${f(hy - 5.8)}" r="1.9"/><circle class="ff-note-head" cx="${f(w + 9.4)}" cy="${f(hy - 7.2)}" r="1.9"/></g>`,
  };
}

// A caterpillar curled into the portal's ring: its head at the top on the left, its feet round
// the bottom.
function portal({ w, h }) {
  const [cx, cy, r] = [w / 2, h / 2, w / 2];
  const feet = [32, 58, 84, 110, 136].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const [x, y] = [cx + Math.cos(a) * (r + 1.2), cy + Math.sin(a) * (r + 1.2)];
    return `<ellipse class="ff-foot" cx="${f(x)}" cy="${f(y)}" rx="3" ry="4.2" transform="rotate(${deg - 90} ${f(x)} ${f(y)})"/>`;
  }).join('');
  const [hx, hy] = [cx - r * 0.66, cy - r * 0.66];
  return {
    back: `<g class="ff-feet">${feet}</g>`,
    front: `<g class="ff-breath" ${at(hx + 3, hy + 6)}>`
      + `<g class="ff-feelers" ${at(hx, hy - 6)}><path class="ff-feeler" d="M${f(hx - 2.6)} ${f(hy - 5.6)}q-2 -4 -5 -5"/><path class="ff-feeler" d="M${f(hx + 2.6)} ${f(hy - 6.4)}q1 -4.4 -0.5 -7"/>`
      + `<circle class="ff-bead" cx="${f(hx - 7.6)}" cy="${f(hy - 10.6)}" r="1.5"/><circle class="ff-bead" cx="${f(hx + 2.1)}" cy="${f(hy - 13.4)}" r="1.5"/></g>`
      + `<circle class="ff-skin" cx="${f(hx)}" cy="${f(hy)}" r="8"/>${cheeks(hx - 4.6, hx + 4.4, hy + 3.2, 1.8, 1.1)}${eyes(hx - 2.9, hx + 3, hy - 1.4, 2.6)}${mouth(hx + 0.2, hy + 3, 3.2)}</g>`,
  };
}

// A sleepy hedgehog: the code is its pale front; spines along its back (growing longer towards
// its rump), an ear, a snout out at the left with a nose, little feet, and now and then a z.
function code({ w, h }) {
  const spike = (x, y, dx, dy, half) => {
    // a soft spike from a base centred at (x, y), pointing along (dx, dy)
    const [nx, ny] = [-dy, dx];
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [(nx / len) * half, (ny / len) * half];
    return `M${f(x - ux)} ${f(y - uy)}Q${f(x + dx * 0.55 - ux * 0.35)} ${f(y + dy * 0.55 - uy * 0.35)} ${f(x + dx)} ${f(y + dy)}Q${f(x + dx * 0.55 + ux * 0.35)} ${f(y + dy * 0.55 + uy * 0.35)} ${f(x + ux)} ${f(y + uy)}Z`;
  };
  const rows = [[], []];
  const start = 22;
  for (let x = start, k = 0; x < w - 4; x += 6.2, k++) {
    const p = (x - start) / Math.max(1, w - start);
    rows[k % 2].push(spike(x, 3.5, 1.2 + p * 1.6, -(3.2 + p * 2.6 + (k % 2) * 0.8), 3.4));
  }
  for (let y = 4, k = 0; y < h - 3; y += 6.2, k++) {
    const p = Math.sin((y / h) * Math.PI);
    rows[k % 2].push(spike(w - 3.5, y, 5.6 + p * 4.6 + (k % 2) * 1.2, 1.4 - (y / h) * 1.2, 3.4));
  }
  const foot = (x) => `<ellipse class="ff-foot" cx="${f(x)}" cy="${f(h + 1.4)}" rx="4.4" ry="3"/>`;
  const my = h * 0.56;
  // its spiny cape, over the ends of its face where nothing is written: down its back, and a
  // thin band along the top; fringed where it meets the pale of its face
  const [r, cw] = [9, Math.min(17, w * 0.09)];
  let cape = `M26 0H${f(w - r)}Q${f(w)} 0 ${f(w)} ${r}V${f(h - r)}Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)}H${f(w - cw + 1)}`;
  for (let y = h - 6; y > 7; y -= 6) cape += `Q${f(w - cw - 2.8)} ${f(y + 3)} ${f(w - cw)} ${f(y)}`;
  for (let x = w - cw - 6; x > 30; x -= 6) cape += `Q${f(x + 3)} 6.6 ${f(x)} 3.8`;
  cape += 'Q27.5 4.8 26 0Z';
  let quills = '';
  for (let y = 9; y < h - 6; y += 5.5) quills += `M${f(w - cw + 4)} ${f(y + 1.5)}l6.5 -3`;
  return {
    back: `<g class="ff-breath" ${at(w * 0.6, h * 0.75)}><g class="ff-spines" ${at(w / 2, h / 2)}><path class="ff-spine-far" d="${rows[1].join('')}"/><path class="ff-spine-near" d="${rows[0].join('')}"/></g></g>`
      + `<g class="ff-ear" ${at(15, 2)}><circle class="ff-ear-out" cx="15" cy="0.2" r="5.2"/><circle class="ff-ear-in" cx="15" cy="0.8" r="2.7"/></g>`
      + `<g class="ff-feet">${foot(22)}${foot(36)}${foot(w - 36)}${foot(w - 21)}</g>`,
    front: `<path class="ff-cape" d="${cape}"/><path class="ff-quills" d="${quills}"/>`
      + `<g class="ff-snout" ${at(4, my)}><path class="ff-muzzle" d="M6 ${f(my - 9)}C-3 ${f(my - 8.4)} -10 ${f(my - 3.4)} -14 ${f(my - 0.6)}C-10 ${f(my + 3.6)} -3 ${f(my + 8.6)} 6 ${f(my + 8.2)}Z"/>`
      + `<circle class="ff-nose" cx="-13" cy="${f(my - 1)}" r="2.9"/><circle class="ff-glint" cx="-13.8" cy="${f(my - 2)}" r="0.9"/>${mouth(-4.6, my + 3.2, 4.4)}</g>`
      + `${cheek(11, my + 4.2, 3.6, 2.1)}${eye(12, h * 0.36, 3.3)}`
      + `<g class="ff-zs"><path class="ff-z ff-z1" d="M-8 -4h4.4l-4.4 4.4h4.4"/><path class="ff-z ff-z2" d="M-14 -12.5h5.6l-5.6 5.6h5.6"/></g>`,
  };
}

// A bluebell that rings itself: a nodding bell of a flower with pointed petals curling out at
// its rim, a face, a green cup at its top on an arching stem with a leaf, a clapper under its
// rim; and rings in the air either side when it rings.
const BLUEBELL = 'M-4.6 1.6C-10.4 2.4 -11.6 10 -11.3 17.4C-11.1 21.4 -13.4 24.2 -16.6 24.2'
  + 'Q-12.8 27.6 -10.8 26.2Q-9.8 29.8 -7.2 30Q-4.8 29.8 -3.4 27.9Q-1.8 31.2 0 31.4Q1.8 31.2 3.4 27.9'
  + 'Q4.8 29.8 7.2 30Q9.8 29.8 10.8 26.2Q12.8 27.6 16.6 24.2C13.4 24.2 11.1 21.4 11.3 17.4C11.6 10 10.4 2.4 4.6 1.6Z';
function bell({ w, h }) {
  const s = Math.min(w, h) / 36.8; // (drawn for a bell 36.8 across; another size, scaled)
  const [cx, top] = [w / 2 + 1, h * 0.08];
  // rings in the air: two on the left, one on the right (where the words beside it begin)
  const arc = (dir, outer) => `<path d="M${f(dir * 19)} 9q${f(dir * 3.6)} 6 0 12${outer ? `M${f(dir * 23.5)} 6q${f(dir * 5.6)} 9 0 18` : ''}"/>`;
  return {
    back: '',
    front: `<g transform="translate(${f(cx)} ${f(top)}) scale(${f(s)})">`
      + `<path class="ff-stem" d="M0 -0.5C0 -9 -7 -14 -15 -12.5C-19 -11.8 -21 -9 -22 -5"/>`
      + `<path class="ff-leaf" d="M-14 -12.8C-18 -20 -25 -21 -29 -19.5C-26.5 -14 -20 -11.6 -14 -12.8Z"/>`
      + `<g class="ff-arcs">${arc(-1, true)}${arc(1, false)}</g>`
      + `<g class="ff-breath" ${at(0, 0)}><g class="ff-flower" ${at(0, 0)}><g transform="rotate(7)">`
      + `<g class="ff-clapper" ${at(0, 25)}><path class="ff-string" d="M0 24v7"/><circle class="ff-ball" cx="0" cy="32.6" r="2.4"/></g>`
      + `<path class="ff-petal" d="${BLUEBELL}"/><path class="ff-shine" d="M-7.4 6C-9.2 10 -9.4 14 -9 19"/>`
      + `<path class="ff-cup" d="M-5.6 3.4L-4 -0.8L-1.6 2.4L0 -1.8L1.6 2.4L4 -0.8L5.6 3.4Q0 5.6 -5.6 3.4Z"/>`
      + `${cheeks(-7.6, 7.6, 18.6, 2.5, 1.5)}${eyes(-4.4, 4.4, 13.6, 3.1)}${mouth(0, 18.6, 4.2)}</g></g></g></g>`,
  };
}

// A field mouse behind the name sign, holding it up: ears, eyes and nose over the top edge on
// the left, its paws on the edge, whiskers, and its tail curling out at the bottom.
function sign({ w, h }) {
  const mx = Math.min(38, w * 0.25);
  return {
    back: `<g class="ff-tail" ${at(12, h - 6)}><path d="M12 ${f(h - 6)}C2 ${f(h - 3)} -7 ${f(h + 2)} -5.5 ${f(h + 8.5)}C-4.4 ${f(h + 13)} 1.6 ${f(h + 13.4)} 2.4 ${f(h + 9.6)}C3 ${f(h + 6.8)} -0.6 ${f(h + 6)} -1 ${f(h + 8.6)}"/></g>`
      + `<g class="ff-peek"><g class="ff-breath" ${at(mx, 4)}>`
      + `<g class="ff-ear ff-l" ${at(mx - 7, -11)}><circle class="ff-ear-out" cx="${f(mx - 10.5)}" cy="-17" r="7.6"/><circle class="ff-ear-in" cx="${f(mx - 10.5)}" cy="-16.6" r="4.4"/></g>`
      + `<g class="ff-ear ff-r" ${at(mx + 7, -11)}><circle class="ff-ear-out" cx="${f(mx + 10.5)}" cy="-17" r="7.6"/><circle class="ff-ear-in" cx="${f(mx + 10.5)}" cy="-16.6" r="4.4"/></g>`
      + `<ellipse class="ff-skin" cx="${f(mx)}" cy="-4.6" rx="13.6" ry="12.4"/>`
      + `<g class="ff-whiskers"><path d="M${f(mx - 4.5)} -3.4l-12 -2.6M${f(mx - 4.5)} -2.2l-12 1.8M${f(mx + 4.5)} -3.4l12 -2.6M${f(mx + 4.5)} -2.2l12 1.8"/></g>`
      + `${cheeks(mx - 8, mx + 8, -4.4, 2.6, 1.6)}${eyes(mx - 5, mx + 5, -9.6, 3.3)}<ellipse class="ff-nose" ${at(mx, -3.4)} cx="${f(mx)}" cy="-3.4" rx="2.6" ry="2.1"/></g></g>`,
    front: `<g class="ff-paws"><ellipse class="ff-paw" cx="${f(mx - 11)}" cy="0.8" rx="4.4" ry="3.2"/><ellipse class="ff-paw" cx="${f(mx + 11)}" cy="0.8" rx="4.4" ry="3.2"/>`
      + `<path class="ff-toes" d="M${f(mx - 12.6)} 1.6v1.5M${f(mx - 9.4)} 1.6v1.5M${f(mx + 9.4)} 1.6v1.5M${f(mx + 12.6)} 1.6v1.5"/></g>`,
  };
}

// A butterfly at rest on a note: its head at the note's outer corner below, feelers, and its
// wings, folded behind the note's edge, that open out slowly now and then.
function note({ w, h, face }) {
  const mine = Boolean(face.closest('li.mine'));
  const s = mine ? -1 : 1;
  const X = (x) => (mine ? -x : w + x); // (outward from the note's outer side)
  const [hx, hy] = [X(2.4), h - 3.4];
  const wing = `M${f(X(-1))} ${f(h - 10)}C${f(X(8))} ${f(h - 35)} ${f(X(20))} ${f(h - 33)} ${f(X(15.5))} ${f(h - 18)}C${f(X(13))} ${f(h - 12)} ${f(X(6))} ${f(h - 10)} ${f(X(-1))} ${f(h - 9)}Z`
    + `M${f(X(-1))} ${f(h - 9)}C${f(X(7))} ${f(h - 10.5)} ${f(X(14))} ${f(h - 7)} ${f(X(10.5))} ${f(h - 1)}C${f(X(8))} ${f(h + 1.5)} ${f(X(2.4))} ${f(h - 3)} ${f(X(-1))} ${f(h - 7)}Z`;
  return {
    back: '',
    front: `<g class="ff-breath" ${at(X(-1), h - 9)}><g class="ff-wings" ${at(X(-1), h - 9)}><path class="ff-wing" d="${wing}"/><circle class="ff-spot" cx="${f(X(11.4))}" cy="${f(h - 23)}" r="2.4"/><circle class="ff-spot" cx="${f(X(7.2))}" cy="${f(h - 17)}" r="1.3"/></g></g>`
      + `<path class="ff-legs" d="M${f(X(-7.5))} ${f(h - 0.5)}l${f(-s * 1)} 4M${f(X(-13))} ${f(h - 0.5)}l${f(-s * 1)} 4"/>`
      + `<g class="ff-head" ${at(hx, hy)}><g class="ff-feelers" ${at(hx, hy - 6)}><path class="ff-feeler" d="M${f(hx - s * 1.4)} ${f(hy - 5.8)}q${f(s * 0.6)} -5.8 ${f(s * 4.6)} -8.6M${f(hx + s * 2.4)} ${f(hy - 4.8)}q${f(s * 3.4)} -4 ${f(s * 8.6)} -5.2"/>`
      + `<circle class="ff-bead" cx="${f(hx + s * 3.2)}" cy="${f(hy - 14.4)}" r="1.45"/><circle class="ff-bead" cx="${f(hx + s * 11)}" cy="${f(hy - 10)}" r="1.45"/></g>`
      + `<circle class="ff-skin" cx="${f(hx)}" cy="${f(hy)}" r="6.6"/>${eyes(hx - 2.6, hx + 2.7, hy - 0.8, 2.45, { pupil: 0.64 })}${cheeks(hx - 4, hx + 4.2, hy + 3, 1.5, 0.9)}</g>`,
  };
}

// The people's tokens: two feet.
function token({ w, h }) {
  const foot = (x, side) => `<g class="ff-foot ${side}" ${at(x, h)}><ellipse class="ff-shoe" cx="${f(x)}" cy="${f(h + 2)}" rx="6.4" ry="3.7"/><ellipse class="ff-shine" cx="${f(x - 1.6)}" cy="${f(h + 0.9)}" rx="2.4" ry="1"/></g>`;
  return { back: '', front: foot(w * 0.3, 'ff-l') + foot(w * 0.7, 'ff-r') };
}

export const KINDS = {
  tile: { draw: tile, margin: 24, rest: 'rest', fidgets: [['wave', 1800], ['ruffle', 1500], ['nod', 1200]], every: [5000, 13000] },
  board: { draw: board, margin: 24, rest: 'rest', fidgets: [['tap', 1100], ['wave', 1600]], every: [6000, 15000], calls: (face) => face.dataset.state === 'go' },
  send: { draw: send, margin: 22, rest: 'rest', fidgets: [['tilt', 1600], ['hop', 900], ['flick', 900]], every: [4500, 11000] },
  portal: { draw: portal, margin: 20, rest: 'rest', fidgets: [['feel', 1300], ['ripple', 1500]], every: [6000, 14000] },
  code: { draw: code, margin: 20, rest: 'sleep', fidgets: [['snore', 3200], ['snore', 3200], ['shuffle', 1200]], every: [3500, 8000], pivot: (w, h) => [w * 0.6, h] },
  bell: { draw: bell, margin: 34, rest: 'rest', fidgets: [['ring', 2000], ['ring', 2000], ['sway', 1800]], every: [7000, 14000], pivot: (w, h) => [w / 2 + 1, h * 0.08] },
  sign: { draw: sign, margin: 30, rest: 'rest', fidgets: [['ears', 1100], ['sniff', 1200], ['peek', 2200], ['tail', 1600]], every: [4500, 11000] },
  note: { draw: note, margin: 40, rest: 'rest', fidgets: [['fan', 2600], ['fan', 2600], ['feel', 1300]], every: [7000, 18000] },
  token: { draw: token, margin: 10, rest: 'rest', fidgets: [], every: [1e9, 1e9], blind: true },
};

// --- A troupe: the folk of a place, and their life ------------------------------------------
//   root:   the place (attributes on it hold every one of them still: data-ff-still, data-ff-asleep)
//   life:   ends it all (on(), onEnd(); see shared/screen.js)
//   calm:   whether anything is being typed (they hold still, and watch it)
//   sights: what else there is to look at (elements: people walking about, a butterfly)
// Returns { scan(cast), tick(now), end() }. tick() is for the world's own loop; nothing runs
// otherwise. With reduced motion the folk are drawn at rest and never woken.
export function troupe({ root, life, calm = () => false, sights = () => [], still = STILL.matches }) {
  const folk = new Map(); // face: creature
  const kept = new Map(); // key: what a creature drawn again was doing
  let last = 0;
  let quiet = false; // something is being typed
  let moved = 0;

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const c = folk.get(entry.target);
      if (!c) continue;
      // (come into view, it stirs: a blink, and before long something of its own)
      if (entry.isIntersecting && !c.seen) {
        const now = performance.now();
        c.nextBlink = Math.min(c.nextBlink, now + rand(300, 1500));
        c.nextDo = Math.min(c.nextDo, now + rand(700, 2800));
      }
      c.seen = entry.isIntersecting;
      c.face.toggleAttribute('data-ff-seen', c.seen);
    }
  });
  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const c = folk.get(entry.target);
      if (c && (c.face.offsetWidth !== c.w || c.face.offsetHeight !== c.h)) draw(c);
    }
  });

  // Dress `face` as a creature of `kind`. `host` is what is pressed (the face's own element
  // unless said); `key` says which creature it is when the place draws it afresh.
  function cast(face, kind, { host = face, key = null } = {}) {
    const c = make(face, kind, host, key);
    if (!c) return;
    measure(c);
    put(c);
  }
  // (in three steps, so that a place drawn afresh is measured all at once and then written to)
  function make(face, kind, host, key) {
    const spec = KINDS[kind];
    if (!spec || folk.has(face)) return null;
    const now = performance.now();
    const was = key ? kept.get(key) : null;
    kept.delete(key);
    const c = was ?? {
      kind, key, born: now - rand(0, 9000), mood: spec.rest, moodUntil: 0, lx: 0, ly: 0, lookUntil: now + rand(400, 2600), target: null,
      nextBlink: now + rand(600, 4200), flip: 'a', nextDo: now + rand(1500, spec.every[1]), doing: null, doFrom: 0, doUntil: 0,
      attendUntil: 0, attending: false, pressUntil: 0, seen: false,
    };
    Object.assign(c, { face, host, spec, back: null, front: null, placed: false });
    folk.set(face, c);
    return c;
  }
  function measure(c) {
    const { face, spec } = c;
    const style = getComputedStyle(face);
    c.w = face.offsetWidth;
    c.h = face.offsetHeight;
    c.edge = [parseFloat(style.borderLeftWidth) || 0, parseFloat(style.borderTopWidth) || 0];
    c.placed = c.placed || style.position === 'static';
    c.drawn = c.w && c.h ? spec.draw({ w: c.w, h: c.h, face }) : { back: '', front: '' };
  }
  function put(c) {
    const { face, host, spec } = c;
    const now = performance.now();
    face.setAttribute('data-ff', c.kind);
    host.setAttribute('data-ff-host', '');
    if (c.placed) face.style.position = 'relative';
    // (carried on from where it was, if it was drawn before: its breath in step, its mood, where it looked)
    face.style.setProperty('--ff-age', `${(-(now - c.born) / 1000).toFixed(2)}s`);
    face.style.setProperty('--lx', f(c.lx));
    face.style.setProperty('--ly', f(c.ly));
    if (c.mood !== 'rest') face.dataset.ffMood = c.mood; // (a hedgehog rests asleep)
    if (c.doing) {
      face.dataset.ffDo = c.doing;
      face.style.setProperty('--ff-do-t', `${(-(now - c.doFrom) / 1000).toFixed(2)}s`);
    }
    if (c.attending) face.setAttribute('data-ff-attend', '');
    if (c.seen) face.setAttribute('data-ff-seen', '');
    paint(c);
    seen.observe(face);
    sizes.observe(face);
  }
  function paint(c) {
    const { face, spec, w, h } = c;
    const m = spec.margin;
    const [bl, bt] = c.edge;
    const layer = (name, inner) => {
      let span = c[name];
      if (!inner) {
        span?.remove();
        c[name] = null;
        return;
      }
      if (!span) {
        span = document.createElement('span');
        span.className = `ff ff-${name} ff-${c.kind}`;
        span.setAttribute('aria-hidden', 'true');
        c[name] = span;
      }
      span.style.cssText = `left:${-m - bl}px;top:${-m - bt}px;width:${w + 2 * m}px;height:${h + 2 * m}px`;
      // (its breath moves the drawing as a whole, on the compositor: nothing is drawn again for it)
      const [px, py] = spec.pivot?.(w, h) ?? [w / 2, h / 2];
      span.innerHTML = `<span class="ff-body" style="transform-origin:${f(px + m)}px ${f(py + m)}px">`
        + `<svg viewBox="${-m} ${-m} ${w + 2 * m} ${h + 2 * m}" focusable="false">${inner}</svg></span>`;
      if (span.parentNode !== face) face.append(span);
    };
    layer('back', c.drawn.back);
    layer('front', c.drawn.front);
  }
  // drawn again at a new size
  function draw(c) {
    measure(c);
    paint(c);
  }

  function undress(c, keep = true) {
    const { face, host } = c;
    seen.unobserve(face);
    sizes.unobserve(face);
    c.back?.remove();
    c.front?.remove();
    c.back = c.front = null;
    for (const name of ['data-ff', 'data-ff-mood', 'data-ff-do', 'data-ff-blink', 'data-ff-attend', 'data-ff-press', 'data-ff-seen', 'data-ff-host']) face.removeAttribute(name);
    host.removeAttribute('data-ff-host');
    for (const name of ['--ff-age', '--lx', '--ly', '--ff-do-t']) face.style.removeProperty(name);
    if (c.placed) face.style.removeProperty('position');
    c.placed = false;
    folk.delete(face);
    if (keep && c.key) kept.set(c.key, c);
  }

  // Everything of `cast` there is now: [[kind, selector, { face(el), key(el) }], ...]. Those
  // no longer there are let go (what they were doing is kept, should they be drawn again).
  function scan(list) {
    if (life.over) return;
    const now = new Set();
    const fresh = [];
    for (const [kind, selector, { face = (el) => el, key = null } = {}] of list) {
      for (const el of root.querySelectorAll(selector)) {
        const it = face(el);
        if (!it) continue;
        now.add(it);
        // (a thing whose inside the place has written afresh has lost its body: it is given it again, and carries on)
        const had = folk.get(it);
        if (had && had.front && had.front.parentNode !== it) undress(had);
        if (!folk.has(it)) fresh.push([it, kind, el, key ? key(el) : null]);
      }
    }
    for (const c of [...folk.values()]) if (!now.has(c.face) || !c.face.isConnected) undress(c);
    const made = fresh.map((args) => make(...args)).filter(Boolean);
    made.forEach(measure);
    made.forEach(put);
    if (kept.size > 80) kept.clear();
  }

  // --- Life ----------------------------------------------------------------------------------
  // where its eyes are, about (measured again at most every 400 ms, and after a scroll)
  let scrolled = 0;
  const middle = (c) => {
    const now = performance.now();
    if (c.mid && now - c.midAt < 400 && c.midAt > scrolled) return c.mid;
    const r = c.face.getBoundingClientRect();
    c.mid = { x: r.left + r.width / 2, y: r.top + r.height * (c.kind === 'board' ? 0.1 : 0.4) };
    c.midAt = now;
    return c.mid;
  };
  // Look towards a point on the screen (the eyes go as far as they can that way).
  function lookAt(c, x, y) {
    const me = middle(c);
    const [dx, dy] = [x - me.x, y - me.y];
    const d = Math.hypot(dx, dy);
    const far = Math.max(d, 46);
    set(c, dx / far, dy / far);
  }
  function set(c, lx, ly) {
    const [x, y] = [Math.max(-1, Math.min(1, lx)), Math.max(-1, Math.min(1, ly))];
    if (Math.abs(x - c.lx) < 0.04 && Math.abs(y - c.ly) < 0.04) return;
    c.lx = x;
    c.ly = y;
    c.face.style.setProperty('--lx', f(x));
    c.face.style.setProperty('--ly', f(y));
  }
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const mood = (c, name, ms) => {
    c.mood = name;
    c.moodUntil = performance.now() + ms;
    if (name === 'rest') delete c.face.dataset.ffMood;
    else c.face.dataset.ffMood = name;
  };
  const begin = (c, name, ms, now) => {
    c.doing = name;
    c.doFrom = now;
    c.doUntil = now + ms;
    c.face.style.setProperty('--ff-do-t', '0s');
    c.face.dataset.ffDo = name;
    if (name === 'ring') mood(c, 'sing', ms * 0.8);
  };
  const stop = (c) => {
    if (!c.doing) return;
    c.doing = null;
    delete c.face.dataset.ffDo;
  };

  // Somewhere new to look: ahead, at a neighbour, at somebody walking by, up at the sky.
  function wander(c, now, people) {
    c.target = null;
    c.lookUntil = now + rand(1400, 3800);
    const me = middle(c);
    const near = people().filter((p) => Math.hypot(p.x - me.x, p.y - me.y) < 170);
    const roll = Math.random();
    if (near.length && roll < 0.55) {
      c.target = pick(near).el;
      c.lookUntil = now + rand(2200, 4200);
      return;
    }
    if (roll < 0.38) return set(c, 0, 0.15);
    if (roll < 0.72) {
      const others = [...folk.values()].filter((o) => o !== c && o.seen && o.kind !== 'token');
      const close = others.map((o) => [o, middle(o)]).filter(([, m]) => Math.hypot(m.x - me.x, m.y - me.y) < 260);
      if (close.length) {
        const [, m] = pick(close);
        return lookAt(c, m.x, m.y);
      }
    }
    if (roll < 0.86) return set(c, rand(-0.6, 0.6), -0.85);
    set(c, pick([-1, 1]) * rand(0.6, 1), rand(-0.2, 0.4));
  }

  // While anything is typed: all of them still, watching what is written.
  function hush(on) {
    quiet = on;
    root.toggleAttribute('data-ff-still', on);
    if (!on) return;
    const field = document.activeElement;
    const there = field && field !== document.body ? centre(field) : null;
    for (const c of folk.values()) {
      stop(c);
      c.attendUntil = 0;
      c.face.removeAttribute('data-ff-attend');
      c.attending = false;
      if (c.mood !== c.spec.rest) mood(c, c.spec.rest, 0);
      if (there && c.seen && !c.spec.blind) lookAt(c, there.x, there.y);
    }
  }

  function tick(now) {
    if (still || life.over || now - last < STEP) return;
    last = now;
    const typing = calm();
    if (typing !== quiet) hush(typing);
    if (typing) return;
    // (where the people are, measured only if somebody wants to look at them)
    let seenPeople = null;
    const people = () => (seenPeople ??= sights().filter(Boolean).map((el) => ({ el, ...centre(el) })));
    let busy = 0; // fidgets going on now (a game calling you is not one: it holds nobody back)
    for (const c of folk.values()) if (c.doing && c.doing !== 'call' && c.seen) busy += 1;
    for (const c of folk.values()) {
      if (!c.seen || c.spec.blind) continue;
      const { face, spec } = c;
      if (c.mood !== spec.rest && now > c.moodUntil) mood(c, spec.rest, 0);
      if (c.doing && now > c.doUntil) stop(c);
      if (c.pressUntil && now > c.pressUntil) {
        c.pressUntil = 0;
        face.removeAttribute('data-ff-press');
      }
      const attending = now < c.attendUntil;
      if (attending !== c.attending) {
        c.attending = attending;
        face.toggleAttribute('data-ff-attend', attending);
        if (attending) stop(c);
        else c.lookUntil = now + rand(500, 1400);
      }
      if (attending) continue; // (it is looking at the finger)
      // blinks, at irregular times, now and then two together (not while asleep, or glad)
      if (now > c.nextBlink) {
        if (c.mood === 'rest') {
          c.flip = c.flip === 'a' ? 'b' : 'a';
          face.dataset.ffBlink = c.flip;
        }
        c.nextBlink = now + (Math.random() < 0.16 ? rand(260, 380) : rand(2300, 7200));
      }
      // where it looks
      if (now > c.lookUntil) wander(c, now, people);
      if (c.target) {
        const p = people().find((one) => one.el === c.target);
        if (p) lookAt(c, p.x, p.y);
        else c.lookUntil = 0;
      }
      // the game that waits on you says so, now and then: a hop and a wave
      if (spec.calls?.(face) && !c.doing && now > c.nextDo) {
        begin(c, 'call', 1900, now);
        c.nextDo = now + rand(3600, 5600);
        set(c, 0, 0.3);
        continue;
      }
      // a fidget of its own kind, never more than two of them going at once
      if (!c.doing && now > c.nextDo && busy < 2 && spec.fidgets.length) {
        const [name, ms] = pick(spec.fidgets);
        begin(c, name, ms, now);
        busy += 1;
        c.nextDo = now + ms + rand(...spec.every);
      }
    }
  }

  // A finger or a pointer near: those near it stop and look at it; the one pressed squashes and is glad.
  function notice(x, y, ms, pressed = null) {
    if (quiet) return;
    const now = performance.now();
    for (const c of folk.values()) {
      if (!c.seen || c.spec.blind) continue;
      const r = c.face.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      const press = pressed && c.host.contains(pressed);
      if (d > NEAR && !press) continue;
      c.attendUntil = Math.max(c.attendUntil, now + ms);
      if (!c.attending) {
        c.attending = true;
        c.face.setAttribute('data-ff-attend', '');
        stop(c);
      }
      c.target = null;
      lookAt(c, x, y);
      if (c.kind === 'code' && c.mood === 'sleep') mood(c, 'rest', 4200); // (it wakes)
      if (press) {
        c.flip = c.flip === 'a' ? 'b' : 'a';
        c.face.setAttribute('data-ff-press', c.flip);
        c.pressUntil = now + 520;
        mood(c, 'glad', 1500);
      }
    }
  }
  if (!still) {
    life.on(document, 'pointerdown', (event) => notice(event.clientX, event.clientY, 1700, event.target), true);
    life.on(document, 'pointermove', (event) => {
      const mouse = event.pointerType === 'mouse' || event.pointerType === 'pen';
      if (!mouse && !event.buttons) return;
      if (event.timeStamp - moved < 50) return;
      moved = event.timeStamp;
      notice(event.clientX, event.clientY, mouse ? 650 : 1700);
    }, { passive: true });
    life.on(document, 'pointerup', (event) => notice(event.clientX, event.clientY, event.pointerType === 'mouse' ? 650 : 1300), true);
    life.on(window, 'scroll', () => { scrolled = performance.now(); }, { passive: true });
    // (a page that cannot be seen moves nothing at all)
    const asleep = () => root.toggleAttribute('data-ff-asleep', document.hidden);
    life.on(document, 'visibilitychange', asleep);
    asleep();
  }

  function end() {
    for (const c of [...folk.values()]) undress(c, false);
    kept.clear();
    seen.disconnect();
    sizes.disconnect();
    root.removeAttribute('data-ff-still');
    root.removeAttribute('data-ff-asleep');
  }
  life.onEnd(end);

  return { scan, tick, end, cast, get size() { return folk.size; } };
}
