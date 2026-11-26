// The world, seen from above (/?map): where the walk has been, where it can go
// on, and what stands round it.
//
// The walk (penny/walk.js) shows one place at a time, close to. This is the
// same map from further off, and it is a world to go about in: the page
// scrolls, the way on is up, and it opens on the frontier (or on whatever
// was last gone into from here). On it, all on the one grid of squares:
//
//   places     the first five, lying where they were walked, and above them
//              the places beyond (penny/beyond.js), which are a network and
//              not a line. A place says what it is by its form (map.css):
//                walked  flat and pale, its posts in colour. A touch walks it again.
//                lit     standing up off the map, in colour, breathing. A touch goes there.
//                near    the way to it is open, but it is not lit: grey, with as
//                        many squares in colour as it has been given energy for.
//                        While there is energy to give a spark rests on it; a
//                        touch pours in what is held, a square at a time, and
//                        when the last takes colour it is lit.
//                faint   the way to it is not open. A touch stirs it, no more.
//   and round them (penny/world.js): the landmarks, your rooms as buildings,
//   what has been found lying where it was found, the portals walked places
//   opened, and the mail you have found, out and going about.
//
// Nothing here is told. A building is a roof in the room's colour; a landmark
// is drawn as what it is; a touch on either goes there.
//
// Energy is the app's one bar (shared/energy.js), at the top; the sparks come
// from it. The bar is everything earned, so pouring takes nothing off it.
//
// Penny stands at the bottom edge, with Dot, and looks at what there is to do:
// a place that is lit, or one that could be.

import { play as sfx } from '/postmarks/sound.js';
import { load, save, recentRooms, roomUrl } from '/shared/identity.js';
import { BAR, ENERGY_KEY, held, read as readEnergy } from '/shared/energy.js';
import { go } from '/shared/nav.js';
import { roof, roomLook } from '/shared/place.js';
import { PLACES } from './places.js';
import { BEYOND, BEYOND_KEY, coloured, everywhere, portalOf, pour, stateOf, tidy } from './beyond.js';
import { LANDMARKS, LEFT, NIGHT, OFFICE_WAY, RIGHT, WIDE, extent, mailAbout, pieces, roomsShown, standing, startOf, step, streetsFor, takenBy } from './world.js';
import { notesHeard } from './mail.js';
import { hasFound } from './tags.js';
import { claim } from './pal.js';
import { ASK, THIS_WAY, TRILL, YES, hasDot, hasWalked, placeReached } from './penny.js';

const SEEN_KEY = 'map:at'; // what was last gone into from here, for this visit: the map opens on it again

// A landmark, drawn as what it is, seen from above. Each fills a box 100 by
// 100 (or as wide as it is in squares), and is coloured by map.css.
const ART = {
  // The Dead Letter Office: a long flat roof, a skylight, and its clock, the hand going at the pace of a real second hand.
  office: `<svg viewBox="0 0 250 150" aria-hidden="true"><rect class="slab" x="6" y="8" width="238" height="124" rx="20"/><rect class="well" x="18" y="20" width="214" height="100" rx="13"/>
    <rect class="pane" x="34" y="38" width="52" height="34" rx="7"/><rect class="pane" x="34" y="80" width="52" height="24" rx="7"/>
    <g class="chute"><rect x="176" y="34" width="40" height="72" rx="8"/><path d="M184 50h24M184 64h24M184 78h24M184 92h24"/></g>
    <circle class="dial" cx="125" cy="70" r="27"/><path class="ticks" d="M125 47v6M125 87v6M102 70h6M142 70h6"/><path class="hand" d="M125 70V50"/><circle class="pin" cx="125" cy="70" r="3"/>
    <rect class="doormat" x="107" y="134" width="36" height="12" rx="3"/></svg>`,
  // The gallery: a pale floor, a plinth in the middle of it, and the radio on the plinth.
  gallery: `<svg viewBox="0 0 150 150" aria-hidden="true"><rect class="slab" x="8" y="8" width="134" height="134" rx="18"/><rect class="floor" x="20" y="20" width="110" height="110" rx="10"/>
    <rect class="plinth" x="46" y="50" width="58" height="52" rx="6"/>
    <g class="set"><path d="M60 66l26-12"/><rect x="56" y="66" width="38" height="24" rx="5"/><circle cx="67" cy="78" r="5.2"/><path d="M78 74h10M78 82h10"/></g></svg>`,
  // The bandstand: a round stand, and the tiles of a loop on it.
  bandstand: `<svg viewBox="0 0 150 150" aria-hidden="true"><circle class="slab" cx="75" cy="75" r="66"/><circle class="floor" cx="75" cy="75" r="52"/>
    <g class="pads"><rect x="42" y="50" width="16" height="16" rx="4"/><rect x="62" y="50" width="16" height="16" rx="4"/><rect x="82" y="50" width="16" height="16" rx="4"/><rect x="52" y="70" width="16" height="16" rx="4"/><rect x="72" y="70" width="16" height="16" rx="4"/><rect x="92" y="70" width="16" height="16" rx="4"/><rect x="62" y="90" width="16" height="16" rx="4"/></g></svg>`,
  // The night: a square of dark, three stars with four points falling in a line, and two small round lights.
  night: `<svg viewBox="0 0 100 100" aria-hidden="true"><rect class="dark" x="6" y="6" width="88" height="88" rx="20"/>
    <g class="stars"><path d="M26 20l2.2 6.8L35 29l-6.8 2.2L26 38l-2.2-6.8L17 29l6.8-2.2z"/><path d="M46 38l3.2 9.8L59 51l-9.8 3.2L46 64l-3.2-9.8L33 51l9.8-3.2z"/><path d="M68 58l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><circle cx="66" cy="30" r="3"/><circle cx="24" cy="66" r="2.4"/></g></svg>`,
};
// A letter that is out and about: a small envelope with a face.
const LETTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="paper" x="3" y="5.5" width="18" height="13" rx="2.6"/><path class="flap" d="M3.8 6.8l8.2 3.6 8.2-3.6"/><circle class="eye" cx="8.8" cy="13.6" r="1.05"/><circle class="eye" cx="15.2" cy="13.6" r="1.05"/><path class="smile" d="M10.6 15.6q1.4 1.1 2.8 0"/></svg>';

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const $ = (id) => root.querySelector(`#${id}`);
  const main = root.querySelector('.far');
  const land = $('far-land');
  const map = root.querySelector('.far-map');
  const about = $('far-about');
  const places = $('far-places');
  const bar = $('far-energy');
  const feeling = $('far-feeling');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms));
  const say = (words) => { if (feeling.textContent !== words) feeling.textContent = words; };

  const first = hasWalked(); // the first five have been walked: the places beyond can open
  let progress = tidy(load(BEYOND_KEY));
  let energy = readEnergy(load(ENERGY_KEY));
  let busy = false;

  const pal = claim(life, { x: 0.7, height: 'peek', mood: 'calm', dot: hasDot() });

  // --- What each place is ---------------------------------------------------------
  const all = everywhere();
  const reached = first ? PLACES.length : Math.min(placeReached(), PLACES.length - 1);
  // One of the first five: walked if the walk has gone past it, lit if it is where the walk has got to.
  const stateHere = (place) => {
    if (typeof place.id === 'string') return stateOf(progress, place.id, first);
    return place.id < reached ? 'walked' : place.id === reached ? 'lit' : 'faint';
  };
  const NAMES = { walked: 'A place already walked', lit: 'A place open to walk', near: 'A place that wants energy', faint: 'A place not reached yet' };

  // Its squares take colour from the bottom row up: the way on is up.
  const order = (place) => place.regions.map((_, cell) => cell).sort((a, b) => Math.floor(b / place.n) - Math.floor(a / place.n) || (a % place.n) - (b % place.n));

  const made = new Map(); // id -> element
  for (const place of all) {
    // What can be pressed: any place the walk has reached, and the places
    // beyond once the first five are walked. (A place of one square is too
    // small to press: the walk's own tiles go back to it.)
    const further = typeof place.id === 'string';
    const pressed = place.n > 1 && (further ? first : place.id <= reached);
    const one = document.createElement(pressed ? 'button' : 'div');
    if (pressed) one.type = 'button';
    one.className = 'far-place';
    one.dataset.id = place.id;
    one.style.setProperty('--n', place.n);
    one.append(...place.regions.map((region, cell) => {
      const square = document.createElement('i');
      square.className = `cell d${region}${place.posts.includes(cell) ? ' post' : ''}`;
      return square;
    }), Object.assign(document.createElement('i'), { className: 'far-wants' }));
    made.set(place.id, one);
  }
  // the portal each walked place opened, and the one out of the office, where it all began
  const ways = all.map(() => Object.assign(document.createElement('i'), { className: 'far-way' }));
  const officeWay = Object.assign(document.createElement('i'), { className: 'far-way' });

  // --- What stands round them (penny/world.js) -----------------------------------------
  const rooms = roomsShown(recentRooms());
  const night = hasFound('night');
  const things = standing({ rooms, night });
  const range = extent(things);
  const sites = [...LANDMARKS, ...(night ? [NIGHT] : [])].map((site) => {
    const link = document.createElement('a');
    link.className = `far-site far-${site.id}`;
    link.href = site.to;
    link.dataset.id = site.id;
    link.setAttribute('aria-label', site.name);
    link.innerHTML = ART[site.id];
    return { ...site, el: link };
  });
  const buildings = rooms.map((room) => {
    const look = roomLook(room.id);
    const link = document.createElement('a');
    link.className = `far-site far-room r${look.colour}`;
    link.href = roomUrl(room.id);
    link.dataset.id = room.id;
    link.setAttribute('aria-label', room.name); // (its name is its own: said, not written, at this size)
    link.append(roof({ kind: look.kind, wide: 150, high: 100, bare: true }));
    return { ...room, el: link };
  });
  const found = pieces(notesHeard()).map((piece) => ({ ...piece, el: Object.assign(document.createElement('i'), { className: 'far-piece' }) }));
  // the mail that has been found: out, and going about
  const taken = takenBy(things);
  const letters = [];
  for (const one of mailAbout({ walkedFirst: reached, walkedBeyond: progress.walked })) {
    const streets = streetsFor(one, taken, range);
    const at = startOf(one, streets, letters.map((other) => other.at));
    if (!at) continue;
    const el = Object.assign(document.createElement('i'), { className: `cell d${one.colour} far-letter`, innerHTML: LETTER });
    letters.push({ ...one, streets, at, el });
  }
  about.replaceChildren(officeWay, ...ways, ...found.map((piece) => piece.el), ...letters.map((one) => one.el));
  places.replaceChildren(...buildings.map((one) => one.el), ...sites.map((one) => one.el), ...made.values());

  function paint() {
    const can = held(energy) > 0;
    all.forEach((place, i) => {
      const one = made.get(place.id);
      const state = stateHere(place);
      one.dataset.state = state;
      one.hidden = !first && typeof place.id === 'string'; // (until the first five are walked, nothing is known of what lies beyond)
      one.classList.toggle('can', state === 'near' && can);
      if (one.tagName === 'BUTTON') one.setAttribute('aria-label', NAMES[state]);
      else one.setAttribute('aria-hidden', 'true');
      const squares = [...one.querySelectorAll('.cell')];
      const lit = typeof place.id === 'string' ? coloured(progress, place.id) : 0;
      const turn = order(place);
      squares.forEach((square, cell) => {
        square.classList.toggle('held', state === 'walked' && square.classList.contains('post'));
        square.classList.toggle('on', state === 'near' && turn.indexOf(cell) < lit);
      });
      ways[i].hidden = state !== 'walked'; // the portal a walked place opened
    });
    const fill = (energy.earned % BAR) / BAR;
    bar.querySelector('.bar i').style.setProperty('--fill', String(fill));
    bar.classList.toggle('empty', fill === 0);
    bar.setAttribute('aria-label', `Energy ${held(energy)}`);
  }

  // --- Where everything lies ---------------------------------------------------------
  // The world is eleven squares wide, and keeps clear of the way back in the
  // top corner, which stays where it is as the page goes by: so a square is
  // as big as the window leaves room for, between two margins that wide.
  let pitch = 24;
  let x0 = 0; // where column 0 begins
  let y0 = 0; // the bottom edge of row 0
  const box = ([column, row], w = 1, h = 1) => ({ left: `${x0 + column * pitch}px`, top: `${y0 - (row + h) * pitch}px`, width: `${w * pitch}px`, height: `${h * pitch}px` });
  function lay() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // (--top and --bottom are lengths with calc() in them: measure them)
    const probe = Object.assign(document.createElement('i'), { style: 'position:absolute;visibility:hidden;height:var(--top);width:var(--bottom)' });
    land.append(probe);
    const above = probe.offsetHeight || 80;
    const below = probe.offsetWidth || 120;
    probe.remove();
    const wide = main.clientWidth;
    pitch = Math.max(rem * 1.39, Math.min(rem * 2.6, (wide - rem * 8) / WIDE));
    x0 = wide / 2 - ((LEFT + RIGHT + 1) / 2) * pitch;
    y0 = above + range.high * pitch;
    land.style.height = `${above + (range.high - range.low) * pitch + below}px`;
    main.style.setProperty('--pitch', `${pitch}px`);
    all.forEach((place, i) => {
      Object.assign(made.get(place.id).style, { ...box(place.at, place.n, place.n), height: '' });
      Object.assign(ways[i].style, box(portalOf(place)));
    });
    Object.assign(officeWay.style, box(OFFICE_WAY));
    for (const one of [...sites, ...buildings]) Object.assign(one.el.style, box(one.at, one.w, one.h));
    for (const piece of found) Object.assign(piece.el.style, box(piece.at));
    for (const one of letters) Object.assign(one.el.style, box(one.at));
    map.style.setProperty('--pitch', `${pitch}px`);
    map.style.setProperty('--map-x', `${((x0 % pitch) + pitch) % pitch}px`);
    map.style.setProperty('--map-y', `${((y0 % pitch) + pitch) % pitch}px`);
  }
  life.on(window, 'resize', lay);

  // The map opens on what was last gone into from here; or else on the
  // frontier: the first place that is lit, or could be.
  function arrive() {
    const last = sessionStorage.getItem(SEEN_KEY);
    const target = (last && places.querySelector(`[data-id="${CSS.escape(last)}"]`))
      || made.get((all.find((place) => stateHere(place) === 'lit') ?? all.find((place) => stateHere(place) === 'near') ?? all[Math.min(reached, PLACES.length - 1)]).id);
    const at = target.getBoundingClientRect();
    const room = window.innerHeight * 0.86; // (the middle of what shows above Penny)
    window.scrollTo(0, Math.max(0, at.top + window.scrollY + at.height / 2 - room / 2));
  }
  const leaveFor = (el) => {
    sessionStorage.setItem(SEEN_KEY, el.dataset.id);
    // the map comes up to meet you, there (map.css)
    const at = el.getBoundingClientRect();
    const frame = root.getBoundingClientRect();
    root.style.setProperty('--into-x', `${at.left + at.width / 2 - frame.left}px`);
    root.style.setProperty('--into-y', `${at.top + at.height / 2 - frame.top}px`);
  };

  // --- Energy, poured into a place -----------------------------------------------------
  async function give(place) {
    const one = made.get(place.id);
    const before = coloured(progress, place.id);
    const poured = pour(progress, energy, place.id, first);
    if (!poured.poured) {
      // nothing to give: it stirs, and Penny cannot help
      nothing(one);
      return;
    }
    busy = true;
    progress = poured.progress;
    energy = poured.energy;
    save(BEYOND_KEY, progress);
    save(ENERGY_KEY, energy);
    const after = coloured(progress, place.id);
    const lit = stateOf(progress, place.id, first) === 'lit';
    one.classList.remove('can');
    pal.mood('holding').look(one);
    say('Energy goes into the place');
    const squares = [...one.querySelectorAll('.cell')];
    const turn = order(place);
    const from = bar.querySelector('.bar i').getBoundingClientRect();
    const each = still ? 0 : Math.min(110, 1400 / Math.max(1, after - before));
    for (let n = before; n < after; n++) {
      const square = squares[turn[n]];
      spark({ x: from.right, y: from.top + from.height / 2 }, square, () => {
        square.classList.add('on', 'taking');
        if ((n - before) % 3 === 0) sfx('pick');
      });
      await wait(each);
      if (life.over) return;
    }
    await wait(still ? 0 : 560);
    if (life.over) return;
    if (lit) {
      one.classList.add('lighting');
      paint();
      sfx('post');
      pal.rise().mood('thrilled').look(one).gesture('jump').hearts(2);
      pal.sing(TRILL, 0.9);
      pal.gesture('hop', 'dot');
      say('The place is lit');
      await wait(still ? 0 : 1500);
      if (life.over) return;
      one.classList.remove('lighting');
      pal.settle('peek').mood('hopeful');
    } else {
      paint();
      pal.mood('hopeful').look(one).gesture('nod');
      pal.sing(YES, 0.6);
      say('The place has taken some energy, and wants more');
    }
    busy = false;
  }
  // A spark from the bar to a square.
  function spark(from, target, landed) {
    if (still) { landed(); return; }
    const to = target.getBoundingClientRect();
    const mote = Object.assign(document.createElement('i'), { className: 'far-spark' });
    document.body.append(mote);
    const dx = to.left + to.width / 2 - from.x;
    const dy = to.top + to.height / 2 - from.y;
    const flight = mote.animate([
      { transform: `translate(${from.x}px, ${from.y}px) scale(0.5) rotate(0deg)`, opacity: 0.2 },
      { transform: `translate(${from.x + dx * 0.5 - dy * 0.12}px, ${from.y + dy * 0.5 + dx * 0.12}px) scale(1.1) rotate(120deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${from.x + dx}px, ${from.y + dy}px) scale(0.6) rotate(240deg)`, opacity: 0.9 },
    ], { duration: 520, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' });
    const end = () => { mote.remove(); if (!life.over) landed(); };
    flight.finished.then(end, end);
    life.onEnd(() => mote.remove());
  }
  // A place that cannot be gone to, and nothing to be done about it just now.
  function nothing(one) {
    one.classList.remove('not-yet');
    void one.getBoundingClientRect();
    one.classList.add('not-yet');
    pal.mood('unsure').look(one);
    pal.sing(ASK, 0.4, { breath: 0 });
    life.setTimeout(() => { if (!busy) pal.mood('calm').look(null); }, 1400);
  }

  places.addEventListener('click', (event) => {
    const site = event.target.closest?.('a.far-site');
    if (site) { // (the link itself does the going: shared/nav.js)
      leaveFor(site);
      return;
    }
    const one = event.target.closest?.('button.far-place');
    if (!one || busy) return;
    const place = all.find((each) => String(each.id) === one.dataset.id);
    const state = stateHere(place);
    if (state === 'lit' || state === 'walked') {
      leaveFor(one);
      pal.mood('thrilled').look(one).gesture('hop');
      go(`/?walk&at=${place.id}`);
    } else if (state === 'near') {
      give(place);
    } else {
      say('Not yet');
      nothing(one);
    }
  });

  // --- The mail that is out, going about ---------------------------------------------
  // Each takes a step now and then, to a free square beside it, and takes its
  // time over it: they are in no hurry. (With less motion asked for they
  // stand where they are.)
  if (!still) {
    life.setInterval(() => {
      if (document.visibilityState !== 'visible' || !letters.length) return;
      const one = letters[Math.floor(Math.random() * letters.length)];
      const next = step(one.at, one.streets, letters.filter((other) => other !== one).map((other) => other.at), Math.random());
      if (next === one.at) return;
      one.el.classList.toggle('left', next[0] < one.at[0]);
      one.at = next;
      Object.assign(one.el.style, box(next));
      one.el.classList.remove('going');
      void one.el.getBoundingClientRect();
      one.el.classList.add('going');
    }, 900);
  }

  // --- Penny, looking at what there is to do --------------------------------------------
  const wanted = () => {
    const open = all.find((place) => stateHere(place) === 'lit');
    if (open) return { place: open, why: 'lit' };
    const near = held(energy) > 0 ? all.find((place) => stateHere(place) === 'near') : null;
    return near ? { place: near, why: 'near' } : null;
  };
  let alone = 0;
  life.on(window, 'pointerdown', () => { alone = 0; });
  life.on(window, 'scroll', () => { alone = 0; }, { passive: true });
  life.setInterval(() => {
    if (busy || document.visibilityState !== 'visible') return;
    alone += 1;
    const want = wanted();
    if (!want) return;
    if (alone === 2 || (alone > 2 && alone % 14 === 0 && alone < 60)) {
      const one = made.get(want.place.id);
      pal.mood('hopeful').look(one);
      if (alone === 2) pal.sing(want.why === 'lit' ? THIS_WAY : ASK, 0.6);
      life.setTimeout(() => { if (!busy) pal.look(null); }, 2400);
    }
  }, 1000);
  pal.onTap(() => {
    pal.gesture('hop');
    const want = wanted();
    if (!want) return;
    // it shows you where: the map goes there
    const one = made.get(want.place.id);
    pal.mood('hopeful').look(one);
    one.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');

  paint();
  lay();
  arrive();
  life.setTimeout(() => { lay(); }, 400); // once whatever else has settled
  say(BEYOND.some((id) => stateOf(progress, id, first) === 'lit') ? 'There is a place open to walk' : '');
}
