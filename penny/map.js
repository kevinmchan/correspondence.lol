// The map from higher up (/?map): where the walk has been, and where it can
// go on.
//
// The walk (penny/walk.js) shows one place at a time, close to. This is the
// same map from further off, so that more than one place can be seen at once:
// the first five, lying where they were walked, and above them the places
// beyond (penny/beyond.js), which are a network and not a line. The way on is
// still up the screen. What is shown is the frontier, whole: the last of the
// first five and the places beyond it. The places before lie below, mostly
// under the edge Penny stands at, as they do in the walk; they are walked
// again from the fifth, by the walk's own two tiles. (The map does not move
// yet. When there is more of it than one screen holds, it will have to.)
//
// Nothing here is told. A place says what it is by its form (map.css):
//
//   walked   flat and pale, its posts in colour. A touch walks it again.
//   lit      standing up off the map, in colour, breathing. A touch goes there.
//   near     the way to it is open, but it is not lit: grey, with as many of
//            its squares in colour as it has been given energy for. While
//            there is energy to give, a spark rests on it; a touch pours in
//            what is held, the squares take colour one after another, and
//            when the last has, it is lit.
//   faint    the way to it is not open. A touch stirs it, no more.
//
// Energy is the app's one bar (shared/energy.js), at the top; the sparks come
// from it. The bar is everything earned, so pouring takes nothing off it.
//
// Penny stands at the bottom edge, with Dot, and looks at what there is to do:
// a place that is lit, or one that could be.

import { play as sfx } from '/postmarks/sound.js';
import { load, save } from '/shared/identity.js';
import { BAR, ENERGY_KEY, held, read as readEnergy } from '/shared/energy.js';
import { go } from '/shared/nav.js';
import { PLACES } from './places.js';
import { BEYOND, BEYOND_KEY, coloured, everywhere, portalOf, pour, stateOf, tidy } from './beyond.js';
import { claim } from './pal.js';
import { ASK, THIS_WAY, TRILL, YES, hasDot, hasWalked, placeReached } from './penny.js';

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const $ = (id) => root.querySelector(`#${id}`);
  const main = root.querySelector('.far');
  const ground = $('far-ground');
  const map = root.querySelector('.far-map');
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

  const pal = claim(life, { x: 0.5, height: 'face', mood: 'calm', dot: hasDot() });

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
    // What can be pressed is what is shown whole: the places beyond and the
    // fifth, once the first five have been walked; before that, those of the
    // five that have been reached. (A place of one square is too small to
    // press: the walk's own tiles go back to it.)
    const further = typeof place.id === 'string';
    const pressed = place.n > 1 && (first ? further || place.id === PLACES.length - 1 : !further && place.id <= reached);
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
  const ways = all.map((place) => Object.assign(document.createElement('i'), { className: 'far-way' }));
  places.replaceChildren(...ways, ...made.values());

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
  // The frontier is what the map opens on: the last of the first five and the
  // places beyond it; or, before the first five have been walked, those five.
  const frontier = () => (first ? all.filter((place) => typeof place.id === 'string' || place.id === PLACES.length - 1) : all.filter((place) => typeof place.id !== 'string'));
  const span = (list) => ({
    left: Math.min(...list.map((place) => place.at[0])),
    right: Math.max(...list.map((place) => place.at[0] + place.n)),
    low: Math.min(...list.map((place) => place.at[1])),
    high: Math.max(...list.map((place) => place.at[1] + place.n + 1)), // (and the square above it, where its portal opens)
  });
  function lay() {
    const style = getComputedStyle(ground);
    const top = parseFloat(style.getPropertyValue('--top')) || 80;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // (--top and --bottom are lengths with calc() in them: measure them)
    const probe = Object.assign(document.createElement('i'), { style: 'position:absolute;visibility:hidden;height:var(--top);width:var(--bottom)' });
    ground.append(probe);
    const above = probe.offsetHeight || top;
    const below = probe.offsetWidth || 120;
    probe.remove();
    const wide = ground.clientWidth;
    const high = ground.clientHeight;
    const seen = span(frontier());
    // as big as shows the whole frontier, between the bar and Penny; never so small a place cannot be pressed
    const pitch = Math.max(rem * 0.9, Math.min(rem * 2.4, (wide - rem * 1.5) / (seen.right - seen.left), (high - above - below) / (seen.high - seen.low)));
    const x0 = wide / 2 - ((seen.left + seen.right) / 2) * pitch; // where column 0 begins
    // the frontier in the middle of the room between the bar and Penny (y0: the bottom edge of row 0)
    const y0 = above + (high - above - below) / 2 + ((seen.low + seen.high) / 2) * pitch;
    main.style.setProperty('--pitch', `${pitch}px`);
    all.forEach((place, i) => {
      const one = made.get(place.id);
      one.style.left = `${x0 + place.at[0] * pitch}px`;
      one.style.top = `${y0 - (place.at[1] + place.n) * pitch}px`;
      one.style.width = `${place.n * pitch}px`;
      const [column, row] = portalOf(place);
      Object.assign(ways[i].style, { left: `${x0 + column * pitch}px`, top: `${y0 - (row + 1) * pitch}px`, width: `${pitch}px`, height: `${pitch}px` });
    });
    map.style.setProperty('--pitch', `${pitch}px`);
    map.style.setProperty('--map-x', `${((x0 % pitch) + pitch) % pitch}px`);
    map.style.setProperty('--map-y', `${((y0 % pitch) + pitch) % pitch}px`);
    map.style.setProperty('--lit-x', `${x0 + ((seen.left + seen.right) / 2) * pitch}px`);
    map.style.setProperty('--lit-y', `${y0 - ((seen.low + seen.high) / 2) * pitch}px`);
  }
  life.on(window, 'resize', lay);

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
      pal.height('up').mood('thrilled').look(one).gesture('jump').hearts(2);
      pal.sing(TRILL, 0.9);
      pal.gesture('hop', 'dot');
      say('The place is lit');
      await wait(still ? 0 : 1500);
      if (life.over) return;
      one.classList.remove('lighting');
      pal.height('face').mood('hopeful');
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
    const one = event.target.closest?.('button.far-place');
    if (!one || busy) return;
    const place = all.find((each) => String(each.id) === one.dataset.id);
    const state = stateHere(place);
    if (state === 'lit' || state === 'walked') {
      // the map comes up to meet you, there (map.css)
      const at = one.getBoundingClientRect();
      const frame = root.getBoundingClientRect();
      root.style.setProperty('--into-x', `${at.left + at.width / 2 - frame.left}px`);
      root.style.setProperty('--into-y', `${at.top + at.height / 2 - frame.top}px`);
      pal.mood('thrilled').look(one).gesture('hop');
      go(`/?walk&at=${place.id}`);
    } else if (state === 'near') {
      give(place);
    } else {
      say('Not yet');
      nothing(one);
    }
  });

  // --- Penny, looking at what there is to do --------------------------------------------
  const wanted = () => {
    const open = all.find((place) => stateHere(place) === 'lit');
    if (open) return { place: open, why: 'lit' };
    const near = held(energy) > 0 ? all.find((place) => stateHere(place) === 'near') : null;
    return near ? { place: near, why: 'near' } : null;
  };
  let alone = 0;
  life.on(window, 'pointerdown', () => { alone = 0; });
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
    if (want) pal.mood('hopeful').look(made.get(want.place.id));
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');

  paint();
  lay();
  life.setTimeout(lay, 400); // once whatever else has settled
  say(BEYOND.some((id) => stateOf(progress, id, first) === 'lit') ? 'There is a place open to walk' : '');
}
