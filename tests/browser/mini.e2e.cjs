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
//   PHONES=pro-app,pro-safari npm run e2e:mini      (PHONES=all: the mini both ways, and the largest installed)
// It needs Playwright with Chromium; where that is not installed it says so and
// passes, unless REQUIRE_BROWSER is set (as it is where pull requests are
// checked), when that is a failure. It serves the repository itself and talks
// to no server.

const assert = require('node:assert/strict');
const { PHONES, ENDS, serve, open, measure, ACCOUNT, ROOM, PEOPLE, listed, roomSays, radioPlayed } = require('./phone.cjs');

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
const LONG_NAME = 'The Thursday Evening Correspondence Club'; // forty letters, which is as long as a room's name can be on the server (a new one is 24 at most)
// A game of every kind, in every state a room's table shows one in (gameStatus() in room/room.js).
const TABLE = [
  ...GAMES,
  listed({ size: 9, status: 'lost', last_player: 1, moves: 6, found: 3, hearts: 0 }),
  listed({ mode: 'trial', size: 8, mine: 'playing', finished: 1 }),
  listed({ mode: 'trial', size: 6, mine: 'won', finished: 2 }),
  listed({ mode: 'phrase', size: 7, mine: 'lost', finished: 1 }),
  listed({ mode: 'phrase', size: 5, phrase_by: 0, finished: 2 }),
].map((game, i) => ({ ...game, id: `${String(i).repeat(8)}-3333-4333-8333-333333333333` }));
// Four games waiting on you, one of each kind there is to play and a fourth, among two that are not.
const SEVERAL = [
  listed({ last_player: 1, found: 2 }), listed({ mode: 'trial', size: 7, mine: 'playing', finished: 1 }), listed({ mode: 'phrase', size: 6, phrase_by: 1 }),
  listed({ size: 8, last_player: 2, found: 4, hearts: 1 }), listed({ last_player: 0, size: 6 }), listed({ mode: 'trial', size: 9, mine: 'won', finished: 3 }),
].map((game, i) => ({ ...game, id: `${String(i + 1).repeat(8)}-5555-4555-8555-555555555555` }));
const ENERGY = (earned) => ({ 'correspondence:energy:v1': { earned, spent: 0, boards: [] } }); // energy earned in all, in other games
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
//   init(): run in the page before it loads (what an iPhone has that this browser has not).
//   settle: what is there once it is in the state (wait: how long that may take, when it is a story being told).
//   whole: the things that must be entirely on the screen without scrolling (and the screen must not scroll).
//   small: things to press that may be under 44 by 44, as [pattern, why, least]. The pattern is matched against how the
//     thing is described; `least` is how small it may be, each way, and no smaller.
async function states() {
  const { newGame } = await import('../../postmarks/game.js');
  // A board played together in the room, as the server shows it to Sam: two posts found, the last by Ada; Sam's move.
  const TOGETHER_ID = '55555555-5555-4555-8555-555555555555';
  const together = await (async () => {
    const { generatePuzzle } = await import('../../postmarks/game.js');
    const size = 7;
    const made = generatePuzzle(size, 21);
    const cells = new Array(size * size).fill(0);
    for (const row of [0, 3]) cells[row * size + made.solution[row]] = 2;
    const view = { id: TOGETHER_ID, room: ROOM, room_name: 'Book club', you: 0, people: PEOPLE, players: PEOPLE.map((one) => one.name), mode: 'coop', size,
      regions: made.regions, cells, hearts: 2, moves: 4, status: 'playing', last: { player: 1, type: 'guess', cell: 3 * size + made.solution[3], correct: true } };
    return (name, args) => (name === 'postmarks_get' ? view : name === 'room_get' ? roomSays(ROOM, 'Book club', []) : undefined);
  })();
  // a solo game with its first `n` posts found
  const opened = (game, n) => ({ ...game, cells: game.cells.map((mark, cell) => (Math.floor(cell / game.size) < n && cell % game.size === game.solution[Math.floor(cell / game.size)] ? 2 : mark)) });
  const { encode } = await import('../../jam/beat.js');
  const { randomBeat } = await import('../../jam/make.js');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const beats = ['Morning', 'A beat with rather a long name to it', 'Three'].map((name, i) => ({ name, code: encode(randomBeat(random)), at: 1795000000000 + i }));
  const played = { 'postmarks:howto-solo:v1': true };
  // the radio: what of the set must be wholly on the screen, and the gallery's label on its plinth; somebody who has heard
  // its story out; somebody who has found Dot
  const SET = ['.radio .body', '.radio .antenna', '.radio .handle', '.radio .feet', '.radio .lab-plate', '#radio-meter', '.penny-back', '#taste-behind-open', '.plinth .gallery-label'];
  const told = { 'radio:taught:v1': true, 'radio:story:v1': 'told' };
  const withDot = { 'penny:dot:v1': true, 'penny:walked:v1': true };
  // ...and a radio on which a station has been kept five times running, twice over: two presets (packed as jam/taste.js keeps it)
  const { FEATURES, begin, choose, features, standing } = await import('../../jam/taste-model.js');
  const radio = begin(random);
  for (let i = 0; i < 12; i++) choose(radio, radio.current.reigning ?? 'front', random);
  const pack = (pair) => ({ ...pair, front: encode(pair.front), back: encode(pair.back), phantom: encode(pair.phantom) });
  const packed = (one) => ({ v: 1, streak: one.streak, retired: one.retired.map(encode), trials: one.trials.map(pack), current: pack(one.current) });
  const kept = packed(radio);
  // ...and somebody with a marked taste (the faster, with drums, and a low tune), kept until the test is significant
  const taste = [];
  for (const [key, much] of [['tempo', 4], ['drums', 3], ['bellsHigh', -4], ['space', -3]]) taste[FEATURES.findIndex((one) => one.key === key)] = much;
  const like = (beat) => features(beat).reduce((sum, value, i) => sum + value * (taste[i] ?? 0), 0);
  const found = begin(random);
  while (!standing(found.trials).significant && found.trials.length < 600) choose(found, like(found.current.front) >= like(found.current.back) ? 'front' : 'back', random);
  assert.equal(standing(found.trials).significant, true, 'a marked taste was not found in 600 picks');
  // ...and the meter in its speaker, played by simulated tasters (phone.cjs): four picks into warming up; under way, at
  // about ×6 with the most it has been above that; somebody with no taste, sunk below ×1; past ×20, the lamp lit and
  // the needle in the band past the mark; and somebody under way who has started over (the stake carried on), three
  // picks into warming up again; and somebody who reached ×20 and then fell back, started over at about ×14, the lamp
  // still lit (×20 reached at any point of the one carried test stays reached), three picks into warming up again
  const UNDER = (now) => now.picks >= 30 && now.stake >= 4.5 && now.stake <= 8 && now.peak >= now.stake * 1.3 && !now.significant;
  const meters = {
    warming: await radioPlayed((now) => now.picks >= 4),
    underWay: await radioPlayed(UNDER, { seed: 7, most: 200, taste: 0.6 }),
    sunk: await radioPlayed((now) => now.picks >= 30 && now.stake < 0.25, { seed: 6, most: 200, taste: 0 }),
    reached: await radioPlayed((now) => now.significant && now.stake >= 20.5 && now.stake <= 29 && now.peak > now.stake * 1.05, { seed: 9, most: 300 }),
    carried: await radioPlayed(UNDER, { seed: 7, most: 200, taste: 0.6, restart: 3 }),
    litCarried: await radioPlayed((now) => now.peak >= 20 && now.stake < 16, { seed: 8, most: 300, taste: 0.6, restart: 3 }),
  };
  const stands = (kept) => standing(kept.trials, kept.carried);
  assert.ok(stands(meters.underWay).stake > 1 && stands(meters.sunk).stake < 1 && stands(meters.reached).stake >= 20 && !stands(meters.underWay).significant, 'the meters are not where they should be');
  assert.ok(meters.carried.carried > 1 && meters.carried.trials.length === 3 && meters.carried.restarts.length === 1, 'the meter after starting over');
  assert.ok(meters.litCarried.carried < 20 && meters.litCarried.restarts[0].peak >= 20 && standing(meters.litCarried.trials, meters.litCarried.carried, meters.litCarried.restarts).significant, 'the meter lit after starting over below ×20');
  // a microphone that hears a hum, and one that may not be used; and a sound recorded with the first
  const { fakeMic } = require('./mic.cjs');
  const [HUM, REFUSED] = [new Function(`(${fakeMic})('hum')`), new Function(`(${fakeMic})('refused')`)];
  const drawer = async (page) => { await page.locator('#jam-mic').click(); await page.waitForSelector('dialog#jam-drawer[open]'); };
  // (three sounds, the newest with the longest name there can be, which is then on the instrument's button)
  const recorded = async (page) => {
    await drawer(page);
    for (let n = 1; n <= 3; n++) {
      await page.locator('#jam-record').click();
      await page.waitForSelector('#jam-record.hearing');
      await sleep(600);
      await page.locator('#jam-record').click();
      await page.waitForSelector(`.jam-sounds li:nth-child(${n + 4})`); // (after the four instruments)
    }
    await page.locator('.jam-sounds input').first().fill('WWWWWWWWWWWW');
    await page.locator('.jam-sounds input').first().press('Enter');
  };
  const eight = async (page) => {
    for (let n = 5; n <= 8; n++) {
      await page.locator('.layer.more').click();
      await page.waitForSelector('dialog#jam-drawer[open]');
      if (n === 5) {
        await page.locator('#jam-record').click();
        await page.waitForSelector('#jam-record.hearing');
        await sleep(600);
        await page.locator('#jam-record').click();
        await page.waitForSelector('.jam-sounds input');
        await page.locator('.jam-sounds input').fill('WWWWWWWWWWWW');
        await page.locator('.jam-sounds input').press('Enter');
      } else await page.locator('.jam-sounds .tile').nth(n % 2 ? 5 : 2).click(); // (the same sound again; or one of the instruments, the keys)
      await page.locator('#jam-drawer-close').click();
      await page.locator('.jam-board .pad').nth(n).click(); // (a note for it, so its light is on the board)
    }
  };
  const PADS = ['^button\\.pad', 'eight tiles across a screen 375 wide, with the page\'s margins: 39 is the room there is', 38];
  const NIGHT = { 'tags:found:v1': ['night'] }; // somebody who has found the night
  // The night, once the way through to it is over: the only screen there is, with nothing left over it; and its picture drawn for the size it is shown at.
  const arrived = async (page) => {
    await page.waitForFunction(() => document.querySelector('.screen-sky') && document.querySelectorAll('#screens .screen').length === 1 && !document.querySelector('.tag-rise'), null, { timeout: 8000 });
    const drawn = await page.evaluate(() => {
      const view = document.querySelector('.sky-view');
      const sharp = Math.min(window.devicePixelRatio || 1, 2);
      return { shown: [view.clientWidth, view.clientHeight].join(' by '), drawnFor: [view.width / sharp, view.height / sharp].join(' by '), window: [window.innerWidth, window.innerHeight].join(' by ') };
    });
    if (drawn.shown !== drawn.window || drawn.drawnFor !== drawn.shown) throw new Error(`the night is shown ${drawn.shown} in a window ${drawn.window}, and its picture is drawn for ${drawn.drawnFor}`);
  };
  // The sleepy cone's stamp (styles.css): on the first screen, and over none of the logo, the title, the face, or what is kept beside it.
  const coneClear = async (page) => {
    const over = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const cone = box('#building');
      if (cone.top < 0 || cone.left < 0 || cone.right > window.innerWidth || cone.bottom > window.innerHeight) return ['the edge of the first screen'];
      return ['.screen-home .mark', '.screen-home h1', '#me-edit', '.tag-kept'].filter((selector) => {
        if (!document.querySelector(selector)) return false;
        const other = box(selector);
        return cone.right > other.left && cone.left < other.right && cone.bottom > other.top && cone.top < other.bottom;
      });
    });
    if (over.length) throw new Error(`the cone's stamp lies over ${over.join(', ')}`);
  };
  return [
    { name: 'home, somebody new', screen: 'home', at: '/', ready: '#welcome-new' },
    { name: 'home, the lobby', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' }, ready: '#menu' },
    // Still being built: a stamp in the top left corner with a sleepy cone on it, opposite the face, and clear of it and of the title.
    { name: 'home, the sleepy cone in its corner, in the dark', screen: 'home', at: '/', storage: { ...ACCOUNT, 'correspondence:theme:v1': 'dark' }, ready: '#menu, .feed-item, #feed-empty',
      then: coneClear },
    // (Play at the head of the page, the face in its corner, and the portal at its foot beside Penny: the lobby with a street of rooms is the longest the page gets)
    { name: 'home, the lobby, at its foot', screen: 'home', at: '/', storage: STREET, ready: '#rooms .street li', then: (page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)), settle: '#portal' },
    { name: 'home, the feed with things waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms(GAMES), ready: '.feed-item' },
    { name: 'home, the feed with nothing waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms([]), ready: '#feed-empty:not([hidden])' },
    // (with room above and below the play button, the first thing waiting on you is still on the first screen, unscrolled)
    { name: 'home, play with room round it, and the first thing waiting', screen: 'home', at: '/', storage: ACCOUNT, server: rooms(GAMES), ready: '.feed-item',
      then: async (page) => {
        const below = await page.evaluate(() => document.querySelector('.feed-item').getBoundingClientRect().bottom - window.innerHeight);
        if (below > 0) throw new Error(`the first thing waiting is ${Math.ceil(below)}px below the first screen`);
      } },
    // Energy, everything earned in every game: one bar under the play button, and the meadow at its end (shared/meadow.js).
    { name: 'home, energy part way to the meadow', screen: 'home', at: '/', storage: { ...ACCOUNT, ...ENERGY(130) }, ready: '#home-energy:not([hidden]) #meadow[disabled]' },
    { name: 'home, the meadow earned and worn', screen: 'home', at: '/', storage: { ...ACCOUNT, ...ENERGY(300) }, ready: '#meadow[aria-pressed="true"]:not([disabled])' },
    { name: 'home, the meadow taken off', screen: 'home', at: '/', storage: { ...ACCOUNT, ...ENERGY(300) }, ready: '#meadow[aria-pressed="true"]',
      then: (page) => page.locator('#meadow').click(), settle: '#meadow[aria-pressed="false"]:not([disabled])' },
    { name: 'opening a room', screen: 'open', at: '/?open', storage: ACCOUNT, ready: '#create-room' },
    { name: 'joining a room', screen: 'join', at: '/?join', storage: ACCOUNT, ready: '#join-room' },
    { name: 'home, the lobby, a street of rooms', screen: 'home', at: '/', storage: STREET, ready: '#rooms .street li' },
    // (each room is a little shop, its name on the board over its window, two lines at most; in the dark, an evening street)
    { name: 'home, the lobby, a street of rooms in the dark', screen: 'home', at: '/', storage: { ...STREET, 'correspondence:theme:v1': 'dark' }, ready: '#rooms .street li' },
    { name: 'a room, with games in it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li' },
    { name: 'a room, empty', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room(), ready: '#no-games:not([hidden])' },
    { name: 'a room, a full table, a long name and a crowd', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '#games li' },
    { name: 'a room, the chat with messages', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES.slice(0, 2), messages: TALK }), ready: '.chat-log li',
      then: (page) => page.locator('#chat').scrollIntoViewIfNeeded() },
    { name: 'a room, seen by somebody not in it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, you: null, messages: null, games: null }), ready: '#join:not([hidden])' },
    { name: 'a room, renaming it', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#room-name button').click(), settle: '#room-name input' },
    // An empty name field says what it is for, in lower case and trailing off: the room's, emptied while renaming it, and
    // the one at the door, for somebody this device has no name for yet.
    { name: 'a room, renaming it, the name cleared', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#room-name button').click(); await page.locator('#room-name input').fill(''); }, settle: '#room-name input:placeholder-shown' },
    { name: 'a room, at its door, somebody with no name yet', screen: 'room', at: `/room/?id=${ROOM}`, server: room({ name: LONG_NAME, you: null, messages: null, games: null }), ready: '#join:not([hidden])', settle: '#join-name:placeholder-shown' },
    // (five at the head of its table, the longest names among them, and all of the building on the screen at once)
    { name: 'a room, at its door, a full table inside', screen: 'room', at: `/room/?id=${ROOM}`, server: room({ name: LONG_NAME, you: null, people: CROWD, messages: null, games: null }), ready: '#join:not([hidden])', settle: '#join-faces .seat:nth-child(5)',
      whole: ['#join .house', '#join-form'] },
    // (somebody sent the link of a game: its board lies lit on the table, and theirs is a name already)
    { name: 'a room, at its door, asked to a game', screen: 'room', at: `/room/?id=${ROOM}&game=33333333-3333-4333-8333-333333333333`, storage: { 'correspondence:name:v1': 'Kit' }, server: room({ you: null, messages: null, games: null }), ready: '#join:not([hidden])', settle: '#join-table.lit .mini',
      whole: ['#join .house', '#join-form'] },
    // The room's two worlds (room/worlds.js): stepping through the portal in its top bar, and the room on the other side,
    // the drama, whole or split by a seam where the cartoon breaks back through (the first time 7 to 11 s after stepping in).
    { name: 'a room, stepping through the portal', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li',
      then: (page) => page.locator('.screen-room > header #worlds').click(), settle: '.screen-room[data-passage="in"]' },
    { name: 'a room, in the other world', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li',
      then: (page) => page.locator('.screen-room > header #worlds').click(), settle: '.screen-room[data-world="serious"]:not([data-passage])' },
    { name: 'a room, split between the two worlds', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '#games li',
      then: (page) => page.locator('.screen-room > header #worlds').click(), settle: '.screen-room[data-world="split"]:not([data-passage])', wait: 20000 },
    { name: 'a room, the chat in the other world', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES.slice(0, 2), messages: TALK }), ready: '.chat-log li',
      then: async (page) => { await page.locator('.screen-room > header #worlds').click(); await page.waitForSelector('.screen-room[data-world="serious"]:not([data-passage])', { timeout: 8000 }); await page.locator('.screen-room > main #chat').scrollIntoViewIfNeeded(); }, settle: '.screen-room[data-world="serious"]' },
    { name: 'a room, writing a pass phrase', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#desk-next').click(); await page.locator('#phrase-text').fill('meet me at the old post office'); }, settle: '#tokens .word' },
    // The quiet room (room/room.css): what is yours to play lies nearest and lit; the table is tidied with one bin.
    { name: 'a room, one game yours to play among the rest', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: [GAMES[3], GAMES[0], GAMES[4], listed({ mode: 'phrase', size: 7, phrase_by: 0 })], messages: TALK }), ready: '#games li[data-state="go"]' },
    // The shelf: each game a wide card, the whole of it the way in. Only the first waiting on you is lit and breathes; the
    // others waiting on you have still, seal-tinted buttons. A full table is eight cards long; a card pressed goes down.
    { name: 'a room, a full table of eight on the shelf', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: TABLE.slice(0, 8), people: CROWD }), ready: '#games li[data-lit]' },
    { name: 'a room, several games waiting on you on the shelf', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: SEVERAL, people: CROWD }), ready: '#games li[data-lit]' },
    { name: 'a room, a game on the shelf pressed', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: SEVERAL }), ready: '#games li[data-lit]',
      then: async (page) => { const box = await page.locator('#games li a.game').first().boundingBox(); await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2); await page.mouse.down(); },
      settle: '#games li[data-lit][data-pressed]' },
    // A tile goes, with one tap, to its desk, the same two steps for every kind of game: how it is played, and then the board
    // it will be played on, drawn ahead, with the way to draw another, and the play mark.
    { name: 'a room, at its desk for a game together', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#modes [data-mode="coop"]').click(), settle: '#desk-how:not([hidden]) .mode-cards li' },
    { name: 'a room, at its desk for a time trial, how it is played', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#modes [data-mode="trial"]').click(), settle: '#desk-how:not([hidden]) .mode-cards li' },
    { name: 'a room, at its desk for a pass phrase, how it is played', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#modes [data-mode="phrase"]').click(), settle: '#desk-how:not([hidden]) .mode-cards li' },
    { name: 'a room, at its desk for a game together, the board', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="coop"]').click(); await page.locator('#desk-next').click(); }, settle: '#desk-board:not([hidden]) #preview-board svg' },
    { name: 'a room, at its desk for a time trial, the biggest board drawn', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { // (the die thrown until the biggest board is drawn)
        await page.locator('#modes [data-mode="trial"]').click();
        await page.locator('#desk-next').click();
        for (let i = 0; i < 80 && (await page.locator('#preview-board').getAttribute('data-size')) !== '9'; i++) await page.locator('#redraw').click();
      }, settle: '#compose:not([hidden]) #preview-board[data-size="9"] svg' },
    { name: 'a room, at its desk, the board drawn again', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="coop"]').click(); await page.locator('#desk-next').click(); await page.locator('#redraw').click(); }, settle: '#compose:not([hidden]) #preview-board svg' },
    { name: 'a room, tidying the table', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '#games li',
      then: (page) => page.locator('#tidy').click(), settle: '.table.tidy' },
    // (with no phrase written, a phrase is picked at random: what it asks, the box, the die lit, and the board drawn ahead;
    // and a phrase written, then the die thrown: the box emptied for one picked at random)
    { name: 'a room, writing a pass phrase, left empty for a random one', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#desk-next').click(); }, settle: '#random-phrase[aria-pressed="true"]' },
    { name: 'a room, writing a pass phrase, the die thrown for a random one', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#desk-next').click(); await page.locator('#phrase-text').fill('meet me at the old post office'); await page.locator('#random-phrase').click(); },
      settle: '#random-phrase[aria-pressed="true"]' },
    // What went wrong (here: nobody at the server) is a short line of its words beside what was tried, for as long as it
    // stands, and what was tried shakes as they come; what was asked in a sheet is tried there, and the sheet shakes and
    // has the words in it.
    { name: 'a room, a game that could not be started', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="trial"]').click(); await page.locator('#desk-next').click(); await page.locator('#phrase-form .start-phrase').click(); }, settle: '#phrase-error:not(:empty)' },
    { name: 'a room, at its desk, a game that could not be started', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#desk-next').click(); await page.locator('#phrase-text').fill('meet me at the old post office'); await page.locator('#phrase-form .start-phrase').click(); },
      settle: '#phrase-error:not(:empty)' },
    { name: 'a room, asked whether to put a game away (the board, not its name)', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#tidy').click(); await page.locator('#games .delete').first().click(); }, settle: 'dialog.ask[open] .picture svg' },
    { name: 'a room, a game that could not be put away', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#tidy').click(); await page.locator('#games .delete').first().click(); await page.locator('dialog.ask[open] button.yes').click(); },
      settle: 'dialog.ask[open] [role="alert"]:not(:empty)' },
    { name: 'a room, a name that could not be changed', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#room-name button').click(); await page.locator('#room-name input').fill('Thursday club'); await page.locator('#room-name input').press('Enter'); },
      settle: '#name-error:not(:empty)' },
    // (the room's options: a pencil and a door)
    { name: 'a room, its options', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#more').click(), settle: '#more-menu:not([hidden])' },
    { name: 'a room, that could not be left', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#more').click(); await page.locator('#leave').click(); await page.locator('dialog.ask[open] button.yes').click(); },
      settle: 'dialog.ask[open] [role="alert"]:not(:empty)' },
    // The meadow, worn by a room (room/meadow.css): paint only, behind everything.
    { name: 'a room, in the meadow', screen: 'room', at: `/room/?id=${ROOM}`, storage: { ...ACCOUNT, ...ENERGY(300) }, server: room({ games: GAMES.slice(0, 3), messages: TALK }), ready: '.screen-room.meadow #games li' },
    { name: 'a room, in the meadow, a full table, a long name and a crowd', screen: 'room', at: `/room/?id=${ROOM}`, storage: { ...ACCOUNT, ...ENERGY(300) }, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '.screen-room.meadow #games li' },
    { name: 'a room, in the meadow, at its desk', screen: 'room', at: `/room/?id=${ROOM}`, storage: { ...ACCOUNT, ...ENERGY(300) }, server: room({ games: GAMES }), ready: '.screen-room.meadow #games li',
      then: (page) => page.locator('#modes [data-mode="coop"]').click(), settle: '#desk-how:not([hidden]) .mode-cards li' },
    { name: 'a room, in the meadow, through the portal to the drama', screen: 'room', at: `/room/?id=${ROOM}`, storage: { ...ACCOUNT, ...ENERGY(300) }, server: rooms(GAMES), ready: '.screen-room.meadow #games li',
      then: (page) => page.locator('.screen-room > header #worlds').click(), settle: '.screen-room[data-world="serious"]:not([data-passage])' },
    { name: 'a room, a link that leads nowhere', screen: 'room', at: '/room/?id=not-a-room', storage: ACCOUNT, ready: '#room-error:not(:empty)' },
    { name: 'opening a room, it went wrong', screen: 'open', at: '/?open', storage: ACCOUNT, ready: '#create-room',
      then: async (page) => { await page.locator('#room-name').fill('Tuesday club'); await page.locator('#create-room button[type="submit"]').click(); },
      settle: '#create-error:not(:empty)' },
    { name: 'joining a room, it went wrong', screen: 'join', at: '/?join', storage: ACCOUNT, ready: '#join-room',
      then: async (page) => { await page.locator('#join-code').fill('K7M-2QP'); await page.locator('#join-room button[type="submit"]').click(); },
      settle: '#join-error:not(:empty)' },
    { name: 'a room, seen by somebody not in it, it went wrong at the door', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, you: null, messages: null, games: null }), ready: '#join:not([hidden])',
      then: (page) => page.locator('#join-form button[type="submit"]').click(), settle: '#join-error:not(:empty)' },
    // (where the phone can hand the code to its share sheet, as an iPhone can: the share button on the mat, by the bell)
    { name: 'a room, at its door, with the code to share', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      init: () => { navigator.share = async () => {}; }, then: (page) => page.locator('.share.mat').scrollIntoViewIfNeeded(), settle: '#share-button:not([hidden])' },
    // (the lobby's street, calm: a room with something waiting on you has its window lit)
    { name: 'home, the lobby, a street with a window lit', screen: 'home', at: '/', storage: STREET, server: rooms(GAMES), ready: '#rooms .street .lot-link.lit' },
    { name: 'the game, the smallest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 5, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'] },
    { name: 'the game, the biggest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 9, seed: 11, players: ['You'] }) }, ready: '#board .cell', whole: ['#board', '#tools'],
      small: [['^button\\.cell', 'nine squares across a screen 375 wide: with no gaps at all each could be 41', 34]] },
    // Energy, playing alone: the bar part way along this board, beside the hearts and the posts, with a great deal held (said only to screen readers)
    { name: 'the game, energy part way, the biggest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': opened(newGame({ size: 9, seed: 11, players: ['You'] }), 4), 'correspondence:energy:v1': { earned: 12840, spent: 0, boards: [{ b: '9:11', p: 4, w: false }] } }, ready: '#energy:not([hidden])', whole: ['#board', '#tools', '#energy'],
      small: [['^button\\.cell', 'nine squares across a screen 375 wide: with no gaps at all each could be 41', 34]] },
    // A board played together: the first time, what is particular to playing together, in place of how to play; and its
    // energy, a shorter bar beside the words of the turn.
    { name: 'the game, energy, the meadow still to come', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': opened(newGame({ size: 7, seed: 12, players: ['You'] }), 2), ...ENERGY(90) }, ready: '#energy:not([hidden]):not(.meadow)', whole: ['#board', '#tools', '#energy'] },
    { name: 'the game, the second bar filled, the thanks', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': opened(newGame({ size: 5, seed: 11, players: ['You'] }), 4), 'correspondence:energy:v1': { earned: 275, spent: 0, boards: [{ b: '5:11', p: 4, w: false }] } }, ready: '#energy:not([hidden])',
      then: async (page) => { const game = await page.evaluate(() => JSON.parse(localStorage.getItem('postmarks:solo:v1'))); await page.locator(`#board .cell[data-cell="${4 * game.size + game.solution[4]}"]`).dblclick(); }, settle: 'dialog.thanks[open]', wait: 15000 },
    { name: 'the game, together, what is particular to it', screen: 'game', at: `/postmarks/?game=${TOGETHER_ID}`, storage: ACCOUNT, server: together, ready: 'dialog.together[open]' },
    { name: 'the game, together, energy beside the turn', screen: 'game', at: `/postmarks/?game=${TOGETHER_ID}`, storage: { ...ACCOUNT, 'postmarks:howto:v1': TOGETHER_ID }, server: together, ready: '#energy:not([hidden])' },
    { name: 'the game, how to play', screen: 'game', at: '/postmarks/', ready: 'dialog.howto[open]' },
    { name: 'the walk, the first place', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 0 }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back'] },
    { name: 'the walk, the last place, with Dot', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 4, 'penny:dot:v1': true, 'penny:walked:v1': true }, ready: '#walk-board .cell', whole: ['#walk-board', '.penny-back', '#walk-down'] },
    { name: 'the film, scene one', screen: 'office', at: '/?office', ready: '.office-stage', whole: ['.office-door'] },
    { name: 'the film, scene two', screen: 'slow', at: '/?slow', ready: '.slow-keep', whole: ['.office-door'] },
    { name: 'the music maker, empty', screen: 'jam', at: '/jam/', ready: '.jam-board .pad', small: [PADS] },
    // (a beat that has just arrived by a link: it is on the board, the note under the board says so, and play is lit until it is played)
    { name: 'the music maker, a shared beat just arrived', screen: 'jam', at: `/jam/?b=${beats[0].code}`, ready: '.jam-board .pad.on', settle: '#jam-play.lit', small: [PADS] },
    // (playing: the first note has set the loop going, the hint above the board has gone, and Penny has come up to dance where there is room.
    // No title is written over the board, since v1.1.82: its name is for screen readers.)
    { name: 'the music maker, playing', screen: 'jam', at: '/jam/', ready: '.jam-board .pad', then: (page) => page.locator('.jam-board .pad').nth(3).click(), settle: '#jam-play.playing', small: [PADS] },
    { name: 'the music maker, with beats saved', screen: 'jam', at: '/jam/', storage: { 'jam:saved:v1': beats }, ready: '.jam-saved li', small: [PADS] },
    // (scrolled to its foot, where the last beat lies along the edge Penny stands on: each beat's own share button is
    // the only one there is, and Penny goes under the edge for it: jam/jam.js)
    { name: 'the music maker, at the foot of its saved beats', screen: 'jam', at: '/jam/', storage: { 'jam:saved:v1': beats }, ready: '.jam-saved li',
      then: (page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)), settle: '.pal[data-height="gone"]', small: [PADS] },
    // Sounds of your own (tests/browser/mic.cjs stands in for the microphone): the drawer with only the instrument in
    // it; while it listens; with sounds recorded and named, one of them in the instrument's place; that instrument's
    // button on the board, wearing the longest name there can be; a sound being deleted; and a microphone refused.
    { name: 'the music maker, the drawer of sounds, empty', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: drawer, settle: 'dialog#jam-drawer[open]' },
    { name: 'the music maker, the microphone listening', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: async (page) => { await drawer(page); await page.locator('#jam-record').click(); }, settle: '#jam-record.hearing' },
    { name: 'the music maker, the drawer with sounds recorded', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: recorded, settle: '.jam-sounds li:nth-child(7)' },
    { name: 'the music maker, an instrument playing a recorded sound', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: async (page) => { await recorded(page); await page.locator('#jam-drawer-close').click(); },
      settle: '#jam-mic[aria-pressed="true"]', small: [PADS] },
    { name: 'the music maker, a sound being deleted', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: async (page) => { await recorded(page); await page.locator('.jam-sounds button.quiet').first().click(); }, settle: 'dialog.ask[open]' },
    // (one of the four instruments in another's place: the bells' button wears the drums' mark and name, and the drawer's button is lit)
    { name: 'the music maker, an instrument playing another instrument', screen: 'jam', at: '/jam/', ready: '.jam-board .pad', then: async (page) => { await drawer(page); await page.locator('.jam-sounds .tile').nth(3).click(); await page.locator('#jam-drawer-close').click(); },
      settle: '.layer[data-wears="Drums"]', small: [PADS] },
    // (the deck: a place being added to it, with nothing chosen yet; and all eight places taken, the last with the longest name)
    { name: 'the music maker, a place being added to the deck', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: (page) => page.locator('.layer.more').click(), settle: 'dialog#jam-drawer[open]' },
    { name: 'the music maker, a deck of eight', screen: 'jam', at: '/jam/', init: HUM, ready: '.jam-board .pad', then: eight, settle: '.layer.more[hidden]', small: [PADS] },
    { name: 'the music maker, the microphone refused', screen: 'jam', at: '/jam/', init: REFUSED, ready: '.jam-board .pad', then: async (page) => { await drawer(page); await page.locator('#jam-record').click(); },
      settle: '#jam-mic-error.oops:not(:empty)' },
    // Penny's Radio: a work in a gallery, played and read about. Its story is told once; these are its stills.
    // (told: nobody comes to show how, and nothing opens by itself.)
    { name: 'Penny’s Radio', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', whole: SET },
    // (arriving with twelve stations kept, two of them presets: the room is the same as on the first day)
    { name: 'Penny’s Radio, under way', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': kept }, ready: '.radio .presets i.lit', whole: SET },
    // (the attendant's sign hangs over the gallery's label)
    { name: 'Penny’s Radio, being shown how', screen: 'taste', at: '/jam/?taste', ready: '#radio-dash:not([hidden])', settle: '#dash-sign [data-order]', whole: [...SET, '#radio-dash', '#dash-sign'] },
    // (a station kept before both were heard: the sign says not yet, and stands 900 ms. The two taps are made in the
    // page, a moment apart by its own clock, so that a late machine cannot stretch them into two single taps.)
    { name: 'Penny’s Radio, a station refused', screen: 'taste', at: '/jam/?taste', ready: '#radio-dash:not([hidden])',
      then: async (page) => {
        await page.waitForSelector('#dash-sign [data-order]');
        await page.evaluate(() => {
          const card = document.querySelector('.taste-card');
          const box = card.getBoundingClientRect();
          const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, isPrimary: true, bubbles: true, pointerId: 1 };
          for (let tap = 0; tap < 2; tap++) for (const type of ['pointerdown', 'pointerup']) card.dispatchEvent(new PointerEvent(type, at));
        });
      },
      settle: '#dash-sign [data-order="not-yet"]', whole: [...SET, '#radio-dash', '#dash-sign'] },
    // (with no Dot: Penny stands under the tag, in front of the plinth, and cannot say what it is)
    { name: 'Penny’s Radio, Penny asks about the tag', screen: 'taste', at: '/jam/?taste', storage: { 'radio:taught:v1': true, 'radio:story:v1': 'seen' }, ready: '.radio .dot',
      then: (page) => page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'trying', null, { timeout: 15000 }), settle: '.radio-world[data-story="trying"]', wait: 15000, whole: SET },
    // (a finger held down on the map keeps the sheet from opening over Dot's line, as it would for anybody)
    { name: 'Penny’s Radio, Dot says it', screen: 'taste', at: '/jam/?taste', storage: { ...withDot, 'radio:taught:v1': true, 'radio:story:v1': 'seen' }, ready: '.radio .dot',
      then: async (page) => { await page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'telling', null, { timeout: 25000 }); await page.mouse.move(24, 120); await page.mouse.down(); },
      settle: '#dot-says span.said:last-child', wait: 25000, whole: [...SET, '#dot-says'] },
    // (the reading scrolls; the way back to the radio, at its foot, does not, and is always wholly on the screen)
    { name: 'Penny’s Radio, reading about it', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog#taste-behind[open]', whole: ['#taste-behind-close'] },
    { name: 'Penny’s Radio, reading about it, under way', screen: 'taste', at: '/jam/?taste', storage: { ...told, ...withDot, 'jam:taste:v1': kept }, ready: '.radio .presets i.lit',
      then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog#taste-behind[open] #dot-told:not([hidden])', whole: ['#taste-behind-close'] },
    // (the test significant: the same sheet, the caption in the same voice, and what the model thinks you go for)
    { name: 'Penny’s Radio, reading about it, significant', screen: 'taste', at: '/jam/?taste', storage: { ...told, ...withDot, 'jam:taste:v1': packed(found) }, ready: '.radio .dot',
      then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog#taste-behind[open] #lab-meter.done', whole: ['#taste-behind-close'] },
    // (the presets have no words: the set's lamps, and each station saved as its picture and its place on the dial)
    { name: 'Penny’s Radio, its presets', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': kept }, ready: '.radio .presets i.lit', then: (page) => page.locator('#taste-presets-open').click(), settle: 'dialog#taste-presets[open] .preset-list a', whole: ['#taste-presets-close'] },
    { name: 'Penny’s Radio, its presets, none yet', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', then: (page) => page.locator('#taste-presets-open').click(), settle: 'dialog#taste-presets[open]', whole: ['#taste-presets-close'] },
    // (the meter in the speaker: the stake of the test, without a word; it keeps the set at its size in every state)
    { name: 'Penny’s Radio, the meter warming up', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.warming }, ready: '#radio-meter.warming .g-pip.on', whole: SET },
    { name: 'Penny’s Radio, the meter under way', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.underWay }, ready: '#radio-meter.risen:not(.warming):not(.lit)', whole: SET },
    { name: 'Penny’s Radio, the meter sunk below ×1', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.sunk }, ready: '#radio-meter:not(.warming):not(.lit)', whole: SET },
    { name: 'Penny’s Radio, the meter at significance', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.reached }, ready: '#radio-meter.lit:not(.warming)', whole: SET },
    { name: 'Penny’s Radio, the meter after starting over', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.carried }, ready: '#radio-meter.warming .g-pip.on', whole: SET },
    { name: 'Penny’s Radio, the meter lit after starting over below ×20', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.litCarried }, ready: '#radio-meter.warming.lit .g-pip.on', whole: SET },
    // (the reading after starting over: what was carried over is a row of its own)
    { name: 'Penny’s Radio, reading about it, after starting over', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': meters.carried }, ready: '.radio .dot',
      then: (page) => page.locator('#taste-behind-open').click(), settle: 'dialog#taste-behind[open] #lab-carried-row:not([hidden])', whole: ['#taste-behind-close'] },
    // The night, which is on no menu: it is a tag, hidden in the app (penny/tags.js). All of it is one picture, and the only thing to press is the way back.
    { name: 'the night', screen: 'sky', at: '/?sky', ready: '.sky-view', settle: '.sky[data-alive]', whole: ['.penny-back'] },
    { name: 'the night, left alone until the way back has gone', screen: 'sky', at: '/?sky', ready: '.sky-view', settle: '.sky.idle', wait: 9000, whole: ['.penny-back'] },
    // ...what is kept of it on the home page once it has been found, across the map from the portal...
    { name: 'home, somebody new, with the night kept', screen: 'home', at: '/', storage: { ...NIGHT }, ready: '.tag-kept' },
    { name: 'home, the lobby, with the night kept', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby', ...NIGHT }, ready: '.tag-kept' },
    { name: 'home, the sleepy cone beside the night kept', screen: 'home', at: '/', storage: { ...ACCOUNT, ...NIGHT }, ready: '.tag-kept', then: coneClear },
    { name: 'home, the feed, with the night kept', screen: 'home', at: '/', storage: { ...ACCOUNT, ...NIGHT }, server: rooms(GAMES), ready: '.tag-kept', settle: '.feed-item' },
    // ...the night as it is when it has been come to, by the tumble, from a page longer than the screen: the size of the screen, with
    // its picture drawn for that size (it was once drawn for the length of the page it was come to from, and squashed to fit)...
    { name: 'the night, come to through the mark from a long page', screen: 'sky', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' }, ready: '.tag-hidden:not([hidden])',
      then: async (page) => { await page.locator('.tag-hidden').click(); await arrived(page); }, settle: '.sky[data-alive]', whole: ['.penny-back'] },
    { name: 'the night, come to from what is kept on a long home page', screen: 'sky', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby', ...NIGHT }, ready: '.tag-kept',
      then: async (page) => { await page.locator('.tag-kept').click(); await arrived(page); }, settle: '.sky[data-alive]', whole: ['.penny-back'] },
    // ...and the mark it is found by, hidden somewhere on other screens and somewhere else each time: small, and still something to press.
    // It is not put down until a screen has settled, so these wait for it. (Found already, it is there all the same, a little plainer.)
    // It is only where there is room for it: in a room that is on the map outside the door, at the bottom of the page; and in the
    // music maker, on a phone, there is none, so it has no test screen there.
    ...[
      { where: 'on the home page', screen: 'home', at: '/' },
      { where: 'on the home page, in the lobby', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' } },
      { where: 'where a room is opened', screen: 'open', at: '/?open', storage: ACCOUNT },
      { where: 'where a room is joined', screen: 'join', at: '/?join', storage: ACCOUNT },
      { where: 'outside the door of a room', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: rooms(GAMES), ready: '#games li', then: (page) => page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight)) },
      { where: 'on the map behind the smallest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 5, seed: 11, players: ['You'] }) } },
      { where: 'on the map behind the biggest board', screen: 'game', at: '/postmarks/', storage: { ...played, 'postmarks:solo:v1': newGame({ size: 9, seed: 11, players: ['You'] }) },
        small: [['^button\\.cell', 'nine squares across a screen 375 wide: with no gaps at all each could be 41', 34]] },
      { where: 'on the walk', screen: 'walk', at: '/?walk', storage: { 'penny:place:v1': 3 } },
      { where: 'in the film, scene one', screen: 'office', at: '/?office' },
      { where: 'in the film, scene two', screen: 'slow', at: '/?slow' },
      { where: 'on Penny’s Radio', screen: 'taste', at: '/jam/?taste', storage: told },
      { where: 'on Penny’s Radio, found already', screen: 'taste', at: '/jam/?taste', storage: { ...told, ...NIGHT } },
    ].map(({ where, ready, ...state }) => ({ name: `the hidden mark, ${where}`, ...state, ...(ready ? { ready, settle: '.tag-hidden:not([hidden])' } : { ready: '.tag-hidden:not([hidden])' }) })),
  ];
}

// One state on one phone: what is wrong with it, as a list of sentences. Empty is right.
async function look(browser, origin, phoneName, state) {
  const { context, page, phone, errors } = await open(browser, phoneName, { storage: state.storage ?? {}, server: state.server });
  const wrong = [];
  try {
    if (state.init) await page.addInitScript(state.init); // (what the phone has that this browser has not)
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
  const asked = process.env.PHONES === 'all' ? ENDS : (process.env.PHONES ?? 'mini-safari,mini-app').split(',').map((name) => name.trim()).filter(Boolean);
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
