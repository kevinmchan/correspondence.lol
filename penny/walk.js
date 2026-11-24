// Walking the map with Penny (/?walk): the first quarter of the adventure.
//
// The screen is the map, seen from far above: a few districts lit, the rest
// faint all round, the places already walked lying flat below. Penny is not
// on the map. Penny stands at the bottom edge with you (penny/pal.js), as big
// as life, and the two of you look at the map together. Penny is searching it
// for a sound: every post has a sound inside, and one of them is the one
// Penny is after (penny/mail.js). The way on is always up the map.
//
// Nothing here is told, and no gesture is shown to be copied: no ring, no
// arrow, no rhythm in a hum. You play, on five places, all by the game's own
// rules, each there to show one thing, and Penny is beside you while you do.
// Penny does not know where the posts are. All Penny can give you is how it
// feels about the square your finger is on, and that comes from its head and
// its ear and nothing else (penny/places.js):
//
//   What Penny knows, it knows at once: a shake of the head and a glance at
//   the post that says no, or a yes it is sure of.
//   What Penny can only hear takes a moment: eyes shut, listening, and then
//   the post is right here, or close by on that side, or far off, or Penny
//   cannot tell, and says so.
//
// The difference between the two is how a rule gets learnt: the squares Penny
// used to have to listen at, it now simply knows. So that difference is put
// where the eyes are, on the squares, and the two look nothing alike: what is
// heard is an amber warmth under your finger; what is known is Penny's own
// red seal, stamped on a square nobody touched, the moment a rule settles it.
// And while Penny listens to what was inside a post, the map goes dim, so
// that for once the thing to look at is Penny.
//
// The hand has three things it can do, the same three as in the game. A
// double tap opens a square. From the second place on, a quick tap crosses
// one out, and takes the cross off again. And a finger held on a square, or
// slid across the map, asks Penny to listen there. (In the first place, which
// is one square, a tap leaves it ajar for as long as a second would count, and
// if Penny thinks there is a post in it, Penny holds its breath that long.)
//
// Penny cannot take a cross off. A cross over a post it has heard, or is sure
// of, frightens it; one that leaves a colour with nowhere troubles it. In the
// last place Penny hears nothing, a slide makes crosses too, and there your
// crosses are Penny's memory: one it can see the reason for gets a nod, one
// it cannot gets its doubt.
//
// Left alone, Penny does not point. If the rules have made a square certain
// its eyes find the square, and later it goes and stands underneath.
// Otherwise it waits for your finger; and now and then a loud post stirs of
// its own accord.
//
// Penny feels all of this hard, and it shows on the map as well as on Penny,
// in proportion to what has happened between the two of you. A post found is
// the big thing: the map floods with light. A cross is a small thing: Penny
// watches, or nods if it can see why. A guess that finds nothing drains the
// colour for a moment. And every sound ends. A post is heard once; a piece of the
// sound Penny is after is over almost as it begins, and Penny holds on to it
// a moment longer than it lasts. One day passes over the five places, early
// in the first and evening by the last, and it only goes one way.
//
// The last post of the last place has no sound in it. It has Dot. (The
// places can be walked again, and then Dot is there from the start and that
// post is somebody's ordinary mail: Dot is found once.)

import { audio, isMuted, play as sfx, noise } from '/postmarks/sound.js';
import { go } from '/shared/nav.js';
import { PLACES, groupsOf, hear, mailIn, read, ruledOut, vouch } from './places.js';
import { claim } from './pal.js';
import { heard, murmur, playMail, remembered, soundSoFar } from './mail.js';
import {
  ALARM, ASK, FAR, GASP, HELLO, LET_GO, LONGING, MM, NEAR, NO_NO, OOPS, RELIEF, SAG, THIS_WAY, TRILL, WONDER, YES,
  hasDot, hasWalked, placeReached, setDot, setPlaceReached, setWalked,
} from './penny.js';

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
// Where each place lies on the map: the [column, row] of its bottom-left
// square, rows counting up. Each starts one square beyond the last one's
// portal, so the walk runs up the map and what has been walked stays below.
const AT = [[1, 0], [0, 2], [1, 7], [-1, 12], [0, 17]];
// How long it waits, left alone, before its eyes go to a square the rules
// have made certain; and before a loud post stirs. Seconds, a place each.
const PATIENCE = [3, 3, 3, 5, 7];
const STIRS = [6, 9, 14, 20, 0];

export function mount(root, life) {
  document.title = 'correspondence.lol';
  const $ = (id) => root.querySelector(`#${id}`);
  const main = root.querySelector('.walk');
  const board = $('walk-board');
  const known = $('walk-known');
  const trail = $('walk-trail');
  const portal = $('walk-portal');
  const down = $('walk-down');
  const up = $('walk-up');
  const feeling = $('walk-feeling');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((done) => life.setTimeout(done, ms));
  // On a phone held sideways there is no room under the map: it stands at its right-hand end instead.
  const sideways = matchMedia('(max-height: 30rem) and (orientation: landscape)');
  const spot = () => (sideways.matches ? 0.88 : 0.5);
  // What it feels colours the map (pal.js). Dot is beside it only once found.
  const pal = claim(life, { x: spot(), height: 'face', mood: 'calm', colours: true, dot: hasDot() });
  // Standing under a thing and looking up at it; sideways, only looking.
  const show = (target) => (sideways.matches ? pal.look(target) : pal.pointAt(target));

  // --- The place ------------------------------------------------------------------
  // Where to begin: at the furthest place reached; or, once all of them have
  // been walked, at the first again. Any place already reached can be gone
  // back to, and come on from, by the two tiles in the bottom corners.
  const furthest = () => Math.max(0, Math.min(placeReached(), PLACES.length - 1));
  let index = hasWalked() ? 0 : furthest();
  let place = null;
  let cells = []; // 'empty' | 'cross' | 'letter'
  let found = []; // the squares whose posts are open, in the order they were found
  let misses = new Set(); // squares guessed at and found empty: they keep a cross
  let byHand = new Set(); // the crosses made by a finger (the last place)
  let good = new Set(); // those of them it can vouch for
  let squares = []; // what it knows of each square (places.js read())
  let hoped = []; // squares that would be certain if every cross of yours were right
  let stuck = []; // groups your crosses have left with nowhere
  let positive = new Set(); // squares where it has heard a post right under the finger
  let done = false;
  let busy = false; // a post is being opened and listened to: the map waits
  const setBusy = (now) => {
    busy = now;
    board.classList.toggle('busy', now); // (as the game's own board is marked while a move is on its way)
  };

  const tile = (cell) => board.children[cell];
  const sureOnes = () => squares.map((square, cell) => (square.is === 'sure' ? cell : -1)).filter((cell) => cell >= 0);
  // What it now knows: from the posts found, the guesses that found nothing,
  // and (the last place) whichever of your crosses it can see the reason for.
  function know() {
    life.setTimeout(seals, 0); // (after whatever called this has finished drawing)
    good = place.crosses ? vouch(place, found, [...misses], [...byHand]) : new Set();
    squares = read(place, found, [...misses, ...good]);
    const trusting = place.crosses ? read(place, found, [...misses, ...byHand]) : squares;
    hoped = trusting.map((square, cell) => (square.is === 'sure' && squares[cell].is !== 'sure' ? cell : -1)).filter((cell) => cell >= 0);
    stuck = trusting.stuck;
  }

  function paint(cell, fx, delay = 0, taught = false) {
    const button = tile(cell);
    const state = cells[cell];
    const n = place.n;
    button.dataset.state = state;
    button.innerHTML = state === 'letter' ? ENVELOPE : state === 'cross' ? '×' : '';
    button.setAttribute('aria-label', `row ${Math.floor(cell / n) + 1}, column ${(cell % n) + 1}, ${state === 'letter' ? 'post found' : state === 'cross' ? 'crossed out' : 'empty'}`);
    button.classList.remove('known', 'asking', 'heard', 'here', 'cold', 'fx-post', 'fx-cross', 'fx-clear', 'fx-miss', 'fx-knock', 'teach', 'why', 'ajar', 'stir', 'starve', 'ringing', 'sought');
    if (!fx && !taught) return;
    void button.getBoundingClientRect();
    button.style.setProperty('--d', `${delay}ms`);
    if (fx) button.classList.add(fx);
    if (taught) button.classList.add('teach');
  }
  const flash = (element, name) => {
    element.classList.remove(name);
    void element.getBoundingClientRect();
    element.classList.add(name);
  };
  // For screen readers only: what it feels, in a line.
  const say = (words) => { if (feeling.textContent !== words) feeling.textContent = words; };

  // Line the faint map up with the lit squares; put the portal's square on it,
  // one above the place; and lay out the places already walked, below.
  function lay() {
    const first = tile(0);
    if (!first) return;
    const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
    const side = first.offsetWidth;
    const pitch = side + gap;
    const left = board.offsetLeft;
    const top = board.offsetTop;
    main.style.setProperty('--pitch', `${pitch}px`);
    main.style.setProperty('--map-x', `${left - gap / 2}px`);
    main.style.setProperty('--map-y', `${top - gap / 2}px`);
    main.style.setProperty('--lit-x', `${left + board.offsetWidth / 2}px`);
    main.style.setProperty('--lit-y', `${top + board.offsetHeight / 2}px`);
    portal.style.width = `${side}px`;
    portal.style.left = `${left + Math.floor((place.n - 1) / 2) * pitch}px`;
    portal.style.top = `${top - pitch}px`;
    const [here, base] = AT[index];
    const tiles = [];
    PLACES.slice(0, index).forEach((walked, i) => {
      walked.regions.forEach((region, cell) => {
        const column = AT[i][0] + (cell % walked.n);
        const row = AT[i][1] + (walked.n - 1 - Math.floor(cell / walked.n)); // counting up the map
        const square = document.createElement('i');
        square.className = `cell d${region}${walked.posts.includes(cell) ? ' held' : ''}`;
        square.style.width = square.style.height = `${side}px`;
        square.style.left = `${left + (column - here) * pitch}px`;
        square.style.top = `${top + (place.n - 1 - (row - base)) * pitch}px`;
        tiles.push(square);
      });
    });
    known.replaceChildren(...tiles);
  }
  life.on(window, 'resize', lay);
  // turned on its side, or back: Penny goes to where there is room
  life.on(sideways, 'change', () => {
    pal.goTo(spot());
    lay();
  });

  // The sound so far, at the top of the map: a mark a note, set as high as the
  // note is, and a fading tail for what has not been heard yet. Pressing it
  // plays what it has of it, and it listens.
  function showTrail() {
    const notes = soundSoFar();
    trail.replaceChildren(...notes.map((note) => {
      const mark = document.createElement('i');
      mark.style.setProperty('--h', note.height);
      mark.style.setProperty('--w', note.dur);
      return mark;
    }), ...[0, 1, 2].map(() => Object.assign(document.createElement('i'), { className: 'more' })));
    trail.hidden = notes.length === 0;
  }
  trail.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    pal.mood('listening').look(trail);
    const marks = [...trail.querySelectorAll('i:not(.more)')];
    let n = 0;
    await playMail(life, remembered(), () => { // (always further off than it was when it was heard)
      const mark = marks[n++];
      if (mark) flash(mark, 'lit');
    });
    setBusy(false);
    pal.mood('hopeful').look(null);
    touched();
  });

  function start(at) {
    index = at;
    setPlaceReached(Math.max(furthest(), index));
    down.hidden = index === 0; // a tile that would lead nowhere is not shown
    up.hidden = index >= furthest();
    place = PLACES[index];
    cells = place.regions.map(() => 'empty');
    found = [];
    misses = new Set();
    byHand = new Set();
    positive = new Set();
    for (const timer of sealing.values()) clearTimeout(timer);
    sealed = new Set();
    sealing = new Map();
    done = false;
    setBusy(false);
    lone = 0;
    asked = { times: 0 };
    sung = new Map();
    crossedYet = false;
    uneasy = false;
    wondered = false;
    stirs = 0;
    lastTouched = null;
    know();
    board.classList.remove('won');
    board.style.setProperty('--n', place.n);
    board.replaceChildren(...place.regions.map((region, cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cell d${region}`;
      button.dataset.cell = cell;
      return button;
    }));
    cells.forEach((_, cell) => paint(cell));
    portal.hidden = true;
    portal.classList.toggle('last', index === PLACES.length - 1);
    showTrail();
    lay();
    say('');
    // it looks the new place over, then at you
    main.classList.remove('hush');
    main.dataset.hour = index; // each place is later in the one day (walk.css)
    pal.height('face').goTo(spot()).mood('curious').look(board);
    pal.gesture('hop');
    pal.sing(index === 0 ? HELLO : ASK, 0.8);
    life.setTimeout(() => { if (lastTouched === null && !busy) pal.mood('calm').look(null); }, 1400);
    touched();
  }

  // --- Its voice, kept from wearing thin -------------------------------------------------
  // A feeling that keeps coming loses its hum: the third time inside six
  // seconds it is only seen.
  let sung = new Map();
  function hum(phrase, level, kind = phrase) {
    const now = performance.now();
    const times = (sung.get(kind) ?? []).filter((at) => now - at < 6000);
    sung.set(kind, [...times, now]);
    if (times.length >= 2) return Promise.resolve();
    return pal.sing(phrase, level, { breath: 0 });
  }
  // Up for a big feeling, then back down to where it waits.
  let lowering = null;
  function rise(ms = 1700) {
    pal.height('up');
    clearTimeout(lowering);
    lowering = life.setTimeout(() => { if (!busy || done) pal.height('face'); }, ms);
  }

  // --- What Penny knows, on the map ---------------------------------------------------
  // This is what the places are for. There are two ways Penny can come to
  // think a post is in a square, and they are made to look nothing alike.
  //
  //   Heard: your finger has to be there. The square waits, then warms: an
  //   amber glow, soft, stronger the closer the sound is (warm(), below).
  //   Known: nobody has to touch anything. The moment a rule leaves a colour,
  //   a row or a column with one square, Penny stamps that square with its
  //   own seal: red, crisp, and at once.
  //
  // So when a post is opened and its crosses spread, and then a seal lands on
  // a square nobody touched, that is the rule, seen. In the first places the
  // seal lands straight away; later it holds back a while, to leave the
  // working out to you.
  const SEAL_AFTER = [0, 700, 1200, 2600, 4200];
  let sealed = new Set(); // squares that have Penny's seal on them
  let sealing = new Map(); // and those about to: square -> timer
  function seals() {
    const sure = new Set(done ? [] : sureOnes());
    for (const cell of [...sealed]) {
      if (sure.has(cell) && cells[cell] !== 'letter') tile(cell)?.classList.add('known'); // (a cross of yours may have wiped it)
      else {
        sealed.delete(cell);
        tile(cell)?.classList.remove('known');
      }
    }
    for (const [cell, timer] of [...sealing]) {
      if (sure.has(cell)) continue;
      clearTimeout(timer);
      sealing.delete(cell);
    }
    for (const cell of sure) {
      if (sealed.has(cell) || sealing.has(cell)) continue;
      sealing.set(cell, life.setTimeout(() => {
        sealing.delete(cell);
        if (done || squares[cell]?.is !== 'sure') return;
        if (busy) { seals(); return; } // not across a post being opened: straight after
        sealed.add(cell);
        flash(tile(cell), 'known');
        if (touching === null) {
          // Penny, certain: no listening, no warmth. It simply knows
          rise(1600);
          pal.mood('sure').look(tile(cell)).gesture('hop');
          hum(YES, 0.75, 'knows');
        }
        say('Penny knows there is a post in one square: the rules leave nowhere else');
      }, (found.length ? SEAL_AFTER[index] : 200) + 500)); // (what is certain before anything is found is marked at once: it is where to begin)
    }
  }

  // --- A finger on a square: places with an ear -----------------------------------------
  let listening = null;
  let asked = { times: 0 }; // how often it has had to say it cannot tell, here
  // `pressed` is false for a pointer or the keyboard's focus only resting on
  // the square: then it feels the same, without a sound.
  // What Penny hears is shown on the square itself as well as on Penny, since
  // the square under the finger is where anyone is looking: its warmth falls
  // on it, a faint edge for something far off, a glow for something close, a
  // beating light for a post right there, and a moment's greying for nothing.
  // It is only ever the square that was touched, and it fades, except "right
  // here", which stays until the post is opened.
  const cooling = new Map();
  function warm(cell, heat) {
    const button = tile(cell);
    if (!button) return;
    clearTimeout(cooling.get(cell));
    button.classList.remove('asking', 'heard', 'here', 'cold');
    if (heat === null) return;
    if (heat === 0) {
      flash(button, 'cold');
      return;
    }
    button.style.setProperty('--heat', heat);
    button.classList.add('heard');
    button.classList.toggle('here', heat === 1);
    if (heat < 1) cooling.set(cell, life.setTimeout(() => button.classList.remove('heard'), 3200));
  }
  // `quick`: a finger sliding across the map gets its answers sooner.
  function ask(cell, pressed = true, quick = false) {
    if (done || busy) return;
    clearTimeout(listening);
    for (const button of board.querySelectorAll('.asking')) button.classList.remove('asking');
    pal.look(tile(cell));
    const state = cells[cell];
    const mine = squares[cell];
    if (state === 'letter') {
      pal.mood('glad');
      say('');
      return;
    }
    if (mine.is === 'out') {
      no(mine, pressed);
      return;
    }
    if (mine.is === 'sure') {
      // it knows, at once: the seal, not the glow
      if (sealed.has(cell)) flash(tile(cell), 'known');
      pal.mood('sure');
      if (pressed) {
        pal.gesture('nod');
        hum(YES, 0.7, `yes ${cell}`);
      }
      say('Penny is sure of this one');
      return;
    }
    if (mine.is === 'room') {
      // (the last place, a pointer resting) it can see it would leave something with nowhere
      pal.mood('no');
      say('Penny does not think so');
      return;
    }
    if (!place.listen) {
      cannotTell(pressed);
      return;
    }
    if (positive.has(cell)) {
      here(pressed, cell);
      return;
    }
    // otherwise it has to listen: eyes shut, quite still, and the square waits with it
    pal.mood('listening');
    tile(cell).classList.add('asking');
    say('Penny is listening');
    listening = life.setTimeout(() => {
      const { strength, side } = hear(place, found, cell);
      if (strength === 1) {
        positive.add(cell);
        here(pressed, cell);
      } else if (strength > 0.4) {
        // close: it comes right up, and leans the way the sound lies
        warm(cell, 0.6);
        rise(1500);
        pal.mood('hopeful').lean(side).glow(0.7).gesture('hop');
        if (pressed) hum(NEAR, 0.7, 'near');
        say(side < 0 ? 'Penny hears something close, to the left' : side > 0 ? 'Penny hears something close, to the right' : 'Penny hears something close');
      } else if (strength > 0) {
        warm(cell, 0.25);
        pal.mood('curious').lean(side).glow(0.35).gesture('nod');
        if (pressed) hum(FAR, 0.55, 'far');
        say('Penny hears something far off');
      } else {
        warm(cell, 0);
        cannotTell(pressed);
      }
    }, quick ? 140 : 80 + place.listen);
  }
  function here(pressed, cell = lastTouched) {
    if (cell !== null) warm(cell, 1);
    rise(2200);
    pal.mood('warm').glow(1);
    if (pressed) {
      pal.gesture('jump');
      hum(GASP, 0.95, 'here');
    }
    say('Penny hears something right here');
  }
  // It does not know, and says so: to you, not to the map. It is not a no.
  function cannotTell(pressed) {
    pal.mood('unsure').look(null).glow(0.1);
    if (pressed && asked.times < 2) {
      asked.times += 1;
      pal.sing(ASK, 0.45, { breath: 0 });
    }
    say('Penny cannot tell');
  }
  // The rules say no. A shake of the head, and a glance at the post that says so.
  function no(mine, pressed) {
    pal.mood('no');
    say('Penny shakes its head');
    if (!pressed) return;
    pal.gesture('shake');
    hum(NO_NO, 0.5, 'no');
    if (mine.post === undefined) return; // a square already guessed at: nothing to look at
    const why = tile(mine.post);
    flash(why, 'why');
    life.setTimeout(() => { if (!busy) pal.look(why); }, 380);
  }

  // --- The double tap ------------------------------------------------------------------
  // One tap leaves the square ajar for as long as a second would count. If
  // it thinks there is a post in it, it holds its breath for exactly that
  // long, then lets it go. In the first place the wait gets longer with every
  // tap left alone, and after six the square simply stays ajar.
  let lone = 0;
  let closing = null;
  let ajar = null;
  const twice = () => (index === 0 ? (lone >= 6 ? Infinity : Math.min(950, place.twice + lone * 150)) : place.twice);
  function leaveAjar(cell) {
    shut();
    const forHowLong = twice();
    ajar = cell;
    tile(cell).classList.add('ajar');
    const thinksSo = positive.has(cell) || squares[cell].is === 'sure';
    if (thinksSo) {
      pal.mood('holding').look(tile(cell)).glow(0.5).glow(1, Math.min(forHowLong, 950));
      say('Penny is holding its breath');
    }
    if (forHowLong === Infinity) return;
    closing = life.setTimeout(() => {
      tile(cell)?.classList.remove('ajar');
      ajar = null;
      lone += 1;
      if (!thinksSo || busy || done) return;
      // nothing came: it lets it go, and looks at you
      pal.mood('hopeful').look(null).gesture('sink').glow(0.2, 250);
      hum(LET_GO, 0.3, 'let go');
      say('');
    }, forHowLong);
  }
  function shut() {
    clearTimeout(closing);
    if (ajar !== null) tile(ajar)?.classList.remove('ajar');
    ajar = null;
  }

  // --- Opening a post -----------------------------------------------------------------
  function ripple(cell) {
    if (still) return;
    const button = tile(cell);
    const wave = document.createElement('i');
    wave.className = 'ripple';
    wave.style.left = `${button.offsetLeft + button.offsetWidth / 2}px`;
    wave.style.top = `${button.offsetTop + button.offsetHeight / 2}px`;
    wave.style.setProperty('--reach', `${board.offsetWidth * 2.4}px`);
    board.append(wave);
    life.setTimeout(() => wave.remove(), 1200);
  }
  // A sound coming out of a post, to be seen as well as heard: the square
  // rings once for each note (gold for the sound it is after).
  function ring(cell, sought) {
    const button = tile(cell);
    button.classList.remove('ringing', 'sought');
    void button.getBoundingClientRect();
    button.classList.add('ringing');
    button.classList.toggle('sought', sought);
  }
  let wondered = false;

  // The last post of the last of these places has no sound in it. It has Dot:
  // a stamp, map-small, who looks out, and then comes across to stand beside
  // it. This is the quarter of the way: from here on it is not alone.
  async function findDot(cell) {
    rise(11000); // (up before Dot's place on the map is measured from where Penny stands, not during)
    pal.mood('holding').look(tile(cell));
    await wait(420);
    pal.mood('listening');
    say('Penny listens. Nothing comes out');
    await wait(1300);
    pal.mood('curious').look(tile(cell));
    await wait(500);
    const arriving = pal.arrive(tile(cell).getBoundingClientRect(), 1500);
    ring(cell, false);
    pal.mood('surprised').gesture('start');
    say('There is someone in this one: a stamp, looking out');
    life.setTimeout(() => { sfx('squeak'); pal.gesture('hop', 'dot'); }, 350);
    life.setTimeout(() => { sfx('squeak'); pal.gesture('hop', 'dot'); }, 1000);
    await arriving;
    if (life.over) return;
    setDot();
    sfx('squeak');
    pal.gesture('hop', 'dot').look(pal.dot).look(pal.penny, 'dot');
    await wait(700);
    // and it is beside itself
    pal.mood('thrilled').gesture('jump').hearts(3);
    say('Penny has found a friend');
    pal.sing(TRILL, 1);
    await wait(650);
    pal.gesture('jump', 'dot').hearts(1, 'dot');
    await wait(800);
    pal.gesture('jump');
    await pal.sing(TRILL, 1);
    pal.mood('glad').look(null).look(null, 'dot');
    await wait(500);
  }

  // Opening a square. Should anything in the long business that follows go
  // wrong, the map is not left waiting for ever: it is handed back, and if
  // that was the last post the way on still opens.
  const open = (cell) => opening(cell).catch((error) => {
    console.error(error);
    if (life.over) return;
    main.classList.remove('hush');
    setBusy(false);
    pal.height('face').mood('calm').look(null);
    if (!done) return;
    board.classList.add('won');
    portal.hidden = false;
    lay();
  });
  async function opening(cell) {
    if (done || busy || cells[cell] === 'letter') return;
    clearTimeout(listening);
    clearTimeout(judging);
    shut();
    touched();
    const mine = squares[cell];
    const thoughtSo = positive.has(cell) || mine.is === 'sure';
    const hadHoped = hoped.includes(cell);
    pal.look(tile(cell));

    if (!place.posts.includes(cell)) {
      // Nothing there. The square keeps a cross: that much is known now. It
      // costs nothing, and whatever it feels is about the square, not you.
      misses.add(cell);
      byHand.delete(cell);
      cells[cell] = 'cross';
      paint(cell, 'fx-miss');
      know();
      if (!frightened().length && !stuck.length) uneasy = false;
      if (mine.is === 'out' && mine.post !== undefined) {
        // it did think not: kindly, it shows you why, the whole shape of it
        pal.mood('no').gesture('wiggle');
        hum(OOPS, 0.7, 'miss');
        ruledOut(mine.rule, mine.post, place.n, place.regions).forEach((other, i) => {
          if (cells[other] !== 'letter') flash(tile(other), 'teach');
          tile(other).style.setProperty('--d', `${i * 70}ms`);
        });
        life.setTimeout(() => { if (!busy) pal.look(tile(mine.post)); }, 300);
        say('Penny shows why not');
      } else if (hadHoped) {
        // it had been hoping too, on the strength of your crosses
        pal.mood('worried').gesture('start');
        hum(OOPS, 0.6, 'miss');
        say('Penny is shaken');
        life.setTimeout(() => { if (!busy && touching === null) trouble(); }, 1200);
      } else {
        // it goes right through it, and is gone again as fast
        pal.mood('sad').gesture('sink');
        hum(OOPS, 0.5, 'miss');
        life.setTimeout(() => { if (!busy && touching === null) pal.mood('calm'); }, 650);
        // and its eyes go back to the squares still open, never to you
        const left = cells.map((state, other) => (state === 'empty' ? other : -1)).filter((other) => other >= 0);
        life.setTimeout(() => { if (!busy && touching === null && left.length) pal.look(tile(left[Math.floor(Math.random() * left.length)])); }, 420);
        say('Not there');
      }
      return;
    }

    setBusy(true);
    cells[cell] = 'letter';
    byHand.delete(cell);
    found.push(cell);
    positive.delete(cell);
    paint(cell, 'fx-post');
    ripple(cell);
    sfx('post');
    rise(2600);
    if (thoughtSo) {
      pal.mood('thrilled').gesture('jump');
      say('Penny is overjoyed');
    } else {
      // it had no idea. For a moment it only looks at you
      pal.mood('surprised').look(null).gesture('jump');
      pal.sing(GASP, 0.9, { breath: 2 });
      say('Penny is amazed');
    }

    // What the post takes away: everything the game's rules say it does. The
    // rule this place is there to show goes first and slowly, square by
    // square, lit as it goes, so that it is seen as a shape, and Penny's eyes
    // follow it. The rest follows quickly.
    const { n, regions, rules } = place;
    const shown = place.shows ?? null;
    const delays = [];
    let at = 240;
    if (shown) {
      const first = at;
      for (const other of ruledOut(shown, cell, n, regions)) {
        if (cells[other] === 'letter') continue;
        const fresh = cells[other] === 'empty';
        if (fresh) cells[other] = 'cross';
        paint(other, fresh ? 'fx-cross' : null, at, true);
        life.setTimeout(() => { if (busy) pal.look(tile(other)); }, at);
        delays.push(at);
        at += 150;
      }
      life.setTimeout(() => {
        pal.mood('curious');
        if (!wondered) pal.sing(WONDER, 0.5, { breath: 0 });
        wondered = true;
      }, first);
      at += 220;
    }
    for (const rule of rules.filter((r) => r !== shown)) {
      for (const other of ruledOut(rule, cell, n, regions)) {
        if (cells[other] !== 'empty') continue;
        cells[other] = 'cross';
        paint(other, 'fx-cross', at);
        delays.push(at);
        at += shown ? 30 : 45;
      }
    }
    // a cross of yours on a square the post has now ruled out is the post's cross from here on
    const ruled = read(place, found, [...misses]);
    for (const other of [...byHand]) if (ruled[other].is === 'out') byHand.delete(other);
    if (delays.length) sfx('cascade', { delays });
    know();
    if (!frightened().length && !stuck.length) uneasy = false; // (the cross that frightened Penny may just have been opened instead)
    done = found.length === place.posts.length;

    // And what was inside it. Every time, this could be the one: it can
    // hardly bear it. Then it holds still to listen.
    await wait(Math.max(900, Math.min(at + 250, 1700)));
    const mail = mailIn(index, found.length - 1, place.posts.length, hasDot()); // (Dot is only there to be found once)
    main.classList.add('hush'); // the map goes dim: for this moment the thing to watch is Penny
    if (mail.dot) {
      await findDot(cell);
    } else {
      pal.mood('holding').look(tile(cell));
      await wait(420);
      pal.mood('listening');
      say('Penny listens to what was inside');
      await playMail(life, mail, () => ring(cell, mail.friend));
      if (life.over) return;
      if (mail.friend) {
        // That is part of the sound. Penny knows it at once, and it goes
        // through Penny like light; Penny hums it back.
        heard(mail);
        showTrail();
        pal.mood('surprised').gesture('start');
        await wait(260);
        rise(5200);
        pal.mood('thrilled').look(null).gesture('jump').hearts(3);
        say('It is part of the sound it is looking for');
        await wait(280);
        await pal.sing(mail.echo, 1);
        // And then it is over, as everything it hears is. It holds on to
        // it a moment longer than it lasts, and looks a long way up the map.
        pal.mood('listening').glow(0.9).glow(0.2, 1300);
        await wait(1100);
        pal.mood('hopeful').look({ x: window.innerWidth / 2, y: 0 });
        await pal.sing(LONGING, 0.55);
      } else {
        // Somebody else's. A post found is a good thing, and Penny is glad
        // of it with you: that comes first and it is the larger part. That it
        // was not the sound Penny is after is one breath, a glance up the map,
        // and gone. (Nobody watching knows yet what Penny is looking for; a
        // Penny that slumped at every find would only seem sad that you had
        // done well.)
        pal.mood('curious').look({ x: window.innerWidth / 2, y: 0 });
        hum(LET_GO, 0.3, 'not it');
        say('Someone else’s post');
        await wait(420);
        pal.mood('glad').look(tile(cell)).gesture(done ? 'jump' : 'hop');
        pal.sing(done ? TRILL : YES, 0.8); // (not waited for: the map is yours again at once)
      }
    }
    if (life.over) return;
    main.classList.remove('hush');
    setBusy(false);
    if (done) {
      board.classList.add('won');
      portal.hidden = false;
      lay();
      pal.mood('glad');
    } else {
      pal.height('face').look(null);
    }
    touched();
  }

  // --- The last place: crosses -------------------------------------------------------------
  let judging = null;
  let crossedYet = false;
  let uneasy = false; // it has been alarmed or troubled, and it has not been put right
  function mark(cell, to) {
    if (cells[cell] === 'letter' || cells[cell] === to) return false;
    if (cells[cell] === 'cross' && !byHand.has(cell)) return false; // a cross the rules or a guess put there stays
    cells[cell] = to;
    if (to === 'cross') byHand.add(cell);
    else byHand.delete(cell);
    paint(cell, to === 'cross' ? 'fx-cross' : 'fx-clear');
    sfx(to === 'cross' ? 'cross' : 'clear');
    return true;
  }
  // The squares of yours it is frightened for: crossed, and it was sure of them.
  // (or heard a post in them)
  const frightened = () => [...byHand].filter((cell) => squares[cell].is === 'sure' || positive.has(cell));
  // Something has been left with nowhere: it droops, and looks at the crosses
  // of yours it cannot answer for, one after another. Returns whether so.
  function trouble() {
    if (!stuck.length) return false;
    pal.mood('sad');
    hum(SAG, 0.5, 'troubled');
    say('Penny is troubled: something has nowhere left to go');
    const doubtful = stuck[0].filter((cell) => byHand.has(cell) && !good.has(cell));
    doubtful.forEach((cell, i) => life.setTimeout(() => {
      if (busy || touching !== null) return;
      pal.look(tile(cell));
      flash(tile(cell), 'starve');
    }, 500 + i * 450));
    return true;
  }
  // What it makes of the crosses just made or rubbed out. It waits for the
  // stroke to end, and a little longer in case it was half of a double tap.
  let pending = null; // crosses made since Penny last had the time to look: { to, cells }
  function judge(strokeCells, to) {
    // a second stroke straight after the first is judged with it, not instead of it
    pending = pending?.to === to ? { to, cells: [...new Set([...pending.cells, ...strokeCells])] } : { to, cells: strokeCells };
    clearTimeout(judging);
    judging = life.setTimeout(() => {
      const changed = pending.cells;
      pending = null;
      const before = { squares, good };
      know(); // (whatever else is going on, what Penny knows keeps up with what is drawn)
      if (busy || done) return;
      // where it has an ear, a cross is listened under: a post right there is heard
      if (to === 'cross' && place.listen) {
        for (const cell of changed) if (hear(place, found, cell).strength === 1) positive.add(cell);
      }
      const afraid = frightened();
      if (to === 'cross' && changed.some((cell) => afraid.includes(cell))) {
        // a cross on a square it was sure of
        rise(1500);
        pal.mood('worried').look(tile(changed.find((cell) => afraid.includes(cell)))).gesture('start');
        pal.sing(ALARM, 0.85, { breath: 0 });
        say('Penny is alarmed: there is a post under that cross');
        uneasy = true;
        return;
      }
      if (trouble()) {
        uneasy = true;
        return;
      }
      if (afraid.length) {
        pal.mood('worried').look(tile(afraid[0]));
        return;
      }
      if (uneasy) {
        // put right
        uneasy = false;
        pal.mood('hopeful').look(null);
        hum(RELIEF, 0.6, 'relief');
        say('Penny is relieved');
        return;
      }
      if (to !== 'cross') {
        pal.mood('calm').look(null);
        say('');
        return;
      }
      const first = !crossedYet;
      crossedYet = true;
      const agreed = changed.filter((cell) => good.has(cell));
      const late = [...good].filter((cell) => !before.good.has(cell) && !changed.includes(cell));
      if (agreed.length || late.length) {
        // it can see why
        pal.mood('calm').look(tile(agreed[0] ?? late[0])).gesture('nod');
        hum(MM, 0.45, 'agree');
        say('Penny agrees');
      } else if (place.listen) {
        // it hears nothing under it, and has no quarrel with it: it watches, no more
        pal.mood('curious').look(tile(changed[0]));
        life.setTimeout(() => { if (!busy && touching === null) pal.mood('calm').look(null); }, 700);
        say('');
      } else if (first) {
        // the first cross it has had to think about: it marvels at it
        pal.mood('surprised').look(tile(changed[0])).gesture('hop');
        pal.sing(WONDER, 0.6, { breath: 0 });
        say('Penny marvels at the cross');
      } else {
        // it cannot see the reason. That is not the same as thinking it wrong
        pal.mood('unsure').look(tile(changed[0]));
        if (asked.times < 2) {
          asked.times += 1;
          pal.sing(ASK, 0.4, { breath: 0 });
        }
        life.setTimeout(() => { if (!busy && touching === null) pal.look(null); }, 700);
        say('Penny is not sure about that cross');
      }
    }, 390);
  }

  // --- Left alone ------------------------------------------------------------------------
  // It does not point. If the rules have made a square certain its eyes find
  // it, and later it goes and stands under it. Otherwise it looks at you,
  // tries to listen from where it stands and cannot; and now and then a loud
  // post stirs of its own accord.
  let alone = 0; // seconds since anything was touched
  let shown = null; // the certain square its eyes have already found
  let stirs = 0;
  let touching = null; // the square a finger is on
  let lastTouched = null;
  function touched() {
    alone = 0;
    shown = null;
  }
  // It tries to listen for itself, and cannot: it needs your finger.
  function cannotHear() {
    pal.mood('listening').look(null);
    life.setTimeout(() => {
      if (busy || done || touching !== null) return;
      pal.mood('unsure');
      if (lastTouched !== null && tile(lastTouched)) pal.look(tile(lastTouched));
      life.setTimeout(() => {
        if (busy || done || touching !== null) return;
        pal.look(null);
        pal.sing(ASK, 0.5);
      }, 700);
    }, 900);
  }
  life.setInterval(() => {
    if (busy || touching !== null || document.visibilityState !== 'visible') return;
    alone += 1;
    if (done) {
      // the way on is open, above: it stands under it and looks from it to you
      if (alone % 8 === 2 && alone < 60) {
        pal.mood('hopeful');
        show(portal);
        if (alone % 16 === 2) {
          pal.gesture('hop');
          pal.sing(THIS_WAY, 0.8);
        }
        life.setTimeout(() => { if (done && touching === null) pal.look(null); }, 2200);
      }
      return;
    }
    if (frightened().length || stuck.length) return; // it has said what it can
    const sure = sureOnes();
    const patience = PATIENCE[index];
    if (sure.length) {
      const cell = sure[0];
      if (alone === patience && shown !== cell) {
        // its eyes run along what has only one square left, and stop on it
        shown = cell;
        const group = squares[cell].group.filter((other) => other !== cell);
        group.forEach((other, i) => life.setTimeout(() => { if (!busy && touching === null) pal.look(tile(other)); }, i * 180));
        life.setTimeout(() => { if (!busy && touching === null && squares[cell]?.is === 'sure') pal.mood('sure').look(tile(cell)); }, group.length * 180 + 120);
        say('Penny has noticed something');
      } else if (alone === patience + 5 && shown === cell) {
        pal.mood('sure');
        show(tile(cell));
      } else if (alone === patience + 9 && shown === cell) {
        pal.look(null);
      }
      return;
    }
    if (hoped.length && alone === patience) {
      // only your crosses make it so: it hopes, without being sure
      pal.mood('hopeful').look(tile(hoped[0]));
      return;
    }
    if (alone === 6) pal.mood('calm').look(null);
    if (alone === 11) {
      if (place.listen) cannotHear();
      else {
        // (the last place) its eyes go over whatever has fewest squares left
        const open = (group) => group.filter((cell) => cells[cell] === 'empty');
        const tight = groupsOf(place).filter((group) => open(group).length > 1).sort((a, b) => open(a).length - open(b).length)[0] ?? [];
        open(tight).forEach((cell, i) => life.setTimeout(() => { if (!busy && touching === null) pal.mood('curious').look(tile(cell)); }, i * 400));
        life.setTimeout(() => { if (!busy && touching === null) pal.mood('unsure').look(null); }, open(tight).length * 400 + 500);
      }
    }
    // a loud post, not yet found, stirs: the map calling, not Penny knowing
    const first = STIRS[index];
    const loud = place.loud.filter((post) => !found.includes(post));
    if (first && loud.length && stirs < 3 && alone >= first && (alone - first) % 16 === 0) {
      stirs += 1;
      const post = loud[0];
      flash(tile(post), 'stir');
      murmur();
      const side = Math.sign(tile(post).getBoundingClientRect().left + tile(post).offsetWidth / 2 - window.innerWidth * pal.x);
      pal.mood('curious').lean(side);
      say('Something stirred on the map');
    }
  }, 1000);

  // --- Touches ------------------------------------------------------------------------------
  const cellAt = (x, y) => {
    const button = document.elementFromPoint(x, y)?.closest?.('.cell');
    return button && board.contains(button) ? Number(button.dataset.cell) : null;
  };
  const knock = (cell) => {
    flash(tile(cell), 'fx-knock');
    if (audio() && !isMuted()) noise({ dur: 0.07, from: 260, to: 120, q: 1, gain: 0.12 });
  };
  let lastTap = { cell: null, at: 0, before: null };
  let stroke = null; // while a finger is down in the last place: { to, cells }
  let press = null; // while a finger is down where a tap crosses and a hold listens: { cell, held, moved }
  let holding = null;
  let hovering = null;

  function tapped(cell, at) {
    if (done || busy) return;
    touched();
    stirs = Math.min(stirs, 2);
    const again = cell === lastTap.cell && (ajar === cell || at - lastTap.at < twice());
    if (again) {
      // the first tap of the two may have crossed the square: put it back
      if (lastTap.before && cells[cell] !== 'letter' && cells[cell] !== lastTap.before) {
        cells[cell] = lastTap.before;
        if (lastTap.before === 'cross') byHand.add(cell);
        else byHand.delete(cell);
        paint(cell);
      }
      lastTap = { cell: null, at: 0, before: null };
      stroke = null;
      press = null;
      clearTimeout(holding);
      touching = null;
      open(cell);
      return;
    }
    lastTap = { cell, at, before: cells[cell] };
    touching = cell;
    lastTouched = cell;
    if (place.marks) {
      if (cells[cell] === 'letter') return;
      stroke = { to: cells[cell] === 'cross' ? 'empty' : 'cross', cells: [] };
      if (mark(cell, stroke.to)) stroke.cells.push(cell);
      else if (squares[cell].is === 'out') no(squares[cell], true);
      return;
    }
    if (place.crosses) {
      // A finger on a square is a question, at once. Lifted again quickly it is
      // also a cross (see lift); held, or slid on, it is only the question.
      press = { cell, held: false, moved: false };
      clearTimeout(holding);
      holding = life.setTimeout(() => { if (press?.cell === cell) press.held = true; }, 260);
      if (cells[cell] === 'empty') knock(cell);
      ask(cell); // a finger on a square always asks; lifted quickly, it leaves a cross as well
      return;
    }
    if (cells[cell] === 'empty') {
      knock(cell);
      leaveAjar(cell);
      if (!(positive.has(cell) || squares[cell].is === 'sure')) ask(cell);
    } else {
      ask(cell);
    }
  }

  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell !== null) tapped(cell, event.timeStamp);
  });
  life.on(window, 'pointermove', (event) => {
    if (!event.isPrimary || done || busy) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (touching === null) {
      // a pointer with nothing pressed: resting on a square a moment asks about it, silently
      if (event.pointerType !== 'mouse' || cell === hovering) return;
      hovering = cell;
      clearTimeout(listening);
      if (cell === null) return;
      listening = life.setTimeout(() => {
        touched();
        ask(cell, false);
      }, 200);
      return;
    }
    if (cell === null || cell === touching) return;
    // a finger sliding across the map
    if (press) {
      press.moved = true;
      clearTimeout(holding);
    }
    touching = cell;
    lastTouched = cell;
    lastTap = { cell: null, at: 0, before: null };
    touched();
    if (stroke) {
      if (mark(cell, stroke.to)) stroke.cells.push(cell);
    } else {
      shut();
      ask(cell, true, true);
    }
  });
  const lift = () => {
    if (touching === null) return;
    touching = null;
    if (stroke?.cells.length) judge(stroke.cells, stroke.to);
    stroke = null;
    if (!press) return;
    clearTimeout(holding);
    const { cell, held, moved } = press;
    press = null;
    if (held || moved) {
      lastTap = { cell: null, at: 0, before: null }; // that was listening, not half of a double tap
      return;
    }
    // a quick tap: a cross, or a cross taken off
    if (busy || done || cells[cell] === 'letter') return;
    const to = cells[cell] === 'cross' ? 'empty' : 'cross';
    if (mark(cell, to)) {
      if (to === 'cross' && (positive.has(cell) || squares[cell].is === 'sure')) pal.mood('holding').look(tile(cell)); // over a post it knows of: it cannot breathe
      judge([cell], to);
    } else if (squares[cell].is === 'out') {
      no(squares[cell], true);
    }
  };
  life.on(window, 'pointerup', lift);
  life.on(window, 'pointercancel', lift);

  // Keys. Moving the focus onto a square and resting there asks about it;
  // Enter opens it; Space is a tap (so two of them open it), or a cross where
  // crosses are in use, as is X.
  board.addEventListener('focusin', (event) => {
    const cell = Number(event.target.closest?.('.cell')?.dataset.cell ?? NaN);
    if (Number.isNaN(cell) || !event.target.matches(':focus-visible')) return;
    clearTimeout(listening);
    listening = life.setTimeout(() => {
      touched();
      lastTouched = cell;
      ask(cell, false);
    }, 250);
  });
  board.addEventListener('keydown', (event) => {
    const cell = Number(event.target.closest?.('.cell')?.dataset.cell ?? NaN);
    if (Number.isNaN(cell) || done || busy) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      open(cell);
    } else if (event.key === ' ' || (event.key.toLowerCase() === 'x' && place.crosses)) {
      event.preventDefault();
      if (event.repeat) return;
      tapped(cell, event.timeStamp);
      lift();
    } else if (event.key.startsWith('Arrow')) {
      const n = place.n;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[event.key];
      const next = cell + step;
      const wraps = Math.abs(step) === 1 && Math.floor(next / n) !== Math.floor(cell / n);
      if (next >= 0 && next < cells.length && !wraps) {
        event.preventDefault();
        tile(next).focus();
      }
    }
  });

  // A tap on Penny itself. If the rules have made something certain, its
  // eyes go to it. Otherwise it tries to hear for itself, and cannot.
  pal.onTap(() => {
    if (busy) return;
    pal.gesture('hop');
    if (done) {
      alone = 1;
      return;
    }
    const sure = sureOnes();
    touched();
    if (sure.length) {
      shown = sure[0];
      pal.mood('sure').look(tile(sure[0]));
      alone = PATIENCE[index];
    } else if (!trouble()) {
      cannotHear();
    }
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');

  // --- Through the portal ---------------------------------------------------------------------
  portal.addEventListener('click', async () => {
    if (busy || portal.hidden || main.classList.contains('through')) return; // (busy: the sound so far is being played back)
    if (index === PLACES.length - 1) {
      setWalked();
      go('/postmarks/');
      return;
    }
    // the map rushes up through the portal, and settles, from high above, on the next place
    const at = portal.getBoundingClientRect();
    const frame = main.getBoundingClientRect();
    main.style.setProperty('--through-x', `${at.left + at.width / 2 - frame.left}px`);
    main.style.setProperty('--through-y', `${at.top + at.height / 2 - frame.top}px`);
    setBusy(true);
    rise(1400);
    pal.mood('thrilled').look(portal).gesture('jump');
    main.classList.add('through');
    await wait(still ? 0 : 520);
    const keyed = document.activeElement === portal; // come through by keyboard: the keys should still have somewhere to be
    start(index + 1);
    if (keyed) tile(0)?.focus({ preventScroll: true });
    main.classList.remove('through');
    main.classList.add('arriving');
    await wait(still ? 0 : 620);
    main.classList.remove('arriving');
  });

  // Back down the map to a place already walked, and up again as far as has
  // been reached. (The portal is still the only way to somewhere new.)
  async function step(to) {
    if (busy || to < 0 || to > furthest() || main.classList.contains('through')) return;
    setBusy(true);
    start(to);
    main.classList.add('arriving');
    await wait(still ? 0 : 620);
    main.classList.remove('arriving');
  }
  down.addEventListener('click', () => step(index - 1));
  up.addEventListener('click', () => step(index + 1));

  start(index);
}
