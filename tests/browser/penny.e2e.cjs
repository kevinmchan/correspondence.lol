// Penny, in a real browser. `npm run e2e`.
//
// The rules of the places are checked in tests/penny.test.js, which needs only
// Node. This checks the part that only exists in a browser: that Penny is
// where it should be and nowhere else, that the whole first quarter can be
// walked from the home page to Dot, by touch and by keyboard and with reduced
// motion, and that nothing throws on the way. It needs Playwright with
// Chromium; where that is not installed it says so and passes (unless
// REQUIRE_BROWSER is set, as it is where pull requests are checked).
//
// It serves the repository itself, talks to no server, and takes about three
// minutes: nothing in the app is sped up for it, so what passes here is what
// a person gets.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  // (where pull requests are checked, REQUIRE_BROWSER is set: there a missing browser is a failure, not a pass)
  const must = Boolean(process.env.REQUIRE_BROWSER);
  console.log(`Playwright is not installed: ${must ? 'and here it has to be.' : 'skipping the browser checks.'}`);
  process.exit(must ? 1 : 0);
}

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain' };
const server = http.createServer((request, response) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (!file.startsWith(ROOT)) return response.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

const PHONE = { width: 390, height: 844 };
const ACCOUNT = {
  'correspondence:name:v1': 'Sam',
  'correspondence:rooms:v1': [{ id: '11111111-1111-4111-8111-111111111111', name: 'Book club', at: 1795000000000 }, { id: '22222222-2222-4222-8222-222222222222', name: 'Family', at: 1795000000000 }],
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  // One check: its own window, its own storage. Any error on the page fails it.
  async function check(name, { storage = {}, viewport = PHONE, ...options }, run) {
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return null; // ONLY=regex runs the checks it names
    const started = Date.now();
    const context = await browser.newContext({ viewport, ...options });
    await context.route(/supabase\.co/, (route) => route.abort());
    await context.addInitScript((store) => {
      if (sessionStorage.getItem('e2e:seeded')) return; // once a window: a reload must keep what the app has saved
      sessionStorage.setItem('e2e:seeded', '1');
      for (const [key, value] of Object.entries(store)) localStorage.setItem(key, JSON.stringify(value));
    }, storage);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Failed to load resource|net::ERR|supabase/i.test(message.text())) errors.push(message.text());
    });
    let failure = null;
    try {
      await run(page, helpers(page));
      assert.deepEqual(errors, [], 'errors on the page');
    } catch (error) {
      failure = error;
    }
    await context.close();
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`${failure ? 'not ok' : 'ok'} - ${name} (${seconds}s)`);
    if (failure) console.log(`  ${String(failure.stack || failure).split('\n').slice(0, 6).join('\n  ')}`);
    return !failure;
  }

  const helpers = (page) => {
    const pal = () => page.evaluate(() => {
      const it = document.querySelector('.pal');
      if (!it) return { height: 'gone', mood: null, alone: true, x: 0 };
      return { height: it.dataset.height, mood: it.dataset.mood, alone: it.classList.contains('alone'), x: Number(it.style.getPropertyValue('--x')) };
    });
    const feeling = () => page.evaluate(() => document.querySelector('#walk-feeling')?.textContent ?? '');
    const board = () => page.evaluate(() => [...document.querySelectorAll('#walk-board .cell')].map((cell) => ({ empty: '.', cross: 'x', letter: 'L' }[cell.dataset.state])).join(''));
    const centre = async (cell) => {
      const box = await page.locator('#walk-board .cell').nth(cell).boundingBox();
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    const tap = async (cell) => page.mouse.click(...(await centre(cell)));
    const idle = () => page.waitForFunction(() => !document.querySelector('#walk-board').classList.contains('busy'), null, { timeout: 30000 });
    // A double tap, and then wait until Penny has finished with what it found.
    const open = async (cell) => {
      await page.mouse.click(...(await centre(cell)), { clickCount: 2, delay: 40 });
      await sleep(300);
      await idle();
    };
    const until = (mood, timeout = 15000) => page.waitForFunction((want) => [].concat(want).includes(document.querySelector('.pal')?.dataset.mood), mood, { timeout });
    const says = (text, timeout = 15000) => page.waitForFunction((want) => document.querySelector('#walk-feeling')?.textContent.includes(want), text, { timeout });
    const portalOpen = () => page.evaluate(() => !document.querySelector('#walk-portal').hidden);
    const through = async () => {
      await sleep(800); // the portal is still unfolding
      await page.locator('#walk-portal').click({ force: true });
      await sleep(1700);
      await idle();
    };
    const stored = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    // what a person could read on the screen (not what is there for screen readers only)
    const words = (selector) => page.evaluate((sel) => {
      const seen = [];
      const walk = (node) => {
        if (node.nodeType === 3) { if (node.textContent.trim()) seen.push(node.textContent.trim()); return; }
        if (node.nodeType !== 1 || node.classList.contains('sr-only') || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(node.tagName)) return;
        node.childNodes.forEach(walk);
      };
      document.querySelectorAll(sel).forEach(walk);
      return seen;
    }, selector);
    // what can be read in the radio's reading, in order (not what is there for screen readers only)
    const reading = () => page.locator('#taste-behind .taste-lab').evaluate((sheet) => [...sheet.querySelectorAll('p, blockquote, figcaption, dd, dt, h2, h3, summary, span, li')]
      .filter((one) => one.getClientRects().length && !one.closest('.sr-only') && [...one.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()))
      .map((one) => one.textContent.replace(/\s+/g, ' ').trim()));
    return { pal, feeling, board, centre, tap, open, idle, until, says, portalOpen, through, stored, words, reading };
  };

  // The question Penny's Radio asks, and what its reading is held to (README, "The question Penny's Radio asks"): it is
  // met before the numbers and how it works; nothing right after it reads as a reply to it (a yes, a no, a "not yet", a
  // "significant"); and nothing after it answers it.
  const QUESTION = 'Is a radio that learns one person’s taste a defence of that taste, or one more step in the averaging?';
  function leftOpen(read) {
    const asked = read.indexOf(QUESTION);
    assert.ok(asked > 0, 'the reading asks the question');
    assert.ok(asked < read.indexOf('Picks') && asked < read.findIndex((one) => /^How it works$/i.test(one)), `the question comes after the numbers or how it works: ${JSON.stringify(read)}`);
    assert.doesNotMatch(read[asked + 1] ?? '', /^(yes|no|not|significant)\b/i, `the first words after the question read as its answer: ${read[asked + 1]}`);
    assert.doesNotMatch(read.slice(asked + 1).join(' '), /defen[cs]e|averag|narrow|homogen|answer/i, 'something after the question answers it');
  }
  // Radios under way, packed as jam/taste.js keeps them: twelve stations kept, two of them presets; and somebody with a
  // marked taste (always the faster, with drums and a low tune), kept until the test is significant.
  const { encode } = await import('../../jam/beat.js');
  const { FEATURES, begin, choose, features, standing } = await import('../../jam/taste-model.js');
  const pack = (pair) => ({ ...pair, front: encode(pair.front), back: encode(pair.back), phantom: encode(pair.phantom) });
  const packed = (radio) => ({ v: 1, streak: radio.streak, retired: radio.retired.map(encode), trials: radio.trials.map(pack), current: pack(radio.current) });
  const radios = (() => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const twelve = begin(random);
    for (let i = 0; i < 12; i++) choose(twelve, twelve.current.reigning ?? 'front', random);
    const taste = [];
    for (const [name, much] of [['tempo', 4], ['drums', 3], ['bellsHigh', -4], ['space', -3]]) taste[FEATURES.findIndex((one) => one.key === name)] = much;
    const like = (beat) => features(beat).reduce((sum, value, i) => sum + value * (taste[i] ?? 0), 0);
    const found = begin(random);
    while (!standing(found.trials).significant && found.trials.length < 600) choose(found, like(found.current.front) >= like(found.current.back) ? 'front' : 'back', random);
    assert.equal(standing(found.trials).significant, true, 'a marked taste was not found in 600 picks');
    return { underWay: packed(twelve), significant: packed(found) };
  })();

  const results = await Promise.all([
    check('the film is asked for, never forced: the app opens on the home page, and scene one has a door back', {}, async (page) => {
      await page.goto(origin);
      await page.waitForSelector('.home-map');
      assert.equal(new URL(page.url()).search, '', 'someone new: the home page');
      assert.match(await page.locator('#version').textContent(), /^v\d+\.\d+\.\d+$/, 'the version at the bottom of the home page');
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office-stage');
      await page.locator('.office-door').click({ force: true });
      await page.waitForSelector('.home-map');
    }),

    check('scene one: every screen loops, no two turns alike; a swipe up goes on; Penny shows how to whoever waits on the first', {}, async (page) => {
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office[data-screen="0"]');
      const where = () => page.evaluate(() => { const it = document.querySelector('.office'); return [Number(it.dataset.screen), Number(it.dataset.turn)]; });
      const turned = (screen, turn, timeout = 40000) => page.waitForSelector(`.office[data-screen="${screen}"][data-turn="${turn}"]`, { timeout });
      const left = () => page.locator('.o-leaving:not(.gone)').count();
      const swipe = async (fromY, toY, x = 195) => {
        await page.mouse.move(x, fromY);
        await page.mouse.down();
        await page.mouse.move(x, toY, { steps: 6 });
        await page.mouse.up();
      };
      assert.equal(await left(), 5, 'the mail on the shelves at the start');
      await page.waitForSelector('.o-touch', { state: 'attached', timeout: 9000 }); // caught waiting: shown
      assert.equal(await left(), 4, 'one letter gone after one turn of the loop');
      await swipe(300, 600); // down: not the way
      await swipe(600, 590); // a tap
      await sleep(300);
      assert.equal((await where())[0], 0, 'something other than a swipe up moved it on');
      // left alone it only loops, and each turn another letter has gone
      await turned(0, 2);
      assert.equal(await left(), 3);
      assert.equal((await where())[0], 0, 'the scene moved on by itself');

      await swipe(600, 300);
      await turned(1, 0, 2000);
      assert.equal(await page.locator('.o-touch').count(), 0, 'still being shown how after doing it');
      assert.equal(await page.locator('.office').getAttribute('data-pace'), 'fast', 'the room is in a hurry while Penny is');
      await turned(1, 4);
      await sleep(300);
      assert.equal(await left(), 0, 'mail still on the shelves when Penny is the last one left');
      assert.equal(await page.locator('.o-touch').count(), 0, 'shown how on a screen that is not the first');
      assert.equal(await page.locator('.p-penny.low').count(), 1, 'it has stopped trying to be quick');
      assert.equal(await page.locator('.office').getAttribute('data-pace'), 'slowing', 'and only then does the room slow');

      await page.keyboard.press('ArrowUp');
      await turned(2, 2);
      await page.waitForSelector('.o-map rect.near'); // it has placed the sound
      assert.equal(await page.locator('.office').getAttribute('data-pace'), 'slow');
      await swipe(600, 300);
      await turned(3, 0, 2000);
      assert.equal(await page.locator('.o-first.lit').count(), 0);
      await turned(3, 1);
      assert.equal(await page.locator('.o-first.lit').count(), 1, 'the square lit');
      await swipe(600, 300);
      await page.waitForURL(/\?slow/, { timeout: 5000 }); // on, to scene two
    }),

    check('scene two: what is drawn fast is gone, what is drawn slowly stays, and then there is a way on', {}, async (page) => {
      await page.goto(`${origin}/?slow`);
      await page.waitForSelector('.slow-keep');
      // how much is on the sheet that keeps things
      const kept = () => page.evaluate(() => {
        const sheet = document.querySelector('.slow-keep');
        const data = sheet.getContext('2d').getImageData(0, 0, sheet.width, sheet.height).data;
        let marked = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 40) marked += 1;
        return marked;
      });
      await page.waitForSelector('.slow-tip.on', { timeout: 9000 }); // caught waiting: shown
      await sleep(4500);
      assert.equal(await kept(), 0, 'what Penny showed was left on the page');
      // a rush across the room
      await page.mouse.move(40, 300);
      await page.mouse.down();
      await page.mouse.move(350, 380, { steps: 1 });
      await page.mouse.move(40, 460, { steps: 1 });
      await page.mouse.up();
      assert.equal(await kept(), 0, 'a rush left something behind');
      assert.equal(await page.locator('#slow-portal').isVisible(), false, 'the way on opened for nothing');
      assert.equal(await page.locator('.slow-tip.on').count(), 0, 'still being shown how after a touch');
      // and the same room, taken slowly
      await page.mouse.move(110, 520);
      await page.mouse.down();
      for (let i = 0; i < 220; i++) {
        await page.mouse.move(130 + Math.cos(i / 20) * (30 + i * 0.3), 430 + Math.sin(i / 20) * (30 + i * 0.3));
        await sleep(12);
      }
      await sleep(2500); // held still: a flower
      await page.mouse.up();
      assert.ok(await kept() > 2000, 'a slow line did not stay');
      assert.equal(await page.locator('.slow').getAttribute('data-pace'), 'slow');
      // the keyboard draws too
      const before = await kept();
      for (let i = 0; i < 40; i++) { await page.keyboard.press(i < 20 ? 'ArrowRight' : 'ArrowUp'); await sleep(30); }
      assert.ok(await kept() > before, 'the arrow keys drew nothing');
      await page.waitForSelector('#slow-portal:not([hidden])', { timeout: 20000 });
      await page.locator('#slow-portal').click({ force: true }); // (it breathes: it is never quite still)
      await page.waitForURL(/\?walk/, { timeout: 5000 });
    }),

    check('home, first visit: Penny alone, not a word, and the way through the portal', {}, async (page, { pal, words }) => {
      await page.goto(`${origin}/?home`);
      await sleep(2700);
      let it = await pal();
      assert.ok(['peek', 'low'].includes(it.height), `at rest Penny waits low, not ${it.height}`);
      assert.equal(it.alone, true, 'Dot has not been found yet');
      await page.waitForFunction(() => Number(document.querySelector('.pal').style.getPropertyValue('--x')) < 0.3, null, { timeout: 15000 });
      it = await pal();
      assert.ok(['up', 'peek'].includes(it.height), 'Penny has come up to show the portal');
      assert.deepEqual((await words('.pal')).filter((text) => text !== '♥'), [], 'nothing written in Penny\'s layer');
      await page.locator('#portal').click({ force: true });
      await page.waitForURL(/\?walk/);
      await sleep(2500);
      assert.equal((await pal()).height, 'face');
      // (the portal was pressed while Penny was still walking over to it: that walk must not carry on here)
      assert.equal(await page.evaluate(() => document.querySelector('.pal-penny').classList.contains('walking')), false, 'not still walking');
      assert.deepEqual((await words('main.walk')).filter((text) => text !== '×'), [], 'no words on the map');
      await page.locator('.penny-back').click();
      await page.waitForURL((url) => url.search === '');
      await sleep(900);
      assert.notEqual((await pal()).height, 'gone', 'and Penny is at home again');
    }),

    check('the first quarter, start to finish, by touch', {}, async (page, h) => {
      await page.goto(`${origin}/?walk`);
      await sleep(1600);
      // place 1: one tap leaves the square ajar and Penny listens, and hears the post; two taps open it
      await h.tap(0);
      assert.equal(await page.locator('#walk-board .cell.ajar').count(), 1, 'one tap leaves the square ajar');
      await h.says('right here');
      await page.waitForFunction(() => !document.querySelector('#walk-board .cell.ajar'));
      await h.tap(0);
      await h.until('holding');
      await h.until('hopeful'); // nothing came: the breath is let go
      await h.open(0);
      assert.equal(await h.board(), 'L');
      assert.ok(await h.portalOpen());
      assert.equal(await page.locator('#walk-trail').isHidden(), true, 'nothing of the sound heard yet');
      await h.through();

      // place 2. One square is the only one of its colour, so it must hold a post: Penny's seal lands on it before anything is touched
      const known = () => page.evaluate(() => [...document.querySelectorAll('#walk-board .cell.known')].map((cell) => Number(cell.dataset.cell)));
      await page.waitForFunction(() => document.querySelector('#walk-board .cell.known'), null, { timeout: 6000 });
      assert.deepEqual(await known(), [14], 'the seal is on the only square of its colour, and nowhere else');
      // a quick tap crosses a square and takes the cross off; holding a finger down only asks
      await h.tap(10);
      await sleep(600);
      assert.equal((await h.board())[10], 'x', 'a quick tap crosses the square');
      await h.tap(10);
      await sleep(600);
      assert.equal((await h.board())[10], '.', 'and takes the cross off again');
      await page.mouse.move(...(await h.centre(0)));
      await page.mouse.down();
      await h.says('close'); // the post is next door
      await page.mouse.up();
      assert.equal((await h.board())[0], '.', 'holding is listening: no cross');
      assert.equal(await page.locator('#walk-board .cell').nth(0).evaluate((cell) => cell.classList.contains('heard') && !cell.classList.contains('known')), true, 'what is heard shows on the square as warmth, not as a seal');
      // a cross over a post it can hear frightens it
      await h.tap(1);
      await h.says('alarmed');
      await sleep(600); // (sooner, and the two taps would be a double tap)
      await h.tap(1);
      await h.says('relieved');
      // a wrong guess costs a cross and nothing else; a square the rules rule out gets a no
      await h.open(5);
      assert.equal((await h.board())[5], 'x', 'a guess that finds nothing leaves a cross');
      await h.open(1);
      // all the rules of the game are in play: the post has crossed out its colour, its row and column, and what touches it
      assert.equal(await h.board(), 'xLxxxxx..x...x..');
      // and what that leaves with nowhere else to be, Penny knows without listening: its seal lands there, untouched
      await page.waitForFunction(() => document.querySelector('#walk-board .cell.known'), null, { timeout: 6000 });
      await page.waitForFunction(() => document.querySelectorAll('#walk-board .cell.known').length === 2, null, { timeout: 6000 });
      assert.deepEqual(await known(), [7, 14], 'and on the one square left in that row');
      await h.tap(0);
      await h.says('shakes its head');
      for (const cell of [7, 8, 14]) await h.open(cell);
      assert.equal(await h.board(), 'xLxxxxxLLxxxxxLx');
      assert.equal(await h.stored('penny:sound:v1'), 1, 'the first piece of the sound');
      await h.through();

      // place 3: it begins with the one square that is alone in its colour; as posts are opened the seal lands on what the rules leave
      await page.waitForFunction(() => document.querySelector('#walk-board .cell.known'), null, { timeout: 6000 });
      assert.deepEqual(await known(), [13], 'where to begin');
      for (const cell of [2, 4]) await h.open(cell);
      await page.waitForFunction(() => document.querySelectorAll('#walk-board .cell.known').length === 2, null, { timeout: 8000 });
      assert.deepEqual(await known(), [11, 13]);
      for (const cell of [11, 13]) await h.open(cell);
      assert.equal(await h.board(), 'xxLxLxxxxxxLxLxx');
      assert.equal(await h.stored('penny:sound:v1'), 2);
      await h.through();
      for (const cell of [1, 7, 8, 14]) await h.open(cell);
      assert.equal(await h.board(), 'xLxxxxxLLxxxxxLx');
      assert.equal(await h.stored('penny:sound:v1'), 3);
      await h.through();

      // place 5: nothing to hear. One cross Penny can see the reason for leaves a colour with one square; it finds that, and is frightened by a cross on it
      await h.tap(3);
      await h.says('agrees');
      assert.equal(await h.board(), '...x............');
      await h.says('noticed', 20000);
      await h.tap(2);
      await h.says('alarmed');
      await h.tap(2);
      await h.says('relieved');
      assert.equal((await h.pal()).alone, true, 'still no Dot');
      for (const cell of [4, 13, 11]) await h.open(cell);
      await h.open(2);
      assert.equal(await h.board(), 'xxLxLxxxxxxLxLxx');
      assert.equal((await h.pal()).alone, false, 'Dot is beside Penny');
      assert.equal(await h.stored('penny:dot:v1'), true);
      assert.equal(await h.stored('penny:sound:v1'), 3, 'the last place gives up no piece');
      assert.ok(await h.portalOpen());
      await sleep(800);
      await page.locator('#walk-portal').click({ force: true });
      await page.waitForURL(/\/postmarks\//);
      await sleep(900);
      assert.equal(await h.stored('penny:walked:v1'), true);
      assert.notEqual((await h.pal()).height, 'gone', 'Penny comes through into the game');
      assert.equal((await h.pal()).alone, false, 'and Dot with it');
    }),

    check('walked again afterwards: Dot is there from the start and is not found twice', { storage: { 'penny:walked:v1': true, 'penny:dot:v1': true, 'penny:sound:v1': 3, 'penny:place:v1': 4 } }, async (page, h) => {
      await page.goto(`${origin}/?walk`);
      await sleep(1600);
      assert.equal((await h.pal()).alone, false);
      // it begins at the first place again; the arrow goes up the map as far as has been reached, and back
      assert.equal((await h.board()).length, 1);
      assert.equal(await page.locator('#walk-down').isHidden(), true);
      for (let i = 0; i < 4; i++) {
        await page.locator('#walk-up').click();
        await sleep(900);
      }
      assert.equal(await page.locator('#walk-up').isHidden(), true, 'no further than has been reached');
      await page.locator('#walk-down').click();
      await sleep(900);
      await page.locator('#walk-up').click();
      await sleep(900);
      assert.equal(await page.evaluate(() => document.querySelector('.walk').dataset.hour), '4');
      for (const cell of [4, 13, 11, 2]) await h.open(cell);
      assert.ok(await h.portalOpen());
      assert.ok(!(await h.feeling()).includes('stamp'), 'no second finding of Dot');
      // while the sound so far is being played back, the portal waits
      await sleep(800);
      await page.locator('#walk-trail').click();
      await page.locator('#walk-portal').click({ force: true });
      await sleep(600);
      assert.ok(/\?walk/.test(page.url()), 'the portal does not open in the middle of the sound');
      await h.idle();
      await page.locator('#walk-portal').click({ force: true });
      await page.waitForURL(/\/postmarks\//);
    }),

    check('after the walk: a tap on Penny at rest plays the film from its first scene, and the asking is counted for the whole visit', { storage: { 'penny:walked:v1': true, 'penny:dot:v1': true, 'penny:sound:v1': 3 } }, async (page, h) => {
      await page.goto(origin);
      await h.until('pleading', 12000); // once, soon after arriving
      await h.until('calm', 15000);
      await sleep(600);
      await page.locator('.pal-penny .paper').click({ force: true });
      await page.waitForURL(/\?office/, { timeout: 5000 });
      await sleep(800);
      await page.locator('.penny-back').click();
      await page.waitForURL((url) => url.search === '');
      // home again inside the same visit: it has asked once already, and leaves it a while
      for (let i = 0; i < 16; i++) {
        await sleep(500);
        assert.notEqual((await h.pal()).mood, 'pleading', 'pleading again straight after coming back');
      }
    }),

    check('reduced motion: the last place can be played, and Dot is found', { reducedMotion: 'reduce', storage: { 'penny:place:v1': 4 } }, async (page, h) => {
      await page.goto(`${origin}/?walk`);
      await sleep(1200);
      for (const cell of [4, 13, 11, 2]) await h.open(cell);
      assert.equal((await h.pal()).alone, false);
      assert.ok(await h.portalOpen());
    }),

    check('keyboard only: a place can be finished and left', { storage: { 'penny:place:v1': 1 } }, async (page, h) => {
      await page.goto(`${origin}/?walk`);
      await sleep(1600);
      await page.locator('#walk-board .cell').nth(0).focus();
      await page.keyboard.press('ArrowRight'); // onto 1, where a post can be heard
      await h.says('right here');
      for (const cell of [1, 7, 8, 14]) {
        await page.locator('#walk-board .cell').nth(cell).focus();
        await page.keyboard.press('Enter');
        await sleep(300);
        await h.idle();
      }
      assert.equal(await h.board(), 'xLxxxxxLLxxxxxLx');
      await page.locator('#walk-portal').focus();
      await page.keyboard.press('Enter');
      await sleep(1900);
      assert.equal(await h.stored('penny:place:v1'), 2);
    }),

    check('installing: Penny pleads, takes a no, and is glad of a yes', { storage: { 'penny:walked:v1': true } }, async (page, h) => {
      await page.goto(origin);
      await h.until('pleading', 12000);
      await sleep(1500);
      // while it is asking, a tap on Penny is a yes; here the browser's own prompt is then turned down
      await page.evaluate(() => {
        const offer = new Event('beforeinstallprompt');
        offer.prompt = () => {};
        offer.userChoice = new Promise((done) => setTimeout(() => done({ outcome: 'dismissed' }), 500));
        window.dispatchEvent(offer);
      });
      // (Penny is thrilled only for as long as that prompt is up, which is half a second: on a busy machine a look can
      // come after it. So what Penny goes through is written down in the page as it happens, and read from there.)
      await page.evaluate(() => {
        const pal = document.querySelector('.pal');
        window.moods = [pal.dataset.mood];
        new MutationObserver(() => {
          if (window.moods.at(-1) !== pal.dataset.mood) window.moods.push(pal.dataset.mood);
        }).observe(pal, { attributes: true, attributeFilter: ['data-mood'] });
      });
      await page.locator('.pal-penny .paper').click({ force: true });
      const went = (...through) => page.waitForFunction((moods) => {
        let from = 0;
        return moods.every((mood) => (from = window.moods.indexOf(mood, from) + 1) > 0);
      }, through, { timeout: 12000 });
      await went('thrilled', 'sad', 'calm');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('penny:install-no')), '1', 'a no is kept for the visit');
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await h.until('thrilled', 3000);
      await sleep(900);
      // no heart anywhere but over Penny (Dot, not yet found, has none to give)
      const strays = await page.evaluate(() => [...document.querySelectorAll('.pal-heart')].filter((heart) => heart.getBoundingClientRect().top < window.innerHeight / 2).length);
      assert.equal(strays, 0, 'a heart far from Penny');
      assert.equal(await page.locator('.install-banner').count(), 0, 'the banner goes once installed');
    }),

    check('the music maker: a beat can be saved, renamed and shared, and a shared one opens on the board without losing what was there', { permissions: ['clipboard-read', 'clipboard-write'] }, async (page) => {
      const stored = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      assert.equal(await page.locator('#jam-save').isDisabled(), true, 'nothing to save yet');
      for (const pad of [0, 9, 18, 27]) await page.locator('.jam-board .pad').nth(pad).click();
      await page.locator('#jam-save').click();
      await page.waitForSelector('.jam-saved li');
      assert.equal(await page.locator('.jam-saved input').inputValue(), 'Beat 1');
      assert.equal(await page.locator('.jam-saved li.here').count(), 1, 'the saved beat is the one on the board');
      await page.locator('#jam-save').click();
      assert.equal(await page.locator('.jam-saved li').count(), 1, 'the same beat saved twice');
      await page.locator('.jam-saved input').fill('Morning');
      await page.locator('.jam-saved input').press('Enter');
      assert.equal((await stored('jam:saved:v1'))[0].name, 'Morning');
      // shared: here that is a link on the clipboard, with the whole beat in it
      await page.evaluate(() => { delete Navigator.prototype.share; });
      await page.locator('#jam-share').click();
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('Link copied'));
      const link = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(link, /\/jam\/\?b=[A-Za-z0-9_-]{39}$/);
      // something else is made, not saved; then the link is opened
      await page.locator('.jam-board .pad').nth(40).click();
      const unsaved = (await stored('jam:v1')).notes[0].length;
      assert.equal(unsaved, 5);
      await page.goto(link);
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('shared with you'));
      assert.equal(new URL(page.url()).search, '', 'the address goes back to plain');
      assert.equal(await page.locator('.jam-board .pad.on').count(), 4, 'the shared beat is on the board');
      assert.deepEqual(await page.locator('.jam-saved input').evaluateAll((all) => all.map((one) => one.value)), ['Unsaved beat', 'Morning'], 'what was on the board was put by');
      // and back to it
      await page.locator('.jam-saved .open').first().click();
      assert.equal(await page.locator('.jam-board .pad.on').count(), 5);
      await page.goto(`${origin}/jam/?b=nonsense`);
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('did not have a beat'));
      assert.equal(await page.locator('.jam-board .pad.on').count(), 5, 'a bad link changed the board');
      // deleted
      await page.locator('.jam-saved li').nth(1).locator('button[aria-label^="Delete"]').click();
      await page.locator('dialog.ask button.yes').click();
      await page.waitForFunction(() => document.querySelectorAll('.jam-saved li').length === 1);
      assert.deepEqual(await page.locator('.jam-saved input').evaluateAll((all) => all.map((one) => one.value)), ['Unsaved beat']);
    }),

    check('the background music stands aside for the music maker and the radio, and still does going from one to the other', { storage: { 'radio:taught:v1': true, 'radio:story:v1': 'told' } }, async (page) => {
      // every fade of the background music: to MUSIC_LEVEL (0.3) when it comes back, to 0 when it stands aside
      await page.addInitScript(() => {
        window.__music = [];
        const set = AudioParam.prototype.setTargetAtTime;
        AudioParam.prototype.setTargetAtTime = function (value, ...rest) {
          if (value === 0.3 || value === 0) window.__music.push(value);
          return set.call(this, value, ...rest);
        };
      });
      const follow = (href) => page.evaluate((to) => { const a = document.createElement('a'); a.href = to; document.body.append(a); a.click(); }, href);
      const last = () => page.evaluate(() => window.__music.at(-1));
      await page.goto(origin);
      await page.waitForSelector('.home-map');
      await page.mouse.click(5, 5); // a first touch wakes the sound, and the background music with it
      await sleep(400);
      await follow('/jam/');
      await page.waitForSelector('.jam');
      await sleep(1500);
      assert.equal(await last(), 0, 'the music maker has the floor');
      await follow('/jam/?taste');
      await page.waitForSelector('.taste-card');
      await sleep(1500); // the music maker has gone by now
      assert.equal(await last(), 0, 'the radio has the floor: the music maker leaving did not bring the background music back');
      await follow('/jam/');
      await page.waitForSelector('.jam');
      await sleep(1500);
      assert.equal(await last(), 0, 'and back again');
      await follow('/');
      await page.waitForSelector('.home-map');
      await sleep(1500);
      assert.equal(await last(), 0.3, 'home again: the background music comes back');
    }),

    check('the music maker: saved beats follow the account, to another device and back', {}, async (page) => {
      // the server, as far as beats go: one profile's list
      let server = [];
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/beats_(get|put|drop)/, (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const call = request.url().match(/beats_(\w+)/)[1];
        const args = JSON.parse(request.postData());
        if (call === 'put') server = [{ code: args.p_code, name: args.p_name, at: Date.now() }, ...server.filter((one) => one.code !== args.p_code)];
        if (call === 'drop') server = server.filter((one) => one.code !== args.p_code);
        return route.fulfill({ json: server, headers: cors });
      });
      const names = () => page.locator('.jam-saved input').evaluateAll((all) => all.map((one) => one.value));
      const settled = (count) => page.waitForFunction((n) => document.querySelectorAll('.jam-saved li').length === n, count);
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      for (const pad of [0, 9, 18]) await page.locator('.jam-board .pad').nth(pad).click();
      await page.locator('#jam-save').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('jam:saved:v1'))?.[0]?.synced === true);
      assert.deepEqual(server.map((one) => one.name), ['Beat 1'], 'a saved beat goes to the account');
      await page.locator('.jam-saved input').fill('Morning');
      await page.locator('.jam-saved input').press('Enter');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('jam:saved:v1'))?.[0]?.synced === true);
      assert.deepEqual(server.map((one) => one.name), ['Morning'], 'and so does its new name');
      // another device of the same account: nothing kept on it yet
      await page.evaluate(() => { localStorage.removeItem('jam:saved:v1'); localStorage.removeItem('jam:v1'); });
      await page.reload();
      await settled(1);
      assert.deepEqual(await names(), ['Morning'], 'the account’s beats arrive on a device that had none');
      // a beat saved on yet another device turns up here; one deleted there goes from here
      const other = 'EQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      server = [{ code: other, name: 'From my tablet', at: Date.now() }];
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.jam-saved input')?.value === 'From my tablet');
      assert.deepEqual(await names(), ['From my tablet']);
      // deleted here: gone from the account
      await page.locator('.jam-saved button[aria-label^="Delete"]').click();
      await page.locator('dialog.ask button.yes').click();
      await settled(0);
      await page.waitForFunction(() => (JSON.parse(localStorage.getItem('jam:gone:v1')) ?? []).length === 0);
      assert.deepEqual(server, [], 'a beat deleted here is deleted from the account');
    }),

    check('the radio: a work in a gallery; somebody shows how and never why; then Penny notices the tag on its side, cannot say what it is, and the tag opens the reading', {}, async (page, h) => {
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('#jam-lab');
      await page.locator('#jam-lab').click();
      await page.waitForURL(/\/jam\/\?taste/);
      await page.waitForSelector('.taste-card');
      await sleep(700); // the screen slides in
      const box = await page.locator('.radio .display').boundingBox(); // (its knob and buttons are pressed, not swiped)
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      // all of the set is on the screen, its tag too, and nothing behind it is the white of a page
      const set = await page.evaluate(() => {
        const parts = [...document.querySelectorAll('.radio .body, .radio .antenna, .radio .handle, .radio .feet, .radio .lab-plate')].map((part) => part.getBoundingClientRect());
        const ground = getComputedStyle(document.querySelector('.radio-world')).backgroundImage;
        return { top: Math.min(...parts.map((r) => r.top)), bottom: Math.max(...parts.map((r) => r.bottom)), left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)), wide: innerWidth, high: innerHeight, ground, scrolls: document.scrollingElement.scrollHeight > innerHeight };
      });
      assert.ok(set.top >= 0 && set.left >= 0 && set.right <= set.wide && set.bottom <= set.high, `the radio is not all on the screen: ${JSON.stringify(set)}`);
      assert.equal(set.scrolls, false, 'the page scrolls');
      assert.match(set.ground, /gradient/, 'the radio stands in the world');
      assert.equal(await page.locator('.radio .plate').textContent(), 'Penny’s Radio');
      assert.equal(await page.locator('#taste-behind-open').isVisible(), true, 'the tag is on the side of the set from the start');
      assert.equal(await page.locator('#taste-behind-open').getAttribute('title'), null, 'the tag says nothing, even under a pointer');
      // a screen reader is told what pressing the tag does, and nothing of what it will find there
      const tagName = await page.locator('#taste-behind-open').getAttribute('aria-label');
      assert.match(tagName, /^Read about/);
      assert.doesNotMatch(tagName, /experiment|model|test|lab/i, 'the tag gives the reveal away before it is pressed');
      // it is a work in a gallery: on a plinth, with the gallery's label, which comes after the set and is its caption, and gives nothing away
      const label = await page.evaluate(() => {
        const [set, card, plinth, caption] = [document.querySelector('.radio .body'), document.querySelector('#taste-card'), document.querySelector('.plinth'), document.querySelector('.radio-ground > figcaption')];
        const words = caption.querySelector('.gallery-label');
        const [a, b] = [set.getBoundingClientRect(), words.getBoundingClientRect()];
        const order = [...document.querySelectorAll('.radio-ground *')].filter((el) => getComputedStyle(el).order !== '0' || /reverse/.test(getComputedStyle(el).flexDirection));
        return { caption: caption === plinth, after: Boolean(card.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING), figure: caption.parentElement.tagName, reordered: order.length, text: words.textContent.replace(/\s+/g, ' ').trim(), under: b.top > a.bottom, inside: b.bottom <= innerHeight };
      });
      assert.ok(label.caption && label.after && label.figure === 'FIGURE' && label.reordered === 0, `the label is not the set's caption, after it: ${JSON.stringify(label)}`);
      assert.ok(label.under && label.inside, `the label is not on the plinth under the set: ${JSON.stringify(label)}`);
      assert.match(label.text, /^Penny’s Radio Steel, enamel Two stations, one listener Anonymous loan$/);
      assert.doesNotMatch(label.text, /experiment|model|test/i, 'the label everyone reads first gives the experiment away');
      // the plinth is as wide as the set, by the one rule they share, not a copy of it
      const wide = await page.evaluate(() => {
        const rules = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } });
        const rule = (selector) => rules.find((one) => one.selectorText === selector)?.style;
        return { set: parseFloat(getComputedStyle(document.querySelector('.radio')).width), plinth: parseFloat(getComputedStyle(document.querySelector('.plinth')).width), setRule: rule('.radio')?.getPropertyValue('--w').trim(), plinthRule: rule('.plinth')?.getPropertyValue('width').trim() };
      });
      assert.ok(Math.abs(wide.set - wide.plinth) < 0.5, `the plinth is not as wide as the set: ${JSON.stringify(wide)}`);
      assert.ok(wide.setRule === 'var(--work-w)' && wide.plinthRule === 'var(--work-w)', `the set and its plinth do not share one width: ${JSON.stringify(wide)}`);
      // the light follows the story and not the learning: what it is now is what it is after a station is kept
      const light = () => page.evaluate(() => [...document.querySelectorAll('.gallery-light')].map((one) => getComputedStyle(one).backgroundImage).join(' | '));
      const lightBefore = await light();
      const tape = () => page.evaluate(() => document.querySelector('#dash-sign [data-order]')?.dataset.order ?? ''); // what it orders now: no waiting for signs that are gone
      const says = (order) => page.waitForFunction((want) => document.querySelector('#dash-sign [data-order]')?.dataset.order === want, order, { timeout: 8000 });
      const story = () => page.evaluate(() => JSON.parse(localStorage.getItem('radio:story:v1')));
      const stage = (name, timeout = 15000) => page.waitForFunction((want) => document.querySelector('.radio-world').dataset.story === want, name, { timeout });
      // somebody else shows how: it stands by the set and hangs an order over the label, and Penny only watches
      await page.waitForSelector('#radio-dash:not([hidden])', { timeout: 6000 });
      await says('swipe');
      assert.equal((await h.pal()).mood, 'unsure', 'Penny is watching the one who shows how');
      assert.match(await page.locator('#dash-says').textContent(), /press Tune/, 'the order is given in a way a screen reader can follow');
      assert.equal(await page.locator('#dash-sign').evaluate((sign) => sign.textContent.trim()), '', 'its orders are signs, not words');
      assert.equal(await page.locator('#dash-sign svg').count(), 1);
      await sleep(300); // (it has dropped into place)
      const hung = await page.evaluate(() => {
        const [sign, words] = [document.querySelector('#dash-sign').getBoundingClientRect(), document.querySelector('.gallery-label').getBoundingClientRect()];
        return { covers: sign.left <= words.left && sign.right >= words.right && sign.top <= words.top && sign.bottom >= words.bottom, hidden: document.querySelector('#dash-sign').getAttribute('aria-hidden') };
      });
      assert.ok(hung.covers, 'its sign hangs over the gallery’s label');
      assert.equal(hung.hidden, 'true', 'the sign is a picture: a screen reader has the order in words');
      const swipe = async () => {
        await page.mouse.move(x + 60, y);
        await page.mouse.down();
        await page.mouse.move(x - 60, y, { steps: 4 });
        await page.mouse.up();
      };
      const doubleTap = async () => {
        await page.mouse.click(x, y);
        await sleep(90);
        await page.mouse.click(x, y);
      };
      const turned = () => page.evaluate(() => document.querySelector('.taste-card').classList.contains('turned'));
      const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem('jam:taste:v1')));
      assert.equal((await kept()).trials.length, 0);
      // a swipe tunes to the other station; and the next order is to listen
      const was = await turned();
      await swipe();
      assert.equal(await turned(), !was, 'a swipe did not tune to the other station');
      await says('listen');
      // too soon: neither station has been listened to. The refusal is that one's, and has no reason in it
      await doubleTap();
      await sleep(250);
      assert.equal((await kept()).trials.length, 0, 'a station was kept before both had been heard');
      assert.equal(await tape(), 'not-yet');
      assert.match(await page.locator('#taste-note').textContent(), /Tune to|Stay on/, 'a screen reader is still told what to do');
      assert.equal(await page.locator('#lab-picks').isVisible(), false, 'the experiment is not on the face of the radio');
      assert.match(await page.locator('#radio-freq').textContent(), /^\d{2,3}\.\d$/, 'a station has a place on the dial');
      // listened to both: the order is to keep one, and it does not say which
      const pickOne = async () => {
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
        if ((await page.locator('.taste-card .face.heard').count()) < 2) await swipe();
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 8000 });
        const up = (await turned()) ? 'back' : 'front';
        await doubleTap();
        await sleep(250);
        return up;
      };
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
      if ((await page.locator('.taste-card .face.heard').count()) < 2) await says('other');
      const first = await pickOne();
      assert.equal(await page.evaluate(() => localStorage.getItem('radio:taught:v1')), 'true', 'a station kept: that is all there was to show');
      let data = await kept();
      assert.equal(data.trials.length, 1);
      assert.equal(data.trials[0].pick, first, 'the station that was tuned in is the one kept');
      assert.equal(data.current[first], data.trials[0][first], 'the station that was kept stays where it is');
      assert.notEqual(data.current[first === 'front' ? 'back' : 'front'], data.trials[0][first === 'front' ? 'back' : 'front'], 'and a new one comes in beside it');
      assert.equal(data.current.reigning, first);
      assert.match(data.current.phantom, /^[A-Za-z0-9_-]{39}$/, 'a phantom was made beside the challenger');
      // the one who showed how is gone, without a word of why, and its sign with it: the label is read again; and Penny has noticed the tag
      await page.waitForSelector('#radio-dash', { state: 'hidden', timeout: 5000 });
      assert.equal(await tape(), '');
      assert.equal(await page.locator('#dash-sign').isVisible(), false, 'the sign is taken off the label');
      assert.equal(await page.locator('#dash-says').textContent(), '');
      await page.waitForFunction(() => localStorage.getItem('radio:story:v1') === '"seen"', null, { timeout: 5000 });
      // it goes and stands under it, tries to say what it is, and cannot: there is no Dot to say it
      await page.waitForFunction(() => Number(document.querySelector('.pal').style.getPropertyValue('--x')) > 0.6, null, { timeout: 10000 });
      await stage('stuck', 20000);
      await stage('waiting', 8000);
      assert.equal(await page.locator('#dot-says').textContent(), '', 'nothing is said');
      assert.equal(await page.locator('#taste-behind').evaluate((sheet) => sheet.open), false, 'and nothing opens by itself');
      // the tag is pressed: that is what it wanted
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      assert.equal((await h.pal()).mood, 'thrilled');
      assert.equal(await story(), 'found');
      assert.equal(await page.locator('#dot-told').isVisible(), false, 'Dot’s line with no Dot to say it');
      assert.equal(await page.locator('#lab-picks').textContent(), '1');
      assert.equal(await page.locator('#lab-verdict').textContent(), 'From the tenth choice on, the model calls each one before it is made.', 'it counts down');
      // the reading: the gallery's entry, opened at its top with its title focused
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'reading-title', 'the reading opens at its title');
      assert.equal(await page.locator('#reading-title').getAttribute('tabindex'), '-1');
      assert.equal(await page.locator('#taste-behind .taste-lab').evaluate((sheet) => sheet.scrollTop), 0);
      assert.match(await page.locator('#taste-behind .what').textContent(), /this radio is also an experiment\./);
      // it asks the question before the numbers and how it works, so that it is met before them; nothing right after it
      // reads as its answer; and nothing after it answers it
      leftOpen(await h.reading());
      // and the way back to the radio does not scroll with it: at the end of the reading it is where it was, in reach
      const foot = async () => page.locator('#taste-behind-close').evaluate((button) => { const box = button.getBoundingClientRect(); return { top: Math.round(box.top), bottom: box.bottom, inside: box.bottom <= innerHeight && box.top >= 0, foot: Boolean(button.closest('footer')) && !button.closest('.taste-lab') }; });
      const atTop = await foot();
      await page.locator('#taste-behind .taste-lab').evaluate((sheet) => { sheet.scrollTop = sheet.scrollHeight; });
      const atEnd = await foot();
      assert.ok(atTop.foot && atTop.inside && atEnd.top === atTop.top, `the way back scrolls with the reading: ${JSON.stringify([atTop, atEnd])}`);
      await page.locator('#taste-behind-close').click();
      assert.equal(await page.locator('#lab-picks').isVisible(), false);
      // the station that was kept says so when it is tuned in
      if (((await turned()) ? 'back' : 'front') !== first) await swipe();
      assert.match(await page.locator('#radio-tag').textContent(), /Kept 1 of 5/);
      // by keyboard: the arrows tune; Enter on the tag opens the sheet and keeps nothing
      await page.locator('.taste-card').focus();
      const before = await turned();
      await page.keyboard.press('ArrowRight');
      assert.equal(await turned(), !before);
      await page.locator('#taste-behind-open').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('#taste-behind[open]');
      assert.equal((await kept()).trials.length, 1, 'Enter on the tag kept a station');
      await page.locator('#taste-behind-close').click();
      // the presets have a sheet of their own, without words: the set's lamps, and what they are for said to a screen reader
      await page.locator('#taste-presets-open').click();
      await page.waitForSelector('#taste-presets[open]');
      assert.equal(await page.locator('#presets-none').isVisible(), true);
      assert.deepEqual(await h.words('#taste-presets'), [], 'the presets’ sheet has words on it');
      assert.equal(await page.locator('#taste-presets .preset-lamps i').count(), 5);
      assert.equal(await page.locator('#taste-presets-close').getAttribute('aria-label'), 'Back to the radio');
      await page.locator('#taste-presets-close').click();
      // and by the buttons
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 12000 }).catch(async () => { await page.locator('#taste-flip').click(); });
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 12000 });
      await page.locator('#taste-pick').click();
      await page.waitForFunction(() => document.querySelector('#lab-picks').textContent === '2');
      assert.equal(await light(), lightBefore, 'the light changes with what is kept'); // (only how cold or warm it is follows the story)
      assert.equal(await page.evaluate(() => document.querySelector('.radio-world').getAttribute('style')), null, 'something on the room follows the experiment');
      // it is all still there after a reload, and nobody comes to show how a second time
      await page.reload();
      await page.waitForSelector('.taste-card');
      assert.equal(await page.locator('#lab-picks').textContent(), '2');
      assert.equal(await page.locator('#lab-verdict').textContent(), 'From the tenth choice on, the model calls each one before it is made.');
      await sleep(2500);
      assert.equal(await page.locator('#radio-dash').isVisible(), false);
    }),

    check('the radio, with Dot: Penny tells Dot, Dot says what Penny means as the audio guide would, and the reading opens by itself, once', { storage: { 'penny:dot:v1': true, 'penny:walked:v1': true, 'radio:taught:v1': true, 'radio:story:v1': 'seen' } }, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.taste-card');
      assert.equal((await h.pal()).alone, false, 'Dot is with Penny');
      // Penny goes under the tag, tries, cannot say it, and turns to Dot
      await page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'telling', null, { timeout: 20000 });
      assert.equal(await page.locator('#dot-says').textContent(), '', 'Dot has not spoken yet');
      // Dot says it, in words
      await page.waitForFunction(() => /You[’']re part of an experiment\./.test(document.querySelector('#dot-says').textContent), null, { timeout: 10000 });
      assert.match(await page.locator('#dot-says').textContent(), /^Dot says: /, 'a screen reader is told who is speaking');
      const clear = await page.evaluate(() => {
        const box = (element) => element.getBoundingClientRect();
        const [said, dot] = [box(document.querySelector('#dot-says')), box(document.querySelector('.pal-dot'))];
        return { right: said.right, dot: dot.left, left: said.left, wide: innerWidth };
      });
      assert.ok(clear.right <= clear.dot && clear.left >= 0, `the words are under Dot, or off the screen: ${JSON.stringify(clear)}`);
      // and the sheet opens by itself, with Dot's line at the head of it
      await page.waitForSelector('#taste-behind[open]', { timeout: 8000 });
      assert.equal(await page.locator('#dot-told').isVisible(), true);
      assert.match(await page.locator('#dot-told').textContent(), /You’re part of an experiment\./);
      assert.match(await page.locator('#dot-told figcaption').textContent(), /^Audio guide ?Dot, for Penny/, 'Dot’s line is in the reading as the audio guide’s stop');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'reading-title', 'the reading opens at its title, opened by itself too');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('radio:story:v1'))), 'told');
      await page.locator('#taste-behind-close').click();
      // they go back to where they stand
      await page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'done' && Number(document.querySelector('.pal').style.getPropertyValue('--x')) < 0.3, null, { timeout: 8000 });
      // once: on coming back nothing is said and nothing opens
      await page.reload();
      await page.waitForSelector('.taste-card');
      await sleep(5000);
      assert.equal(await page.locator('#dot-says').textContent(), '');
      assert.equal(await page.locator('#taste-behind').evaluate((sheet) => sheet.open), false);
      assert.equal(await page.locator('#radio-dash').isVisible(), false);
    }),

    check('the radio, interrupted: the tag pressed before the attendant has come brings it afterwards, and pressed as it goes does not leave it standing', {}, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.taste-card');
      // the tag, pressed before the one who shows how has come (it comes 0.9 s after the radio is on)
      const early = await page.evaluate(() => {
        const away = document.querySelector('#radio-dash').hidden;
        document.querySelector('#taste-behind-open').click();
        return away;
      });
      assert.equal(early, true, 'the attendant had come before the tag could be pressed: this case was not tried');
      await page.waitForSelector('#taste-behind[open]');
      await sleep(1500);
      await page.locator('#taste-behind-close').click();
      // the reading closed, it comes after all, and the lesson goes on: the light is cold while it is here
      await page.waitForSelector('#radio-dash:not([hidden])', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('#dash-sign [data-order]')?.dataset.order === 'swipe', null, { timeout: 5000 });
      assert.match(await page.locator('#dash-says').textContent(), /press Tune/);
      assert.equal(await page.evaluate(() => document.querySelector('.radio-world').dataset.story), 'lesson');
      // both stations heard, by the buttons; the first one kept, and the tag pressed at once, before it has gone
      await page.locator('#taste-play').click();
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
      if ((await page.locator('.taste-card .face.heard').count()) < 2) await page.locator('#taste-flip').click();
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 8000 });
      const shown = await page.evaluate(async () => {
        document.querySelector('#taste-pick').click();
        await new Promise((done) => setTimeout(done, 150));
        const there = !document.querySelector('#radio-dash').hidden;
        document.querySelector('#taste-behind-open').click();
        return there;
      });
      assert.equal(shown, true, 'the attendant had gone before the tag could be pressed: this case was not tried');
      await page.waitForSelector('#taste-behind[open]');
      assert.equal((await h.stored('jam:taste:v1')).trials.length, 1);
      await sleep(500);
      await page.locator('#taste-behind-close').click();
      // it has gone all the same, and taken its sign and its orders with it; the label can be read again, and the light warms
      await page.waitForSelector('#radio-dash', { state: 'hidden', timeout: 5000 });
      assert.equal(await page.locator('#dash-sign').evaluate((sign) => sign.childElementCount), 0, 'its sign is left over the label');
      assert.equal(await page.locator('#dash-says').textContent(), '', 'a screen reader is still given its order');
      await page.waitForFunction(() => document.querySelector('.radio-world').dataset.story === 'done', null, { timeout: 8000 });
      await sleep(3000);
      assert.equal(await page.locator('#radio-dash').isVisible(), false);
    }),

    check('the radio, under way: the reading says where the test stands the same way however it stands; the data is copied; starting over asks first; a preset opens in the music maker', { storage: { 'radio:taught:v1': true, 'radio:story:v1': 'told', 'jam:taste:v1': radios.underWay }, permissions: ['clipboard-read', 'clipboard-write'] }, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .presets i.lit');
      // the presets: each station saved, as its picture and its place on the dial, the latest first, and nothing else to read
      await page.locator('#taste-presets-open').click();
      await page.waitForSelector('#taste-presets[open] .preset-list a');
      const kept = await h.stored('jam:taste:v1');
      assert.equal(kept.retired.length, 2);
      assert.deepEqual(await page.locator('#lab-hall a').evaluateAll((links) => links.map((a) => a.getAttribute('href'))), kept.retired.map((code) => `/jam/?b=${code}`).reverse(), 'each preset opens its own station in the music maker, the latest first');
      assert.equal(await page.locator('#taste-presets .preset-lamps i.lit').count(), 2);
      const seen = await h.words('#taste-presets');
      assert.ok(seen.length > 0 && seen.every((text) => /^(\d{2,3}\.\d|FM)$/.test(text)), `the presets’ sheet has words on it: ${JSON.stringify(seen)}`);
      await page.locator('#taste-presets-close').click();
      // the reading, twelve picks in: what is measured, and if it is significant, never a yes or a "not yet", nor a count
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      assert.equal(await page.locator('#lab-picks').textContent(), '12');
      assert.match(await page.locator('#lab-verdict').textContent(), /^So far p = \d\.\d\d\. The test is significant if the stake reaches ×20 \(p = 0\.05\)\.$/);
      leftOpen(await h.reading());
      const look = () => page.locator('#lab-verdict').evaluate((verdict) => { const style = getComputedStyle(verdict); return { style: style.fontStyle, weight: style.fontWeight, colour: style.color, size: style.fontSize, classes: verdict.className }; });
      const notYet = await look();
      // the data, copied out: said on the button, and back after a while
      await page.locator('#taste-copy').click();
      await page.waitForFunction(() => document.querySelector('#taste-copy').textContent === 'Copied', null, { timeout: 3000 });
      const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
      assert.equal(copied.trials.length, 12);
      assert.equal(copied.standing.picks, 12);
      await page.waitForFunction(() => document.querySelector('#taste-copy').textContent === 'Copy the data', null, { timeout: 4000 });
      // starting over asks first: no keeps everything, yes throws away the picks and the presets
      await page.locator('#taste-reset').click();
      await page.waitForSelector('dialog.ask[open]');
      assert.match(await page.locator('dialog.ask').textContent(), /12 choices/);
      await page.locator('dialog.ask button.quiet').click();
      await page.waitForSelector('dialog.ask', { state: 'detached' });
      assert.equal(await page.locator('#lab-picks').textContent(), '12');
      assert.equal((await h.stored('jam:taste:v1')).trials.length, 12, 'a no threw the picks away');
      await page.locator('#taste-reset').click();
      await page.locator('dialog.ask button.yes').click();
      await page.waitForFunction(() => document.querySelector('#lab-picks').textContent === '0');
      const fresh = await h.stored('jam:taste:v1');
      assert.deepEqual([fresh.trials.length, fresh.retired.length], [0, 0]);
      assert.equal(await page.locator('.radio .presets i.lit').count(), 0);
      assert.equal(await page.locator('#lab-verdict').textContent(), 'From the tenth choice on, the model calls each one before it is made.');
      await page.locator('#taste-behind-close').click();
      // somebody with a marked taste, kept until the test is significant: the verdict is in the same voice as before, and
      // still not the first thing after the question
      await page.evaluate((data) => localStorage.setItem('jam:taste:v1', JSON.stringify(data)), radios.significant);
      await page.reload();
      await page.waitForSelector('.radio .dot');
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      assert.match(await page.locator('#lab-verdict').textContent(), /^Significant at choice \d+: p = 0\.0\d\d\. The music itself predicts the choices\.$/);
      assert.equal(await page.locator('#lab-meter').evaluate((meter) => meter.style.getPropertyValue('--full')), '1.000');
      leftOpen(await h.reading());
      assert.deepEqual(await look(), notYet, 'the verdict is given more weight once it is significant');
      await page.locator('#taste-behind-close').click();
      // and a preset, pressed, opens its station in the music maker
      await page.locator('#taste-presets-open').click();
      await page.waitForSelector('#taste-presets[open] .preset-list a');
      const href = await page.locator('#lab-hall a').first().getAttribute('href');
      await page.locator('#lab-hall a').first().click();
      await page.waitForURL((url) => `${url.pathname}${url.search}` === href);
      await page.waitForSelector('.jam-board .pad');
    }),

    check('home, with rooms: a feed of what is waiting on you on one tab, and everything else on the other', { storage: ACCOUNT }, async (page) => {
      const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
      const game = (over) => ({ id: '33333333-3333-4333-8333-333333333333', kind: 'postmarks', mode: 'coop', size: 5, status: 'playing', hearts: 3, moves: 2, found: 1, last_player: null, phrase_by: null, finished: 0, mine: null, updated_at: '2026-11-24T10:00:00Z', ...over });
      const games = { // Book club: a move of yours, a race, and a game you are waiting on. Family: nothing
        '11111111-1111-4111-8111-111111111111': [game({ last_player: 1 }), game({ mode: 'trial', finished: 2 }), game({ last_player: 0 })],
        '22222222-2222-4222-8222-222222222222': [game({ status: 'won', last_player: 1 })],
      };
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/room_get/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const id = JSON.parse(route.request().postData()).p_room;
        return route.fulfill({ json: { id, name: id.startsWith('1') ? 'Book club' : 'Family', you: 0, people, messages: [], games: games[id] }, headers: cors });
      });
      await page.goto(origin);
      await page.waitForSelector('.feed-item');
      assert.equal(await page.locator('#tab-feed').getAttribute('aria-selected'), 'true', 'someone with rooms starts on the feed');
      assert.deepEqual(await page.locator('.feed-item em').allTextContents(), ['Your move', 'New']);
      assert.equal(await page.locator('.feed-item strong').first().textContent(), 'Ada played');
      assert.equal(await page.locator('#feed-count').textContent(), '2');
      assert.equal(await page.locator('#menu').isVisible(), false, 'the lobby is on the other tab');
      // nothing above the tabs, nor the tabs themselves, moves when the other one is picked
      const placed = () => page.evaluate(() => ['.mark', 'h1', '#tabs'].map((part) => {
        const box = document.querySelector(part).getBoundingClientRect();
        return [box.left, box.top, box.width, box.height].map(Math.round).join(' ');
      }));
      await sleep(700); // (the page the app opens on rises into place: measured once it has)
      const onFeed = await placed();
      await page.locator('#tab-lobby').click();
      assert.deepEqual(await placed(), onFeed, 'the page shifted when the tab changed');
      assert.equal(await page.locator('#menu').isVisible(), true);
      assert.equal(await page.locator('#rooms').isVisible(), true);
      assert.equal(await page.locator('.feed-item').first().isVisible(), false);
      await page.reload();
      await page.waitForSelector('#menu');
      assert.equal(await page.locator('#tab-lobby').getAttribute('aria-selected'), 'true', 'the tab last up is remembered');
      await page.locator('#tab-feed').click();
      await page.locator('.feed-item').first().click();
      await page.waitForURL(/\/postmarks\/\?game=33333333/, { timeout: 5000 });
    }),

    check('with an account: Penny keeps out of the way of the page', { viewport: { width: 390, height: 664 }, storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' } }, async (page, h) => {
      await page.goto(`${origin}/?home`);
      await sleep(2700);
      assert.equal((await h.pal()).height, 'low', 'a tile is under Penny: it ducks');
      await h.until('hopeful', 12000); // Penny comes up to ask
      await sleep(400);
      const spot = await page.evaluate(() => {
        const paper = document.querySelector('.pal-penny .paper').getBoundingClientRect();
        const x = paper.left + paper.width / 2;
        const y = paper.top + 8;
        const under = document.elementsFromPoint(x, y).find((element) => !element.closest('.pal'))?.closest('a[href]');
        return { x, y, href: under?.getAttribute('href') ?? null };
      });
      if (spot.href) {
        await page.mouse.click(spot.x, spot.y);
        await page.waitForURL((url) => url.pathname + url.search === spot.href, { timeout: 5000 });
      }
    }),

    check('Penny is only where a screen has asked for it', { storage: ACCOUNT }, async (page, h) => {
      for (const address of ['/?open', '/?join', '/?office', '/?slow']) {
        await page.goto(origin + address);
        await sleep(1200);
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, address, 'the address is still the one asked for');
        assert.equal((await h.pal()).height, 'gone', address);
      }
      // the music maker asks for it: there it dances while the loop plays, and stops when the loop does
      await page.goto(`${origin}/jam/`);
      await sleep(1200);
      assert.equal((await h.pal()).mood, 'calm', 'Penny is at the music maker, and still');
      await page.locator('#jam-dice').click({ force: true });
      await h.until('dancing', 3000);
      assert.notEqual((await h.pal()).height, 'gone');
      await page.locator('#jam-play').click();
      await h.until('calm', 3000);
      // the game is one of the screens that asks for it
      await page.goto(`${origin}/postmarks/`);
      await sleep(1500);
      assert.notEqual((await h.pal()).height, 'gone', 'Penny is in the game');
      assert.equal(await page.locator('.game-map').isVisible(), true, 'and the map is behind the board');
      // and leaving the map in the middle of something leaves nothing behind
      await page.goto(`${origin}/?walk`);
      await sleep(1500);
      await page.mouse.click(...(await h.centre(0)), { clickCount: 2, delay: 40 });
      await sleep(500);
      await page.locator('.penny-back').click();
      await sleep(6000);
      assert.equal((await h.pal()).mood === 'listening', false, 'Penny is not still listening to a post on a screen that has gone');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('pal-tinted')), false, 'the home page is not left coloured');
    }),
    // A room's two worlds (room/worlds.js). A portal in the room's top bar is the way into its serious world, the same
    // room as a drama at night; inside, the cartoon breaks back through now and then, while the portal is in sight; the
    // portal is the way back. Every visit begins outside. The worlds change paint and never geometry, never more than 3
    // times a second, and with reduced motion only by a slow cross-fade.
    check('two worlds: a portal in the room, outside by default and after a reload; stepping in opens the seam from the portal and the drama is seen to sweep in from there; every box the same in both worlds and between them; typing and focus carry through, and the page is not copied again for it; never more than 3 changes a second inside; stepping out passes back through, seen the same way, and stops everything', { storage: ACCOUNT }, async (page) => {
      const w = await worldsHelpers(page, { clock: true });
      const portal = page.locator('.screen-room > header #worlds');
      assert.equal(await portal.isVisible(), true, 'the portal is there for a member inside');
      assert.equal(await portal.getAttribute('aria-pressed'), 'false', 'outside to begin with');
      assert.equal(await portal.getAttribute('aria-label'), 'The other world', 'named for screen readers');
      assert.equal((await portal.innerText()).trim(), '', 'and no words to read on it');
      assert.equal(await portal.getAttribute('title'), null, 'nor a tooltip');
      const size = await portal.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44, `the portal is big enough for a finger (${size.width} by ${size.height})`);
      assert.ok(size.y + size.height <= 844 && size.y >= 0, 'and on the screen without scrolling');
      assert.match(await portal.evaluate((el) => getComputedStyle(el, '::before').backgroundImage), /conic-gradient/, 'a ring of light, as the home page\'s portal is');
      assert.equal(await w.turning(), false, 'and still, as the room is, until somebody passes through it');
      const light = await w.tint();
      await w.watch();
      await sleep(3000);
      assert.deepEqual(await w.seen(), [], 'outside, nothing crosses');
      assert.equal(await w.world(), 'playful');
      assert.equal(await w.left(), 0, 'and nothing of the other world is there');
      const calm = await w.boxes();
      assert.ok(calm.length > 10, 'the things to press were found');
      const heard = await w.hear();
      const liveCalm = await w.live();
      const cartoon = await page.screenshot(); // (the cartoon whole, to tell the worlds apart by part-way)

      // stepping in: the seam opens from the portal, and its two edges sweep apart. (The page's clock is held still
      // at the press and run on by hand, to look at the passage part-way, whatever else this machine is doing.)
      await w.record();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000)); // (it jumps there and holds: far enough ahead of a busy machine)
      await page.evaluate(() => document.querySelector('.screen-room > header #worlds').click());
      const pressed = await w.pressed();
      assert.equal(await portal.getAttribute('aria-pressed'), 'true', 'pressed: inside is where the person has asked to be');
      assert.equal(await portal.getAttribute('aria-label'), 'The other world', 'and its name stays the same');
      const first = (await w.seen())[0];
      assert.ok(first && first.at - pressed < 2000, `the first crossing (the step in) comes at once (after ${Math.round(first?.at - pressed)} ms)`);
      assert.equal(first.world, 'split', 'by a seam');
      assert.equal(await w.passage(), 'in');
      const going = { at: 0, photo: 600, seen: [] };
      await w.partWay(going, 300);
      await page.clock.runFor(100);
      going.at = 400;
      const centre = await w.centre();
      const part = await w.seam();
      assert.ok(part && Math.hypot(part.x - centre.x, part.y - centre.y) < 2, `the seam is drawn out of the portal (${JSON.stringify(part)}, the portal at ${JSON.stringify(centre)})`);
      assert.ok(part.spread > 0.05 && part.spread < Math.PI, `its edges part-way apart (${part.spread.toFixed(2)})`);
      assert.equal(await w.turning(), true, 'the portal\'s ring turns while somebody passes through it');
      // the other world is an inert copy laid over the page, after it, hidden from screen readers; and taps go through
      assert.deepEqual(await w.copy(), { hidden: 'true', inert: true, pointer: 'none', after: true, decoration: true, through: true, ids: true }, 'the copy is inert, hidden and never pressed, after the page; and so is all that is drawn over it');
      assert.equal(await w.live(), liveCalm, 'nothing more is there to be announced');
      w.same(calm, await w.boxes(), 'stepping in');
      assert.equal(await w.hear(), heard, 'a screen reader hears the same room on the way through');
      await w.partWay(going, 600);
      await w.partWay(going, 900);
      await page.clock.resume();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 4000 });
      w.sweep(await w.edges(), centre, 'in');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.worlds-copy, .worlds-splice').length), 0, 'once the drama has it all, the copy and the seam are gone');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.screen-room > :is(header, main)')].every((part) => part.dataset.paint === 'serious')), true);
      const drama = await page.screenshot();
      await w.judge(going, 'in', cartoon, drama);
      const film = (await w.holed()).film;
      assert.deepEqual([film.inner, film.outer], [0, 3], `inside, the film over the drama leaves the portal out too (${JSON.stringify(film)})`);
      assert.equal(await w.turning(), false, 'once through, the portal is still again');
      assert.equal(await w.tint(), '#050505', `the browser's own bars go dark with the drama (from ${light})`);
      w.same(calm, await w.boxes(), 'inside');
      assert.equal(await w.hear(), heard, 'a screen reader hears the same room, inside');

      // inside, with the portal in sight, the cartoon breaks back through; typing goes on through it, keeping the focus
      // and everything typed, and the page is not copied again for it. Then the person goes down to the chat, where the
      // portal (the way out) is out of sight: what the cartoon was doing goes back, gently, with no cut, and nothing
      // breaks through again while it is out of sight.
      const field = page.locator('.screen-room > main .chat form input');
      await field.evaluate((el) => el.focus({ preventScroll: true }));
      assert.equal(await w.inSight(), true, 'the portal is in sight, at the top');
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world !== 'serious', null, { timeout: 15000 });
      assert.equal(await w.passage(), undefined, 'a crossing, not a passage');
      w.same(calm, await w.boxes(), 'the cartoon breaking through');
      await w.fills();
      await page.keyboard.type('across ', { delay: 60 });
      const down = await page.evaluate(() => performance.now());
      await w.scroll('chat');
      assert.equal(await w.inSight(), false, 'down at the chat, the portal is out of sight');
      const gone = await page.evaluate(() => performance.now()); // (by now the page has seen it go)
      await page.keyboard.type('the seam', { delay: 60 });
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.worlds-copy'), null, { timeout: 6000 });
      const since = (await w.seen()).filter((one) => one.at > gone);
      assert.ok(since.every((one) => one.world === 'split' || one.world === 'serious'), `the cartoon went back by a seam, with no cut (${JSON.stringify((await w.seen()).filter((one) => one.at > down).map((one) => [Math.round(one.at - down), one.world]))})`);
      assert.equal(await field.inputValue(), 'across the seam', 'what was typed is all there');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.screen-room > main .chat form input')), true, 'and the field still has the focus');
      assert.equal(await w.filled(), 0, 'and the page was not copied again for the typing, nor for the room\'s poll putting back what was there');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.worlds-copy, .worlds-splice').length), 0, 'the drama has it all again');
      assert.deepEqual(await w.timers(), [], 'and while the portal is out of sight, nothing waits to break through');
      w.same(calm, await w.boxes(), 'the drama back');
      assert.equal(await w.hear(), heard, 'a screen reader hears the same room');

      // stepping out passes back through: the seam opens from the portal again and sweeps back the other way (back up
      // where the portal is; the clock held still again at the press)
      await w.scroll('top');
      await w.record();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000)); // (no sooner than 15 s will the cartoon break through again)
      await page.evaluate(() => document.querySelector('.screen-room > header #worlds').click());
      const out = await w.pressed();
      const there = await w.centre();
      assert.equal(await portal.getAttribute('aria-pressed'), 'false');
      assert.equal(await portal.getAttribute('aria-label'), 'The other world');
      w.same(calm, await w.boxes(), 'stepping out');
      const leaving = { at: 0, photo: 600, seen: [] };
      for (const at of [300, 600, 900]) await w.partWay(leaving, at);
      await page.clock.resume();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful', null, { timeout: 2500 });
      w.sweep(await w.edges(), there, 'out');
      assert.deepEqual(await w.ways(), ['in', 'out'], 'in through the portal, and back out through it');
      const back = (await w.seen()).at(-1);
      assert.ok(back.at - out < 2000, `and the room is the cartoon within 2 s (after ${Math.round(back.at - out)} ms)`);
      await sleep(300);
      await w.judge(leaving, 'out', await page.screenshot(), drama);
      assert.equal(await w.left(), 0, 'back outside, nothing of the other world is left over');
      assert.deepEqual(await w.timers(), [], 'and no timer is left');
      assert.equal(await w.tint(), light, 'the browser\'s bars as they were');
      w.same(calm, await w.boxes(), 'back outside');
      assert.equal(await w.hear(), heard, 'a screen reader hears the same room');
      const changes = await w.changes();
      assert.ok(w.most(changes) <= 3, `never more than 3 changes in a second, the step in and out with them (${JSON.stringify(changes.map((one) => [Math.round(one.at), one.world, one.way]))})`);
      await w.watch();
      await sleep(4500);
      assert.deepEqual(await w.seen(), [], 'and nothing crosses after');
      assert.deepEqual(await w.timers(), []);

      // not kept: after a reload the room begins outside
      await page.reload();
      await page.waitForSelector('.screen-room #games li');
      assert.equal(await portal.getAttribute('aria-pressed'), 'false', 'every visit begins outside');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => /world|portal/i.test(key)).length), 0, 'nothing of it is kept on the device');
      await w.watch();
      await sleep(3000);
      assert.deepEqual(await w.seen(), [], 'and nothing crosses');
      assert.equal(await w.left(), 0);
    }),

    check('two worlds: a press on the way through turns round; a burst of presses never flashes; a press while the cartoon breaks through is taken smoothly', { storage: ACCOUNT }, async (page) => {
      const w = await worldsHelpers(page);
      const portal = page.locator('.screen-room > header #worlds');
      const calm = await w.boxes();
      await w.watch();
      // stepping in, and straight back out: it turns round, never having been all the way in (pressed in the page, the
      // second time on the frame after the passage has begun: Playwright's own click can take longer than a passage)
      await page.evaluate(() => new Promise((done) => {
        const root = document.querySelector('.screen-room');
        const it = root.querySelector(':scope > header #worlds');
        it.click();
        const look = () => requestAnimationFrame(() => (root.dataset.passage === 'in' ? requestAnimationFrame(() => done(it.click())) : look()));
        look();
      }));
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 2500 });
      assert.deepEqual(await w.ways(), ['in', 'out'], 'stepping in, it turned round and stepped back out');
      assert.ok((await w.seen()).every((one) => one.world !== 'serious'), 'never all the way in');
      await sleep(300);
      assert.equal(await w.left(), 0);
      assert.deepEqual(await w.timers(), [], 'and back outside, nothing is left going');

      // a burst of presses: taken one way at a time, no stacking, no burst of flashes
      await w.watch();
      for (let i = 0; i < 9; i++) {
        await portal.click();
        await sleep(110);
      }
      assert.equal(await portal.getAttribute('aria-pressed'), 'true', 'nine presses: in');
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 8000 });
      w.same(calm, await w.boxes(), 'after the burst');
      let changes = await w.changes();
      assert.ok(w.most(changes) <= 3, `never more than 3 changes in a second, a passage turning round counted as one (${JSON.stringify(changes.map((one) => [Math.round(one.at), one.world, one.way]))})`);
      // and each way a passage went was kept at least half a second: any part of the window changes once at most each
      // way, so no part of it changes more than 3 times in a second either
      const off = await w.setOff();
      assert.ok(off.length >= 2 && off.slice(1).every((at, i) => at - off[i] >= 480), `each way kept at least half a second (${JSON.stringify(off.map((at) => Math.round(at - off[0])))})`);

      // inside, wait for the cartoon to break through; and step out in the middle of it
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world !== 'serious', null, { timeout: 15000 });
      await portal.click();
      const out = await w.pressed();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.worlds-copy'), null, { timeout: 2500 });
      changes = await w.changes();
      assert.ok(changes.filter((one) => one.at > out).every((one) => one.world !== 'serious'), `taken smoothly on to the cartoon, with no flash of the drama (${JSON.stringify(changes.map((one) => [Math.round(one.at - out), one.world]))})`);
      assert.ok(w.most(changes) <= 3, `never more than 3 changes in a second (${JSON.stringify(changes.map((one) => [Math.round(one.at), one.world, one.way]))})`);
      await sleep(300);
      assert.equal(await w.left(), 0);
      assert.deepEqual(await w.timers(), [], 'and nothing is left going');
      w.same(calm, await w.boxes(), 'back outside');
    }),

    check('two worlds, with reduced motion: stepping in and out are slow cross-fades, with no seam; nothing moves inside; every box the same', { storage: ACCOUNT, reducedMotion: 'reduce' }, async (page) => {
      const w = await worldsHelpers(page, { clock: true });
      const portal = page.locator('.screen-room > header #worlds');
      assert.equal(await portal.evaluate((el) => getComputedStyle(el, '::before').animationName), 'none', 'the portal\'s ring does not turn');
      const calm = await w.boxes();
      await w.watch();
      // (the page's clock held still at the press, and run on by hand to part-way through the fade, to look at it there)
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000)); // (it jumps there and holds: far enough ahead of a busy machine)
      await page.evaluate(() => document.querySelector('.screen-room > header #worlds').click());
      const pressed = await w.pressed();
      await page.clock.runFor(350);
      const fading = await page.evaluate(() => ({
        world: document.querySelector('.screen-room').dataset.world,
        seams: document.querySelectorAll('.worlds-splice').length,
        opacity: Number(getComputedStyle(document.querySelector('.worlds-copy')).opacity),
        grain: getComputedStyle(document.querySelector('.worlds-film .grain')).animationName,
      }));
      assert.equal(fading.world, 'fade', 'it fades');
      assert.equal(fading.seams, 0, 'there is no seam');
      assert.ok(fading.opacity > 0 && fading.opacity < 1, `the drama fading in (${fading.opacity})`);
      assert.equal(fading.grain, 'none', 'and the grain is still');
      w.same(calm, await w.boxes(), 'fading in');
      await page.clock.resume();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious', null, { timeout: 4000 });
      const inside = (await w.seen()).at(-1);
      assert.ok(inside.at - pressed >= 600, `slowly (${Math.round(inside.at - pressed)} ms)`);
      w.same(calm, await w.boxes(), 'inside');
      // inside, nothing moves: no crossing at all, however long it is left
      await w.watch();
      await sleep(12000);
      assert.deepEqual(await w.seen(), [], 'nothing crosses inside');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.worlds-copy, .worlds-splice').length), 0);
      assert.deepEqual(await w.timers(), [], 'nor is anything waiting to');
      // and out, as slowly
      await portal.click();
      const out = await w.pressed();
      w.same(calm, await w.boxes(), 'fading out');
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful', null, { timeout: 2500 });
      const leaving = await w.seen();
      assert.deepEqual(leaving.map((one) => one.world), ['fade', 'playful'], 'out by a fade');
      const back = leaving.at(-1);
      assert.ok(back.at - out >= 600 && back.at - out < 2000, `out slowly, and within 2 s (${Math.round(back.at - out)} ms)`);
      await sleep(300);
      assert.equal(await w.left(), 0);
      assert.deepEqual(await w.timers(), []);
      const changes = await w.seen();
      assert.ok(changes.every((one) => one.world !== 'split'), 'never split');
      // a press during a fade does not turn it round (that would make the whole screen pulse): the fade goes on, the
      // world it comes to is kept a while, and only then does it fade back
      await w.watch();
      await portal.click();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'fade', null, { timeout: 2000 });
      await sleep(250);
      await portal.click();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.worlds-copy'), null, { timeout: 8000 });
      const twice = await w.seen();
      assert.deepEqual(twice.map((one) => one.world), ['fade', 'serious', 'fade', 'playful'], 'in all the way, and only then back out');
      const kept = twice[2].at - twice[1].at;
      assert.ok(kept >= 1450, `the drama kept a while before fading back (${Math.round(kept)} ms)`);
      assert.ok(w.most(twice) <= 2, `the whole screen changes no more than twice in a second (${JSON.stringify(twice.map((one) => [Math.round(one.at - twice[0].at), one.world]))})`);
      await sleep(300);
      assert.equal(await w.left(), 0);
      assert.deepEqual(await w.timers(), []);
    }),
    // The way out is always within reach. The portal is in the top bar, which scrolls away; while it is out of sight
    // the cartoon does not break through, and if it was breaking through, it goes back gently, with no cut. (The page's
    // clock is held, and run on by hand; and the chances room/worlds.js takes are set, one crossing at a time.)
    check('two worlds: the way out is always within reach: while the portal is out of sight nothing breaks through, and what had begun goes back gently, with no cut; however presses fall on a cut, never more than 3 changes a second; leaving the room in the middle of it stops it where it is', { storage: ACCOUNT }, async (page) => {
      const w = await worldsHelpers(page, { clock: true, steer: true });
      const world = () => page.evaluate(() => document.querySelector('.screen-room').dataset.world);
      const press = () => page.evaluate(() => document.querySelector('.screen-room > header #worlds').click());
      // the clock run on a little at a time until `done` (in the page) is true; how long that took, in the page's time
      const until = async (done, { step = 50, most = 20000 } = {}) => {
        for (let spent = 0; spent <= most; spent += step) {
          if (await page.evaluate(done)) return spent;
          await page.clock.runFor(step);
        }
        throw new Error(`not so after ${most} ms: ${done}`);
      };
      await w.steer([0]); // the seam's way down, straight
      await press();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 4000 });
      const calm = await w.boxes();

      // down at the chat, the portal out of sight: a minute and more, and nothing breaks through
      await w.scroll('chat');
      assert.equal(await w.inSight(), false, 'down at the chat, the portal is out of sight');
      await w.watch();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await page.clock.runFor(75000);
      assert.deepEqual(await w.seen(), [], 'while the portal is out of sight, nothing breaks through (75 s)');
      assert.deepEqual(await w.timers(), [], 'nor is anything waiting to');

      // back up, the portal in sight: the cartoon breaks through again (set: in 15 s, a takeover, straight, from the
      // right, over 1.3 s); it has the room; and down at the chat, it goes back, by a seam from a side (straight, from
      // the right), with no cut
      await w.steer([0]);
      await w.scroll('top');
      assert.equal(await w.inSight(), true);
      await w.steer([0.99, 0, 0.9, 0]);
      await until(() => document.querySelector('.screen-room').dataset.world !== 'serious', { step: 500, most: 16000 });
      await until(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.worlds-copy'), { most: 3000 });
      w.same(calm, await w.boxes(), 'the cartoon breaking through');
      await w.watch();
      await w.steer([0, 0.9]);
      await w.scroll('chat');
      await until(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.worlds-copy'), { most: 4000 });
      let seen = await w.seen();
      assert.deepEqual(seen.map((one) => one.world), ['split', 'serious'], 'the drama came back by a seam, gently, with no cut');
      assert.ok(seen[1].at - seen[0].at >= 900, `over a second or so (${Math.round(seen[1].at - seen[0].at)} ms)`);
      w.same(calm, await w.boxes(), 'the drama back');
      await page.clock.runFor(75000);
      assert.equal((await w.seen()).length, 2, 'and nothing breaks through again while the portal is out of sight');

      // a burst of presses on a cut (set: in 15 s, a splice, straight, the cartoon from the left): out just after the
      // cut, straight back in, and back out as soon as it can turn. Every change counted, turns too: never more than 3
      // in a second
      await w.steer([0]);
      await w.scroll('top');
      await w.steer([0, 0, 0.1]);
      await w.watch();
      await until(() => document.querySelector('.screen-room').dataset.world !== 'serious', { step: 100, most: 16000 });
      assert.equal(await world(), 'playful', 'the cut');
      await until(() => document.querySelector('.screen-room').dataset.world === 'split', { step: 10, most: 400 });
      await press();
      await until(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.worlds-copy'), { step: 16, most: 3000 });
      await press();
      await until(() => document.querySelector('.screen-room').dataset.passage === 'in', { step: 16, most: 3000 });
      await press();
      await until(() => document.querySelector('.screen-room').dataset.passage === 'out', { step: 16, most: 3000 });
      await until(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.screen-room').dataset.passage && !document.querySelector('.worlds-copy'), { step: 16, most: 3000 });
      const changes = await w.changes();
      assert.ok(changes.length >= 5, `the cut, back to half, the cartoon, in, and turning round (${JSON.stringify(changes.map((one) => [Math.round(one.at - changes[0].at), one.world, one.way]))})`);
      assert.ok(w.most(changes) <= 3, `never more than 3 changes in a second, however the presses fell (${JSON.stringify(changes.map((one) => [Math.round(one.at - changes[0].at), one.world, one.way]))})`);
      w.same(calm, await w.boxes(), 'after the burst');

      // leaving the room in the middle of a crossing (set: a takeover, straight, from the right, over 1.3 s):
      // it all stops where it is, and the film goes with the room as it slides away, the size of the window still
      await press();
      await until(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.screen-room').dataset.passage, { step: 50, most: 3000 });
      await w.steer([0.99, 0, 0.9, 0]); // (when it comes, 7 to 11 s after stepping in)
      await until(() => document.querySelector('.screen-room').dataset.world === 'split', { step: 500, most: 16000 });
      await page.clock.runFor(400);
      await page.evaluate(() => document.querySelector('.screen-room > header > a').click());
      await page.waitForFunction(() => document.querySelector('.screen-room.leaving'), null, { timeout: 4000 });
      await sleep(150);
      const going = await page.evaluate(() => {
        const root = document.querySelector('.screen-room.leaving');
        const film = root.querySelector('.worlds-film').getBoundingClientRect();
        return { film: [film.top, film.width, film.height].map(Math.round), window: [0, innerWidth, innerHeight], world: root.dataset.world };
      });
      assert.deepEqual(going.film, going.window, `the film stays the size of the window, where it was (${JSON.stringify(going)})`);
      assert.deepEqual(await w.timers(), [], 'and nothing of it is left going');
      await page.clock.runFor(1000);
      await page.waitForFunction(() => !document.querySelector('.screen-room'), null, { timeout: 4000 });
      assert.deepEqual(await w.timers(), []);
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#f6f1e7', 'the browser\'s bars as they were');
      await page.clock.resume();
    }),
  ]);

  // The night, the tags, and the checks that came with them. These are run once
  // the ones above are done, not beside them. All of those run at once, in a
  // window each, and several of them have to see something that does not last
  // (a mood Penny is in for a second or two): every check put beside them
  // makes the machine busier and such a thing easier to miss. On the machine
  // that checks pull requests, five more beside them was enough for one to be
  // missed. So what is added after them waits for them.
  results.push(...await Promise.all([
    check('a tag is hidden wherever a screen has room for it: nothing leads to the night but finding it, going through it is a tumble, and found, it is kept', { storage: { ...ACCOUNT, 'postmarks:howto-solo:v1': true, 'home:tab:v1': 'lobby' } }, async (page, h) => {
      // What the mark is like, where it is.
      const where = () => page.evaluate(() => {
        const box = (element) => {
          const b = element.getBoundingClientRect();
          return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) };
        };
        const mark = document.querySelector('.tag-hidden');
        const grid = document.querySelector('#board');
        const penny = document.querySelector('.pal:not([data-height="gone"]) .pal-penny');
        const [x, y] = [(mark.getBoundingClientRect().left + mark.getBoundingClientRect().right) / 2, (mark.getBoundingClientRect().top + mark.getBoundingClientRect().bottom) / 2];
        return {
          mark: box(mark), board: grid ? box(grid) : null, penny: penny ? box(penny) : null,
          shown: Number(getComputedStyle(mark.querySelector('svg')).opacity), words: mark.textContent.trim(), label: mark.getAttribute('aria-label'),
          pressed: mark.contains(document.elementFromPoint(x, y)),
          // what of the page is under it: nothing but the page's own ground
          under: document.elementsFromPoint(x, y).find((element) => !mark.contains(element) && !element.closest('.pal'))?.matches('main, .walk-ground, .radio-ground, .office-stage, .jam, .plot') ?? false,
        };
      });
      const apart = (a, b) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
      // nothing on the home page's menu leads to the night, and nothing is kept there yet; but somewhere on the page there is a mark
      await page.goto(origin);
      await page.waitForSelector('#menu');
      assert.equal(await page.locator('a[href="/?sky"]').count(), 0, 'the night is not chosen from a menu');
      assert.equal(await page.locator('.tag-kept').count(), 0);
      await page.waitForSelector('.tag-hidden:not([hidden])', { timeout: 9000 });
      // and so there is wherever else there is room for one: a form, the map, the film, the radio.
      // (Not everywhere. It is something to press, and is given the room a finger needs, clear of
      // everything else to press: where a screen has none to give, as the music maker has none on
      // most phones, it is not there. tests/browser/mini.e2e.cjs holds it to all of that, on a phone.)
      for (const address of ['/?join', '/?walk', '/?slow', '/jam/?taste']) {
        await page.goto(origin + address);
        await page.waitForSelector('.tag-hidden:not([hidden])', { timeout: 9000 });
        const there = await where();
        assert.ok(there.mark.right - there.mark.left >= 44 && there.mark.bottom - there.mark.top >= 44, `${address}: it has less room than a finger needs`);
        assert.ok(there.pressed && there.under, `${address}: the mark is under something, or over something`);
        assert.ok(there.mark.left >= 0 && there.mark.top >= 0 && there.mark.right <= PHONE.width && there.mark.bottom <= PHONE.height, `${address}: off the screen`);
        assert.ok(there.shown < 0.2 && there.words === '', `${address}: it is faint, and says nothing`);
        assert.ok(!there.penny || apart(there.mark, { ...there.penny, top: PHONE.height - (there.penny.bottom - there.penny.top) }), `${address}: it was put where Penny stands`);
      }
      // in a game it is in one of the squares of the map behind the board, and stays in it
      await page.goto(`${origin}/postmarks/`);
      await page.waitForSelector('#board .cell');
      await page.waitForSelector('.tag-hidden:not([hidden])', { timeout: 9000 });
      await sleep(1200);
      const first = await where();
      assert.ok(apart(first.mark, first.board), 'the tag is on the board, where a touch is a move');
      assert.ok(first.pressed && first.under);
      await sleep(2300);
      assert.deepEqual((await where()).mark, first.mark, 'the tag hopped about');
      // it glints for whoever has stopped: nothing has been pressed for a few seconds now
      await page.waitForSelector('.tag-hidden.glint', { timeout: 14000 });
      // found. Going through it is a tumble: the picture comes up out of where the mark was
      await page.mouse.click((first.mark.left + first.mark.right) / 2, (first.mark.top + first.mark.bottom) / 2);
      await page.waitForSelector('.tag-rise', { timeout: 2000 });
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('tumbling')), true);
      await page.waitForURL((url) => url.pathname + url.search === '/?sky', { timeout: 5000 });
      await page.waitForSelector('.sky-view');
      assert.deepEqual(await h.stored('tags:found:v1'), ['night'], 'found, it is theirs');
      await page.waitForFunction(() => !document.querySelector('.tag-rise') && !document.documentElement.classList.contains('tumbling'), null, { timeout: 6000 });
      assert.equal(await page.locator('#screens .screen').count(), 1, 'the screen that fell away has gone');
      // the way back leads to the game; and the mark is still there, known now: a way through from wherever it has room
      assert.equal(await page.locator('.sky .penny-back').getAttribute('href'), '/postmarks/');
      await page.locator('.sky .penny-back').click({ force: true });
      await page.waitForSelector('#board .cell');
      await page.waitForSelector('.tag-hidden.known:not([hidden])', { timeout: 9000 });
      assert.equal((await where()).label, 'The night');
      // it is kept on the home page's map, which leads back to it; still on no menu
      await page.goto(origin);
      await page.waitForSelector('.tag-kept');
      assert.equal(await page.locator('#menu a[href="/?sky"]').count(), 0);
      await sleep(3200); // (the splash, and the page settling)
      assert.equal(await page.locator('.tag-hidden').count(), 0, 'on the home page it is where it is kept, and nowhere else');
      await page.locator('.tag-kept').click({ force: true });
      await page.waitForURL((url) => url.pathname + url.search === '/?sky', { timeout: 6000 });
      await page.waitForSelector('.sky-view');
      assert.equal(await page.locator('.sky .penny-back').getAttribute('href'), '/', 'and from there the way back leads home');
    }),

    check('the night: the picture, far dimmer, comes to life a light at a time; nothing is added to it, and Penny is not in it', {}, async (page, h) => {
      await page.goto(`${origin}/?sky`);
      await page.waitForSelector('.sky-view');
      const said = () => page.locator('#sky-said').textContent();
      // What the sky is like at each of the picture's lights, in a corner, and at places far from all of them;
      // and how many of its lights are awake. (`watch`: from now on, every change to that number is written down.
      // How it wakes is read from that, not from looks taken in between: on a busy machine a look can come late.)
      const look = (watch = false) => page.evaluate(async (watching) => {
        const sky = document.querySelector('.sky');
        const awake = sky.dataset.alive;
        if (watching) {
          window.skyWoke = [awake];
          new MutationObserver(() => {
            if (window.skyWoke.at(-1) !== sky.dataset.alive) window.skyWoke.push(sky.dataset.alive);
          }).observe(sky, { attributes: true, attributeFilter: ['data-alive'] });
        }
        const { PICTURE, frame } = await import('/penny/stars.js');
        const view = document.querySelector('.sky-view');
        const pen = view.getContext('2d');
        const dense = view.width / view.clientWidth;
        const place = frame(view.clientWidth, view.clientHeight);
        const at = (x, y) => [...pen.getImageData(Math.round(x * dense), Math.round(y * dense), 1, 1).data].slice(0, 3);
        const lights = PICTURE.map((light) => ({ x: place.x + light.x * place.side, y: place.y + light.y * place.side, reach: (light.kind === 'star' ? light.b : light.r) * place.side }));
        const empty = [];
        for (let y = 12; y < view.clientHeight; y += 44) {
          for (let x = 12; x < view.clientWidth; x += 44) {
            if (lights.every((light) => Math.hypot(x - light.x, y - light.y) > light.reach * 1.9 + 70)) empty.push(at(x, y));
          }
        }
        // (and one patch of it, to tell whether anything has moved)
        const patch = [...pen.getImageData(Math.round((lights[0].x - 40) * dense), Math.round((lights[0].y - 50) * dense), Math.round(80 * dense), Math.round(100 * dense)).data].filter((_, i) => i % 4 === 0);
        return { awake, lights: lights.map((light) => ({ ...light, colour: at(light.x, light.y) })), empty, patch, corner: at(view.clientWidth - 3, 3) };
      }, watch);
      // it opens as the picture, as still as a picture, and far dimmer than the picture's own near-white.
      // (It is a second or two before the first light wakes. Should the first look come later than that, it is opened again.)
      let opening = await look(true);
      for (let again = 0; again < 3 && opening.awake !== '0'; again++) {
        await page.reload();
        await page.waitForSelector('.sky-view');
        opening = await look(true);
      }
      assert.equal(opening.awake, '0', 'it was never seen before its lights began to wake');
      assert.deepEqual(opening.corner, [9, 9, 13], 'the black of the picture');
      for (const [i, light] of opening.lights.entries()) {
        assert.ok(light.colour[0] > 70 && light.colour[0] < 125, `light ${i} of the picture is not there, or not dim: ${light.colour}`);
        assert.ok(light.colour[0] > light.colour[2] + 4, `light ${i} is not warm: ${light.colour}`);
      }
      // then it wakes, a light at a time
      await page.waitForSelector('.sky[data-alive="5"]', { timeout: 16000 });
      assert.deepEqual(await page.evaluate(() => window.skyWoke), ['0', '1', '2', '3', '4', '5'], 'the lights wake one at a time');
      await sleep(3000);
      // alive: the same patch of it a moment apart is not the same
      const [one, other] = [await look(), await sleep(400).then(look)];
      assert.notDeepEqual(one.patch, other.patch, 'nothing in it is moving');
      // nothing is added to it: away from its five lights it is the picture's black, and stays so
      for (const seen of [one, other]) {
        assert.ok(seen.empty.length > 20, `${seen.empty.length} places looked at`);
        for (const colour of seen.empty) assert.ok(colour[0] <= 14 && colour[2] <= 18, `something in the sky that is not in the picture: ${colour}`);
      }
      // nobody stands under it, and there is not a word
      assert.equal((await h.pal()).height, 'gone', 'Penny is in the night');
      assert.deepEqual(await h.words('.screen-sky'), []);
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#09090d', 'the strip at the top of a phone is the night');
      // a light that is touched twinkles: for a moment it is brighter. (Touched while it is at rest, to be sure of that.)
      let before = 255;
      for (let tries = 0; tries < 60 && before > 118; tries++) {
        await sleep(150);
        before = (await look()).lights[2].colour[0];
      }
      await page.mouse.click(one.lights[2].x, one.lights[2].y);
      await sleep(70);
      const after = (await look()).lights[2].colour[0];
      assert.ok(after > before + 20, `the middle star, touched, did not twinkle: ${before} then ${after}`);
      assert.ok(after < 222 - 20, `and even then it is well short of the picture: ${after}`);
      assert.equal(await said(), 'The middle star.');
      // a touch anywhere else, and the nearest answers
      await page.mouse.click(30, 800);
      await page.waitForFunction(() => document.querySelector('#sky-said').textContent === 'The lower dot.', null, { timeout: 2000 });
      // a finger run across them, and each twinkles as it is reached
      await page.mouse.move(one.lights[0].x - 60, one.lights[0].y);
      await page.mouse.down();
      await page.mouse.move(one.lights[0].x, one.lights[0].y, { steps: 6 });
      await page.waitForFunction(() => document.querySelector('#sky-said').textContent === 'The small star.', null, { timeout: 2000 });
      await page.mouse.up();
      // the way back keeps out of the picture when it is left alone, and comes back for a touch
      await page.waitForSelector('.sky.idle', { timeout: 6000 });
      await sleep(900); // (it fades)
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sky .penny-back')).opacity), '0');
      await page.mouse.click(30, 800);
      await page.waitForSelector('.sky:not(.idle)');
      // the way back is a tumble too: the page comes turning up out of the dark, and then the night has gone
      await page.locator('.sky .penny-back').click({ force: true });
      await page.waitForSelector('.home-map');
      await page.waitForFunction(() => document.querySelectorAll('#screens .screen').length === 1, null, { timeout: 5000 });
      assert.notEqual(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#09090d', 'the strip at the top is the page\'s again');
    }),

    check('the night, with reduced motion and by keyboard: nothing moves, and the keys 1 to 5 are its five lights', { reducedMotion: 'reduce', viewport: { width: 1024, height: 768 } }, async (page) => {
      await page.goto(`${origin}/?sky`);
      await page.waitForSelector('.sky[data-alive="5"]', { timeout: 2000 });
      // every light is where the picture has it, and stays there: just outside each, the sky stays black
      const outside = () => page.evaluate(async () => {
        const { PICTURE, frame } = await import('/penny/stars.js');
        const view = document.querySelector('.sky-view');
        const pen = view.getContext('2d');
        const dense = view.width / view.clientWidth;
        const place = frame(view.clientWidth, view.clientHeight);
        const at = (x, y) => pen.getImageData(Math.round(x * dense), Math.round(y * dense), 1, 1).data[0];
        return PICTURE.map((light) => {
          const [x, y] = [place.x + light.x * place.side, place.y + light.y * place.side];
          const [w, h] = light.kind === 'star' ? [light.a * place.side, light.b * place.side] : [light.r * place.side, light.r * place.side];
          // its middle; and four places beside its points, where a light that had wandered would show
          return { middle: at(x, y), beside: [at(x + w * 0.5, y - h * 0.5), at(x - w * 0.5, y + h * 0.5), at(x + 3, y - h - 4), at(x + w + 4, y + 3)] };
        });
      });
      await sleep(1500);
      for (const seen of [await outside(), await sleep(900).then(outside)]) {
        for (const [i, light] of seen.entries()) {
          assert.ok(light.middle > 40 && light.middle < 222 - 20, `light ${i}: ${light.middle}`);
          if (i % 2 === 0) assert.ok(light.beside.every((value) => value <= 40), `star ${i} has moved: ${light.beside}`);
        }
      }
      // the keys 1 to 5 are the five lights, as they are read
      const names = ['The small star.', 'The lower dot.', 'The middle star.', 'The upper dot.', 'The big star.'];
      for (const [i, name] of names.entries()) {
        await page.keyboard.press(String(i + 1));
        await page.waitForFunction((want) => document.querySelector('#sky-said').textContent === want, name, { timeout: 2000 });
      }
      // the space bar is each of them in turn, and the arrows go back and forth along them
      await page.keyboard.press(' ');
      await page.waitForFunction(() => document.querySelector('#sky-said').textContent === 'The small star.');
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('#sky-said').textContent === 'The big star.');
      // the way back answers to the keyboard as a link does
      await page.locator('.sky .penny-back').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.home-map');
    }),

    // The screen the app opens on is the only one whose parts rise into place
    // (the others slide in whole). They rise, and no more than that: the game
    // has a letter arrive on its square with a turn and a bounce, and for as
    // long as that had the same name, that is how every part of the page
    // arrived. And once risen, each is what it would be on any other visit.
    // They were once left fully opaque for good: scene two opened with its
    // fingertip of light, which is there to show how to whoever is caught
    // waiting, standing in the middle of the room.
    check('the screen the app opens on rises into place, and is then as it would be anywhere', {}, async (page) => {
      await page.goto(`${origin}/?slow`);
      await page.waitForSelector('.screen.opening .office-door');
      const onTheWay = await page.evaluate(() => {
        const door = document.querySelector('.screen.opening .office-door');
        const rise = door.getAnimations().find((each) => each.animationName === 'arrive');
        if (!rise) return null;
        rise.pause();
        rise.currentTime = rise.effect.getComputedTiming().delay + 90; // a quarter of the way
        const { a, b, c, d, f } = new DOMMatrix(getComputedStyle(door).transform);
        const seen = { turned: [a, b, c, d], below: f, opacity: Number(getComputedStyle(door).opacity) };
        rise.finish();
        return seen;
      });
      assert.ok(onTheWay, 'its parts arrive');
      assert.deepEqual(onTheWay.turned, [1, 0, 0, 1], 'neither turned nor grown on the way');
      assert.ok(onTheWay.below > 0 && onTheWay.below < 8, `a little below where it will be (${onTheWay.below})`);
      assert.ok(onTheWay.opacity > 0 && onTheWay.opacity < 0.55, `and fainter than it will be (${onTheWay.opacity})`);
      await sleep(1200);
      const settled = await page.evaluate(() => {
        const tip = document.querySelector('.slow-tip');
        return { door: getComputedStyle(document.querySelector('.office-door')).opacity, tip: getComputedStyle(tip).opacity, shown: tip.classList.contains('on') };
      });
      assert.equal(settled.door, '0.55', 'the door back is as dim as on any other visit');
      assert.deepEqual([settled.shown, settled.tip], [false, '0'], 'and the fingertip is not to be seen: nobody has been caught waiting yet');
    }),

    // A hop is Penny's own: down a little first, then up and stretched, then
    // down again on landing. (For as long as the end of a game had a hop of
    // the same name, that plainer one was the only hop there was, anywhere.)
    // And at the end of a game won, what was kept hops, one after another: the
    // hearts of a game won alone, the faces of one won together. (Neither ever
    // did. The rule for it could match nothing, and counted on a number the
    // hearts were never given.)
    check('a hop is Penny\'s own; and at the end of a game won, what was kept hops, one after another', {}, async (page) => {
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('#jam-play');
      await sleep(1500);
      // the first hop there is, stopped as it starts and looked at in three places
      await page.evaluate(() => {
        window.hopSeen = new Promise((done) => {
          document.addEventListener('animationstart', function heard(event) {
            if (event.animationName !== 'hop') return;
            document.removeEventListener('animationstart', heard);
            const hop = event.target.getAnimations().find((each) => each.animationName === 'hop');
            hop.pause();
            const at = (share) => {
              hop.currentTime = share * hop.effect.getComputedTiming().duration;
              const { a, d, f } = new DOMMatrix(getComputedStyle(event.target).transform);
              return { wide: a, tall: d, up: -f };
            };
            const seen = [at(0.18), at(0.48), at(0.78)];
            hop.play();
            done(seen);
          });
        });
      });
      await page.locator('#jam-play').click(); // (with nothing on the board, Penny hops on the beat itself)
      const [crouch, leap, landing] = await page.evaluate(() => Promise.race([window.hopSeen, new Promise((done) => setTimeout(() => done([null, null, null]), 8000))]));
      await page.locator('#jam-play').click();
      assert.ok(crouch, 'Penny hops to the beat');
      assert.ok(crouch.wide > 1.03 && crouch.tall < 0.95 && crouch.up === 0, `first it gathers itself (${JSON.stringify(crouch)})`);
      assert.ok(leap.up > 2 && leap.tall > 1.02 && leap.wide < 1, `then it is up, and stretched (${JSON.stringify(leap)})`);
      assert.ok(landing.wide > 1.01 && landing.tall < 0.97 && landing.up === 0, `and it lands (${JSON.stringify(landing)})`);

      // The end of a game, opened as the game opens it (without a game being played to get there).
      await page.goto(`${origin}/postmarks/`);
      await sleep(1500);
      const kept = (mode) => page.evaluate(async (how) => {
        const before = document.querySelector('dialog.finale');
        before?.close();
        while (before?.isConnected) await new Promise((done) => setTimeout(done, 20)); // (it takes itself away once it has closed)
        const { openFinale } = await import('/postmarks/finale.js');
        openFinale({ won: true, mode: how, title: 'Delivered', detail: '', hearts: 3, people: [{ avatar: '🦊', color: 1 }, { avatar: '🐼', color: 2 }], about: {}, leave: 'Done', onDone() {} });
        return [...document.querySelectorAll('dialog.finale .kept .heart, dialog.finale .team .avatar')].map((each) => `${getComputedStyle(each).animationName} ${getComputedStyle(each).animationDelay}`);
      }, mode);
      assert.deepEqual(await kept('solo'), ['finale-hop 0.5s', 'finale-hop 0.62s', 'finale-hop 0.74s'], 'the hearts kept, one after another');
      assert.deepEqual(await kept('coop'), ['finale-hop 0.5s', 'finale-hop 0.62s'], 'the faces of everyone who played, one after another');
      await page.evaluate(() => document.querySelector('dialog.finale')?.close());
    }),
  ]));

  // A room, with games and a chat, opened by a member; and what is needed to watch its worlds. (`steer`: the chances
  // room/worlds.js takes can be set, one at a time, with w.steer([...]): what each is for is said where it is used.)
  async function worldsHelpers(page, { clock = false, steer = false } = {}) {
    const ROOM = '11111111-1111-4111-8111-111111111111';
    const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
    const game = (n, over) => ({ id: `${String(n).repeat(8)}-3333-4333-8333-333333333333`, kind: 'postmarks', mode: 'coop', size: 6, status: 'playing', hearts: 3, moves: 2, found: 1, last_player: 1, phrase_by: null, finished: 0, mine: null, updated_at: '2026-11-24T10:00:00Z', ...over });
    const messages = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, seat: i % 3 ? 1 : 0, body: i % 4 ? 'a note passed across the rug' : 'a longer note, passed across the rug, that has to turn a line or two before it ends', at: new Date(Date.UTC(2026, 10, 24, 18, i)).toISOString(), game_kind: null, game_id: null }));
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await page.route(/supabase\.co\/rest\/v1\/rpc\/room_get/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const after = JSON.parse(route.request().postData()).p_after ?? 0;
      return route.fulfill({ json: { id: ROOM, name: 'Book club', code: 'K7M2QP', you: 0, people, messages: messages.filter((one) => one.id > after), games: [game(1), game(2, { mode: 'trial', finished: 1 }), game(3, { status: 'won', found: 6 })] }, headers: cors });
    });
    if (clock) await page.clock.install(); // (before what follows, which keeps account of the page's timers)
    // the timers and frames room/worlds.js has asked for and that have not yet come (from its own calls, by the stack)
    await page.addInitScript(() => {
      const pending = new Map();
      const ours = () => /\/room\/worlds\.js/.test(new Error().stack);
      const where = () => new Error().stack.split('\n').filter((line) => line.includes('/room/worlds.js')).map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+/, '')).slice(0, 3).join(' < ');
      const [later, unlater, frame, unframe] = [window.setTimeout, window.clearTimeout, window.requestAnimationFrame, window.cancelAnimationFrame];
      window.setTimeout = function (fn, ms, ...rest) {
        if (typeof fn !== 'function' || !ours()) return later.call(window, fn, ms, ...rest);
        const id = later.call(window, (...args) => { pending.delete(`timer ${id}`); fn(...args); }, ms, ...rest);
        pending.set(`timer ${id}`, where());
        return id;
      };
      window.clearTimeout = function (id) { pending.delete(`timer ${id}`); return unlater.call(window, id); };
      window.requestAnimationFrame = function (fn) {
        if (!ours()) return frame.call(window, fn);
        const id = frame.call(window, (now) => { pending.delete(`frame ${id}`); fn(now); });
        pending.set(`frame ${id}`, where());
        return id;
      };
      window.cancelAnimationFrame = function (id) { pending.delete(`frame ${id}`); return unframe.call(window, id); };
      window.worldsTimers = () => [...pending].map(([what, from]) => `${what}: ${from}`);
      // when the portal was last pressed, as the page has it
      document.addEventListener('click', (event) => {
        if (event.target.closest?.('.screen-room > header #worlds')) window.worldsPressed = performance.now();
      }, true);
    });
    if (steer) {
      await page.addInitScript(() => {
        const real = Math.random;
        window.worldsSteer = [];
        Math.random = () => (window.worldsSteer.length && /\/room\/worlds\.js/.test(new Error().stack) ? window.worldsSteer.shift() : real());
      });
    }
    await page.goto(`${origin}/room/?id=${ROOM}`);
    await page.waitForSelector('.screen-room #games li');
    await sleep(800); // (the furniture settles into place)
    const w = {
      world: () => page.evaluate(() => document.querySelector('.screen-room').dataset.world),
      passage: () => page.evaluate(() => document.querySelector('.screen-room').dataset.passage),
      pressed: () => page.evaluate(() => window.worldsPressed),
      // what is left going (given up to 2 s for the last frames of a change to come, on a busy machine)
      timers: async () => {
        await page.waitForFunction(() => window.worldsTimers().length === 0, null, { timeout: 2000 }).catch(() => {});
        return page.evaluate(() => window.worldsTimers());
      },
      // what of the other world is on the page: the copy, the film, a seam (and the layer they are on), the page painted serious
      left: () => page.evaluate(() => document.querySelectorAll('.worlds-copy, .worlds-over, .worlds-film, .worlds-splice, .screen-room [data-paint], .screen-room[data-passage]').length),
      // the next chances room/worlds.js takes (Math.random), in order; after them, chance again
      steer: (values) => page.evaluate((list) => { window.worldsSteer = [...list]; }, values),
      // whether the portal is in sight (at least half of it)
      inSight: () => page.evaluate(() => {
        const r = document.querySelector('.screen-room > header #worlds').getBoundingClientRect();
        return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= r.height / 2;
      }),
      // the page scrolled to the top, or down to the chat; and time for the page to see where the portal now is
      scroll: async (to) => {
        await page.evaluate((where) => {
          if (where === 'top') window.scrollTo(0, 0);
          else document.querySelector('.screen-room > main .chat form').scrollIntoView({ block: 'center' });
        }, to);
        await sleep(250);
      },
      // how much of the window each part of the other world has, from the shape it is cut to (a point every 8 px):
      // the copy of the page (and which world it is), and the film over the drama
      shares: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        const ctx = document.createElement('canvas').getContext('2d');
        const shape = (el) => {
          const m = el?.style.clipPath.match(/^polygon\((?:(evenodd|nonzero),\s*)?(.*)\)$/);
          if (!m) return null;
          const path = new Path2D();
          m[2].split(',').map((p) => p.trim().split(/\s+/).map(parseFloat)).forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
          path.closePath();
          return { path, rule: m[1] ?? 'nonzero' };
        };
        const box = root.getBoundingClientRect();
        const copy = root.querySelector(':scope > .worlds-copy');
        const [cut, film] = [shape(copy), shape(root.querySelector('.worlds-film'))];
        let [c, f, n] = [0, 0, 0];
        for (let y = 4; y < innerHeight; y += 8) {
          for (let x = 4; x < innerWidth; x += 8) {
            n += 1;
            if (cut && ctx.isPointInPath(cut.path, x - box.left, y - box.top, cut.rule)) c += 1;
            if (film && ctx.isPointInPath(film.path, x, y, film.rule)) f += 1;
          }
        }
        return { copy: c / n, film: f / n, world: copy?.dataset.paint };
      }),
      // whether the portal is left out of the copy and the film (it belongs to neither world): of points inside its
      // ring, and of points just beyond it, how many each covers (round the way a passage faces, or else below it)
      holed: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        const ctx = document.createElement('canvas').getContext('2d');
        const shape = (el) => {
          const m = el?.style.clipPath.match(/^polygon\((?:(evenodd|nonzero),\s*)?(.*)\)$/);
          if (!m) return null;
          const path = new Path2D();
          m[2].split(',').map((p) => p.trim().split(/\s+/).map(parseFloat)).forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
          path.closePath();
          return { path, rule: m[1] ?? 'nonzero' };
        };
        const box = root.getBoundingClientRect();
        const r = root.querySelector(':scope > header #worlds').getBoundingClientRect();
        const o = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
        const edges = [...root.querySelectorAll('.worlds-splice.edge')].map((edge) => Number(edge.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1]) + Math.PI / 2);
        const [mid, half] = edges.length === 2 ? [(edges[0] + edges[1]) / 2, Math.abs(edges[1] - edges[0]) / 2] : [Math.PI / 2, 0.5];
        const at = (d, a) => [o.x + d * Math.cos(a), o.y + d * Math.sin(a)];
        const inner = [0.35, 0.65, 0.9].flatMap((k) => [-0.3, 0, 0.3].map((da) => at(k * o.r, mid + da)));
        const outer = [-0.4, 0, 0.4].map((k) => at(o.r + 10, mid + k * Math.min(half, 0.5))); // (inside the seam's opening)
        const count = (el, points, dx, dy) => {
          const it = shape(el);
          return it ? points.filter(([x, y]) => ctx.isPointInPath(it.path, x - dx, y - dy, it.rule)).length : null;
        };
        const [copy, film] = [root.querySelector(':scope > .worlds-copy'), root.querySelector('.worlds-film')];
        return {
          copy: copy && { inner: count(copy, inner, box.left, box.top), outer: count(copy, outer, box.left, box.top) },
          film: film && { inner: count(film, inner, 0, 0), outer: count(film, outer, 0, 0) },
          points: { inner: inner.length, outer: outer.length },
        };
      }),
      // the light at points of the window, in a screenshot (each the mean over a small square round it)
      light: (png, points) => {
        return page.evaluate(async ({ b64, points }) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const canvas = document.createElement('canvas');
          [canvas.width, canvas.height] = [img.width, img.height];
          const g = canvas.getContext('2d');
          g.drawImage(img, 0, 0);
          const scale = img.width / innerWidth;
          const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return points.map(([x, y]) => {
            const d = g.getImageData(Math.round(x * scale) - 4, Math.round(y * scale) - 4, 9, 9).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
            return sum / (d.length / 4);
          });
        }, { b64: png.toString('base64'), points });
      },
      // points below the portal, down the middle of a passage's seam (the way it faces), and points beside the portal,
      // level with it, which the drama reaches last on the way in and leaves first on the way out
      sights: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        const r = root.querySelector(':scope > header #worlds').getBoundingClientRect();
        const o = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const edges = [...root.querySelectorAll('.worlds-splice.edge')].map((edge) => Number(edge.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1]) + Math.PI / 2);
        const mid = (edges[0] + edges[1]) / 2;
        const down = [];
        for (let d = 80; o.y + d * Math.sin(mid) < innerHeight - 20; d += 40) down.push([o.x + d * Math.cos(mid), o.y + d * Math.sin(mid)]);
        const beside = [];
        for (let x = 24; x < o.x - 60; x += 24) beside.push([x, o.y]);
        return { down: down.filter(([x]) => x > 8 && x < innerWidth - 8), beside };
      }),
      // which world each of `points` shows in the screenshot `png`: the one whose whole screenshot is nearer there (only
      // where the two differ)
      which: async (png, points, cartoon, drama) => {
        const [seen, c, d] = [await w.light(png, points), await w.light(cartoon, points), await w.light(drama, points)];
        return seen.map((one, i) => (Math.abs(c[i] - d[i]) < 0.12 ? null : Math.abs(one - c[i]) < Math.abs(one - d[i]) ? 'cartoon' : 'drama')).filter(Boolean);
      },
      // how many times the copy of the page is made again while it is up, from now on (making a new one is not counted)
      fills: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        window.worldsFills = 0;
        window.worldsFillsWatch?.forEach((one) => one.disconnect());
        const each = new MutationObserver((list) => { window.worldsFills += list.filter((one) => one.addedNodes.length).length; });
        const look = () => root.querySelectorAll(':scope > .worlds-copy').forEach((copy) => each.observe(copy, { childList: true }));
        const come = new MutationObserver(look);
        look();
        come.observe(root, { childList: true });
        window.worldsFillsWatch = [each, come];
      }),
      filled: () => page.evaluate(() => window.worldsFills),
      // the colour the browser is asked to give its own bars round the page; and whether the portal's ring is turning
      tint: () => page.evaluate(() => document.querySelector('meta[name="theme-color"]').content),
      turning: () => page.evaluate(() => getComputedStyle(document.querySelector('.screen-room > header #worlds'), '::before').animationName !== 'none'),
      // A passage held part-way (the page's clock held still since the press), looked at `at` ms after the press: how
      // much of the window the other world has, from the shapes the copy and the film are cut to; whether the portal is
      // left out of both; and at `photo` ms, a screenshot, with points down the middle of the opening and beside the
      // portal, level with it (to be judged once both worlds have been seen whole: see judge).
      partWay: async (held, at) => {
        await page.clock.runFor(at - held.at);
        held.at = at;
        const one = { at, ...(await w.shares()), holed: await w.holed() };
        if (at === held.photo) [one.sights, one.png] = [await w.sights(), await page.screenshot()];
        held.seen.push(one);
        return one;
      },
      // ...and the passage so looked at, judged: the other world's part of the window grew (in: the drama's, from the
      // copy; out: the cartoon's) at the pace the passage goes; the film over exactly the drama's part; the portal in
      // neither; and half-way, what is seen: the drama below the portal, the way the seam was drawn out (stepping in,
      // opening from there; stepping out, closing back into it), and beside the portal, level with it, the cartoon
      // (where the drama comes last, and the cartoon first). `cartoon` and `drama` are screenshots of each world whole,
      // from the same place.
      judge: async (held, way, cartoon, drama) => {
        const other = way === 'in' ? 'serious' : 'playful';
        const what = JSON.stringify(held.seen.map((one) => [one.at, one.world, Number(one.copy.toFixed(3)), Number(one.film.toFixed(3))]));
        held.seen.forEach((one, i) => {
          const eased = (1 - Math.cos((Math.PI * one.at) / 1200)) / 2; // (as far through as the passage is, at an even pace over the window)
          assert.equal(one.world, other, `${way}: the copy laid over the page is the other world (${what})`);
          assert.ok(one.copy > 0.02 && one.copy < 0.95, `${way}, ${one.at} ms: the other world has part of the window, neither none nor all of it (${what})`);
          assert.ok(Math.abs(one.copy - eased) < 0.1, `${way}, ${one.at} ms: as much of it as the passage has come (${eased.toFixed(2)}: ${what})`);
          if (i) assert.ok(one.copy > held.seen[i - 1].copy + 0.05, `${way}: more of it at every look (${what})`);
          const drama = way === 'in' ? one.copy : 1 - one.copy;
          assert.ok(Math.abs(one.film - drama) < 0.03, `${way}, ${one.at} ms: the film is over the drama's part, and only that (${what})`);
          const { copy: c, film: f, points } = one.holed;
          assert.deepEqual([c.inner, f.inner], [0, 0], `${way}, ${one.at} ms: the portal is in neither world: the copy and the film leave it out (${JSON.stringify(one.holed)})`);
          if (one.at >= 600) assert.deepEqual([c.outer, f.outer], [way === 'in' ? points.outer : 0, points.outer], `${way}, ${one.at} ms: ...and only it: just beyond it, below, the drama (${JSON.stringify(one.holed)})`);
        });
        const photo = held.seen.find((one) => one.png);
        const [down, beside] = [await w.which(photo.png, photo.sights.down, cartoon, drama), await w.which(photo.png, photo.sights.beside, cartoon, drama)];
        assert.ok(down.length >= 4 && down.filter((one) => one === 'drama').length >= 0.8 * down.length, `${way}, ${photo.at} ms: below the portal, the drama is seen (${JSON.stringify(down)})`);
        assert.ok(beside.length >= 3 && beside.filter((one) => one === 'cartoon').length >= 0.8 * beside.length, `${way}, ${photo.at} ms: beside it, the cartoon (${JSON.stringify(beside)})`);
      },
      // the middle of the portal, in the window
      centre: () => page.evaluate(() => {
        const r = document.querySelector('.screen-room > header #worlds').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }),
      // a passage's seam: where its two edges start from, and how far apart they are (radians)
      seam: () => page.evaluate(() => {
        const edges = [...document.querySelectorAll('.worlds-splice.edge')].map((edge) => edge.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)rad\)/)?.slice(1).map(Number));
        if (edges.length !== 2 || !edges.every(Boolean)) return null;
        return { x: edges[0][0], y: edges[0][1], spread: edges[1][2] - edges[0][2], same: edges[0][0] === edges[1][0] && edges[0][1] === edges[1][1] };
      }),
      // every frame of a passage's seam from now on: where its two edges start from, and how far apart they are
      record: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        window.worldsEdges = [];
        window.worldsEdgesWatch?.disconnect();
        window.worldsEdgesWatch = new MutationObserver(() => {
          const edges = [...root.querySelectorAll(':scope > .worlds-over > .worlds-splice.edge')].map((edge) => edge.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)rad\)/)?.slice(1).map(Number));
          if (edges.length !== 2 || !edges.every(Boolean)) return;
          const one = { x: edges[0][0], y: edges[0][1], spread: edges[1][2] - edges[0][2] };
          const last = window.worldsEdges.at(-1);
          if (!last || last.spread !== one.spread || last.x !== one.x || last.y !== one.y) window.worldsEdges.push(one);
        });
        window.worldsEdgesWatch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
      }),
      edges: () => page.evaluate(() => window.worldsEdges),
      // a whole passage: drawn out of the portal every frame, and its edges going one way only, from together below
      // the portal to together above it (in), or back (out)
      sweep: (edges, centre, way) => {
        const what = JSON.stringify(edges.map((one) => Number(one.spread.toFixed(2))));
        assert.ok(edges.length >= 3, `the seam was seen on the way (${what})`);
        for (const one of edges) assert.ok(Math.hypot(one.x - centre.x, one.y - centre.y) < 2, `the seam is drawn out of the portal (${JSON.stringify(one)}, the portal at ${JSON.stringify(centre)})`);
        const [from, to] = way === 'in' ? [0, 2 * Math.PI] : [2 * Math.PI, 0];
        assert.ok(Math.abs(edges[0].spread - from) < 0.3 && Math.abs(edges.at(-1).spread - to) < 0.6, `from ${from.toFixed(2)} to ${to.toFixed(2)} radians apart (${what})`);
        edges.slice(1).forEach((one, i) => assert.ok(way === 'in' ? one.spread >= edges[i].spread - 1e-6 : one.spread <= edges[i].spread + 1e-6, `${way === 'in' ? 'opening' : 'closing'} all the way, never back (${what})`));
      },
      // the copy and all that is drawn over the page: inert, hidden, after the page, and never pressed
      copy: () => page.evaluate(() => {
        const it = document.querySelector('.worlds-copy');
        const root = document.querySelector('.screen-room');
        const more = root.querySelector(':scope > header #more').getBoundingClientRect();
        const hit = document.elementFromPoint(more.left + more.width / 2, more.top + more.height / 2);
        return {
          hidden: it.getAttribute('aria-hidden'), inert: it.inert, pointer: getComputedStyle(it).pointerEvents,
          after: [...root.querySelectorAll(':scope > :is(header, main)')].every((part) => part.compareDocumentPosition(it) & Node.DOCUMENT_POSITION_FOLLOWING),
          decoration: [...document.querySelectorAll('.worlds-over, .worlds-film, .worlds-splice')].every((one) => one.getAttribute('aria-hidden') === 'true' && getComputedStyle(one).pointerEvents === 'none'),
          through: hit?.closest('#more') === root.querySelector(':scope > header #more'),
          // (the copy has the page's ids too: anything looked for by its id is still found on the page)
          ids: [...it.querySelectorAll('[id]')].every((twin) => !root.querySelector(`#${CSS.escape(twin.id)}`).closest('.worlds-copy') && !document.getElementById(twin.id).closest('.worlds-copy')),
        };
      }),
      // what a screen reader is told of the room (but for whether the portal is pressed, which pressing it changes, and
      // what is typed in the message field, which the checks type)
      hear: async () => (await page.locator('.screen-room').ariaSnapshot())
        .replace(/(button "The other world")(?: \[pressed\])?/, '$1')
        .replace(/( *)- textbox "Message"[^\n]*\n(?:\1 +[^\n]*\n)*/, (all, indent) => `${indent}- textbox "Message"\n`),
      live: () => page.evaluate(() => [...document.querySelectorAll('.screen-room [aria-live], .screen-room [role="log"], .screen-room [role="alert"], .screen-room [role="status"]')].filter((one) => !one.closest('[aria-hidden="true"]')).length),
      // every change of world from now on, with when it was (and which way through the portal anybody was going)
      watch: () => page.evaluate(() => {
        const root = document.querySelector('.screen-room');
        window.worldsFrom = root.dataset.world;
        window.worldsWayFrom = root.dataset.passage ?? '';
        window.worldsSeen = [];
        window.worldsWatch?.disconnect();
        window.worldsWatch = new MutationObserver(() => window.worldsSeen.push({ at: performance.now(), world: root.dataset.world, way: root.dataset.passage ?? '' }));
        window.worldsWatch.observe(root, { attributes: true, attributeFilter: ['data-world', 'data-passage'] });
      }),
      seen: () => page.evaluate(() => window.worldsSeen.filter((one, i, all) => one.world !== (i ? all[i - 1].world : window.worldsFrom))),
      // every change to the screen since then: a change of world, or a passage turning round (which changes what part of
      // the window is in which world, though not the world as a whole)
      changes: () => page.evaluate(() => window.worldsSeen.filter((one, i, all) => {
        const [world, way] = i ? [all[i - 1].world, all[i - 1].way] : [window.worldsFrom, window.worldsWayFrom];
        return one.world !== world || (one.way && way && one.way !== way);
      })),
      // when a passage set off, or turned round, since then
      setOff: () => page.evaluate(() => window.worldsSeen.filter((one, i, all) => one.way && one.way !== (i ? all[i - 1].way : window.worldsWayFrom)).map((one) => one.at)),
      // the ways through the portal since then, in order ('in', 'out')
      ways: () => page.evaluate(() => window.worldsSeen.map((one) => one.way).filter(Boolean).filter((one, i, all) => i === 0 || one !== all[i - 1])),
      most: (changes) => Math.max(0, ...changes.map((one) => changes.filter((other) => other.at >= one.at && other.at < one.at + 1000).length)),
      // where everything that can be pressed, typed in or scrolled is on the page (not in the copy of it)
      boxes: () => page.evaluate(() => [...document.querySelectorAll('.screen-room > :is(header, main)')]
        .flatMap((part) => [...part.querySelectorAll('a[href], button, input, textarea, select, [tabindex], .chat-log')])
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
        })),
      same: (before, after, when) => {
        assert.equal(after.length, before.length, `${when}: the same things to press`);
        before.forEach((one, i) => {
          const two = after[i];
          const off = Math.max(...['x', 'y', 'w', 'h'].map((key) => Math.abs(one[key] - two[key])));
          assert.ok(two.what === one.what && off <= 1, `${when}: ${one.what} moved or changed size (${JSON.stringify(one)} then ${JSON.stringify(two)})`);
        });
      },
    };
    return w;
  }

  await browser.close();
  server.close();
  const failed = results.filter((ok) => ok === false).length;
  const skipped = results.filter((ok) => ok === null).length;
  console.log(`# ${results.length - failed - skipped} passed, ${failed} failed${skipped ? `, ${skipped} not asked for` : ''}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
