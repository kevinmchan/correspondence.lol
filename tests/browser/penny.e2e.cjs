// Penny, in a real browser. `npm run e2e`.
//
// The rules of the places are checked in tests/penny.test.js, which needs only
// Node. This checks the part that only exists in a browser: that Penny is
// where it should be and nowhere else, that the whole first quarter can be
// walked from the home page to Dot, by touch and by keyboard and with reduced
// motion, and that nothing throws on the way. It needs Playwright with
// Chromium; where that is not installed it says so and passes.
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
  console.log('Playwright is not installed: skipping the browser checks.');
  process.exit(0);
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
    return { pal, feeling, board, centre, tap, open, idle, until, says, portalOpen, through, stored, words };
  };

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
      await page.locator('.pal-penny .paper').click({ force: true });
      await h.until('thrilled', 3000);
      await h.until('sad', 3000);
      await h.until('calm', 6000);
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

    check('the radio: a swipe tunes to the other station, a double tap keeps one once both have been heard, and the experiment stays behind it', {}, async (page) => {
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('#jam-lab');
      await page.locator('#jam-lab').click();
      await page.waitForURL(/\/jam\/\?taste/);
      await page.waitForSelector('.taste-card');
      await sleep(700); // the screen slides in
      const box = await page.locator('.radio .display').boundingBox(); // (its knob and buttons are pressed, not swiped)
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      // all of the set is on the screen, and nothing behind it is the white of a page
      const set = await page.evaluate(() => {
        const parts = [...document.querySelectorAll('.radio .body, .radio .antenna, .radio .handle, .radio .feet')].map((part) => part.getBoundingClientRect());
        const ground = getComputedStyle(document.querySelector('.radio-world')).backgroundImage;
        return { top: Math.min(...parts.map((r) => r.top)), bottom: Math.max(...parts.map((r) => r.bottom)), left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)), wide: innerWidth, high: innerHeight, ground, scrolls: document.scrollingElement.scrollHeight > innerHeight };
      });
      assert.ok(set.top >= 0 && set.left >= 0 && set.right <= set.wide && set.bottom <= set.high, `the radio is not all on the screen: ${JSON.stringify(set)}`);
      assert.equal(set.scrolls, false, 'the page scrolls');
      assert.match(set.ground, /gradient/, 'the radio stands in the world');
      assert.equal(await page.locator('.radio .plate').textContent(), 'Penny’s Radio');
      const mood = () => page.evaluate(() => document.querySelector('.pal')?.dataset.mood);
      await page.waitForFunction(() => document.querySelector('.pal')?.dataset.mood === 'hopeful', null, { timeout: 6000 }); // Penny shows how: a swipe
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
      // a swipe turns it over, and back
      const was = await turned();
      await swipe();
      assert.equal(await turned(), !was, 'a swipe did not turn the card');
      assert.equal(await mood(), 'thrilled', 'Penny is not delighted that it was done');
      // too soon: neither side has been listened to
      await sleep(300);
      await doubleTap();
      await sleep(200);
      assert.equal((await kept()).trials.length, 0, 'a pick counted before both sides had been heard');
      assert.match(await page.locator('#taste-note').textContent(), /Tune to|Stay on/);
      assert.equal(await page.locator('#lab-picks').isVisible(), false, 'the experiment is not on the face of the radio');
      assert.match(await page.locator('#radio-freq').textContent(), /^\d{2,3}\.\d$/, 'a station has a place on the dial');
      // listened to both: now it counts
      const pickOne = async () => {
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
        if ((await page.locator('.taste-card .face.heard').count()) < 2) await swipe();
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 8000 });
        const up = (await turned()) ? 'back' : 'front';
        await doubleTap();
        await sleep(250);
        return up;
      };
      const first = await pickOne();
      assert.equal(await page.evaluate(() => localStorage.getItem('radio:taught:v1')), 'true', 'a station kept: Penny has shown all there is');
      let data = await kept();
      assert.equal(data.trials.length, 1);
      assert.equal(data.trials[0].pick, first, 'the side that was up is the one picked');
      assert.equal(data.current[first], data.trials[0][first], 'the loop that was picked stays where it is');
      assert.notEqual(data.current[first === 'front' ? 'back' : 'front'], data.trials[0][first === 'front' ? 'back' : 'front'], 'and a new challenger takes the other side');
      assert.equal(data.current.reigning, first);
      assert.match(data.current.phantom, /^[A-Za-z0-9_-]{39}$/, 'a phantom was made beside the challenger');
      assert.equal(await page.locator('#lab-picks').textContent(), '1');
      assert.equal(await page.locator('#lab-picks').isVisible(), false);
      // the station that was kept says so when it is tuned in
      if (((await turned()) ? 'back' : 'front') !== first) await swipe();
      assert.match(await page.locator('#radio-tag').textContent(), /Kept 1 of 5/);
      // behind the radio: the experiment, when asked for
      await page.locator('#taste-behind-open').click();
      assert.equal(await page.locator('#lab-picks').isVisible(), true);
      assert.match(await page.locator('#lab-verdict').textContent(), /9 to go/);
      await page.locator('#taste-behind-close').click();
      assert.equal(await page.locator('#lab-picks').isVisible(), false);
      // by keyboard, and by the buttons
      await page.locator('.taste-card').focus();
      const before = await turned();
      await page.keyboard.press('ArrowRight');
      assert.equal(await turned(), !before);
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 12000 }).catch(async () => { await page.locator('#taste-flip').click(); });
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 12000 });
      await page.locator('#taste-pick').click();
      await page.waitForFunction(() => document.querySelector('#lab-picks').textContent === '2');
      // it is all still there after a reload
      await page.reload();
      await page.waitForSelector('.taste-card');
      assert.equal(await page.locator('#lab-picks').textContent(), '2');
      assert.match(await page.locator('#lab-verdict').textContent(), /8 to go/);
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
  ]);

  await browser.close();
  server.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`# ${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
