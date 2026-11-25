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
//   init(): run in the page before it loads (what an iPhone has that this browser has not).
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
  // the radio: what of the set must be wholly on the screen, and the gallery's label on its plinth; somebody who has heard
  // its story out; somebody who has found Dot
  const SET = ['.radio .body', '.radio .antenna', '.radio .handle', '.radio .feet', '.radio .lab-plate', '.penny-back', '#taste-behind-open', '.plinth .gallery-label'];
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
  const PADS = ['^button\\.pad', 'eight tiles across a screen 375 wide, with the page\'s margins: 39 is the room there is', 38];
  const NIGHT = { 'tags:found:v1': ['night'] }; // somebody who has found the night
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
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#phrase-text').fill('meet me at the old post office'); }, settle: '#tokens .word' },
    // The quiet room (room/room.css): what is yours to play lies nearest and lit; a tile lifts before it starts a game; the table is tidied with one bin.
    { name: 'a room, one game yours to play among the rest', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: [GAMES[3], GAMES[0], GAMES[4], listed({ mode: 'phrase', size: 7, phrase_by: 0 })], messages: TALK }), ready: '#games li[data-state="go"]' },
    { name: 'a room, a tile lifted before a game is started', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#modes [data-mode="coop"]').click(), settle: '#modes [data-armed]' },
    { name: 'a room, tidying the table', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: TABLE, people: CROWD }), ready: '#games li',
      then: (page) => page.locator('#tidy').click(), settle: '.table.tidy' },
    // (with no phrase written, the start is a die: a phrase is picked at random)
    { name: 'a room, writing a pass phrase, left empty for a random one', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#modes [data-mode="phrase"]').click(), settle: '#phrase-form .start-phrase.random' },
    // (...and the die lifted by a first tap, the play mark beside it: a second would start the game, and tell the room)
    { name: 'a room, writing a pass phrase, the die lifted', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="phrase"]').click(); await page.locator('#phrase-form .start-phrase.random').click(); }, settle: '#phrase-form .start-phrase[data-armed]' },
    // What went wrong (here: nobody at the server) is a shake of what was tried and a soft red mark beside it, pressed
    // for its words; what was asked in a sheet is tried there, and the sheet shakes and has the mark in it.
    { name: 'a room, a game that could not be started', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="trial"]').click(); await page.locator('#modes [data-mode="trial"]').click(); }, settle: '.start .oops-mark:not([hidden])' },
    { name: 'a room, a game that could not be started, the mark pressed for its words', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#modes [data-mode="trial"]').click(); await page.locator('#modes [data-mode="trial"]').click(); await page.locator('.start .oops-mark:not([hidden])').click(); },
      settle: '#game-error:not(.sr-only):not(:empty)' },
    { name: 'a room, asked whether to put a game away (the board, not its name)', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#tidy').click(); await page.locator('#games .delete').first().click(); }, settle: 'dialog.ask[open] .picture svg' },
    { name: 'a room, a game that could not be put away', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#tidy').click(); await page.locator('#games .delete').first().click(); await page.locator('dialog.ask[open] button.yes').click(); await page.locator('dialog.ask[open] .oops-mark:not([hidden])').click(); },
      settle: 'dialog.ask[open] [role="alert"]:not(.sr-only):not(:empty)' },
    { name: 'a room, a name that could not be changed', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#room-name button').click(); await page.locator('#room-name input').fill('Thursday club'); await page.locator('#room-name input').press('Enter'); },
      settle: '#room-name .oops-mark:not([hidden])' },
    // (the room's options: a pencil and a door)
    { name: 'a room, its options', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: (page) => page.locator('#more').click(), settle: '#more-menu:not([hidden])' },
    { name: 'a room, that could not be left', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      then: async (page) => { await page.locator('#more').click(); await page.locator('#leave').click(); await page.locator('dialog.ask[open] button.yes').click(); },
      settle: 'dialog.ask[open] .oops-mark:not([hidden])' },
    { name: 'a room, a link that leads nowhere', screen: 'room', at: '/room/?id=not-a-room', storage: ACCOUNT, ready: '#room-error:not(:empty)', settle: '.plot > .oops-mark:not([hidden])' },
    { name: 'opening a room, it went wrong', screen: 'open', at: '/?open', storage: ACCOUNT, ready: '#create-room',
      then: async (page) => { await page.locator('#room-name').fill('Tuesday club'); await page.locator('#create-room button[type="submit"]').click(); await page.locator('#create-room .oops-mark:not([hidden])').click(); },
      settle: '#create-error:not(.sr-only):not(:empty)' },
    { name: 'joining a room, it went wrong', screen: 'join', at: '/?join', storage: ACCOUNT, ready: '#join-room',
      then: async (page) => { await page.locator('#join-code').fill('K7M-2QP'); await page.locator('#join-room button[type="submit"]').click(); },
      settle: '#join-room .oops-mark:not([hidden])' },
    { name: 'a room, seen by somebody not in it, it went wrong at the door', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ name: LONG_NAME, you: null, messages: null, games: null }), ready: '#join:not([hidden])',
      then: async (page) => { await page.locator('#join-form button[type="submit"]').click(); await page.locator('#join-form .oops-mark:not([hidden])').click(); }, settle: '#join-error:not(.sr-only):not(:empty)' },
    // (where the phone can hand the code to its share sheet, as an iPhone can: the share button on the mat, by the bell)
    { name: 'a room, at its door, with the code to share', screen: 'room', at: `/room/?id=${ROOM}`, storage: ACCOUNT, server: room({ games: GAMES }), ready: '#games li',
      init: () => { navigator.share = async () => {}; }, then: (page) => page.locator('.share.mat').scrollIntoViewIfNeeded(), settle: '#share-button:not([hidden])' },
    // (the lobby's street, calm: a room with something waiting on you has its window lit)
    { name: 'home, the lobby, a street with a window lit', screen: 'home', at: '/', storage: STREET, server: rooms(GAMES), ready: '#rooms .street .lot-link.lit' },
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
    // Penny's Radio: a work in a gallery, played and read about. Its story is told once; these are its stills.
    // (told: nobody comes to show how, and nothing opens by itself.)
    { name: 'Penny’s Radio', screen: 'taste', at: '/jam/?taste', storage: told, ready: '.radio .dot', whole: SET },
    // (arriving with twelve stations kept, two of them presets: the room is the same as on the first day)
    { name: 'Penny’s Radio, under way', screen: 'taste', at: '/jam/?taste', storage: { ...told, 'jam:taste:v1': kept }, ready: '.radio .presets i.lit', whole: SET },
    // (the attendant's sign hangs over the gallery's label)
    { name: 'Penny’s Radio, being shown how', screen: 'taste', at: '/jam/?taste', ready: '#radio-dash:not([hidden])', settle: '#dash-sign [data-order]', whole: [...SET, '#radio-dash', '#dash-sign'] },
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
    // The night, which is on no menu: it is a tag, hidden in the app (penny/tags.js). All of it is one picture, and the only thing to press is the way back.
    { name: 'the night', screen: 'sky', at: '/?sky', ready: '.sky-view', settle: '.sky[data-alive]', whole: ['.penny-back'] },
    { name: 'the night, left alone until the way back has gone', screen: 'sky', at: '/?sky', ready: '.sky-view', settle: '.sky.idle', wait: 9000, whole: ['.penny-back'] },
    // ...what is kept of it on the home page once it has been found, across the map from the portal...
    { name: 'home, somebody new, with the night kept', screen: 'home', at: '/', storage: { ...NIGHT }, ready: '.tag-kept' },
    { name: 'home, the lobby, with the night kept', screen: 'home', at: '/', storage: { ...ACCOUNT, 'home:tab:v1': 'lobby', ...NIGHT }, ready: '.tag-kept' },
    { name: 'home, the feed, with the night kept', screen: 'home', at: '/', storage: { ...ACCOUNT, ...NIGHT }, server: rooms(GAMES), ready: '.tag-kept', settle: '.feed-item' },
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
