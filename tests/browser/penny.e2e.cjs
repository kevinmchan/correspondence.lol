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
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office-stage');
      await page.locator('.office-door').click({ force: true });
      await page.waitForSelector('.home-map');
    }),

    check('scene one is gone through by swiping up, and Penny shows how to whoever waits on its first screen', {}, async (page) => {
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office[data-screen="0"]');
      const rested = (screen) => page.waitForSelector(`.office[data-screen="${screen}"]:not(.playing)`, { timeout: 30000 });
      const swipe = async (fromY, toY, x = 195) => {
        await page.mouse.move(x, fromY);
        await page.mouse.down();
        await page.mouse.move(x, toY, { steps: 6 });
        await page.mouse.up();
      };
      await sleep(2500);
      assert.equal(await page.locator('.office').getAttribute('data-screen'), '0', 'the scene moved on by itself');
      await page.waitForSelector('.o-touch', { state: 'attached', timeout: 8000 }); // caught waiting: shown
      await swipe(300, 600); // down: not the way
      await swipe(600, 590); // a tap
      await sleep(300);
      assert.equal(await page.locator('.office').getAttribute('data-screen'), '0', 'something other than a swipe up moved it on');
      await swipe(600, 300);
      await page.waitForSelector('.o-leaving.lit');
      assert.equal(await page.locator('.o-touch').count(), 0, 'still being shown how after doing it');
      await rested(1);
      await sleep(9500);
      assert.equal(await page.locator('.o-touch').count(), 0, 'shown how on a screen that is not the first');
      await swipe(600, 300);
      await swipe(600, 300); // while that one plays: kept
      await rested(3);
      await page.keyboard.press('ArrowUp');
      await page.waitForSelector('.o-first.lit', { timeout: 30000 });
      await rested(4);
      await swipe(600, 300);
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

    check('with an account: Penny keeps out of the way of the page', { viewport: { width: 390, height: 664 }, storage: ACCOUNT }, async (page, h) => {
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
      for (const address of ['/jam/', '/?open', '/?join', '/?office']) {
        await page.goto(origin + address);
        await sleep(1200);
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, address, 'the address is still the one asked for');
        assert.equal((await h.pal()).height, 'gone', address);
      }
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
