// The app on an iPhone mini. `npm run e2e:mini`.
//
// The interface is designed for an iPhone Pro and has to go on working on a
// Pro Max and on a mini. The mini is where it is tightest, so this suite goes
// through every screen of the app, in every state worth looking at, on a mini
// both ways (inside Safari with its bars showing, 375 by 629; and installed,
// 375 by 812 with the notch and the home bar), and holds each to the same
// rules:
//
//   - the page cannot be scrolled sideways, and nothing sticks out past its edges;
//   - everything there is to press is at least 44 by 44, which is what Apple
//     asks for a finger (the few things that are not are named, with why);
//   - no two things to press overlap;
//   - installed, nothing to press lies under the notch or the home bar;
//   - no text is under 11px, and no text field under 16px (Safari zooms the
//     whole page when a smaller one is tapped);
//   - no text is cut off by its own box;
//   - a screen that is meant to be seen whole is whole: it does not scroll,
//     and the things named for it are entirely on the screen.
//
// KEEPING IT UP. A new screen, or a new state of one (a sheet, a list that can
// grow, a step of a lesson), gets an entry in states() below in the same
// change that adds it. An exception is written next to the state it is for,
// with the reason, and is the smallest that will do. This is not left to
// memory: every pull request has to add a test screen here and pass, or carry
// an exception (tests/pr-control.cjs), and every screen the app has must have
// at least one (tests/control.test.js).
//
//   node tests/browser/mini.e2e.cjs --list     the test screens, as JSON, without a browser
//
// The same suite can be pointed at the other phones:
//   PHONES=pro-app,pro-safari npm run e2e:mini      (all of them: PHONES=all)
// It needs Playwright with Chromium; where that is not installed it says so and
// passes, unless REQUIRE_BROWSER is set (as it is where pull requests are
// checked), when that is a failure. It serves the repository itself and talks
// to no server.

const assert = require('node:assert/strict');
const { PHONES, serve, open, measure, ACCOUNT, ROOM, PEOPLE, listed, roomSays } = require('./phone.cjs');

const LISTING = process.argv.includes('--list');
let chromium = null;
if (!LISTING) {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    const must = Boolean(process.env.REQUIRE_BROWSER);
    console.log(`Playwright is not installed: ${must ? 'and here it has to be.' : 'skipping the phone checks.'}`);
    process.exit(must ? 1 : 0);
  }
}

const PRESS = 44; // the least a thing to press may be, each way
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// What the server says, for the screens that ask it something.
const GAMES = [listed({ last_player: 1, found: 2, hearts: 2 }), listed({ mode: 'trial', finished: 2 }), listed({ mode: 'phrase', mine: 'playing', finished: 1 }), listed({ last_player: 0 }), listed({ status: 'won', last_player: 1, moves: 9, found: 5 })];
const rooms = (games) => (name, args) => (name === 'room_get' ? roomSays(args.p_room, args.p_room === ROOM ? 'Book club' : 'Family', args.p_room === ROOM ? games : []) : undefined);
// One room, as the server says it is, with whatever is different about it this time.
const room = (over = {}) => (name, args) => (name === 'room_get' ? { ...roomSays(args.p_room, 'Book club', []), ...over } : undefined);
const LONG_NAME = 'The Thursday Evening Correspondence Club'; // forty letters, which is as long as a room's name gets
// A game of every kind, in every state a room's table shows one in (gameStatus() in room/room.js).
const TABLE = [
  ...GAMES,
  listed({ size: 9, status: 'lost', last_player: 1, moves: 6, found: 3, hearts: 0 }),
  listed({ mode: 'trial', size: 8, mine: 'playing', finished: 1 }),
  listed({ mode: 'trial', size: 6, mine: 'won', finished: 2 }),
  listed({ mode: 'phrase', size: 7, mine: 'lost', finished: 1 }),
  listed({ mode: 'phrase', size: 5, phrase_by: 0, finished: 2 }),
].map((game, i) => ({ ...game, id: `${String(i).repeat(8)}-3333-4333-8333-333333333333` }));
const CROWD = [...PEOPLE, { name: 'Bartholomew', avatar: '🐙', color: 5, left: false }, { name: 'Lin', avatar: '🌵', color: 3, left: false }, { name: 'Wilhelmina Longname', avatar: '🦉', color: 6, left: false }];
// A dozen messages from two people, short and long, with what the room itself says in between (rooms.room_view).
const said = (id, seat, body, game = null) => ({ id, seat, body, at: new Date(Date.UTC(2026, 10, 24, 18, id)).toISOString(), game_kind: game && 'postmarks', game_id: game });
const TALK = [
  said(1, null, 'Sam opened the room'), said(2, 1, 'hello!'), said(3, 0, 'Hi Ada. Shall we start with one together?'),
  said(4, null, 'Ada started Together 6 × 6', '33333333-3333-4333-8333-333333333333'),
  said(5, 1, 'Your move. I have put two posts in the top corner, and I am fairly sure about the yellow district, but the long green one down the left-hand side could go either way, so do not trust my crosses there.'),
  said(6, 0, 'ok'), said(7, 0, 'Found one more. Lost a heart on the way, sorry!'), said(8, 1, '😅'), said(9, 1, 'I left you a pass phrase too'),
  said(10, null, 'Ada started Pass phrase 5 × 5', '33333333-3333-4333-8333-333333333333'),
  said(11, 0, 'A hint? How many words? I will have a look after supper, and then the time trial, if my clock has not run out by then.'),
  said(12, 1, 'no hints'), said(13, 1, 'good luck 🍀'), said(14, 0, 'Averyveryverylongwordwithnospacesinitatallwhichhastobreaksomewhere'),
];
const STREET = { ...ACCOUNT, 'home:tab:v1': 'lobby', 'correspondence:rooms:v1': [...ACCOUNT['correspondence:rooms:v1'], { id: '44444444-4444-4444-8444-444444444444', name: LONG_NAME, at: 1794000000000 }] };

// Every screen, in every state worth looking at.
//   screen: which screen of the app it is (the name of its template in index.html, without "screen-").
//   at: its address.  storage: what is on the device.  server: what the server says.
//   ready: what is there when it has come up.  then(page): what has to be done to get it into the state.
//   settle: what is there once it is in the state (wait: how long that may take, when it is a story being told).
//   whole: the things that must be entirely on the screen without scrolling (and the screen must not scroll).
//   small: things to press that may be under 44 by 44, as [pattern, why, least]. The pattern is matched against how the
//     thing is described; `least` is how small it may be, each way, and no smaller.
async function states() {
  const { newGame } = await import('../../postmarks/game.js');
  const { encode } = await import('../../jam/beat.js');
  const { randomBeat } = await import('../../jam/make.js');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const beats = ['Morning', 'A beat with rather a long name to it', 'Three'].map((name, i) => ({ name, code: encode(randomBeat(random)), at: 1795000000000 + i }));
  const played = { 'postmarks:howto-solo:v1': true };
  // the radio: what of the set must be wholly on the screen; somebody who has heard its story out; somebody who has found Dot
  const SET = ['.radio .body', '.radio .antenna', '.radio .handle', '.radio .feet', '.radio .lab-plate', '.penny-back', '#taste-behind-open'];
  const told = { 'radio:taught:v1': true, 'radio:story:v1': 'told' };
  const withDot = { 'penny:dot:v1': true, 'penny:walked:v1': true };
  // ...and a radio on which a station has been kept five times running, twice over: two presets (packed as jam/taste.js keeps it)
  const { begin, choose } = await import('../../jam/taste-model.js');
  const radio = begin(random);
  for (let i = 0; i < 12; i++) choose(radio, radio.current.reigning ?? 'front', random);
  const pack = (pair) => ({ ...pair, front: encode(pair.front), back: encode(pair.back), phantom: encode(pair.phantom) });
  const kept = { v: 1, streak: radio.streak, retired: radio.retired.map(encode), trials: radio.trials.map(pack), current: pack(radio.current) };
  const PADS = ['^button\\.pad', 'eight tiles across a screen 375 wide, with the page\'s margins: 39 is the room there is', 38];
  return [
    { name: 'home, somebody new', screen: 'home', at: '/', ready: '#welcome-new' },
    { name: 'home, the lobby', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' }, ready: '#menu' },
    { name: 'home, the feed with things waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms(GAMES), ready: '.feed-item' },
    { name: 'home, the feed with nothing waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms([]), ready: '#feed-empty:not([hidden])' },
    { name: 'opening a room', screen: 'open', at: '/?open', storage: ACCOUNT, ready: '#create-room' },
    { name: 'joining a room', screen: 'join', at: '/?join', storage: ACCOUNT, ready: '#join-room' },
    { name: 'home, the lobby, a street of rooms', screen: 'home', at: '/', storage: STREET, ready: '#rooms .street li' },
    { name: 'a room, with games in it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li' },
    { name: 'a room, empty', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room(), ready: '#no-games:not([hidden])' },
    { name: 'a room, a full table, a long name and a crowd', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '#games li' },
    { name: 'a room, the chat with messages', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES.slice(0, 2), messages: TALK }), ready: '.chat-log li',
      then: (page) => page.locator('#chat').scrollIntoViewIfNeeded() },
    { name: 'a room, seen by somebody not in it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, you: null, messages: null, games: null }), ready: '#join:not([hidden])' },
    { name: 'a room, renaming it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#room-name button').click(), settle: '#room-name input' },
    { name: 'a room, writing a pass phrase', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#phrase-text').fill('meet me at the old post office'); }, settle: '#tokens .word' },
    { name: 'the game, the smallest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 5, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'] },
    { name: 'the game, the biggest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 9, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'],
      small: [['^button\\.cell', 'nine squares across a screen 375 wide: with no gaps at all each could be 41', 34]] },
    { name: 'the game, how to play', screen: 'game', at: '/postmarks/', ready: 'dialog.howto[open]' },
    { name: 'the walk, the first place', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 0 }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back'] },
    { name: 'the walk, the last place, with Dot', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 4, 'penny:dot:v1': true, 'penny:walked:v1': true }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back', '#walk-down'] },
    { name: 'the film, scene one', screen: 'office', at: '/?office', ready: '.office-stage', whole: ['.office-door'] },
    { name: 'the film, scene two', screen: 'slow', at: '/?slow', ready: '.slow-keep', whole: ['.office-door'] },
    { name: 'the music maker, empty', screen: 'jam', at: '/jam/', ready: '.jam-board .pad', small: [PADS] },
    { name: 'the music maker, with beats saved', screen: 'jam', at: '/jam/', storage: { 'jam:saved:v1': beats }, ready: '.jam-saved li', small: [PADS] },
    // Penny's Radio. Its story is told once; these are its stills. (told: nobody comes to show how, and nothing opens by itself.)
    { name: 'Penny’s Radio', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', whole: SET },
    { name: 'Penny’s Radio, being shown how', screen: 'taste', at: '/jam/?taste', ready: '#radio-dash:not([hidden])', settle: '#dash-says span', whole: [...SET, '#radio-dash', '#dash-says'] },
    // (a finger held down on the map keeps the sheet from opening over Dot's line, as it would for anybody)
    { name: 'Penny’s Radio, Dot says it', screen: 'taste', at: '/jam/?taste', storage: { ...withDot, 'radio:taught:v1': true, 'radio:story:v1': 'seen' }, ready: '.radio .dot',
      then: async (page) => { await page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'telling', null, { timeout: 25000 }); await page.mouse.move(24, 120); await page.mouse.down(); },
      settle: '#dot-says span.said:last-child', wait: 25000, whole: [...SET, '#dot-says'] },
    { name: 'Penny’s Radio, behind it', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog#taste-behind[open]' },
    { name: 'Penny’s Radio, its presets', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': kept }, ready: '.radio .presets i.lit', then: (page) => page.locator('#taste-presets-open').click(), settle: 'dialog#taste-presets[open] .preset-list a' },
  ];
}

// One state on one phone: what is wrong with it, as a list of sentences. Empty is right.
async function look(browser, origin, phoneName, state) {
  const { context, page, phone, errors } = await open(browser, phoneName, { storage: state.storage ?? {}, server: state.server });
  const wrong = [];
  try {
    await page.goto(origin + state.at);
    await page.waitForSelector(state.ready, { timeout: 15000 });
    if (state.then) await state.then(page);
    if (state.settle) await page.waitForSelector(state.settle, { timeout: state.wait ?? 8000, state: 'attached' });
    await sleep(900); // whatever slides or rises into place has
    const seen = await measure(page, { insets: phone.insets });
    if (!String(seen.screen).split(' ').includes(`screen-${state.screen}`)) wrong.push(`the screen that came up is "${seen.screen}", not screen-${state.screen}`);
    // (an exception has a floor of its own: under that it is too small whatever the reason)
    const least = (what) => (state.small ?? []).find(([pattern]) => new RegExp(pattern).test(what))?.[2] ?? PRESS;
    if (seen.sideways) wrong.push('the page scrolls sideways');
    for (const one of seen.wide) wrong.push(`sticks out sideways: ${one.what} (from ${one.x} to ${one.x + one.w} on a screen ${seen.width} wide)`);
    for (const one of seen.press) if (one.w < least(one.what) || one.h < least(one.what)) wrong.push(`too small to press: ${one.what} is ${one.w} by ${one.h}${least(one.what) < PRESS ? ` (and ${least(one.what)} is the least it may be)` : ''}`);
    for (const one of seen.overlapping) wrong.push(`overlap: ${one.a} and ${one.b} (by ${one.by})`);
    for (const one of seen.unsafe) wrong.push(`under the notch or the home bar: ${one.what} (at ${one.y} to ${one.y + one.h} of ${seen.height})`);
    for (const one of seen.tinyText) wrong.push(`text too small to read: ${one.what} is ${one.px}px`);
    for (const one of seen.smallFields) wrong.push(`a text field under 16px (Safari will zoom the page): ${one.what} is ${one.px}px`);
    for (const one of seen.clipped) wrong.push(`text cut off: ${one.what}`);
    if (state.whole) {
      if (seen.scrolls) wrong.push(`meant to be seen whole, but the page is ${seen.pageHeight} high on a screen of ${seen.height}`);
      const top = phone.insets?.top ?? 0;
      const bottom = seen.height - (phone.insets?.bottom ?? 0);
      for (const selector of state.whole) {
        const boxes = await page.locator(selector).evaluateAll((all) => all.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, right: r.right, bottom: r.bottom, w: r.width }; }));
        if (boxes.length === 0) wrong.push(`not there at all: ${selector}`);
        for (const box of boxes) {
          if (box.w === 0) continue; // not shown in this state
          if (box.x < -0.5 || box.right > seen.width + 0.5 || box.y < top - 0.5 || box.bottom > bottom + 0.5) wrong.push(`not wholly on the screen: ${selector} (${Math.round(box.x)},${Math.round(box.y)} to ${Math.round(box.right)},${Math.round(box.bottom)}; the room is ${seen.width} wide, from ${top} to ${bottom})`);
        }
      }
    }
    for (const error of errors) wrong.push(`an error on the page: ${error}`);
  } catch (error) {
    wrong.push(String(error.message || error).split('\n')[0]);
  }
  await context.close();
  return wrong;
}

async function main() {
  if (LISTING) { // the test screens there are: what the pull request control counts
    const names = (await states()).map((state) => ({ name: state.name, screen: state.screen }));
    assert.equal(new Set(names.map((one) => one.name)).size, names.length, 'two test screens have the same name');
    console.log(JSON.stringify(names));
    return;
  }
  const asked = process.env.PHONES === 'all' ? Object.keys(PHONES) : (process.env.PHONES ?? 'mini-safari,mini-app').split(',').map((name) => name.trim()).filter(Boolean);
  for (const name of asked) assert.ok(PHONES[name], `No such phone: ${name}. There are: ${Object.keys(PHONES).join(', ')}`);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null; // ONLY=radio, to look at one screen
  const { origin, close } = await serve();
  const browser = await chromium.launch();
  const todo = [];
  for (const state of await states()) for (const phone of asked) if (!only || only.test(state.name)) todo.push({ state, phone });
  let failed = 0;
  // a few at a time: each is a browser window of its own
  const worker = async () => {
    for (let next = todo.shift(); next; next = todo.shift()) {
      const started = Date.now();
      const wrong = await look(browser, origin, next.phone, next.state);
      console.log(`${wrong.length ? 'not ok' : 'ok'} - ${next.phone}: ${next.state.name} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      for (const line of wrong) console.log(`  ${line}`);
      if (wrong.length) failed += 1;
    }
  };
  const total = todo.length;
  await Promise.all(Array.from({ length: 4 }, worker));
  await browser.close();
  close();
  console.log(`# ${total - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
