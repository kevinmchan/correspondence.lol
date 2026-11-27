// Marcus Pell: an aluminium extension ladder with a face, who posts reels (the
// story doc, "One way they could look outside the game"). His body, drawn once
// for his reel (penny/reel.js) and once small for his card in the feed
// (home.js). He is drawn in the reel's own picture, 360 by 640, standing 64
// lower than he is shown (his reel lifts him into frame as a whole).
//
// His tell, never noticed and never said: now and then he hauls his lower
// section up after him, out of reach (`#base`). The rest of the time he is
// sincere.

const range = (n) => [...Array(n).keys()];

// Whether his reel has been watched to its end (penny/reel.js): until then it waits in the feed (home.js).
export const WATCHED_KEY = 'reel:marcus:watched:v1';

// An eye that looks into the lens, with the ring light in it as a small ring; a lid to blink with.
const eye = (x, y, r, id) => `
  <g${id ? ` id="${id}"` : ''}>
    <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.12}" fill="#fff"/>
    <g class="pupil"><circle cx="${x}" cy="${y + 1}" r="${r * 0.62}" fill="#26313b"/>
    <circle cx="${x + r * 0.18}" cy="${y - r * 0.12}" r="${r * 0.26}" fill="none" stroke="#fff" stroke-width="${Math.max(1, r * 0.11)}"/></g>
    <ellipse class="lid" cx="${x}" cy="${y}" rx="${r + 1.5}" ry="${r * 1.12 + 1.5}" fill="${LID}" transform-origin="${x} ${y - r * 1.12 - 1.5}" style="transform: scaleY(0)"/>
  </g>`;

export const LID = '#c3cdd3'; // the wall behind his face: there is no plate, his face is between his rails
export const MOUTH = { x: 180, y: 414, w: 30, fill: '#3b4650' };

// A mouth: a soft earnest line at rest (open 0), rounder the more it is open (up to 1).
export function mouthPath(open, { x, y, w } = MOUTH) {
  const h = 2 + open * 16;
  const t = 2.5 - open * 1.5;
  return `M${x - w / 2} ${y} Q${x} ${y + t} ${x + w / 2} ${y} Q${x} ${y + h + 6} ${x - w / 2} ${y}Z`;
}

// A rung of the ladder, with its highlight.
const rung = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#aab4bb"/><rect x="${x}" y="${y}" width="${w}" height="3.5" rx="1.75" fill="#d4dbdf"/>`;

// His body. `named` gives the parts the reel moves their ids; the feed's small
// copy has none (a page may hold it more than once).
export function body({ named = true } = {}) {
  const id = (name) => (named ? ` id="${name}"` : '');
  return `
    <g${id('torso')}>
      <g${id('base')}>
        <path d="M104 470 V780 M256 470 V780" stroke="#9aa6ae" stroke-width="13"/>
        <path d="M101 470 V780 M253 470 V780" stroke="#c4ccd1" stroke-width="4"/>
        ${range(4).map((i) => `<rect x="104" y="${496 + i * 62}" width="152" height="9" rx="4.5" fill="#8f9ba3"/>`).join('')}
      </g>
      <path d="M118 460 V720 M242 460 V720" stroke="#b9c2c8" stroke-width="14"/>
      <path d="M114 460 V720 M238 460 V720" stroke="#dfe5e8" stroke-width="3.5"/>
      ${range(3).map((i) => rung(118, 528 + i * 62, 124)).join('')}
      <path d="M110 500 q-10 4 -8 16 l8 2z M250 500 q10 4 8 16 l-8 2z" fill="#e08a3c"/>
      <path d="M180 478 C176 560 184 640 178 760" stroke="#e3b04b" stroke-width="3.5" fill="none"/>
      <circle cx="180" cy="474" r="8" fill="#7d8891"/><circle cx="180" cy="474" r="3" fill="#c4ccd1"/>
    </g>
    <g${id('head')}>
      <path d="M118 258 V476 M242 258 V476" stroke="#b9c2c8" stroke-width="14"/>
      <path d="M114 258 V476 M238 258 V476" stroke="#dfe5e8" stroke-width="3.5"/>
      <rect x="109" y="244" width="18" height="22" rx="6" fill="#3e4850"/><rect x="233" y="244" width="18" height="22" rx="6" fill="#3e4850"/>
      ${rung(118, 278, 124)}${rung(118, 452, 124)}
      <rect x="236" y="340" width="12" height="34" rx="2" fill="#e08a3c"/>
      <g stroke="#3b4650" stroke-width="4.5" stroke-linecap="round" fill="none">
        <path${id('brow-l')} d="M141 330 Q154 322 167 326"/>
        <path${id('brow-r')} d="M193 326 Q206 322 219 330"/>
      </g>
      ${eye(154, 352, 11, named && 'eye-l')}${eye(206, 352, 11, named && 'eye-r')}
      <ellipse cx="142" cy="384" rx="11" ry="6" fill="#e58f86" opacity=".35"/><ellipse cx="218" cy="384" rx="11" ry="6" fill="#e58f86" opacity=".35"/>
      <path${id('mouth')} d="${mouthPath(0)}" fill="${MOUTH.fill}"/>
    </g>
    <g${id('arm')}>
      <path d="M116 400 C70 440 76 550 74 700" stroke="#2a333b" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="70" cy="712" r="32" fill="#fbfaf6" stroke="#2a333b" stroke-width="3"/>
    </g>`;
}

// His face, small, on the wall of his room: for his card in the feed.
export function poster() {
  return `<svg viewBox="104 178 152 265" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect x="0" y="0" width="360" height="640" fill="#c3cdd3"/>
    <g transform="translate(0 -64)">${body({ named: false })}</g></svg>`;
}
