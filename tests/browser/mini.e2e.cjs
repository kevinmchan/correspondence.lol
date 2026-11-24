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
const { PHONES, serve, open, measure, ACCOUNT, ROOM, listed, roomSays } = require('./phone.cjs');

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

// Every screen, in every state worth looking at.
//   screen: which screen of the app it is (the name of its template in index.html, without "screen-").
//   at: its address.  storage: what is on the device.  server: what the server says.
//   ready: what is there when it has come up.  then(page): what has to be done to get it into the state.
//   whole: the things that must be entirely on the screen without scrolling (and the screen must not scroll).
//   small: things to press that may be under 44 by 44, as [pattern, why]. The pattern is matched against how the thing is described.
async function states() {
  const { newGame } = await import('../../postmarks/game.js');
  const { encode } = await import('../../jam/beat.js');
  const { randomBeat } = await import('../../jam/make.js');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const beats = ['Morning', 'A beat with rather a long name to it', 'Three'].map((name, i) => ({ name, code: encode(randomBeat(random)), at: 1795000000000 + i }));
  const played = { 'postmarks:howto-solo:v1': true };
  return [
    { name: 'home, somebody new', screen: 'home', at: '/', ready: '#welcome-new' },
    { name: 'home, the lobby', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' }, ready: '#menu' },
    { name: 'home, the feed with things waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms(GAMES), ready: '.feed-item' },
    { name: 'home, the feed with nothing waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms([]), ready: '#feed-empty:not([hidden])' },
    { name: 'opening a room', screen: 'open', at: '/?open', storage: ACCOUNT, ready: '#create-room' },
    { name: 'joining a room', screen: 'join', at: '/?join', storage: ACCOUNT, ready: '#join-room' },
    { name: 'a room, with games in it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li' },
    { name: 'the game, the smallest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 5, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'] },
    { name: 'the game, the biggest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 9, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'] },
    { name: 'the game, how to play', screen: 'game', at: '/postmarks/', ready: 'dialog.howto[open]' },
    { name: 'the walk, the first place', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 0 }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back'] },
    { name: 'the walk, the last place, with Dot', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 4, 'penny:dot:v1': true, 'penny:walked:v1': true }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back', '#walk-down'] },
    { name: 'the film, scene one', screen: 'office', at: '/?office', ready: '.office-stage', whole: ['.office-door'] },
    { name: 'the film, scene two', screen: 'slow', at: '/?slow', ready: '.slow-keep', whole: ['.office-door'] },
    { name: 'the music maker, empty', screen: 'jam', at: '/jam/', ready: '.jam-board .pad' },
    { name: 'the music maker, with beats saved', screen: 'jam', at: '/jam/', storage: { 'jam:saved:v1': beats }, ready: '.jam-saved li' },
    { name: 'Penny’s Radio', screen: 'taste', at: '/jam/?taste', storage: { 'radio:taught:v1': true }, ready: '.radio .dot', whole: ['.radio .body', '.radio .antenna', '.radio .handle', '.radio .feet', '.penny-back', '#taste-behind-open'] },
    { name: 'Penny’s Radio, behind it', screen: 'taste', at: '/jam/?taste', storage: { 'radio:taught:v1': true }, ready: '.radio .dot', then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog.behind[open]' },
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
    if (state.settle) await page.waitForSelector(state.settle, { timeout: 8000 });
    await sleep(900); // whatever slides or rises into place has
    const seen = await measure(page, { insets: phone.insets });
    if (!String(seen.screen).split(' ').includes(`screen-${state.screen}`)) wrong.push(`the screen that came up is "${seen.screen}", not screen-${state.screen}`);
    const allowed = (what) => (state.small ?? []).some(([pattern]) => new RegExp(pattern).test(what));
    if (seen.sideways) wrong.push('the page scrolls sideways');
    for (const one of seen.wide) wrong.push(`sticks out sideways: ${one.what} (from ${one.x} to ${one.x + one.w} on a screen ${seen.width} wide)`);
    for (const one of seen.press) if ((one.w < PRESS || one.h < PRESS) && !allowed(one.what)) wrong.push(`too small to press: ${one.what} is ${one.w} by ${one.h}`);
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
