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
const { quietSocket } = require('./socket.cjs');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main() {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  // One check: its own window, its own storage. Any error on the page fails it.
  // What a page put on the clipboard, as it wrote it. The clipboard itself is
  // the machine's, one for every window: two checks that copy at the same time
  // read each other's (a radio's data once came back as a music maker's link).
  const keepsCopies = (page) => page.addInitScript(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => { window.__copied = text; return write(text); };
  });
  const copiedBy = (page) => page.evaluate(() => window.__copied ?? null);

  // No more than AT_ONCE checks at a time (8, or what AT_ONCE says). They are written to run side by side, a batch
  // at once, and a batch is some thirty windows: on a machine of four cores, a tap made here was reaching its page
  // hundreds of milliseconds late, and nearly every check that failed now and then failed of that. The rest wait
  // their turn, in the order they were written.
  const AT_ONCE = Number(process.env.AT_ONCE) || 8;
  // SHARD=k/n: the suite split over n machines, this one taking every nth check from the kth (GitHub runs it as
  // two halves, side by side). Counted in the order the checks are written, which is the order they are called in.
  const part = /^(\d+)\/(\d+)$/.exec(process.env.SHARD || '');
  const SHARD = part && Number(part[1]) >= 1 && Number(part[1]) <= Number(part[2]) ? { is: Number(part[1]), of: Number(part[2]) } : null;
  if (process.env.SHARD && !SHARD) throw new Error(`SHARD is k/n, as in 1/2: not "${process.env.SHARD}"`);
  let asked = 0;
  let running = 0;
  const waiting = [];
  const turn = () => (running < AT_ONCE ? (running += 1, Promise.resolve()) : new Promise((go) => waiting.push(go)));
  const done = () => { const next = waiting.shift(); if (next) next(); else running -= 1; };

  async function check(name, { storage = {}, viewport = PHONE, ...options }, run) {
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return null; // ONLY=regex runs the checks it names
    if (SHARD && asked++ % SHARD.of !== SHARD.is - 1) return null; // SHARD=1/2 runs every other check: its half of them
    await turn();
    const started = Date.now();
    const context = await browser.newContext({ viewport, ...options });
    await context.route(/supabase\.co/, (route) => route.abort());
    await quietSocket(context); // (and its live socket is answered here, not by the service)
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
    done();
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
    // A double tap, as a person makes one: two quick taps, 80 ms from one to the next. The machine does not always manage
    // it. Each press and each lift is a message to the browser, and when the machine is busy they arrive late: the second
    // tap has come 420 to 580 ms after the first where the last place allows 350, and the walk then rightly takes them for
    // two taps (a cross, and the cross rubbed out) and opens nothing. So the page is asked what it was really given and
    // what came of it. Two taps that were not quick are made again; two quick taps that open nothing are a failure.
    const QUICK = 200; // ms: under every place's `twice` (350 at the least), and under the 260 at which a press is a hold
    const twice = async (cell) => {
      const [x, y] = await centre(cell);
      for (let tries = 1; ; tries++) {
        const before = await page.evaluate((n) => {
          if (!window.__taps) {
            for (const type of ['pointerdown', 'pointerup']) window.addEventListener(type, (event) => window.__taps.push({ type, at: event.timeStamp }), true);
          }
          window.__taps = [];
          return document.querySelectorAll('#walk-board .cell')[n].dataset.state;
        }, cell);
        await page.mouse.click(x, y, { clickCount: 2, delay: 40 });
        // (the walk answers a tap as it lands, so by now it has answered both)
        const { after, busy, taps } = await page.evaluate((n) => ({
          after: document.querySelectorAll('#walk-board .cell')[n].dataset.state,
          busy: document.querySelector('#walk-board').classList.contains('busy'),
          taps: window.__taps,
        }), cell);
        if (busy || after === 'letter' || after !== before) return; // a post found, or a cross where there was none
        const downs = taps.filter((tap) => tap.type === 'pointerdown');
        const ups = taps.filter((tap) => tap.type === 'pointerup');
        const quick = downs.length === 2 && ups.length === 2 && downs[1].at - downs[0].at < QUICK && ups.every((up, i) => up.at - downs[i].at < QUICK);
        assert.ok(!quick, `a double tap on square ${cell} opened nothing (${JSON.stringify(taps.map((tap) => Math.round(tap.at - taps[0].at)))} ms)`);
        assert.ok(tries < 8, `the machine is too slow to make a double tap on square ${cell}: ${tries} tries`);
        await sleep(1000); // at least: the slow taps are forgotten before the next two
      }
    };
    // A double tap, and then wait until Penny has finished with what it found.
    const open = async (cell) => {
      await twice(cell);
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
    // What does not last long enough to be asked after, written down in the page as it happens, from now on: each
    // mood Penny takes ('mood glad'), and on the map a square left ajar and shut again ('ajar', 'shut').
    const watch = () => page.evaluate(() => {
      window.__seen = [];
      window.__seeing?.disconnect();
      const board = document.querySelector('#walk-board');
      const isAjar = () => Boolean(board?.querySelector('.cell.ajar'));
      let ajar = isAjar();
      window.__seeing = new MutationObserver((list) => {
        for (const { target, attributeName, oldValue } of list) { // (in the order things happened)
          if (attributeName === 'data-mood') {
            if (target.dataset.mood !== oldValue) window.__seen.push(`mood ${target.dataset.mood}`);
          } else if (isAjar() !== ajar) {
            ajar = !ajar;
            window.__seen.push(ajar ? 'ajar' : 'shut');
          }
        }
      });
      window.__seeing.observe(document.querySelector('.pal'), { attributes: true, attributeFilter: ['data-mood'], attributeOldValue: true });
      if (board) window.__seeing.observe(board, { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    // ...and what has been written down so far; or, given `last`, once that is in it
    const seen = async (last = null, timeout = 15000) => (await page.waitForFunction((want) => (want === null || window.__seen.includes(want)) && window.__seen, last, { timeout })).jsonValue();
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
    return { pal, feeling, board, centre, tap, twice, open, idle, until, says, portalOpen, through, stored, watch, seen, words, reading };
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

  // Penny's Radio's meter. A radio played by a simulated taster (phone.cjs), two picks short of the end of its
  // warm-up; one somewhere under way; and one a pick short of ×20, by hand, in picks made by the rule before
  // there were eight phantoms (the first pick called nothing, the next eleven each won the bet at 0.3 of the stake,
  // ×1.3^11 is ×17.9, and the pair now up is on record at 0.9 for the front with the real challenger and 0.5 with
  // the phantom, so that keeping the front wins 0.4 more: ×25). And the owner's own radio, as main saved it.
  const { radioPlayed } = require('./phone.cjs');
  const model = await import('../../jam/taste-model.js');
  const TOLD = { 'radio:taught:v1': true, 'radio:story:v1': 'told' };
  const VERSION = fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
  const OWNER = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'radio-saved-v1.1.58.json'), 'utf8')).saves;
  const early = await radioPlayed((now) => now.picks >= model.WARMUP - 2);
  const going = await radioPlayed((now) => now.picks >= 30 && now.stake >= 4.5 && now.stake <= 8 && now.peak >= now.stake * 1.3 && !now.significant, { seed: 7, most: 200, taste: 0.6 });
  const brink = await radioPlayed((now) => now.picks >= 12);
  const old = ({ pPhantoms, ...trial }) => trial; // (a pick as it was kept before there were eight phantoms)
  brink.trials = brink.trials.map((trial, i) => old({ ...trial, pick: 'front', ...(i === 0 ? { p: null, q: null, pPhantom: null } : { p: 0.7, q: 0.5, pPhantom: 0.4 }) }));
  brink.current = old({ ...brink.current, first: 'front', p: 0.9, q: 0.5, pPhantom: 0.5 });
  // ...and the same radio once that pair was kept (×20 at pick 13) and two more lost (old picks: ×0.7 each), the stake
  // fallen back to about ×12, the lamp lit
  const fallen = { ...brink, trials: [...brink.trials, { ...brink.current, pick: 'front' }, ...[0, 1].map(() => ({ ...brink.trials.at(-1), pick: 'back' }))] };
  // What the meter shows, and says to a screen reader; and all of it as it is in the page (every attribute, the
  // classes in any order, and the whole of what is drawn), so that nothing about it can change unnoticed.
  const meterOf = (page) => page.locator('#radio-meter').evaluate((el) => {
    const needle = el.querySelector('.g-needle');
    const style = getComputedStyle(needle);
    const attributes = [...el.attributes].map((one) => `${one.name}=${one.name === 'class' ? [...el.classList].sort().join(' ') : one.value}`).sort();
    return {
      attributes, drawn: el.innerHTML,
      role: el.getAttribute('role'), now: el.getAttribute('aria-valuenow'), min: el.getAttribute('aria-valuemin'), max: el.getAttribute('aria-valuemax'), text: el.getAttribute('aria-valuetext'),
      warming: el.classList.contains('warming'), risen: el.classList.contains('risen'), lit: el.classList.contains('lit'), lighting: el.classList.contains('lighting'),
      swing: el.style.getPropertyValue('--swing'), peak: el.style.getPropertyValue('--peak'), sunk: el.style.getPropertyValue('--sunk'), pips: el.querySelectorAll('.g-pip.on').length,
      needle: style.transform, swings: style.transitionDuration.split(',')[0], halo: el.querySelector('.g-halo').getAnimations().length,
    };
  });
  // Anything at all that is written to the meter from now on: every attribute, class, child or word, anywhere in it.
  const watchMeter = (page) => page.evaluate(() => {
    window.meterChanges = [];
    window.meterWatch?.disconnect();
    window.meterWatch = new MutationObserver((list) => { for (const one of list) window.meterChanges.push(`${one.type} ${one.attributeName ?? ''} on ${one.target.nodeName}`); });
    window.meterWatch.observe(document.querySelector('#radio-meter'), { attributes: true, attributeOldValue: true, childList: true, subtree: true, characterData: true });
  });
  const meterChanges = (page) => page.evaluate(() => window.meterChanges);
  const keptOn = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jam:taste:v1')));
  const standingOn = (page) => page.evaluate(async () => {
    const kept = JSON.parse(localStorage.getItem('jam:taste:v1'));
    return (await import('/jam/taste-model.js')).standing(kept.trials, kept.carried ?? 1, kept.restarts ?? []);
  });
  const valueOf = (stake) => String(Math.round(Math.min(model.NEEDED, Math.max(0, stake)) * 100) / 100); // aria-valuenow: between its ends, roughly
  // Both stations listened to, for long enough that one can be kept; and one kept (`side`: that one).
  // (The one that is up is listened to, and then the other. It used to be "until one has been heard, then the other":
  // but the one heard may be the one that is not up. A check that tunes away from a station and comes here has, on a
  // busy machine, come with that station heard through already: the radio was then turned back to it, and 8 seconds
  // went by on a station already heard.)
  const listenToBoth = async (page) => {
    if ((await page.locator('#taste-play').getAttribute('aria-pressed')) !== 'true') await page.locator('#taste-play').click();
    await page.waitForFunction(() => document.querySelector('.taste-card .face.tuned.heard'), null, { timeout: 8000 });
    if ((await page.locator('.taste-card .face.heard').count()) < 2) await page.locator('#taste-flip').click();
    await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 8000 });
  };
  const keepOne = async (page, side = null) => {
    const before = (await keptOn(page)).trials.length;
    await listenToBoth(page);
    const tuned = (await page.locator('.taste-card').evaluate((card) => card.classList.contains('turned'))) ? 'back' : 'front';
    if (side && tuned !== side) await page.locator('#taste-flip').click();
    await page.locator('#taste-pick').click();
    await page.waitForFunction((n) => JSON.parse(localStorage.getItem('jam:taste:v1')).trials.length === n + 1, before, { timeout: 5000 });
  };
  const startOverOn = async (page) => {
    await page.locator('#taste-behind-open').click();
    await page.waitForSelector('#taste-behind[open]');
    await page.locator('#taste-reset').click();
    await page.locator('dialog.ask button.yes').click();
    await page.waitForFunction(() => document.querySelector('#lab-picks').textContent === '0');
    await page.locator('#taste-behind-close').click();
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
      // The scene keeps its own time, and on a busy machine this check does not keep up with it. A swipe made from
      // here is a press, six moves and a lift, each of them a message to the browser: the two below that are not
      // swipes up have taken 10 seconds between them, where a turn of the first loop in which nothing is shown is
      // 3.8 s; so the third turn was 4.3 s old when it was asked after, and its letter (gone 2.8 s in) had left: 2 on
      // the shelves, not 3. And the count of the mail "at the start" has come back 3.1 s after the scene began,
      // which is when the first letter is gone. So what there is as a turn begins is not asked for afterwards. The
      // page writes each turn down as it begins (which screen, which turn of its loop, the mail on the shelves,
      // whether the square is lit), and each showing how (with the mail there was then); and that is what is read.
      await page.addInitScript(() => {
        window.__scene = [];
        new MutationObserver((list) => {
          const office = document.querySelector('.office');
          const now = (what) => ({ what, screen: Number(office.dataset.screen), turn: Number(office.dataset.turn), left: document.querySelectorAll('.o-leaving:not(.gone)').length, lit: Boolean(document.querySelector('.o-first.lit')) });
          for (const one of list) {
            if (one.type === 'attributes' && one.target === office) window.__scene.push(now('turn'));
            else if ([...one.addedNodes].some((node) => node.nodeType === 1 && node.classList.contains('o-touch'))) window.__scene.push(now('shown'));
          }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-turn'] });
      });
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office[data-screen="0"]');
      const where = () => page.evaluate(() => { const it = document.querySelector('.office'); return [Number(it.dataset.screen), Number(it.dataset.turn)]; });
      // a turn of a loop, as it was when it began (waited for, if it has not begun yet); and the first showing how
      const written = (what, screen, turn, timeout) => page.waitForFunction(([w, s, t]) => window.__scene.find((one) => one.what === w && one.screen === s && (t === null || one.turn === t)), [what, screen, turn], { timeout }).then((found) => found.jsonValue());
      const turned = (screen, turn, timeout = 40000) => written('turn', screen, turn, timeout);
      const left = () => page.locator('.o-leaving:not(.gone)').count();
      const swipe = async (fromY, toY, x = 195) => {
        await page.mouse.move(x, fromY);
        await page.mouse.down();
        await page.mouse.move(x, toY, { steps: 6 });
        await page.mouse.up();
      };
      assert.equal((await turned(0, 0)).left, 5, 'the mail on the shelves at the start');
      const shown = await written('shown', 0, null, 9000); // caught waiting: shown
      assert.deepEqual([shown.turn, shown.left], [0, 4], 'one letter gone after one turn of the loop');
      await swipe(300, 600); // down: not the way
      await swipe(600, 590); // a tap
      await sleep(300);
      assert.equal((await where())[0], 0, 'something other than a swipe up moved it on');
      // left alone it only loops, and each turn another letter has gone
      assert.equal((await turned(0, 1)).left, 4);
      assert.equal((await turned(0, 2)).left, 3);
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
      assert.equal((await turned(3, 0, 2000)).lit, false); // (lit 3.4 s into this turn: not to be asked after)
      assert.equal((await turned(3, 1)).lit, true, 'the square lit');
      await swipe(600, 300);
      await page.waitForURL((url) => url.pathname === '/' && url.search === '', { timeout: 5000 }); // on: home, where it was found (it is out of the story for now)
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
      // A rush across the room: there and back in a fiftieth of a second. The room tells fast from slow by the times
      // on what the hand sends it, which a screen stamps as the finger moves, however late the page gets them. Sent
      // one by one from here they are stamped as they arrive, and on a busy machine that is late: the press and the
      // first stroke have come 176 ms to a second apart, which is 320 pixels at a walk, and the room rightly kept
      // it. So the rush is sent with its times on it, 8 ms from one to the next, and the page says what it was given.
      await page.evaluate(() => {
        window.__rush = [];
        for (const type of ['pointerdown', 'pointermove', 'pointerup']) window.addEventListener(type, (event) => window.__rush.push(event.timeStamp), true);
      });
      const hand = await page.context().newCDPSession(page);
      const began = Date.now() / 1000 - 1;
      const sent = (type, x, y, ms, held) => hand.send('Input.dispatchMouseEvent', { type, x, y, timestamp: began + ms / 1000, button: type === 'mouseMoved' && !held ? 'none' : 'left', buttons: held ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
      await sent('mouseMoved', 40, 300, 0, false);
      await sent('mousePressed', 40, 300, 8, true);
      await sent('mouseMoved', 350, 380, 16, true);
      await sent('mouseMoved', 40, 460, 24, true);
      await sent('mouseReleased', 40, 460, 32, false);
      const given = await page.evaluate(() => window.__rush);
      assert.ok(given.length === 5 && given[4] - given[0] < 40, `the rush did not reach the room as a rush: ${JSON.stringify(given.map((at) => Math.round(at - given[0])))} ms`);
      assert.equal(await kept(), 0, 'a rush left something behind');
      // And a rush as a hand makes one: not across the room in a frame, but 10 pixels every 8 ms (1.25 a millisecond,
      // over the 0.9 at which nothing stays), already moving as it comes down. Its beginning is a rush too: the speed
      // used to be eased up from nothing at each press, and the first strokes of this were kept as slow ones.
      await page.evaluate(() => { window.__rush = []; });
      await sent('mouseMoved', 40, 520, 1000, false);
      await sent('mousePressed', 40, 520, 1008, true);
      for (let i = 1; i <= 30; i++) await sent('mouseMoved', 40 + i * 10, 520, 1008 + i * 8, true);
      await sent('mouseReleased', 340, 520, 1256, false);
      await hand.detach();
      const swept = await page.evaluate(() => window.__rush);
      assert.ok(swept.length >= 3 && swept.at(-1) - swept[0] < 260, `the second rush did not reach the room as a rush: ${swept.length} events over ${Math.round(swept.at(-1) - swept[0])} ms`);
      assert.equal(await kept(), 0, 'a rush left its beginning behind');
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
      // (the portal is at the foot of the page, on the left: Penny comes over from 0.7 to stand beside it, clear of it)
      await page.waitForFunction(() => Number(document.querySelector('.pal').style.getPropertyValue('--x')) < 0.5, null, { timeout: 15000 });
      it = await pal();
      assert.ok(['up', 'peek'].includes(it.height), 'Penny has come up to show the portal');
      await sleep(900); // (the walk over)
      const clear = await page.evaluate(() => document.querySelector('.pal-penny').getBoundingClientRect().left - document.querySelector('#portal').getBoundingClientRect().right);
      assert.ok(clear >= 0, `Penny stands over the portal it is showing, by ${-clear}px`);
      assert.deepEqual((await words('.pal')).filter((text) => text !== '♥'), [], 'nothing written in Penny\'s layer');
      // through it: the story, from the beginning
      await page.locator('#portal').click({ force: true });
      await page.waitForURL(/\?hello/);
      await page.waitForSelector('#hello-penny:not([hidden])');
      await sleep(1200);
      assert.equal((await pal()).height, 'gone', 'Penny is in the scene, not standing at the edge');
      // (the portal was pressed while Penny was still walking over to it: that walk must not carry on here)
      assert.equal(await page.evaluate(() => document.querySelector('.pal-penny').classList.contains('walking')), false, 'not still walking');
      assert.deepEqual(await words('main.hello'), [], 'no words in the introduction');
      await page.locator('.penny-back').click();
      await page.waitForURL((url) => url.search === '');
      await sleep(900);
      assert.notEqual((await pal()).height, 'gone', 'and Penny is at home again');
    }),

    check('play: the story comes first for everybody, from its beginning the first time and then from wherever it was left, until the first places have been walked, whatever has been played already; then a board, and the portal always goes back to the beginning', { storage: { ...ACCOUNT, 'postmarks:howto-solo:v1': true, 'correspondence:energy:v1': { earned: 5, spent: 0, boards: [] } } }, async (page) => {
      const store = (values) => page.evaluate((all) => { for (const [key, value] of Object.entries(all)) localStorage.setItem(key, JSON.stringify(value)); }, values);
      const home = async () => {
        await page.goto(`${origin}/`);
        await page.waitForSelector('#play:not([hidden])');
      };
      const playGoes = async () => page.locator('#play').getAttribute('href');
      // the first time: the beginning
      await home();
      assert.equal(await playGoes(), '/?hello');
      await page.locator('#play').click();
      await page.waitForURL(/\?hello/);
      await page.waitForSelector('#hello-penny:not([hidden])');
      // still the beginning, if that is as far as it got
      await home();
      assert.equal(await playGoes(), '/?hello');
      // through the introduction's portal to scene two (scene one is out of the story for now), and left there: play goes on from scene two
      await page.goto(`${origin}/?hello&at=portal`);
      await page.waitForSelector('#hello-portal:not([hidden]):not(:disabled)', { timeout: 15000 });
      await page.locator('#hello-portal').click({ force: true });
      await page.waitForURL(/\?slow/);
      await page.waitForSelector('.slow-keep');
      await home();
      assert.equal(await playGoes(), '/?slow', 'play goes on from where the story was left');
      // the portal, though, is always the beginning
      assert.equal(await page.locator('#portal').getAttribute('href'), '/?hello');
      // and from scene two, and from the walk: on from there
      await page.goto(`${origin}/?slow`);
      await page.waitForSelector('.slow-keep');
      await home();
      assert.equal(await playGoes(), '/?slow');
      await page.locator('#play').click();
      await page.waitForURL(/\?slow/);
      await page.goto(`${origin}/?walk`);
      await page.waitForSelector('#walk-board .cell');
      await home();
      assert.equal(await playGoes(), '/?walk');
      // a scene seen again from the beginning does not take play back with it
      await page.goto(`${origin}/?office`);
      await page.waitForSelector('.office-stage');
      await home();
      assert.equal(await playGoes(), '/?walk', 'seeing an earlier scene again does not lose the place');
      // left part of the way along the walk: the walk again, at the place that had been reached
      await store({ 'penny:place:v1': 2 });
      await home();
      assert.equal(await playGoes(), '/?walk', 'not walked yet: play is still the walk');
      await page.locator('#play').click();
      await page.waitForURL(/\?walk/);
      await page.waitForFunction(() => document.querySelectorAll('#walk-board .cell').length > 1);
      // walked: a board
      await store({ 'penny:walked:v1': true });
      await home();
      await page.locator('#play').click();
      await page.waitForURL(/\/postmarks\/$/);
      await page.waitForSelector('#board .cell');
      // and from then on the story is reached by the portal, from its beginning
      await home();
      assert.equal(await playGoes(), '/postmarks/');
      await page.waitForFunction(() => !document.querySelector('#splash')); // (what the app opens under has cleared)
      await page.locator('#portal').click({ force: true });
      await page.waitForURL(/\?hello/);
      await page.waitForSelector('#hello-penny:not([hidden])');
    }),
    check('the first quarter, start to finish, by touch', {}, async (page, h) => {
      await page.goto(`${origin}/?walk`);
      await sleep(1600);
      // place 1: one tap leaves the square ajar and Penny listens, and hears the post; two taps open it
      // (The square is ajar for 500 ms; and the second time, with Penny holding its breath, for 650. On a busy machine
      // a tap made from here has come back, and the question after it been put, later than that: asked 684 ms after
      // the tap landed, the square had been shut for 180. So the page writes down what a tap brings, and that is
      // read: nothing here is asked after by the clock.)
      await page.waitForSelector('#walk-board .cell');
      await h.watch();
      await h.tap(0);
      assert.deepEqual((await h.seen('shut')).filter((one) => !one.startsWith('mood')), ['ajar', 'shut'], 'one tap leaves the square ajar');
      await h.says('right here');
      // (No sooner: the second time, two taps 650 ms apart are still a double tap. With nothing else for the machine to
      // do the next tap used to land 541 to 553 ms after the last, and the post was opened here and not below:
      // `holding` and `hopeful`, which were waited for, were moods of that.)
      await sleep(600);
      await h.watch();
      await h.tap(0);
      // it has heard the post there: ajar again, it holds its breath; and nothing came: shut, and the breath is let go
      const second = await h.seen('mood hopeful');
      assert.deepEqual(second.slice(second.indexOf('ajar')), ['ajar', 'mood holding', 'shut', 'mood hopeful']);
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

    check('the introduction: Penny hides behind the mailbox and looks out; comes up the street, shy of a touch; fills the glass, wider than the screen, its eyes on a finger; a portal opens behind it, it jumps back and then in; and the portal, which could not be pressed before, leads on; not a word', {}, async (page, h) => {
      const it = () => page.evaluate(() => {
        const penny = document.querySelector('.h-penny');
        const at = penny.querySelector('.paper').getBoundingClientRect();
        return { behind: Boolean(penny.closest('.h-behind')), wide: at.width / innerWidth, left: at.left, right: at.right, mood: penny.dataset.mood, lookX: Number(penny.style.getPropertyValue('--look-x')), gone: penny.classList.contains('gone') };
      });
      const said = (text, timeout = 30000) => page.waitForFunction((want) => document.querySelector('#hello-said')?.textContent.includes(want), text, { timeout });
      await page.goto(`${origin}/?hello`);
      // first, alone and large in the middle of the screen, until it is touched
      await page.waitForSelector('#hello-penny:not([hidden])');
      await sleep(600);
      assert.deepEqual(await h.words('main.hello'), [], 'no words');
      let now = await it();
      assert.ok(!now.behind && now.wide > 0.5 && now.wide < 0.75, `at first it is large: ${now.wide.toFixed(2)} of the screen wide`);
      assert.ok(Math.abs((now.left + now.right) / 2 - PHONE.width / 2) < 4, 'and in the middle');
      // touched: knocked back down the street, and it hides
      await page.locator('#hello-penny').click();
      await said('hides behind a mailbox');
      now = await it();
      assert.ok(now.behind && now.wide < 0.2, 'small, behind the mailbox');
      assert.equal(await page.locator('#hello-portal').isHidden(), true);
      // it looks out: part of it shows beside the mailbox
      await said('looks out');
      const box = await page.locator('.h-box .body').boundingBox();
      now = await it();
      assert.ok(now.left < box.x - 2, 'something of Penny shows beside the mailbox');
      assert.ok(now.right > box.x, 'and the rest is behind it');
      // out, and up the street; touched on the way, it starts and goes back, and comes on again
      await said('comes out');
      // touched before the glimpse came: it comes now, once, as Penny sets off, and Penny walks on through it
      await page.waitForSelector('.hello.glimpse', { timeout: 4000 });
      assert.ok(await page.locator('.hello-static .band').count() > 0, 'blocks of the screen go wrong');
      await page.waitForSelector('.hello:not(.glimpse) #hello-broke:empty', { timeout: 2000 }); // (both pushes over)
      await sleep(1700);
      const before = (await it()).wide;
      await page.mouse.click(200, 200);
      await said('goes back a step');
      await sleep(600);
      assert.ok((await it()).wide <= before + 0.01, 'a touch did not send it back');
      // at the glass: wider than the screen, and its eyes go to a finger
      await said('bigger than the screen');
      await page.waitForSelector('.h-penny.pressed');
      await sleep(400);
      now = await it();
      assert.ok(now.wide > 1.2, `at the glass Penny is ${now.wide.toFixed(2)} of the screen wide`);
      assert.ok(now.left < 0 && now.right > PHONE.width, 'it runs off both sides of the screen');
      // (once it has looked you over and tapped: from then its eyes are yours, and it stays while there is a finger to follow)
      await page.waitForSelector('.hello[data-watching] .h-penny[data-mood="glad"]', { timeout: 20000 });
      assert.equal(await page.locator('.hello.glimpse').count(), 0, 'nothing breaks through at the glass');
      const looks = (side) => page.waitForFunction((want) => Math.sign(Number(document.querySelector('.h-penny').style.getPropertyValue('--look-x'))) === want && Math.abs(Number(document.querySelector('.h-penny').style.getPropertyValue('--look-x'))) > 0.5, side, { timeout: 4000 });
      await page.mouse.move(20, 300);
      await page.mouse.move(30, 300);
      await looks(-1); // its eyes follow to the left
      await page.mouse.move(370, 300);
      await looks(1); // and to the right
      // the portal: there, but behind Penny and not to be pressed, until Penny has gone through
      await said('A portal opens');
      assert.equal(await page.locator('#hello-portal').isDisabled(), true);
      const covered = await page.evaluate(() => { const p = document.querySelector('#hello-portal').getBoundingClientRect(); const body = document.querySelector('.h-penny .paper').getBoundingClientRect(); return p.left > body.left && p.right < body.right && p.top > body.top && p.bottom < body.bottom; });
      assert.ok(covered, 'the portal opens behind Penny: Penny hides it');
      await said('there it is');
      await sleep(700);
      now = await it();
      assert.ok(now.left >= 0 && now.wide < 0.6, 'jumped back: small again, and wholly on the screen');
      const clear = await page.evaluate(() => { const p = document.querySelector('#hello-portal').getBoundingClientRect(); const body = document.querySelector('.h-penny .paper').getBoundingClientRect(); return body.right < p.left + 4 || body.top > p.bottom; });
      assert.ok(clear, 'and the portal is revealed');
      await said('jumps in');
      assert.equal((await it()).gone, true);
      assert.equal(await page.locator('#hello-portal').isDisabled(), false);
      assert.deepEqual(await h.words('main.hello'), []);
      await page.locator('#hello-portal').click({ force: true }); // (it breathes: it is never quite still)
      await page.waitForURL(/\?slow/); // (scene two: scene one is out of the story for now)
    }),

    check('the introduction, at first: Penny alone, going through one feeling after another, its face, its eyes and its paper with each, until it is touched; one feeling can be held; and by keyboard, Penny can be pressed', {}, async (page) => {
      const face = () => page.evaluate(() => { const it = document.querySelector('.h-penny'); return `${it.dataset.mood} ${it.dataset.eyes} ${it.dataset.mouth}`; });
      await page.goto(`${origin}/?hello`);
      await page.waitForSelector('#hello-penny:not([hidden])');
      // early on, just after it is glad: for a blink, something breaks through the screen; Penny itself is not changed by it
      const looks = () => page.evaluate(() => { const it = document.querySelector('.h-penny'); return [it.dataset.mood, it.dataset.eyes, it.dataset.mouth, getComputedStyle(it.querySelector('.seal')).fill, getComputedStyle(it.querySelector('.paper')).fill].join(' '); });
      // (the page is asked what it showed as the glimpse began: it is a fifth of a second, and a look from here can come too late for it)
      const { was, tear, bands } = await page.evaluate(() => new Promise((done) => {
        const main = document.querySelector('main.hello');
        const seen = () => {
          const it = document.querySelector('.h-penny');
          done({
            was: [it.dataset.mood, it.dataset.eyes, it.dataset.mouth, getComputedStyle(it.querySelector('.seal')).fill, getComputedStyle(it.querySelector('.paper')).fill].join(' '),
            tear: getComputedStyle(document.querySelector('.hello-near')).filter,
            bands: document.querySelectorAll('.hello-static .band').length,
          });
        };
        if (main.classList.contains('glimpse')) return seen();
        const watch = new MutationObserver(() => { if (main.classList.contains('glimpse')) { watch.disconnect(); seen(); } });
        watch.observe(main, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => done({ was: 'no glimpse in 15 s' }), 15000);
      }));
      assert.equal(tear, 'url("#hello-tear")', 'the picture tears');
      assert.ok(bands > 0, 'blocks of the screen go wrong');
      assert.ok(was.startsWith('glad'), `it comes just after Penny is glad, not ${was}`);
      await page.waitForSelector('.hello:not(.glimpse) #hello-broke:empty', { timeout: 2000 }); // (both pushes over)
      assert.equal(await looks(), was, 'Penny is just as it was');
      assert.equal(await page.locator('.hello-static .band').count(), 0, 'and it is gone');
      const faces = new Set();
      const paper = new Set();
      for (let i = 0; i < 40; i++) {
        faces.add(await face());
        paper.add(await page.evaluate(() => document.querySelector('.h-penny .paper').getAttribute('d')));
        await sleep(500);
      }
      assert.ok(faces.size >= 6, `only ${faces.size} feelings: ${[...faces].join(', ')}`);
      for (const one of ['happy', 'closed', 'half']) assert.ok([...faces].some((f) => f.includes(one)), `its eyes never ${one}`);
      assert.ok(paper.size > 10, 'its paper never changed shape');
      assert.ok(/\?hello/.test(page.url()) && await page.locator('.hello.in-street').count() === 0, 'nothing happens until it is touched');
      // one feeling, held
      await page.goto(`${origin}/?hello&emote=sad`);
      await page.waitForSelector('#hello-penny:not([hidden])');
      for (let i = 0; i < 6; i++) {
        await sleep(800);
        assert.equal(await face(), 'sad half frown');
      }
      // and by keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'hello-penny');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.hello.in-street');
      await page.waitForFunction(() => document.querySelector('#hello-said')?.textContent.includes('hides behind a mailbox'), null, { timeout: 10000 });
    }),

    check('the introduction: Penny walks, it does not slide or swell: it comes nearer a step at a time, still between steps, and nearer is always bigger and lower together, on the street', {}, async (page) => {
      await page.goto(`${origin}/?hello`);
      await page.locator('#hello-penny').click();
      await page.waitForFunction(() => document.querySelector('#hello-said')?.textContent.includes('comes out'), null, { timeout: 30000 });
      // where it stands, as the page draws it, sampled through the first stretches up the street (asked of the page: not timed from here)
      const seen = await page.evaluate(() => new Promise((done) => {
        const out = [];
        const started = performance.now();
        const take = () => {
          const at = document.querySelector('.h-penny').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/).slice(1).map(Number);
          out.push(at);
          if (performance.now() - started < 6000) requestAnimationFrame(take); else done(out);
        };
        requestAnimationFrame(take);
      }));
      const [, , first] = seen[0];
      const [, , lastS] = seen.at(-1);
      assert.ok(lastS > first * 1.3, `it came no nearer: from ${first} to ${lastS}`);
      // on the street: it stands where its size says (the horizon at 168, its eyes 15.4 of its units above the ground)
      for (const [, y, scale] of seen) assert.ok(Math.abs(y - (168 + 15.4 * scale)) < 0.1, `off the street: at ${y} for a size of ${scale}`);
      // still between steps: runs of frames where it does not move at all, and more than one of them
      let stills = 0;
      let run = 0;
      for (let i = 1; i < seen.length; i++) {
        const same = seen[i][0] === seen[i - 1][0] && seen[i][2] === seen[i - 1][2];
        run = same ? run + 1 : 0;
        if (run === 3) stills += 1;
      }
      assert.ok(stills >= 3, `it slid: only ${stills} moments of standing still in six seconds of coming nearer`);
    }),

    check('the introduction, the other ways up the street, with less motion asked for: each gets to the glass and through the portal', { reducedMotion: 'reduce' }, async (page) => {
      for (const [gait, walk] of [['zigzag', ''], ['edges', '&walk=rock'], ['tiptoe', '&walk=hop']]) {
        await page.goto(`${origin}/?hello&gait=${gait}${walk}`);
        await page.locator('#hello-penny').click();
        await page.waitForFunction(() => document.querySelector('#hello-said')?.textContent.includes('jumps in'), null, { timeout: 20000 });
        assert.equal(await page.locator('.hello').getAttribute('data-gait'), gait);
        assert.equal(await page.locator('#hello-portal').isDisabled(), false);
      }
      // (round from wherever the keys last were: Penny, pressed and gone)
      for (let n = 0; n < 4 && await page.evaluate(() => document.activeElement.id) !== 'hello-portal'; n++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'hello-portal', 'the portal can be reached by keyboard');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\?slow/); // (scene two: scene one is out of the story for now)
    }),

    check('back, pressed while the next screen is still on its way, goes back: the screen that is up is the one the address names', {}, async (page) => {
      await page.goto(`${origin}/?walk`);
      await page.waitForSelector('#walk-board .cell');
      // the way home is pressed, and back at once, before the home page has been fetched
      await page.evaluate(() => { document.querySelector('.penny-back').click(); history.back(); });
      await sleep(3000); // (the home page arrives, and the walk comes back over it)
      assert.ok(/\?walk/.test(page.url()));
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#screens .screen')].map((screen) => screen.className.match(/screen-\w+/)[0])), ['screen-walk']);
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

    check('the story started over, from the profile: asked first; everything the story and its walkthroughs kept is forgotten, and energy with it, and what was made stays; and play begins at the beginning again', { storage: { ...ACCOUNT, 'penny:walked:v1': true, 'penny:place:v1': 4, 'penny:dot:v1': true, 'penny:sound:v1': 3, 'penny:story:v1': 'walk', 'tags:found:v1': ['night'], 'radio:taught:v1': true, 'radio:story:v1': 'told', 'postmarks:howto-solo:v1': true, 'correspondence:energy:v1': { earned: 300, spent: 0, boards: [] }, 'correspondence:meadow:v1': 'off', 'correspondence:thanks:v1': true, 'jam:saved:v1': [{ name: 'Morning', code: 'x', at: 1 }], 'correspondence:theme:v1': 'dark' } }, async (page) => {
      const stored = (key) => page.evaluate((k) => localStorage.getItem(k), key);
      const STORY = ['penny:walked:v1', 'penny:place:v1', 'penny:dot:v1', 'penny:sound:v1', 'penny:story:v1', 'tags:found:v1', 'radio:taught:v1', 'radio:story:v1', 'postmarks:howto-solo:v1', 'correspondence:energy:v1', 'correspondence:meadow:v1', 'correspondence:thanks:v1'];
      const KEPT = ['jam:saved:v1', 'correspondence:theme:v1', 'correspondence:token:v1'];
      await page.goto(`${origin}/?home`);
      await page.waitForSelector('#play:not([hidden])');
      assert.equal(await page.locator('#play').getAttribute('href'), '/postmarks/');
      await page.waitForFunction(() => !document.querySelector('#splash'));
      await page.locator('#me-edit').click();
      await page.waitForSelector('dialog.profile[open] #story-again');
      // kept, if the answer is no
      await page.locator('#story-again').click();
      await page.waitForSelector('dialog.ask[open]');
      await page.locator('dialog.ask[open] button', { hasText: 'Keep it' }).click();
      await sleep(400);
      for (const key of STORY) assert.notEqual(await stored(key), null, `${key} was forgotten on a no`);
      // and started over on a yes
      await page.locator('#story-again').click();
      await page.waitForSelector('dialog.ask[open]');
      await Promise.all([page.waitForEvent('load'), page.locator('dialog.ask[open] button', { hasText: 'Start over' }).click()]); // (the app is opened afresh)
      await page.waitForSelector('#play:not([hidden])');
      for (const key of STORY) assert.equal(await stored(key), null, `${key} was not forgotten`);
      for (const key of KEPT) assert.notEqual(await stored(key), null, `${key} was lost`);
      assert.equal(await page.locator('#play').getAttribute('href'), '/?hello', 'play begins the story again');
      assert.equal(await page.locator('#meadow').isDisabled(), true, 'energy begins again: the meadow is to be earned again');
      // with nothing of the story kept, there is nothing to start over
      await page.waitForFunction(() => !document.querySelector('#splash'));
      await page.locator('#me-edit').click();
      await page.waitForSelector('dialog.profile[open]');
      assert.equal(await page.locator('#story-again').isVisible(), false);
    }),

    check('after the walk: a tap on Penny at rest plays the story from its beginning, and the asking is counted for the whole visit', { storage: { 'penny:walked:v1': true, 'penny:dot:v1': true, 'penny:sound:v1': 3 } }, async (page, h) => {
      await page.goto(origin);
      await h.until('pleading', 12000); // once, soon after arriving
      await h.until('calm', 15000);
      await sleep(600);
      await page.locator('.pal-penny .paper').click({ force: true });
      await page.waitForURL(/\?hello/, { timeout: 5000 });
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
      await keepsCopies(page); // (what this page copies, not whatever another window copied last)
      const stored = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      assert.equal(await page.locator('#jam-save').isDisabled(), true, 'nothing to save yet');
      assert.equal(await page.locator('#jam-play.lit').count(), 0, 'play is lit, with no beat arrived');
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
      // (from the beat itself, in the list: there is no other button for it)
      await page.evaluate(() => { delete Navigator.prototype.share; });
      assert.equal(await page.locator('#jam-share').count(), 0, 'a second way to share, at the top of the page');
      await page.locator('.jam-saved button[aria-label="Share Morning"]').click();
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('Link copied'));
      const link = await copiedBy(page);
      assert.match(link, /\/jam\/\?b=[A-Za-z0-9_-]{39}$/);
      // something else is made, not saved; then the link is opened
      await page.locator('.jam-board .pad').nth(40).click();
      const unsaved = (await stored('jam:v1')).notes[0].length;
      assert.equal(unsaved, 5);
      await page.goto(link);
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('shared with you'));
      // play is lit for the beat that has arrived, until it is played, and not again after
      assert.equal(await page.locator('#jam-play.lit').count(), 1, 'a beat has arrived, and play is not lit');
      await page.locator('#jam-play').click();
      await page.waitForSelector('#jam-play.playing:not(.lit)');
      await page.locator('#jam-play').click();
      assert.equal(await page.locator('#jam-play.lit').count(), 0, 'play is lit again once the beat has been played');
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

    check('the music maker: Penny never hides a button of a saved beat, wherever the page is scrolled to, and a tap on Penny over something to press goes to it', {}, async (page) => {
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      // three beats, saved: the list is under the board, and the last of them at the very foot of the page
      // (the first note sets the loop going, and Penny dancing, which is when it comes furthest up: there is room for it here)
      await page.locator('.jam-board .pad').nth(0).click();
      await page.waitForSelector('#jam-play.playing');
      await page.waitForFunction(() => document.querySelector('.pal').dataset.height !== 'gone');
      await page.locator('#jam-save').click();
      for (const pad of [9, 18]) {
        await page.locator('.jam-board .pad').nth(pad).click();
        await page.locator('#jam-save').click();
      }
      await page.waitForFunction(() => document.querySelectorAll('.jam-saved li').length === 3);
      // What of the list's buttons is in the window and is not what a finger there would find; and how Penny stands.
      const hidden = () => page.evaluate(() => [...document.querySelectorAll('.jam-saved button')].filter((button) => {
        const box = button.getBoundingClientRect();
        const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
        if (y < 0 || y > window.innerHeight) return false;
        const found = document.elementFromPoint(x, y);
        return found !== button && !button.contains(found);
      }).map((button) => button.getAttribute('aria-label')));
      const height = () => page.evaluate(() => document.querySelector('.pal').dataset.height);
      const foot = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      assert.ok(foot > 0, 'the page is no longer than the window: there is nothing to scroll under Penny');
      // all the way down, and then back up a little at a time: every button there is to see is there to press
      for (const to of [foot, foot - 30, foot - 60, foot - 90, foot - 120, foot / 2]) {
        await page.evaluate((y) => window.scrollTo(0, y), to);
        await sleep(700); // (Penny looks again, and moves)
        assert.deepEqual(await hidden(), [], `scrolled to ${Math.round(to)} of ${foot}, with Penny at "${await height()}"`);
      }
      // at the very foot the last beat lies along the edge Penny stands on: it has gone under
      await page.evaluate((y) => window.scrollTo(0, y), foot);
      await sleep(700);
      assert.equal(await height(), 'gone', 'Penny is standing on the last beat');
      // A tap that lands on Penny where something of the page's can be pressed goes to that: here, the tempo.
      const tempo = page.locator('#jam-tempo');
      const was = await tempo.innerText();
      await tempo.evaluate((button) => {
        const box = button.getBoundingClientRect();
        document.querySelector('.pal-penny .paper').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
      });
      assert.notEqual(await tempo.innerText(), was, 'a tap on Penny over the tempo did not reach it');
    }),

    check('the music maker: sounds recorded from the microphone go in a drawer, each a new one with a name, and one pressed there is what the instrument plays, in tune', {}, async (page) => {
      const { fakeMic } = require('./mic.cjs');
      await page.addInitScript(fakeMic, 'hum');
      // every recorded sound the engine starts: how fast it is played
      await page.addInitScript(() => {
        window.__played = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...rest) {
          if (this.buffer.length > 8000) window.__played.push(this.playbackRate.value); // (the drums' own bursts of noise are shorter)
          return start.apply(this, rest);
        };
      });
      const kept = () => page.evaluate(() => new Promise((done) => {
        const opening = indexedDB.open('jam');
        opening.onsuccess = () => {
          const all = opening.result.transaction('sounds').objectStore('sounds').getAll();
          all.onsuccess = () => { opening.result.close(); done(all.result.map((one) => ({ name: one.name, hz: one.hz, seconds: one.pcm.length / one.rate }))); };
        };
      }));
      const record = async () => {
        await page.locator('#jam-record').click();
        await page.waitForSelector('#jam-record.hearing');
        await sleep(800);
        await page.locator('#jam-record').click(); // enough
        await page.waitForSelector('#jam-record:not(.hearing)');
      };
      const names = () => page.locator('.jam-sounds .rename').allInnerTexts();
      const pressed = () => page.locator('.jam-sounds .tile').evaluateAll((all) => all.map((one) => one.getAttribute('aria-pressed') === 'true'));
      const layers = () => page.locator('.layer:not([hidden]):not(.more) .name').allInnerTexts();
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      const mic = page.locator('#jam-mic');
      // a note laid down, so the loop is playing
      await page.locator('.jam-board .pad').nth(48).click();
      await page.waitForSelector('#jam-play.playing');
      // the drawer: at first the instrument itself, which is the one in its place, and the other three
      await mic.click();
      await page.waitForSelector('dialog#jam-drawer[open]');
      assert.deepEqual(await page.locator('.jam-sounds .own').allInnerTexts(), ['Bells', 'Keys', 'Bass', 'Drums']);
      assert.deepEqual(await pressed(), [true, false, false, false]);
      const close = page.locator('#jam-drawer-close');
      assert.equal(await close.getAttribute('aria-label'), 'Close', 'nothing chosen yet: an X');
      // another instrument in the bells' place: the button wears its mark and its name, the rows are its rows, and the
      // drawer's own button is lit; and then the bells themselves again
      await page.locator('.jam-sounds .tile').nth(3).click();
      assert.deepEqual(await pressed(), [false, false, false, true]);
      assert.deepEqual(await layers(), ['Drums', 'Keys', 'Bass', 'Drums']);
      assert.equal(await close.getAttribute('aria-label'), 'Done', 'another chosen: a tick');
      assert.equal(await page.locator('dialog#jam-drawer.chosen').count(), 1);
      assert.equal(await page.locator('.layer').first().getAttribute('data-own'), 'false', 'an instrument is not a sound of your own');
      assert.equal(await page.locator('.layer').first().locator('svg').innerHTML(), await page.locator('.layer').nth(3).locator('svg').innerHTML(), 'the drums\' mark');
      assert.match(await page.locator('.jam-board .pad').nth(48).getAttribute('aria-label'), /^Kick/, 'the rows are the drums\' rows');
      assert.equal(await mic.getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('jam:slots:v1')).slice(0, 4)), ['kind:3', null, null, null]);
      await page.locator('.jam-sounds .tile').first().click();
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
      assert.equal(await mic.getAttribute('aria-pressed'), 'false');
      assert.equal(await close.getAttribute('aria-label'), 'Close', 'the one it opened with again: an X again');
      // recording: the loop stops to listen and goes on afterwards, and the new sound is in the bells' place
      await page.locator('#jam-record').click();
      await page.waitForSelector('#jam-record.hearing');
      assert.equal(await page.locator('#jam-record').innerText(), 'Stop');
      assert.equal(await page.locator('#jam-play.playing').count(), 0, 'the loop went on over the microphone');
      await sleep(800);
      await page.locator('#jam-record').click();
      await page.waitForSelector('.jam-sounds .rename');
      await page.waitForSelector('#jam-play.playing');
      assert.deepEqual(await names(), ['Sound 1']);
      assert.deepEqual(await pressed(), [false, false, false, false, true]);
      assert.deepEqual(await layers(), ['Sound 1', 'Keys', 'Bass', 'Drums']);
      const [sound] = await kept();
      assert.ok(Math.abs(12 * Math.log2(sound.hz / 220)) < 0.5, `a hum at 220 hertz, heard as ${sound.hz}`);
      assert.ok(sound.seconds > 0.4 && sound.seconds <= 1.5, `${sound.seconds} seconds kept`);
      // what the loop plays there is now that sound: the bottom row, the chord's own note (C, A, F or G), in some octave
      await page.waitForFunction(() => window.__played.length > 0, null, { timeout: 8000 });
      const rate = await page.evaluate(() => window.__played[0]);
      const roots = [0, -3, -7, -5].map((semitones) => 523.25 * 2 ** (semitones / 12));
      const off = Math.min(...roots.map((root) => { const octaves = Math.log2((sound.hz * rate) / root); return Math.abs(octaves - Math.round(octaves)) * 12; }));
      assert.ok(off < 0.01, `out of tune by ${off} of a semitone (played at ${rate})`);
      // recording again makes another, and takes the place of none
      await record();
      await page.waitForFunction(() => document.querySelectorAll('.jam-sounds .rename').length === 2);
      assert.deepEqual(await names(), ['Sound 2', 'Sound 1'], 'the newest first');
      assert.deepEqual(await pressed(), [false, false, false, false, true, false]);
      // named: the name is on the instrument's button too
      await page.locator('.jam-sounds .rename').first().click();
      await page.locator('.jam-sounds input').fill('Hum');
      await page.locator('.jam-sounds input').press('Enter');
      assert.deepEqual(await layers(), ['Hum', 'Keys', 'Bass', 'Drums']);
      assert.match(await page.locator('.layer').first().innerText(), /your sound/);
      assert.equal(await page.locator('.jam-sounds input').count(), 0, 'the name is underlined again once it is let go of');
      assert.deepEqual(await names(), ['Hum', 'Sound 1']);
      assert.deepEqual(await pressed(), [false, false, false, false, true, false], 'renaming it chose nothing');
      // let go of with Escape: the name as it was
      await page.locator('.jam-sounds .rename').first().click();
      await page.locator('.jam-sounds input').fill('Not this');
      await page.locator('.jam-sounds input').press('Escape');
      assert.deepEqual(await names(), ['Hum', 'Sound 1']);
      assert.equal(await page.locator('dialog#jam-drawer[open]').count(), 1, 'Escape let go of the name, not the drawer');
      // swapped, by pressing anywhere in a row: the other sound (between its name and its bin), and then the bells themselves (on their name)
      const row = page.locator('.jam-sounds li').nth(5);
      const { width, height } = await row.boundingBox();
      await row.click({ position: { x: width - 80, y: height / 2 } });
      assert.deepEqual(await pressed(), [false, false, false, false, false, true]);
      assert.deepEqual(await layers(), ['Sound 1', 'Keys', 'Bass', 'Drums']);
      await page.locator('.jam-sounds .own').first().click();
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
      assert.equal(await mic.getAttribute('aria-pressed'), 'false');
      // the same drawer for another instrument: its own sound, and the same two
      await page.locator('#jam-drawer-close').click();
      await page.locator('.layer').nth(3).click();
      await mic.click();
      assert.deepEqual(await page.locator('.jam-sounds .own').allInnerTexts(), ['Drums', 'Bells', 'Keys', 'Bass'], 'its own first');
      assert.deepEqual(await names(), ['Hum', 'Sound 1']);
      await page.locator('.jam-sounds .tile').nth(4).click();
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Hum']);
      await page.locator('#jam-drawer-close').click();
      assert.equal(await mic.getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('.jam-board .pad').nth(48).getAttribute('aria-label'), /^Note 1 of 7/, 'the drums\' rows are heights of the sound now');
      // it is all there the next time
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('.layer .name')[3]?.textContent === 'Hum');
      // deleted: gone from the drawer, from where it was kept, and from the instrument that played it
      await page.locator('.layer').nth(3).click();
      await mic.click();
      await page.locator('.jam-sounds button[aria-label="Delete Hum"]').click();
      await page.locator('dialog.ask button.yes').click();
      await page.waitForFunction(() => document.querySelectorAll('.jam-sounds .rename').length === 1);
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
      assert.deepEqual((await kept()).map((one) => one.name), ['Sound 1']);
    }),

    check('the music maker: recorded sounds follow the profile: sent to the server whole once and by name after, fetched on a device that has not got them, and gone where they were deleted', {}, async (page) => {
      const { fakeMic } = require('./mic.cjs');
      await page.addInitScript(fakeMic, 'hum');
      // the server, as supabase/migrations/20261126000000_sounds.sql has it: what it keeps, and what it was asked
      const there = new Map();
      const asked = [];
      const view = () => [...there.values()].map((one) => ({ id: one.id, name: one.name, at: one.at }));
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co/, (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const call = request.url().match(/\/rpc\/(\w+)/)?.[1];
        if (!/^sounds_/.test(call ?? '')) return route.abort();
        const args = JSON.parse(request.postData());
        asked.push({ call, ...args });
        if (call === 'sounds_put') there.set(args.p_id, args.p_pcm ? { id: args.p_id, name: args.p_name, rate: args.p_rate, hz: args.p_hz, pcm: args.p_pcm, at: 1795000000000 + there.size } : { ...there.get(args.p_id), name: args.p_name });
        if (call === 'sounds_drop') there.delete(args.p_id);
        return route.fulfill({ json: call === 'sounds_fetch' ? there.get(args.p_id) ?? null : view(), headers: cors });
      });
      const until = (what, test) => (async () => { for (let i = 0; i < 100 && !test(); i++) await sleep(50); assert.ok(test(), what); })();
      const names = () => page.locator('.jam-sounds .rename').allInnerTexts();
      const layers = () => page.locator('.layer:not([hidden]):not(.more) .name').allInnerTexts();
      const open = async () => { await page.locator('#jam-mic').click(); await page.waitForSelector('dialog#jam-drawer[open]'); };
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      // recorded: the whole of it goes to the server
      await open();
      await page.locator('#jam-record').click();
      await page.waitForSelector('#jam-record.hearing');
      await sleep(700);
      await page.locator('#jam-record').click();
      await page.waitForSelector('.jam-sounds .rename');
      await until('the sound was not sent', () => there.size === 1);
      const [sent] = there.values();
      assert.match(sent.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(sent.name, 'Sound 1');
      assert.equal(sent.rate, 44100);
      assert.ok(Math.abs(12 * Math.log2(sent.hz / 220)) < 0.5, `a hum at 220 hertz, sent as ${sent.hz}`);
      assert.ok(sent.pcm.length > 40000 && sent.pcm.length < 180000, `${sent.pcm.length} letters of it`);
      // named: only the name goes
      await page.locator('.jam-sounds .rename').click();
      await page.locator('.jam-sounds input').fill('Hum');
      await page.locator('.jam-sounds input').press('Enter');
      await until('the name was not sent', () => sent.id && there.get(sent.id).name === 'Hum');
      const renaming = asked.filter((one) => one.call === 'sounds_put').pop();
      assert.equal(renaming.p_pcm, undefined, 'the whole sound was sent again for a name');
      assert.equal(asked.filter((one) => one.call === 'sounds_put' && one.p_pcm).length, 1, 'sent whole more than once');
      // another device of the profile (this one, with its own copy gone): the sound is fetched, and plays where it did
      await page.evaluate(() => new Promise((done) => { indexedDB.deleteDatabase('jam').onsuccess = done; }));
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.layer .name')?.textContent === 'Hum', null, { timeout: 8000 });
      await open();
      assert.deepEqual(await names(), ['Hum']);
      await page.locator('#jam-drawer-close').click();
      // a second, made on another device, arrives; and one deleted on another device goes
      there.set('7d1f1c1e-0000-4000-8000-000000000002', { ...there.get(sent.id), id: '7d1f1c1e-0000-4000-8000-000000000002', name: 'Elsewhere', at: 1795000009000 });
      await page.reload();
      await page.waitForSelector('.jam-board .pad');
      await open();
      await page.waitForFunction(() => document.querySelectorAll('.jam-sounds .rename').length === 2, null, { timeout: 8000 });
      assert.deepEqual(await names(), ['Elsewhere', 'Hum']);
      await page.locator('#jam-drawer-close').click();
      there.delete(sent.id);
      await page.reload();
      await page.waitForSelector('.jam-board .pad');
      await page.waitForFunction(() => document.querySelector('.layer .name')?.textContent === 'Bells', null, { timeout: 8000 });
      await open();
      assert.deepEqual(await names(), ['Elsewhere']);
      // deleted here: the server is told
      await page.locator('.jam-sounds button[aria-label="Delete Elsewhere"]').click();
      await page.locator('dialog.ask button.yes').click();
      await until('the server was not told of the deleting', () => there.size === 0);
      assert.deepEqual(await names(), []);
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
    }),

    check('the music maker: the deck holds up to eight, and a shared beat brings the deck\'s sounds to whoever opens it', { permissions: ['clipboard-read', 'clipboard-write'] }, async (page) => {
      const { fakeMic } = require('./mic.cjs');
      await keepsCopies(page);
      await page.addInitScript(fakeMic, 'hum');
      // the server, as supabase/migrations has it: the profile's sounds, and what has been shared
      const there = new Map();
      const shares = new Map();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co/, (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const call = request.url().match(/\/rpc\/(\w+)/)?.[1];
        const args = JSON.parse(request.postData() ?? '{}');
        const view = () => [...there.values()].map((one) => ({ id: one.id, name: one.name, at: one.at }));
        let answer;
        if (call === 'sounds_get') answer = view();
        else if (call === 'sounds_put') { there.set(args.p_id, args.p_pcm ? { id: args.p_id, name: args.p_name, rate: args.p_rate, hz: args.p_hz, pcm: args.p_pcm, at: 1795000000000 + there.size } : { ...there.get(args.p_id), name: args.p_name }); answer = view(); }
        else if (call === 'sounds_drop') { there.delete(args.p_id); answer = view(); }
        else if (call === 'sounds_fetch') answer = there.get(args.p_id) ?? null;
        else if (call === 'share_put') {
          const id = String(shares.size + 1).padStart(20, 'a');
          shares.set(id, args.p_slots.map((sound, slot) => (there.has(sound) ? { slot, ...there.get(sound) } : null)).filter(Boolean));
          answer = id;
        } else if (call === 'share_get') answer = shares.get(args.p_id) ?? [];
        else return route.abort();
        return route.fulfill({ json: answer, headers: cors });
      });
      const layers = () => page.locator('.layer:not([hidden]):not(.more) .name').allInnerTexts();
      const record = async () => {
        const before = await page.locator('.jam-sounds .rename').count();
        await page.locator('#jam-record').click();
        await page.waitForSelector('#jam-record.hearing');
        await sleep(600);
        await page.locator('#jam-record').click();
        await page.waitForFunction((n) => document.querySelectorAll('.jam-sounds .rename').length === n + 1, before);
      };
      const more = page.locator('.layer.more');
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
      // a place added and nothing put in it: it is not kept
      await more.click();
      await page.waitForSelector('dialog#jam-drawer[open]');
      assert.deepEqual(await page.locator('.jam-sounds .own').allInnerTexts(), ['None', 'Bells', 'Keys', 'Bass', 'Drums']);
      await page.locator('#jam-drawer-close').click();
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums']);
      // a sound recorded into a new place: a fifth button, with a part of its own
      await more.click();
      await record();
      await page.locator('#jam-drawer-close').click();
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Bass', 'Drums', 'Sound 1']);
      assert.equal(await page.locator('.layer[aria-checked="true"] .name').innerText(), 'Sound 1');
      await page.locator('.jam-board .pad').nth(50).click();
      await page.locator('.layer').first().click();
      await page.locator('.jam-board .pad').nth(48).click();
      assert.equal(await page.locator('.jam-board .pad').nth(50).locator('i:not([hidden])').count(), 1, 'the other part\'s note shows as a light');
      // up to eight, and then there is nowhere to add
      for (let n = 6; n <= 8; n++) {
        await more.click();
        await page.locator('.jam-sounds .tile').nth(5).click(); // the same sound again will do
        await page.locator('#jam-drawer-close').click();
        assert.equal((await layers()).length, n);
      }
      assert.equal(await more.isVisible(), false, 'a ninth place');
      // one taken off: its place goes, and there is room again
      await page.locator('.layer:not([hidden]):not(.more)').nth(7).click();
      await page.locator('#jam-mic').click();
      await page.locator('.jam-sounds .tile').first().click();
      await page.waitForSelector('dialog#jam-drawer', { state: 'hidden' });
      assert.equal((await layers()).length, 7);
      assert.equal(await more.isVisible(), true);
      // one of the instruments in another's place: the keys, where the bass is
      await page.locator('.layer').nth(2).click();
      await page.locator('#jam-mic').click();
      await page.locator('.jam-sounds .tile').nth(2).click();
      await page.locator('#jam-drawer-close').click();
      assert.deepEqual((await layers()).slice(0, 4), ['Bells', 'Keys', 'Keys', 'Drums']);
      // saved, and shared: the link has the beat in it, the long way, and says where its sounds are, and which instrument is in another's place
      await page.locator('#jam-save').click();
      await page.locator('.jam-saved button[aria-label^="Share"]').first().click();
      await page.waitForFunction(() => document.querySelector('#jam-note')?.textContent.includes('Link copied'));
      const link = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(link, /\/jam\/\?b=[A-Za-z0-9_-]{76}&s=a{19}1&o=--1-----$/);
      assert.deepEqual(shares.get('aaaaaaaaaaaaaaaaaaa1').map((one) => one.slot), [4, 5, 6]);
      // somebody else opens it (this browser, with nothing of the sharer's on it): the beat, and its sounds on the deck and in the drawer
      there.clear();
      await page.evaluate(() => new Promise((done) => { localStorage.clear(); indexedDB.deleteDatabase('jam').onsuccess = done; }));
      await page.goto(link);
      await page.waitForFunction(() => document.querySelectorAll('.layer:not([hidden]):not(.more)').length === 7, null, { timeout: 8000 });
      assert.deepEqual(await layers(), ['Bells', 'Keys', 'Keys', 'Drums', 'Sound 1', 'Sound 1', 'Sound 1'], 'the deck as it was shared');
      assert.equal(new URL(page.url()).search, '', 'the address goes back to plain');
      await page.locator('.layer').nth(4).click();
      assert.equal(await page.locator('.jam-board .pad.on').count(), 1, 'the part written for the sound');
      await page.locator('#jam-mic').click();
      assert.deepEqual(await page.locator('.jam-sounds .rename').allInnerTexts(), ['Sound 1'], 'one sound, however many places it was in');
      // and it is theirs now: kept in their own profile
      for (let i = 0; i < 100 && there.size === 0; i++) await sleep(50);
      assert.equal(there.size, 1, 'the sound that came with the beat was not kept for them');
    }),

    check('the music maker: a microphone that is refused, or hears nothing, says so under the button, moves nothing above it and makes no sound', {}, async (page) => {
      const { fakeMic } = require('./mic.cjs');
      await page.addInitScript(fakeMic, 'refused');
      await page.goto(`${origin}/jam/`);
      await page.waitForSelector('.jam-board .pad');
      await page.locator('#jam-mic').click();
      await page.waitForSelector('dialog#jam-drawer[open]');
      await sleep(500); // (the drawer has come up)
      const [record, error] = [page.locator('#jam-record'), page.locator('#jam-mic-error')];
      assert.equal(await error.isVisible(), false, 'nothing is wrong yet');
      const above = await record.boundingBox();
      await record.click();
      await page.waitForFunction(() => document.querySelector('#jam-mic-error').textContent === 'The microphone is not allowed.');
      assert.equal(await error.getAttribute('role'), 'alert');
      // (where it is once its shake is over: measured in the middle of that, as it was on a busy machine, it is a hair to one side)
      await record.evaluate((button) => Promise.all(button.getAnimations().map((shake) => shake.finished)));
      assert.deepEqual(await record.boundingBox(), above, 'what is above the error moved');
      // one that hears nothing
      await page.evaluate(`(${fakeMic})('silent')`);
      await record.click();
      await page.waitForSelector('#jam-record.hearing');
      assert.equal(await error.isVisible(), false, 'trying again takes the old error away');
      await record.click();
      await page.waitForFunction(() => document.querySelector('#jam-mic-error').textContent === 'Nothing was heard.');
      assert.equal(await page.locator('.jam-sounds .rename').count(), 0, 'nothing recorded: only the instruments');
      assert.equal(await page.locator('.layer[data-own="true"]').count(), 0);
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
      assert.equal(await page.locator('.radio .plate').textContent(), 'Liv Radio');
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
      assert.match(label.text, /^Liv Radio Steel, enamel Two stations, one listener Anonymous loan$/);
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
      // Two taps, 90 ms apart, as a person makes them: and what the radio made of them, asked of the page and not of
      // the clock. Each press and each lift is a message to the browser, and on a busy machine they arrive late: the
      // second tap has come 398 and 407 ms after the first, where the radio counts two taps as one for 380, and it
      // then rightly took them for two taps and kept nothing and refused nothing. And what it does answer does not
      // stand to be read: its "not yet" is on the sign for half a second (the radio tunes to the station not heard
      // yet, and the order to listen to that one comes 500 ms after), which a check that looks 250 ms later, on a
      // machine that is late, has found already gone. So the page keeps what it was given and every order hung
      // since, with the words for a screen reader as they were then. `answered` says whether the radio took the two
      // taps as one. Two that were quick and were not taken fail the check; two the machine stretched are made again.
      const doubleTap = async (answered) => {
        for (let tries = 1; ; tries++) {
          await page.evaluate(() => {
            if (!window.__hand) {
              for (const type of ['pointerdown', 'pointerup']) window.addEventListener(type, () => window.__hand.push({ type, at: performance.now() }), true); // (the radio times a tap as it is handled)
              new MutationObserver(() => window.__hand.push({ type: 'order', order: document.querySelector('#dash-sign [data-order]')?.dataset.order ?? '', note: document.querySelector('#taste-note').textContent, at: performance.now() }))
                .observe(document.querySelector('#dash-sign'), { childList: true });
              // ...and when the sign was hung and when it was taken down, to the moment: an observer is told only once
              // the radio has finished with the tap, and that has been 5 to 141 ms after the sign went up
              const sign = document.querySelector('#dash-sign');
              for (const name of ['append', 'replaceChildren']) {
                sign[name] = function (...nodes) {
                  Element.prototype[name].apply(this, nodes);
                  window.__hand.push({ type: 'hung', sign: this.querySelector('[data-order]')?.dataset.order ?? '', at: performance.now() });
                };
              }
            }
            window.__hand = [];
          });
          await page.mouse.click(x, y);
          await sleep(90);
          await page.mouse.click(x, y);
          // (the radio answers a tap as it lands, and the order it hangs is on record in the same turn)
          const seen = await page.evaluate(() => ({ hand: window.__hand, kept: JSON.parse(localStorage.getItem('jam:taste:v1')).trials.length }));
          const downs = seen.hand.filter((one) => one.type === 'pointerdown');
          const ups = seen.hand.filter((one) => one.type === 'pointerup');
          // what was hung once the second tap had landed: the first of them is the radio's answer to it
          seen.orders = ups.length === 2 ? seen.hand.slice(seen.hand.indexOf(ups[1]) + 1).filter((one) => one.type === 'order') : [];
          if (answered(seen)) return seen;
          const quick = downs.length === 2 && ups.length === 2 && ups[1].at - ups[0].at < 200 && ups.every((up, i) => up.at - downs[i].at < 200);
          assert.ok(!quick, `two quick taps on the display were not taken as a double tap (${JSON.stringify(seen.hand.filter((one) => one.type.startsWith('pointer')).map((one) => Math.round(one.at - seen.hand[0].at)))} ms)`);
          assert.ok(tries < 8, `the machine is too slow to make a double tap on the display: ${tries} tries`);
          await sleep(1000); // at least: the slow taps are forgotten before the next two
        }
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
      const refused = await doubleTap((seen) => seen.orders.some((one) => one.order === 'not-yet') || seen.kept > 0); // (refused; or, wrongly, kept)
      await sleep(250);
      assert.equal((await kept()).trials.length, 0, 'a station was kept before both had been heard');
      assert.equal(refused.orders[0]?.order, 'not-yet');
      assert.match(refused.orders[0].note, /Tune to|Stay on/, 'a screen reader is still told what to do');
      // and the refusal stands its time out: 900 ms, whether or not the radio turned to the station not heard yet
      // (that turn used to hang the next order 500 ms on, over the refusal). A late machine can only make it longer:
      // so long as it is timed from the sign going up to its coming down. Timed from when an observer was told of
      // each, it has come out at 819 to 871 ms on a busy machine (where that was measured, the observer heard of "not
      // yet" 71 and 141 ms after the tap); from the tap that was refused to the next order it was never under 903.
      await page.waitForFunction(() => { const from = window.__hand.findIndex((one) => one.order === 'not-yet'); return window.__hand.slice(from + 1).some((one) => one.type === 'order' && one.order !== 'not-yet'); }, null, { timeout: 8000 });
      const stood = await page.evaluate(() => { const hung = window.__hand.filter((one) => one.type === 'hung'); const from = hung.findIndex((one) => one.sign === 'not-yet'); return hung[from + 1].at - hung[from].at; });
      assert.ok(stood >= 880, `"Not yet" was taken down after ${Math.round(stood)} ms`);
      assert.equal(await page.locator('#lab-picks').isVisible(), false, 'the experiment is not on the face of the radio');
      assert.match(await page.locator('#radio-freq').textContent(), /^\d{2,3}\.\d$/, 'a station has a place on the dial');
      // listened to both: the order is to keep one, and it does not say which
      // (Which station has been heard is asked of the radio. The refusal tunes to a station not heard yet; when the
      // double tap had to be made again, the one that was up had been heard through by then, and the radio is now on
      // the other: the order is to listen, there is no "the other one" to wait for, and a swipe would leave it.)
      const onlyThisHeard = () => page.evaluate(() => Boolean(document.querySelector('.taste-card .face.tuned.heard')) && document.querySelectorAll('.taste-card .face.heard').length < 2);
      const pickOne = async () => {
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
        if (await onlyThisHeard()) await swipe();
        await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length === 2, null, { timeout: 8000 });
        const up = (await turned()) ? 'back' : 'front';
        const had = (await kept()).trials.length;
        await doubleTap((seen) => seen.kept > had);
        await sleep(250);
        return up;
      };
      await page.waitForFunction(() => document.querySelectorAll('.taste-card .face.heard').length >= 1, null, { timeout: 8000 });
      if (await onlyThisHeard()) await says('other');
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
      // the page's clock held still from the start, so that the tag is pressed before the one who shows how has
      // come (it comes 0.9 s after the radio is on) however busy the machine is, and let go once it has been
      await page.clock.install();
      await page.clock.pauseAt(await page.evaluate(() => Date.now()).catch(() => Date.now()) + 1000);
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.taste-card');
      const early = await page.evaluate(() => {
        const away = document.querySelector('#radio-dash').hidden;
        document.querySelector('#taste-behind-open').click();
        return away;
      });
      await page.clock.resume();
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
      await keepsCopies(page); // (what this page copies, not whatever another window copied last)
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
      const copied = JSON.parse(await copiedBy(page));
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
      // ...but not the stake, which carries on; and that it was started over is written down
      const was = standing(radios.underWay.trials);
      assert.equal(fresh.carried, was.stake);
      assert.deepEqual(fresh.restarts.map(({ after, carried, peak }) => ({ after, carried, peak })), [{ after: 12, carried: was.stake, peak: was.peak }]);
      assert.equal(await page.locator('#lab-carried-row').isVisible(), true, 'the reading says what was carried over');
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

    check('the radio’s meter: unlit while the model warms up; nothing on it is written to from a pair coming up to a station kept, nor with the model’s call on that pair turned round; then it stands at the stake, and each pick is written down, metered or not, and copied out', { storage: { ...TOLD, 'jam:taste:v1': early }, permissions: ['clipboard-read', 'clipboard-write'] }, async (page, h) => {
      await keepsCopies(page);
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      // warming up: unlit, a pip lit for each pick so far, the needle at ×1; and not a word on it
      let m = await meterOf(page);
      assert.equal(m.role, 'meter');
      assert.deepEqual([m.min, m.max], ['0', String(model.NEEDED)]);
      assert.deepEqual([m.warming, m.now, m.pips, m.risen, m.lit], [true, '1', model.WARMUP - 2, false, false]);
      assert.match(m.text, new RegExp(`^Warming up: ${model.WARMUP - 2} of ${model.WARMUP}`));
      assert.deepEqual(await h.words('#radio-meter'), [], 'words or numbers on the meter');
      assert.deepEqual(await h.words('.radio .top-row'), ['Liv Radio'], 'words on the top of the set');
      assert.equal(m.swings, '1.6s', 'the needle swings to where it stands, slowly');
      // a pick while it warms up lights one more pip; the needle stays where it is; and it was made with no stake shown
      await keepOne(page);
      const warm = await meterOf(page);
      assert.deepEqual([warm.warming, warm.pips, warm.swing, warm.now], [true, model.WARMUP - 1, m.swing, '1']);
      assert.equal((await keptOn(page)).trials.at(-1).metered, false, 'metered while warming up');
      // the last pick of the warm-up: the meter lights, at ×1, and the pair that comes up is the first the model calls
      await keepOne(page);
      m = await meterOf(page);
      assert.equal(m.warming, false, 'it has warmed up');
      assert.equal(m.now, valueOf((await standingOn(page)).stake));
      assert.match(m.text, /^Evidence ×1\.0 of ×20$/);
      let kept = await keptOn(page);
      assert.equal(typeof kept.current.p, 'number', 'the model is on record about the pair that is up');
      assert.equal(kept.current.pPhantoms.length, model.PHANTOMS, 'with eight phantoms');
      // From here to a station kept, nothing on the meter is written to: not a station refused, not tuning, not
      // listening, not the reading, not the presets. (Watched for any change at all, and compared whole.)
      await sleep(1900); // (whatever the last pick set swinging has come to rest)
      const before = await meterOf(page);
      await watchMeter(page);
      const same = async (what) => {
        assert.deepEqual(await meterChanges(page), [], `the meter was written to on ${what}`);
        assert.deepEqual(await meterOf(page), before, `the meter changed on ${what}`);
      };
      await page.locator('#taste-pick').click(); // too soon: neither has been heard
      await sleep(400);
      assert.equal((await keptOn(page)).trials.length, model.WARMUP, 'a station kept before both had been heard');
      await same('a station refused');
      await page.locator('#taste-flip').click();
      await sleep(300);
      await same('tuning');
      await listenToBoth(page);
      await page.locator('#taste-flip').click();
      await sleep(600);
      await same('listening');
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      await page.locator('#taste-behind-close').click();
      await same('the reading');
      await page.locator('#taste-presets-open').click();
      await page.waitForSelector('#taste-presets[open]');
      await page.locator('#taste-presets-close').click();
      await sleep(300);
      await same('the presets');
      // Nor does it hang on what the model says of the pair that is up: with its call turned round (as it is kept
      // on the device), and the radio loaded again, the meter is as it was; and nothing is written to it after.
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('jam:taste:v1'));
        for (const key of ['p', 'q', 'pPhantom']) data.current[key] = 1 - data.current[key];
        data.current.pPhantoms = data.current.pPhantoms.map((p) => 1 - p);
        localStorage.setItem('jam:taste:v1', JSON.stringify(data));
      });
      await page.reload();
      await page.waitForSelector('.radio .dot');
      assert.deepEqual(await meterOf(page), before, 'the meter changed with the model’s call on the pair that is up turned round');
      await watchMeter(page);
      await listenToBoth(page);
      await sleep(300);
      assert.deepEqual(await meterChanges(page), [], 'the meter was written to after the reload');
      // the first pick the model called (on that call, as it was kept): the meter stands at the stake, and is written to
      await keepOne(page);
      assert.ok((await meterChanges(page)).length > 0, 'the meter was not drawn after the pick');
      const now = await standingOn(page);
      assert.equal(now.bets, 1);
      m = await meterOf(page);
      assert.equal(m.now, valueOf(now.stake), 'the meter is not at the stake');
      assert.deepEqual([m.warming, m.risen, m.lit, Number(m.sunk) <= 1], [false, now.peak > 1, false, true]);
      // and the pick is written down with the meter in sight, what was heard of each side, how long it took, and the version
      kept = await keptOn(page);
      const last = kept.trials.at(-1);
      assert.equal(last.metered, true);
      assert.ok(last.heard.front >= 1500 && last.heard.back >= 1500, `heard: ${JSON.stringify(last.heard)}`);
      assert.ok(Number.isInteger(last.decideMs) && last.decideMs >= Math.max(last.heard.front, last.heard.back), `decided in ${last.decideMs}ms, having heard ${JSON.stringify(last.heard)}`);
      assert.deepEqual([last.ms, last.heardFront, last.heardBack], [last.decideMs, last.heard.front, last.heard.back], 'the same numbers under the names they were first kept by');
      assert.equal(last.version, VERSION);
      assert.equal(kept.trials[0].metered, undefined, 'the picks made before (here, by the simulated taster) have none of it, and still load');
      // a pick made with the meter out of sight (the set moved off the screen once both have been heard) is written down so
      await listenToBoth(page);
      await page.addStyleTag({ content: '.radio-ground { translate: 0 -120vh; }' });
      await page.locator('#taste-pick').dispatchEvent('click');
      await page.waitForFunction((n) => JSON.parse(localStorage.getItem('jam:taste:v1')).trials.length === n, model.WARMUP + 2, { timeout: 5000 });
      assert.equal((await keptOn(page)).trials.at(-1).metered, false, 'metered with the meter off the screen');
      await page.evaluate(() => document.querySelectorAll('style').forEach((one) => { if (one.textContent.includes('-120vh')) one.remove(); }));
      // all of which "Copy the data" gives out, with the version, the stake carried and the times it was started
      // over; and not the pair that is up, nor what the model says of it
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      await page.locator('#taste-copy').click();
      await page.waitForFunction(() => document.querySelector('#taste-copy').textContent === 'Copied', null, { timeout: 3000 });
      const copied = JSON.parse(await copiedBy(page));
      kept = await keptOn(page);
      assert.deepEqual(copied.trials, kept.trials, 'every pick, as it is kept');
      assert.deepEqual([copied.version, copied.carried, copied.restarts, copied.standing.picks], [VERSION, 1, [], model.WARMUP + 2]);
      const out = copied.trials.at(-2);
      assert.deepEqual({ metered: out.metered, heard: out.heard, decideMs: out.decideMs, version: out.version }, { metered: true, heard: last.heard, decideMs: last.decideMs, version: VERSION });
      assert.equal('current' in copied, false, 'the pair that is up was copied out');
      // and each look at the model is on the record: the reading opened twice before, and now once more, and copied
      assert.deepEqual(copied.looked.map(({ what, after }) => ({ what, after })), [{ what: 'reading', after: model.WARMUP }, { what: 'reading', after: model.WARMUP + 2 }, { what: 'copy', after: model.WARMUP + 2 }]);
      assert.ok(copied.looked.every((one) => one.at > 1795000000000 && one.version === VERSION));
      assert.equal(JSON.stringify(copied).includes(JSON.stringify(kept.current.pPhantoms)), false, 'what the model says of the pair that is up was copied out');
    }),

    check('the radio’s meter: the station kept that takes it to ×20 lights the lamp, and it stays lit; announced once; Penny takes no notice; with reduced motion nothing swings', { storage: { ...TOLD, 'jam:taste:v1': brink }, reducedMotion: 'reduce' }, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      let m = await meterOf(page);
      assert.equal(m.lit, false);
      assert.equal(m.now, valueOf(1.3 ** 11), `the stake is ${m.now}, by the rule of picks made with one phantom`);
      assert.equal(m.swings, '0s', 'with reduced motion the needle is put where it stands, not swung there');
      assert.equal(await page.locator('#radio-story').textContent(), '');
      // both heard, and the front kept: the real challenger's call for it beat the phantom's (and that pair, called
      // with one phantom, is bet on by that rule)
      await listenToBoth(page);
      await h.watch(); // (Penny's moods, from here on)
      // ...and the lamp's: lit, and marked as lighting for the 3.4 s its glow takes. That mark was asked after too,
      // four questions on from the pick: 0.07 to 2.5 s after it on a busy machine, and once, by then, it had gone.
      await page.evaluate(() => {
        window.__lamp = [];
        const meter = document.querySelector('#radio-meter');
        new MutationObserver(() => window.__lamp.push([meter.classList.contains('lit'), meter.classList.contains('lighting')])).observe(meter, { attributes: true, attributeFilter: ['class'] });
      });
      await keepOne(page, 'front');
      const crossed = (await keptOn(page)).trials.at(-1);
      assert.equal(crossed.pick, 'front');
      // Penny is as it is for any station kept (glad; thrilled for a preset), and gives the lamp no notice. It is
      // glad for a second and a half and then calm again, and on a busy machine it has been 1.5 s from the pick to
      // word of it here, and Penny found calm: so its moods are written down in the page, and those are read.
      const moods = await h.seen();
      assert.deepEqual(moods, [`mood ${crossed.retired ? 'thrilled' : 'glad'}`, 'mood calm'].slice(0, moods.length || 1), 'Penny made something of ×20');
      const now = await standingOn(page);
      assert.ok(now.stake >= model.NEEDED && now.reachedAt === 13, JSON.stringify(now));
      assert.ok(Math.abs(now.stake - 1.3 ** 11 * 1.4) < 1e-9);
      m = await meterOf(page);
      assert.equal(m.now, valueOf(now.stake));
      const lamp = await page.evaluate(() => window.__lamp); // [lit, lighting], each time the meter's classes changed
      assert.deepEqual(lamp, [[true, true], [true, false]].slice(0, lamp.length || 1), 'the lamp comes on');
      assert.equal(m.lit, true, 'and stays on');
      assert.match(m.text, /significant since pick 13/);
      assert.match(await page.locator('#radio-story').textContent(), /lamp on the meter has come on/, 'and a screen reader is told');
      assert.equal(await page.locator('#radio-meter .g-needle').evaluate((needle) => needle.getAnimations().length), 0, 'the needle swung');
      assert.equal(m.halo, 0, 'the lamp glowed, with reduced motion');
      // for good: after a reload it is lit, and not lit again
      await page.reload();
      await page.waitForSelector('.radio .dot');
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.risen], [true, false, true]);
      assert.equal(await page.locator('#radio-story').textContent(), '', 'announced again');
      // and whatever the next pick does to the stake, the lamp stays lit and the pointer at the peak does not come down
      await keepOne(page);
      const after = await meterOf(page);
      assert.deepEqual([after.lit, after.lighting], [true, false]);
      assert.ok(parseFloat(after.peak) >= parseFloat(m.peak), `the pointer at the peak came down: ${m.peak} to ${after.peak}`);
      assert.equal(after.now, valueOf((await standingOn(page)).stake));
    }),

    check('the radio’s meter: ×20 is marked only on a pick, never on arriving nor on starting over; and starting over carries the stake on, the needle where it was', { storage: { ...TOLD, 'jam:taste:v1': brink } }, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      await sleep(400);
      let m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.halo], [false, false, 0]);
      await keepOne(page, 'front');
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting], [true, true]);
      assert.ok(m.halo > 0, 'the lamp’s glow spreads, once');
      const reached = await standingOn(page);
      // started over at once, while it glows: the glow is not set off again, nor announced, and the stake carries on
      await page.evaluate(() => { document.querySelector('#radio-story').textContent = ''; });
      const needle = m.swing;
      await startOverOn(page);
      m = await meterOf(page);
      assert.deepEqual([m.lighting, m.halo], [false, 0], 'starting over set off the lamp’s moment');
      assert.equal(await page.locator('#radio-story').textContent(), '');
      assert.deepEqual([m.warming, m.pips, m.swing], [true, 0, needle], 'warming up again, the needle where it was');
      assert.equal(m.lit, true, 'carried at ×20 or more, it is lit from the start');
      assert.match(m.text, /^Warming up: 0 of 10 picks before it counts; the stake carried over at ×25; significant since pick 13, before it was started over$/);
      await sleep(3000);
      assert.equal((await meterOf(page)).halo, 0, 'the glow came back');
      const kept = await keptOn(page);
      assert.equal(kept.carried, reached.stake);
      assert.deepEqual(kept.restarts.map(({ after, carried, peak, reachedAt, version }) => ({ after, carried, peak, reachedAt, version })), [{ after: 13, carried: reached.stake, peak: reached.peak, reachedAt: 13, version: VERSION }]);
      assert.ok(kept.restarts[0].at > 1795000000000);
      // the pair that was up, thrown away unpicked, is written down with it (bet on: past the warm-up)
      const { voided } = kept.restarts[0];
      assert.deepEqual([voided.bet, voided.pPhantoms.length, typeof voided.p, typeof voided.front, ['front', 'back'].includes(voided.up)], [true, model.PHANTOMS, 'number', 'string', true]);
      assert.ok(Number.isFinite(voided.heard.front) && Number.isFinite(voided.heard.back));
      // a pick while it warms up again: a pip; nothing bet; the stake where it was carried
      await keepOne(page);
      m = await meterOf(page);
      assert.deepEqual([m.pips, m.swing, m.lighting], [1, needle, false]);
      assert.equal((await standingOn(page)).stake, reached.stake);
      // and arriving at a radio already lit marks nothing either
      await page.reload();
      await page.waitForSelector('.radio .dot');
      await sleep(1500);
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.halo], [true, false, 0]);
      // A radio under way, started over: the needle stays where it was, the pointer goes back to it, the lamp unlit
      // as it was, and the face warms up again; what it was left at is in the reading and in the data.
      await page.evaluate((data) => localStorage.setItem('jam:taste:v1', JSON.stringify(data)), going);
      await page.reload();
      await page.waitForSelector('.radio .dot');
      const was = await standingOn(page);
      const under = await meterOf(page);
      assert.deepEqual([under.warming, under.risen, under.lit], [false, true, false]);
      await startOverOn(page);
      m = await meterOf(page);
      assert.deepEqual([m.warming, m.swing, m.now, m.lit, m.lighting], [true, under.swing, under.now, false, false]);
      assert.equal(m.peak, m.swing, 'the most it has been, since it was started over, is where it was carried');
      assert.equal((await keptOn(page)).carried, was.stake);
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      assert.equal(await page.locator('#lab-carried').textContent(), `×${was.stake.toFixed(2)}`);
      assert.equal(await page.locator('#lab-stake').textContent(), `×${was.stake.toFixed(2)} of ×20`);
      assert.equal(await page.locator('#lab-verdict').textContent(), 'From the tenth choice on, the model calls each one before it is made.');
      leftOpen(await h.reading());
    }),

    check('the radio’s meter: once lit, the lamp stays lit through a start over whatever stake is carried, below ×20 too; and nothing marks it again', { storage: { ...TOLD, 'jam:taste:v1': fallen } }, async (page, h) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      const was = await standingOn(page);
      assert.ok(was.significant && was.reachedAt === 13 && was.stake < model.NEEDED && was.stake > 1, JSON.stringify(was));
      let m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.halo], [true, false, 0], 'lit, and not marked on arriving');
      assert.match(m.text, /^Evidence ×12 of ×20; at most ×25; significant since pick 13$/);
      // started over at about ×12: the lamp stays lit (×20 was reached in the one test the stakes carried on make), with
      // no moment, no announcement; the brass pointer is this experiment's own, back at the needle
      await startOverOn(page);
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.halo, m.warming, m.peak], [true, false, 0, true, m.swing], 'the lamp went out, or was marked again');
      assert.equal(await page.locator('#radio-story').textContent(), '', 'announced again');
      assert.match(m.text, /^Warming up: 0 of 10 picks before it counts; the stake carried over at ×12; significant since pick 13, before it was started over$/);
      const kept = await keptOn(page);
      assert.deepEqual([kept.carried, kept.restarts[0].peak, kept.restarts[0].reachedAt], [was.stake, was.peak, 13]);
      const now = await standingOn(page);
      assert.deepEqual([now.significant, now.reachedAt, now.reached, now.best, now.p], [true, 0, { experiment: 1, pick: 13 }, was.peak, 1 / was.peak]);
      // the reading says so, in the same voice: significant, where, and the rule as far as the stake has ever got
      await page.locator('#taste-behind-open').click();
      await page.waitForSelector('#taste-behind[open]');
      assert.equal(await page.locator('#lab-verdict').textContent(), `Significant at choice 13, before it was started over: p = ${(1 / was.peak).toFixed(3)}. The music itself predicts the choices.`);
      assert.equal(await page.locator('#lab-meter').evaluate((el) => el.classList.contains('done')), true);
      assert.match(await page.locator('#lab-meter').getAttribute('aria-label'), /^The furthest the stake has got: ×25,/);
      leftOpen(await h.reading());
      await page.locator('#taste-behind-close').click();
      // a pick while it warms up again marks nothing; nor does a reload
      await keepOne(page);
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.pips], [true, false, 1]);
      assert.equal(await page.locator('#radio-story').textContent(), '', 'a pick set off the moment again');
      await page.reload();
      await page.waitForSelector('.radio .dot');
      await sleep(1500);
      m = await meterOf(page);
      assert.deepEqual([m.lit, m.lighting, m.halo], [true, false, 0]);
    }),

    check('the radio’s meter: a radio saved before it, by main as it was, comes up with the same stake, the same peak and the same lamp, and goes on from there', { storage: { ...TOLD, 'jam:taste:v1': OWNER.significant.saved } }, async (page) => {
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      for (const [name, { saved, standing: was }] of Object.entries(OWNER)) {
        await page.evaluate((data) => localStorage.setItem('jam:taste:v1', JSON.stringify(data)), saved);
        await page.reload();
        await page.waitForSelector('.radio .dot');
        const now = await standingOn(page);
        assert.deepEqual([now.stake, now.peak, now.significant, now.reachedAt, now.bets], [was.stake, was.peak, was.significant, was.reachedAt, was.bets], `${name}: not what main made of it`);
        const m = await meterOf(page);
        assert.deepEqual([m.now, m.lit, m.lighting, m.warming, m.risen], [valueOf(was.stake), was.significant, false, false, was.peak > 1], name);
        assert.ok(was.peak === was.stake ? m.peak === m.swing : parseFloat(m.peak) > parseFloat(m.swing), `${name}: the pointer at the peak`);
        assert.match(m.text, was.significant ? new RegExp(`significant since pick ${was.reachedAt}$`) : /^Evidence ×\d/);
        const kept = await keptOn(page);
        assert.deepEqual([kept.carried, kept.restarts], [1, []], 'an old save carries nothing over');
        assert.deepEqual(kept.trials, saved.trials, `${name}: the picks were changed on loading`);
      }
      // the owner's radio as it was, significant, and a station kept on the pair that was up (called with one phantom):
      // by that rule; and the pair that comes up next is called with eight
      const { saved, standing: was } = OWNER.significant;
      await page.evaluate((data) => localStorage.setItem('jam:taste:v1', JSON.stringify(data)), saved);
      await page.reload();
      await page.waitForSelector('.radio .dot');
      await keepOne(page);
      const kept = await keptOn(page);
      const last = kept.trials.at(-1);
      assert.equal('pPhantoms' in last, false);
      const front = last.pick === 'front';
      const [real, phantom] = [front ? last.p : 1 - last.p, front ? last.pPhantom : 1 - last.pPhantom];
      const share = Math.min(model.ONE_PHANTOM, Math.abs(real - phantom));
      const now = await standingOn(page);
      assert.equal(now.stake, real === phantom ? was.stake : was.stake * (real > phantom ? 1 + share : 1 - share), 'the pick on the pair that was up, by its rule');
      assert.deepEqual([now.significant, now.reachedAt], [true, was.reachedAt]);
      assert.ok(now.peak >= was.peak);
      assert.equal(kept.current.pPhantoms.length, model.PHANTOMS);
      assert.equal(last.metered, true);
      const m = await meterOf(page);
      assert.deepEqual([m.now, m.lit, m.lighting], [valueOf(now.stake), true, false], 'the lamp was already lit: nothing to mark');
    }),

    check('the radio in two windows: a station kept in one is not undone by keeping the other side of the same pair in the other; the other takes the radio up as it was left', { storage: { ...TOLD, 'jam:taste:v1': going } }, async (a) => {
      await a.goto(`${origin}/jam/?taste`);
      await a.waitForSelector('.radio .dot');
      const b = await a.context().newPage();
      const errors = [];
      b.on('pageerror', (error) => errors.push(error.message));
      await b.goto(`${origin}/jam/?taste`);
      await b.waitForSelector('.radio .dot');
      await sleep(300);
      // both windows have the same pair up, and both have heard it through
      await listenToBoth(a);
      await listenToBoth(b);
      const before = await keptOn(a);
      // a station kept in the first window
      await keepOne(a);
      const after = await keptOn(a);
      assert.equal(after.trials.length, before.trials.length + 1);
      // the second has taken the radio up as the first left it: the new pair, with nothing heard of it there yet,
      // and its meter where the first window's is
      await b.waitForFunction(() => document.querySelector('#taste-card .face.heard') === null, null, { timeout: 5000 });
      assert.equal(await b.locator('#radio-meter').getAttribute('aria-valuetext'), await a.locator('#radio-meter').getAttribute('aria-valuetext'));
      // and keeping a station in it at once (the other side of the pair it had, were it still up) changes nothing
      await b.locator('#taste-pick').click();
      await sleep(500);
      assert.deepEqual((await keptOn(b)).trials, after.trials, 'a pick in the window left behind changed the picks kept');
      // A save written by another window whose news never came (as after a while in the browser's cache): the pick in
      // this window is refused, with a shake, nothing is written over, and it takes up what is there
      await listenToBoth(b);
      await b.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('jam:taste:v1'));
        localStorage.setItem('jam:taste:v1', JSON.stringify({ ...data, gen: 'another window' }));
      });
      await b.locator('#taste-card').evaluate((card) => card.classList.remove('nope'));
      await b.locator('#taste-pick').click();
      await sleep(400);
      let kept = await keptOn(b);
      assert.deepEqual([kept.gen, kept.trials.length], ['another window', after.trials.length], 'a window wrote over a save it had not read');
      assert.equal(await b.locator('#taste-card').evaluate((card) => card.classList.contains('nope')), true, 'refused without a shake');
      // having taken it up, it can keep a station; and then the first window is the one left behind, and takes it up
      await keepOne(b);
      kept = await keptOn(b);
      assert.equal(kept.trials.length, after.trials.length + 1);
      assert.notEqual(kept.gen, 'another window');
      await a.waitForFunction((n) => document.querySelector('#lab-picks').textContent === String(n), kept.trials.length, { timeout: 5000 });
      assert.equal(await a.locator('#radio-meter').getAttribute('aria-valuetext'), await b.locator('#radio-meter').getAttribute('aria-valuetext'));
      assert.deepEqual(errors, [], 'errors in the second window');
    }),

    check('the radio, its save spoilt: it is not written over but put aside, and the stake carries on from it, written down as lost', { storage: { ...TOLD, 'jam:taste:v1': { ...going, current: { ...going.current, front: '!' } } } }, async (page) => {
      const was = model.standing(going.trials, 1);
      await page.goto(`${origin}/jam/?taste`);
      await page.waitForSelector('.radio .dot');
      const { kept, aside } = await page.evaluate(() => ({
        kept: JSON.parse(localStorage.getItem('jam:taste:v1')),
        aside: Object.keys(localStorage).filter((key) => key.startsWith('jam:taste:v1:lost:')).map((key) => JSON.parse(localStorage.getItem(key))),
      }));
      assert.equal(aside.length, 1, 'the spoilt save was not put aside');
      assert.deepEqual(aside[0].trials, going.trials, 'what was put aside is not the save as it was');
      assert.deepEqual([kept.trials.length, kept.carried], [0, was.stake], 'the stake did not carry on');
      assert.deepEqual(kept.restarts.map(({ after, carried, peak, lost }) => ({ after, carried, peak, lost })), [{ after: going.trials.length, carried: was.stake, peak: was.peak, lost: true }]);
      assert.equal(await page.locator('#radio-meter').getAttribute('aria-valuenow'), valueOf(was.stake));
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
      await page.waitForFunction(() => !document.querySelector('#splash')); // (what the app opens under has cleared: a tab pressed under it is only reached by scrolling)
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

    // The quiet room (room/room.css), and what it says (CLAUDE.md, "Look and words": the words on a screen are its
    // content, and its descriptions are kept for screen readers).
    check('a quiet room: its words are only its content; what is yours lies nearest; one tap on a tile goes to its desk, where the board is drawn ahead and the die draws another, and one tap on the play mark starts the game; one bin tidies the table; the chat says each thing once, a game started only while that game is not on the table; what went wrong is a short line of its words beside it, with a shake, while it stands', { storage: ACCOUNT, timezoneId: 'UTC', locale: 'en-US' }, async (page, h) => {
      const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
      const game = (over) => ({ kind: 'postmarks', mode: 'coop', size: 5, status: 'playing', hearts: 3, moves: 2, found: 1, last_player: null, phrase_by: null, finished: 0, mine: null, updated_at: '2026-11-24T10:00:00Z', ...over });
      let games = [game({ id: 'b2222222-2222-4222-8222-222222222222', mode: 'trial', size: 6, mine: 'won', finished: 2 }), game({ id: 'a1111111-1111-4111-8111-111111111111', last_player: 1 })];
      const [trial, together] = games;
      const at = (m) => new Date(Date.UTC(2026, 10, 24, 18, m)).toISOString();
      const line = (id, body, gameId) => ({ id, seat: null, body, at: at(id), game_kind: 'postmarks', game_id: gameId });
      const note = (id, body, minute) => ({ id, seat: 1, body, at: at(minute), game_kind: null, game_id: null });
      const messages = [
        line(1, 'Sam started a game of Postmarks', together.id), // its game is on the table: said there already
        line(2, 'Ada started a 6 × 6 game of Postmarks', trial.id), // (as it was once worded) the same
        line(3, 'Ada started a Postmarks time trial', 'c3333333-3333-4333-8333-333333333333'), // its game is gone: the line stays
        line(4, 'Pass phrase solved: Sam started a game of Postmarks', together.id), // a phrase solved, whatever its words: it stays
        line(5, 'Sam finished the time trial in 3:12', trial.id),
        note(6, 'one', 6), note(7, 'two', 7), note(8, 'three', 30),
      ];
      const asked = [];
      let refuse = true; // (the server says no to putting a game away, the first time)
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/(room_get|postmarks_start|postmarks_delete)/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const name = route.request().url().match(/rpc\/(\w+)/)[1];
        asked.push(name);
        const args = JSON.parse(route.request().postData());
        if (name === 'postmarks_delete') {
          if (refuse) return route.fulfill({ status: 400, json: { message: 'Only the room’s members can do that.' }, headers: cors });
          games = games.filter((one) => one.id !== args.p_game);
          return route.fulfill({ json: {}, headers: cors });
        }
        if (name !== 'room_get') return route.abort();
        return route.fulfill({ json: { id: args.p_room, name: 'Book club', code: 'K7M2QP', you: 0, people, messages: args.p_after ? [] : messages, games }, headers: cors });
      });
      await page.goto(`${origin}/room/?id=11111111-1111-4111-8111-111111111111`);
      await page.waitForSelector('#games li');
      await sleep(900); // (the furniture settles)
      // What can be read on the screen, exactly: names, notes, the code. No labels, no headings, no words on buttons, no
      // placeholders but the one in the box a message is written in (asked for by the owner, 26 November 2026), nothing written on the table; and the line that a game was started is on the table instead. (Faces
      // are emoji: people's faces are content too. The time shows where somebody starts to speak.) A regression guard on
      // the rule: a word that only describes, put back on the room, fails here.
      const seen = () => page.evaluate(() => {
        const out = [];
        const walk = (node) => {
          if (node.nodeType === 3) { if (node.textContent.trim()) out.push(node.textContent.trim().replace(/\s+/g, ' ')); return; }
          if (node.nodeType !== 1 || node.classList.contains('sr-only') || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(node.tagName)) return;
          if (!node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return;
          node.childNodes.forEach(walk);
        };
        document.querySelectorAll('.screen-room > :is(header, main)').forEach(walk);
        for (const field of document.querySelectorAll('.screen-room > :is(header, main) input')) if (field.placeholder && field.checkVisibility()) out.push(`(placeholder) ${field.placeholder}`);
        return out;
      });
      // (each game's card shows the faces of who is in it: faces are content, as the seats' are)
      assert.deepEqual(await seen(), ['🦊', 'Book club', '🦊', 'Sam', '🐼', 'Ada', '🦊', '🐼', '🐼', '🦊', 'Ada started a Postmarks time trial', 'Pass phrase solved: Sam started a game of Postmarks', 'Sam finished the time trial in 3:12', '🐼', 'Ada', '6:06 PM', 'one', 'two', '🐼', 'Ada', '6:30 PM', 'three', 'K7M-2QP', '(placeholder) message…']);
      // yours to play first; nothing on the table is written, it is said to screen readers
      assert.deepEqual(await page.locator('#games li').evaluateAll((all) => all.map((li) => li.dataset.state)), ['go', 'won']);
      // (and who started each, which the line in the chat said, put away while the game is on the table)
      assert.deepEqual(await page.locator('#games a.game').evaluateAll((all) => all.map((a) => a.getAttribute('aria-label'))), ['Together 5 × 5, started by Sam: your move, 1 of 5 posts found, 3 hearts left', 'Time trial 6 × 6, started by Ada: you finished, 2 finished']);
      // ...and what is not yours rests, with some of its colour still (soft, not grey)
      const rest = await page.locator('#games li[data-state="won"] .mini').evaluate((board) => getComputedStyle(board).filter);
      assert.match(rest, /saturate\(0\.5\)/, `a game at rest keeps half its colour (${rest})`);
      // the chat: each thing said once; who and when once a run; every note alike (nothing lit as new)
      const hidden = () => page.locator('.chat-log li.note').evaluateAll((all) => all.map((li) => li.hidden));
      assert.deepEqual(await hidden(), [true, true, false, false, false], 'a game started is said by the table while it is on it');
      assert.deepEqual(await page.locator('.chat-log li:not(.note)').evaluateAll((all) => all.map((li) => li.classList.contains('more'))), [false, true, false]);
      assert.equal(await page.locator('.chat-log li.fresh, .chat-log [class*="new"]').count(), 0, 'no note is marked as new');
      // the line the server says a game was started with, as it is worded now and was before, and nothing else
      const started = await page.evaluate(async () => {
        const { STARTED } = await import('/shared/chat.js');
        return [
          'Sam started a game of Postmarks', 'Ada started a 5 × 5 game of Postmarks', 'Kevin started a Postmarks time trial', 'Bo started a Postmarks pass phrase',
          'Wilhelmina Longname wrote a Postmarks pass phrase to solve', 'Mary Ann started a 9 × 9 game of Postmarks', 'Abcdefghijklmnopqrst started a game of Postmarks', '🐸 started a game of Postmarks',
          'Abcdefghijklmnopqrstu started a game of Postmarks', 'Pass phrase solved: Sam started a game of Postmarks', 'Pass phrase solved: started a game of Postmarks',
          'A pass phrase went unsolved: Bo wrote a Postmarks pass phrase to solve', 'Sam finished the time trial in 3:12', 'Sam started a game of Postmarks, and won', 'Sam opened the room', 'started a game of Postmarks',
        ].map((body) => STARTED.test(body));
      });
      assert.deepEqual(started, [true, true, true, true, true, true, true, true, false, false, false, false, false, false, false, false]);
      // the room is asked for again every so often (a poll; the socket saying something changed; the phone back
      // online), and is mostly the same room: what has not changed stays as it is. Here somebody's name has changed, and
      // the room's has not: its button is the one it was, not another like it. So the keyboard keeps its place on it;
      // and a finger that was pressing it as the answer came is pressing it still, and letting go is a tap. (It was once
      // made again every time: the focus fell to the page, and a press held across it let go of another button, and was
      // lost.)
      const again = async (name) => {
        people[1].name = name;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction((want) => document.querySelector('#members .seat:not(.you) .name')?.textContent === want, name, { timeout: 5000 });
      };
      const title = page.locator('#room-name button.rename');
      await title.focus();
      await page.evaluate(() => { window.nameWas = document.querySelector('#room-name button.rename'); });
      const spot = await title.boundingBox();
      await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
      await page.mouse.down();
      await again('Adah');
      assert.equal(await page.evaluate(() => document.querySelector('#room-name button.rename') === window.nameWas), true, 'the room asked for again: the name\'s button is the one it was');
      assert.equal(await page.evaluate(() => document.activeElement === window.nameWas), true, 'and the keyboard is still on it');
      await page.mouse.up();
      await page.waitForSelector('#room-name form.rename input', { timeout: 2000 }); // (a press held meanwhile is a tap: the name is a field)
      await page.locator('#room-name input').press('Escape');
      assert.equal(await title.textContent(), 'Book club');
      await page.evaluate(() => document.activeElement.blur());
      await again('Ada');
      // a tile: one tap goes to its desk, which starts nothing and tells nobody. Its first step is how the game is
      // played, a few cards; the way on is the board it will be played on, drawn ahead, and the way to draw another.
      // Back goes back a step, and from the first, to the room.
      await page.locator('#modes [data-mode="coop"]').click();
      await page.waitForSelector('#desk-how:not([hidden]) .mode-cards li');
      assert.equal(await page.locator('#desk-how .mode-cards li').count(), 3, 'how a game together is played, on three cards');
      assert.equal(await page.locator('#desk-board').isVisible(), false, 'and the board not yet');
      await page.locator('#desk-next').click();
      await page.waitForSelector('#desk-board:not([hidden]) #preview-board svg');
      await sleep(400);
      assert.equal(asked.includes('postmarks_start'), false, 'one tap started a game');
      assert.equal(await page.locator('#phrase-ask').isVisible(), false, 'a game together asks for no message');
      const drawn = () => page.locator('#preview-board svg').evaluate((svg) => svg.outerHTML);
      const first = await drawn();
      await page.locator('#redraw').click();
      assert.notEqual(await drawn(), first, 'the die draws another board');
      assert.equal(asked.includes('postmarks_start'), false, 'and starts nothing');
      await page.locator('#phrase-back').click();
      await page.waitForSelector('#desk-how:not([hidden]) .mode-cards li');
      await page.locator('#phrase-back').click();
      await page.waitForSelector('.screen-room > main #room:not([hidden])');
      // (what is shaken, from here on)
      await page.evaluate(() => {
        window.shaken = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          if (this.closest?.('.screen-room, dialog') && JSON.stringify(keyframes).includes('translate')) window.shaken.push(this.id || this.tagName.toLowerCase());
          return animate.call(this, keyframes, options);
        };
      });
      // (where a thing lies on the page, or in its sheet, once whatever moves it for a moment, a shake or a sheet coming,
      // has done; and what there is to press that was not there when last looked at)
      const still = () => page.evaluate(() => Promise.all(document.getAnimations().filter((one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity).map((one) => one.finished.catch(() => {}))));
      const lies = async (locator) => {
        await still();
        return locator.evaluate((one) => {
          const box = one.getBoundingClientRect();
          const page = one.closest('dialog') ? [0, 0] : [scrollY, scrollX];
          return [box.top + page[0], box.left + page[1], box.width, box.height].map(Math.round);
        });
      };
      const presses = (look) => page.evaluate((again) => {
        const now = [...document.querySelectorAll('.screen-room > :is(header, main) :is(button, a[href], input), dialog[open] :is(button, a[href], input)')].filter((one) => one.checkVisibility());
        const come = again ? now.filter((one) => !window.pressable.has(one)).map((one) => one.outerHTML.slice(0, 80)) : [];
        window.pressable = new Set(now);
        return come;
      }, look);
      const box = (locator) => locator.evaluate((one) => one.getBoundingClientRect().toJSON());
      const tiles = await lies(page.locator('#modes'));
      await presses();
      assert.deepEqual(await lies(page.locator('#modes')), tiles, 'back in the room, the tiles are where they were');
      await page.locator('#modes [data-mode="trial"]').click();
      await page.locator('#desk-next').click();
      await page.waitForSelector('#desk-board:not([hidden]) #preview-board svg');
      await presses();
      const go = page.locator('#phrase-form .start-phrase');
      const goAt = await lies(go);
      await go.click();
      await page.waitForSelector('#phrase-error:not(:empty)');
      assert.equal(asked.filter((name) => name === 'postmarks_start').length, 1, 'the play mark at the desk starts it, with one tap');
      // what went wrong (here, the server could not be reached): a short line of its words under the play mark, said at
      // once to screen readers too (role="alert"), and the desk shakes as they come; no mark to press for them, and the
      // play mark does not move for them.
      const line1 = page.locator('#phrase-error');
      const shown = (words) => words.evaluate((one) => !one.closest('.sr-only') && one.checkVisibility() && one.getBoundingClientRect().width > 40);
      assert.equal(await line1.getAttribute('role'), 'alert');
      assert.match(await line1.textContent(), /reach the server/);
      assert.deepEqual(await page.evaluate(() => window.shaken), ['phrase-form'], 'the desk shook');
      assert.equal(await shown(line1), true, 'its words are on the screen');
      assert.deepEqual(await lies(go), goAt, 'the play mark has not moved');
      const under = await box(line1);
      const mark = await box(go);
      assert.ok(under.top >= mark.bottom && under.top - mark.bottom < 40 && Math.abs((under.left + under.right) / 2 - (mark.left + mark.right) / 2) < 2, `the words are just under the play mark (${JSON.stringify([under, mark])})`);
      assert.deepEqual(await presses(true), [], 'and nothing has come to press');
      await page.locator('#redraw').click();
      assert.equal(await line1.textContent(), '', 'another board drawn, it is not still said');
      await page.locator('#phrase-back').click();
      await page.locator('#phrase-back').click();
      await page.waitForSelector('.screen-room > main #room:not([hidden])');
      // renaming the room, refused: the name is back as it was, and shakes, and the words lie under it, over the top wall
      // of the building, above the people; nothing moves for them (a tile tapped as the name was left is still where it
      // was for its second tap). Tried again, what went wrong is not still said.
      const name = await lies(page.locator('#room-name'));
      const house = await lies(page.locator('#house'));
      await page.locator('#room-name button.rename').click();
      await page.locator('#room-name input').fill('Thursday club');
      await page.locator('#room-name input').press('Enter');
      await page.waitForSelector('#name-error:not(:empty)');
      assert.equal(await page.locator('#room-name button.rename').textContent(), 'Book club');
      assert.equal(await page.locator('#name-error').getAttribute('role'), 'alert');
      assert.match(await page.locator('#name-error').textContent(), /reach the server/);
      assert.equal(await shown(page.locator('#name-error')), true, 'its words are on the screen');
      assert.deepEqual(await page.evaluate(() => window.shaken), ['phrase-form', 'room-name'], 'the name shook');
      assert.deepEqual([await lies(page.locator('#room-name')), await lies(page.locator('#house'))], [name, house], 'neither the name nor the building has moved');
      const slip = await box(page.locator('#name-error'));
      const sign = await box(page.locator('#room-name'));
      const seats = await box(page.locator('#members'));
      assert.ok(slip.top >= sign.bottom && slip.top - sign.bottom < 12 && slip.bottom <= seats.top && Math.abs((slip.left + slip.right) / 2 - (sign.left + sign.right) / 2) < 2, `the words lie just under the name, above the people (${JSON.stringify([slip, sign, seats])})`);
      // (whatever face the phone sets them in: a narrower phone, or wider letters, wrap them onto a second line, and they
      // must still lie above the people)
      const wide = await page.addStyleTag({ content: '#name-error { letter-spacing: 0.14em; }' });
      const wrapped = await box(page.locator('#name-error'));
      assert.ok(wrapped.height > slip.height * 1.4, `with wider letters, the words take two lines (${JSON.stringify([slip, wrapped])})`);
      assert.ok(wrapped.top === slip.top && wrapped.bottom <= seats.top, `and still lie above the people (${JSON.stringify([wrapped, seats])})`);
      await wide.evaluate((style) => style.remove());
      await page.locator('#room-name button.rename').click();
      assert.equal(await page.locator('#name-error').textContent(), '', 'tried again, it is not still said');
      await page.locator('#room-name input').press('Escape');
      assert.equal(await shown(page.locator('#name-error')), false);
      // leaving, refused: asked in a sheet (with no words of explanation in it), and the sheet stays, shakes, and the
      // words come in it, under the question; its answers stay where they were under the finger. Stay puts it away.
      await page.locator('#more').click();
      assert.deepEqual(await page.locator('#more-menu button').evaluateAll((all) => all.map((one) => [one.getAttribute('aria-label'), one.textContent.trim()])), [['Rename room', 'Rename'], ['Leave room', 'Leave']], 'the room\'s options are a pencil and a door, each with its word');
      assert.equal(await page.evaluate(() => document.querySelector('.screen-room > main').inert), true, 'and while they are open, the room under them is out of reach');
      await page.locator('#leave').click();
      await page.waitForSelector('dialog.ask[open]');
      assert.equal(await page.locator('dialog.ask[open] p:not([role="alert"])').count(), 0, 'nothing but the question and its answers');
      const answers = await lies(page.locator('dialog.ask[open] .buttons'));
      await presses();
      await page.locator('dialog.ask[open] button.yes').click();
      await page.waitForSelector('dialog.ask[open] [role="alert"]:not(:empty)');
      assert.match(await page.locator('dialog.ask[open] [role="alert"]').textContent(), /reach the server/);
      assert.equal(await shown(page.locator('dialog.ask[open] [role="alert"]')), true, 'its words are in the sheet');
      assert.deepEqual((await page.evaluate(() => window.shaken)).slice(2), ['dialog'], 'the sheet shook');
      assert.deepEqual(await lies(page.locator('dialog.ask[open] .buttons')), answers, 'its answers have not moved');
      const between = await page.locator('dialog.ask[open]').evaluate((sheet) => {
        const [question, words, buttons] = ['h2', '[role="alert"]', '.buttons'].map((one) => sheet.querySelector(one).getBoundingClientRect());
        return words.top >= question.bottom && words.bottom <= buttons.top;
      });
      assert.equal(between, true, 'the words are between the question and its answers');
      assert.deepEqual(await presses(true), [], 'and nothing has come to press');
      await page.locator('dialog.ask[open] button.quiet').click();
      assert.equal(await page.locator('dialog[open]').count(), 0, 'Stay puts it away');
      // one bin for the table: pressed, a tap on a board asks to put it away; an Escape is for the question first
      assert.equal(await page.locator('#games .delete').first().isVisible(), false);
      await page.locator('#tidy').click();
      await page.locator('#games .delete').first().click();
      await page.waitForSelector('dialog.ask[open]');
      await page.keyboard.press('Escape');
      await sleep(300);
      assert.equal(await page.locator('.table.tidy').count(), 1, 'the Escape was for the question');
      // put away, and the server says no: the sheet it was asked in (which shows the board, not its name, and no
      // words of explanation) stays, shakes, and the words come in it, while its answers stay where they were; not
      // under the tiles. Tried again, they go, and come again.
      await page.locator('#games .delete').first().click();
      await page.waitForSelector('dialog.ask[open] .picture svg rect');
      assert.equal(await page.locator('dialog.ask[open] h2').evaluate((title) => title.classList.contains('sr-only')), true, 'the board is shown in place of its name');
      assert.equal(await page.locator('dialog.ask[open] p:not([role="alert"])').count(), 0);
      const kept = await lies(page.locator('dialog.ask[open] .buttons'));
      await page.locator('dialog.ask[open] button.yes').click();
      await page.waitForSelector('dialog.ask[open] [role="alert"]:not(:empty)');
      const words = page.locator('dialog.ask[open] [role="alert"]');
      assert.match(await words.textContent(), /members can do that/);
      assert.equal(await shown(words), true, 'its words are there, with nothing to press for them');
      assert.deepEqual(await lies(page.locator('dialog.ask[open] .buttons')), kept, 'its answers have not moved');
      assert.equal(await page.locator('#game-error').textContent(), '', 'not under the tiles');
      const shakes = (await page.evaluate(() => window.shaken)).length;
      await page.locator('dialog.ask[open] button.yes').click();
      await page.waitForSelector('dialog.ask[open] [role="alert"]:not(:empty)');
      assert.equal((await page.evaluate(() => window.shaken)).length, shakes + 1, 'tried again and refused again: the words went, and came again with a shake');
      assert.deepEqual(await lies(page.locator('dialog.ask[open] .buttons')), kept, 'and its answers have still not moved');
      await page.locator('dialog.ask[open] button.quiet').click();
      assert.equal(await page.locator('#games li').count(), 2, 'the game is still on the table');
      // and put away again, it goes: its line that it was started comes back, as the table no longer says so
      refuse = false;
      await page.locator('#games li[data-state="go"] .delete').click();
      await page.locator('dialog.ask[open] button.yes').click();
      await page.waitForFunction(() => document.querySelectorAll('#games li').length === 1, null, { timeout: 5000 });
      assert.deepEqual(await hidden(), [false, true, false, false, false], 'a game gone from the table: the line that it was started is back');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.table.tidy').count(), 0);
      // at the desk for a pass phrase: what it asks, in words; the board drawn ahead, at the size the message needs, and
      // drawn again by the die; the play mark starts it with one tap, the box left empty for a random phrase
      await page.locator('#modes [data-mode="phrase"]').click();
      await page.waitForSelector('#desk-how:not([hidden]) .mode-cards li');
      await page.locator('#desk-next').click();
      await page.waitForSelector('#desk-board:not([hidden]) #preview-board svg');
      assert.equal((await page.locator('#phrase-ask').textContent()).trim(), 'What message would you like to deliver?');
      assert.equal(await shown(page.locator('#phrase-ask')), true, 'and it is on the screen');
      const start = page.locator('#phrase-form .start-phrase');
      const starts = () => asked.filter((name) => name === 'postmarks_start').length;
      const begun = starts();
      const sized = () => page.locator('#preview-board').getAttribute('data-size');
      assert.ok(['5', '6', '7'].includes(await sized()), 'left empty, one of the smaller boards');
      await page.locator('#phrase-text').fill('meet me at the old post office tonight');
      assert.equal(await sized(), String(await page.evaluate(async () => (await import('/postmarks/game.js')).phraseBoardSize('meet me at the old post office tonight'))), 'a message: the board its words need');
      const before = await page.locator('#preview-board svg').evaluate((svg) => svg.outerHTML);
      await page.locator('#redraw').click();
      assert.notEqual(await page.locator('#preview-board svg').evaluate((svg) => svg.outerHTML), before, 'the die draws another');
      assert.equal(starts(), begun, 'and starts nothing');
      // the die beside the box: lit while the box is empty, which is when a phrase picked at random is used; thrown with
      // a phrase written, it empties the box for one
      assert.equal(await page.locator('#random-phrase').getAttribute('aria-pressed'), 'false', 'a message written: the die is not lit');
      await page.locator('#random-phrase').click();
      assert.equal(await page.locator('#phrase-text').inputValue(), '', 'thrown, the box is emptied');
      assert.equal(await page.locator('#random-phrase').getAttribute('aria-pressed'), 'true', 'and the die is lit');
      assert.ok(['5', '6', '7'].includes(await sized()), 'a random phrase: one of the smaller boards');
      assert.equal(starts(), begun, 'and nothing has started');
      const desk = await lies(start);
      await start.click();
      await page.waitForSelector('#phrase-error:not(:empty)');
      assert.equal(starts(), begun + 1, 'one tap starts the game');
      assert.equal((await page.evaluate(() => window.shaken)).at(-1), 'phrase-form', 'and refused, the desk shook');
      assert.match(await page.locator('#phrase-error').textContent(), /reach the server/);
      assert.equal(await shown(page.locator('#phrase-error')), true, 'and its words are under the play mark');
      assert.deepEqual(await lies(start), desk, 'which has not moved');
      await page.locator('#phrase-text').fill('meet me at the old post office');
      assert.equal(await page.locator('#phrase-error').textContent(), '', 'once what was typed changes, it is not still said');
    }),

    // Opening a room and joining one: their doors are held back until there is what they need, so those can never be
    // refused for want of it; a refusal from the server is a short line of its words under the door, and the door
    // shakes (with less motion asked for, it does not), until what was typed is changed.
    check('opening and joining a room: the door is held back until there is a name, or a whole code; what went wrong is said under it, with a shake, until what was typed changes', { storage: ACCOUNT }, async (page) => {
      // (what is shaken, on each screen)
      const watch = () => page.evaluate(() => {
        window.shaken = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          if (JSON.stringify(keyframes).includes('translate')) window.shaken.push(this.id || this.tagName.toLowerCase());
          return animate.call(this, keyframes, options);
        };
      });
      const shaken = () => page.evaluate(() => window.shaken);
      const still = () => page.evaluate(() => Promise.all(document.getAnimations().filter((one) => one.playState === 'running' && one.effect?.getComputedTiming().iterations !== Infinity).map((one) => one.finished.catch(() => {}))));
      const lies = async (locator) => {
        await still();
        const box = await locator.evaluate((one) => one.getBoundingClientRect().toJSON());
        return ['top', 'left', 'width', 'height'].map((side) => Math.round(box[side]));
      };
      const shown = (words) => words.evaluate((one) => !one.closest('.sr-only') && one.checkVisibility() && one.getBoundingClientRect().width > 40);
      const under = (words, door) => page.evaluate(([a, b]) => {
        const [w, d] = [document.querySelector(a).getBoundingClientRect(), document.querySelector(b).getBoundingClientRect()];
        return w.top >= d.bottom && w.top - d.bottom < 40 && Math.abs((w.left + w.right) / 2 - (d.left + d.right) / 2) < 2;
      }, [words, door]);

      await page.goto(`${origin}/?open`);
      const open = page.locator('#create-room button[type="submit"]');
      await page.waitForSelector('#create-room');
      await watch();
      assert.equal(await open.isDisabled(), true, 'no name: the door is held back');
      await page.locator('#room-name').fill('   ');
      assert.equal(await open.isDisabled(), true, 'nor spaces');
      await page.locator('#room-name').press('Enter');
      assert.equal(await page.locator('#create-error').textContent(), '', 'and Enter says nothing');
      await page.locator('#room-name').fill('Tuesday club');
      assert.equal(await open.isDisabled(), false);
      const plus = await lies(open);
      await open.click();
      await page.waitForSelector('#create-error:not(:empty)');
      assert.equal(await page.locator('#create-error').getAttribute('role'), 'alert');
      assert.match(await page.locator('#create-error').textContent(), /reach the server/);
      assert.equal(await shown(page.locator('#create-error')), true, 'its words are on the screen');
      assert.equal(await under('#create-error', '#create-room button[type="submit"]'), true, 'just under the door');
      assert.deepEqual(await shaken(), ['create-room'], 'and the board shook');
      assert.deepEqual(await lies(open), plus, 'the door has not moved');
      assert.equal(await page.locator('#create-room button').count(), 1, 'nothing has come to press');
      await page.locator('#room-name').fill('Tuesday Club');
      assert.equal(await page.locator('#create-error').textContent(), '', 'once what was typed changes, it is not still said');
      assert.equal(await shown(page.locator('#create-error')), false);

      // (joining, with less motion asked for: the words come all the same, and nothing shakes)
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${origin}/?join`);
      const join = page.locator('#join-room button[type="submit"]');
      await page.waitForSelector('#join-room');
      await watch();
      assert.equal(await page.locator('#join-code').getAttribute('placeholder'), '•••-•••', 'the shape of a code, not an example of one');
      assert.equal(await join.isDisabled(), true);
      await page.locator('#join-code').fill('K7M-2Q');
      assert.equal(await join.isDisabled(), true, 'five of six: held back');
      await page.locator('#join-code').press('Enter');
      assert.equal(await page.locator('#join-error').textContent(), '');
      await page.locator('#join-code').fill('k7m2qp');
      assert.equal(await join.isDisabled(), false, 'a whole code, however it is written');
      const way = await lies(join);
      await join.click();
      await page.waitForSelector('#join-error:not(:empty)');
      assert.equal(await page.locator('#join-error').getAttribute('role'), 'alert');
      assert.match(await page.locator('#join-error').textContent(), /reach the server/);
      assert.equal(await shown(page.locator('#join-error')), true, 'its words are on the screen');
      assert.equal(await under('#join-error', '#join-room button[type="submit"]'), true, 'just under the door');
      assert.deepEqual(await shaken(), [], 'with less motion asked for, nothing shook');
      assert.deepEqual(await lies(join), way, 'the door has not moved');
      await page.locator('#join-code').fill('k7m2qq');
      assert.equal(await page.locator('#join-error').textContent(), '', 'once what was typed changes, it is not still said');
    }),

    check('with an account: Penny keeps out of the way of the page', { viewport: { width: 390, height: 664 }, storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' } }, async (page, h) => {
      // How Penny has stood since it arrived, written down in the page: its height and its mood, each time either
      // changes. (It arrives with its eyes over the edge and ducks half a second later, when the page has settled.
      // That used to be asked after 2.7 s from the page having loaded; but the home page is put up some time after
      // that, 2.4 s after on a busy machine, and Penny was then asked how it stood 0.4 s after arriving, before it
      // had looked: still up.)
      await page.addInitScript(() => {
        window.__stood = [];
        new MutationObserver(() => {
          const it = document.querySelector('.pal');
          const last = window.__stood.at(-1);
          if (it && (it.dataset.height !== last?.height || it.dataset.mood !== last?.mood)) window.__stood.push({ height: it.dataset.height, mood: it.dataset.mood });
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-height', 'data-mood'] });
      });
      await page.goto(`${origin}/?home`);
      const stood = await (await page.waitForFunction(() => window.__stood.some((one) => one.mood === 'hopeful') && window.__stood, null, { timeout: 12000 })).jsonValue(); // Penny comes up to ask
      // a tile is under Penny: it ducks, the first thing it does, and stays down until it comes up to ask
      assert.deepEqual(stood.slice(0, stood.findIndex((one) => one.mood === 'hopeful')), [{ height: 'peek', mood: 'calm' }, { height: 'low', mood: 'calm' }], 'a tile is under Penny: it ducks');
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
      await h.twice(0);
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

    check('Marcus Pell\'s reel: in the feed once half a bar of energy is earned, waiting like anything else; a line at a time, swiped up; the partnership said only once the sponsor is named; then the comment, then from the top; watched, it leaves the feed, and Reels on the menu still has it', { storage: { ...ACCOUNT, 'home:tab:v1': 'feed', 'correspondence:energy:v1': { earned: 34, spent: 0, boards: [] } } }, async (page) => {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#panel-feed:not([hidden])');
      assert.equal(await page.locator('#feed-reels').isHidden(), true, 'not before half a bar');
      await page.evaluate(() => localStorage.setItem('correspondence:energy:v1', JSON.stringify({ earned: 35, spent: 0, boards: [] })));
      await page.reload();
      await page.waitForSelector('.feed-reel');
      assert.equal(await page.locator('#feed-count').textContent(), '1', 'it is waiting on you, like anything else');
      assert.equal(await page.locator('#feed-empty').isHidden(), true, 'and the feed is not all clear');
      await page.locator('.feed-reel').click();
      await page.waitForSelector('.screen-reel .reel-cam');
      await page.waitForFunction(() => document.querySelectorAll('#screens .screen').length === 1);
      assert.equal(await page.locator('#reel-said').textContent(), '', 'nothing said until it is asked for');
      assert.equal(await page.locator('#reel-play').isVisible(), true, 'it begins with a tap on play');
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 120); // (a swipe is not a tap: sound could not start on it, so it does not begin the reel)
      await page.waitForFunction(() => document.querySelector('#reel-play').classList.contains('nudge'));
      assert.equal(await page.locator('#reel-said').textContent(), '', 'a swipe first only nudges the play button');
      await page.waitForTimeout(470);
      const said = [];
      const paidAt = [];
      for (let i = 0; i < 19; i += 1) {
        if (i === 0) {
          await page.locator('#reel-play').click();
          await page.waitForSelector('#reel-next:not([hidden])'); // (after the first line, how it goes on)
          assert.equal(await page.locator('#reel-play').isHidden(), true, 'and play has gone');
        }
        else if (i === 1) { await page.mouse.move(200, 300); await page.mouse.wheel(0, 120); } // (a scroll, as a swipe up)
        else await page.keyboard.press('ArrowDown');
        await page.waitForFunction((n) => document.querySelector('#reel-progress').style.transform.includes(`${n}`), String(((i % 18) + 1) / 18).slice(0, 5));
        said.push(await page.locator('#reel-said').textContent());
        if (await page.locator('#reel-paid').isVisible()) paidAt.push(i);
        await page.waitForTimeout(470); // (one line at a time: not quicker than a line can start)
      }
      assert.equal(said[0], 'I opened up Wealthmart');
      assert.equal(said[9], 'Penny’s Energy');
      assert.equal(said[16], 'don’t fall out of step');
      assert.equal(paidAt[0], 9, 'the partnership is said only once the sponsor is named');
      assert.equal(said[17], '', 'after the last line, the comment');
      assert.equal(said[18], 'I opened up Wealthmart', 'and then from the top');
      await page.locator('.reel .penny-back').click();
      await page.waitForSelector('.screen-home #feed-empty:not([hidden])');
      assert.equal(await page.locator('.feed-reel').count(), 0, 'watched to its end, it has left the feed');
      assert.equal(await page.locator('#feed-count').isHidden(), true, 'and nothing is waiting');
      await page.locator('#tab-lobby').click();
      await page.locator('#menu-reels').click();
      await page.waitForSelector('.screen-reel .reel-cam');
    }),

    check('Marcus Pell\'s reel, shared: the share mark opens the phone\'s share sheet with the reel\'s address; with no share sheet, the address is copied and a short line says so', {}, async (page) => {
      await page.addInitScript(() => {
        window.shared = [];
        if (sessionStorage.getItem('no-sheet')) Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        else Object.defineProperty(navigator, 'share', { value: (what) => { window.shared.push(what); return Promise.resolve(); }, configurable: true });
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.copied = text; } }, configurable: true });
      });
      await page.goto(`${origin}/reels/marcus/`);
      await page.waitForSelector('.reel-cam');
      await page.locator('#reel-share').click();
      const sent = await page.evaluate(() => window.shared);
      assert.equal(sent.length, 1, 'the share sheet, once');
      assert.equal(new URL(sent[0].url).pathname + new URL(sent[0].url).search, '/reels/marcus/', 'with the reel\'s own address, which has its own preview');
      assert.equal(await page.locator('#reel-said').textContent(), '', 'and the reel is not moved on by it');
      assert.equal(await page.locator('#reel-shared').textContent(), '', 'the sheet says what happened: the page says nothing');
      await page.evaluate(() => sessionStorage.setItem('no-sheet', '1'));
      await page.reload();
      await page.waitForSelector('.reel-cam');
      await page.locator('#reel-share').click();
      await page.waitForSelector('#reel-shared:not(:empty)');
      assert.equal(await page.locator('#reel-shared').textContent(), 'Link copied');
      assert.match(await page.evaluate(() => window.copied), /\/reels\/marcus\/$/, 'and it is the reel\'s address that is copied');
    }),

    check('Marcus Pell, followed from his reel: he is in the world, wandering behind the home page, and goes when he is no longer followed', { storage: ACCOUNT }, async (page) => {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#play:not([hidden])');
      assert.equal(await page.locator('.wander-marcus').count(), 0, 'not followed: not in the world');
      await page.goto(`${origin}/reels/marcus/`);
      await page.waitForSelector('.reel-cam');
      assert.equal(await page.locator('#reel-follow').getAttribute('aria-pressed'), 'false');
      await page.locator('#reel-follow').click();
      assert.equal(await page.locator('#reel-follow').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#reel-follow').textContent(), 'Following');
      assert.equal(await page.locator('#reel-said').textContent(), '', 'and the reel is not moved on by it');
      await page.locator('.reel .penny-back').click();
      await page.waitForSelector('.screen-home .wander-marcus');
      const where = () => page.evaluate(() => {
        const him = document.querySelector('.wander-marcus').getBoundingClientRect();
        const frame = document.querySelector('.screen-home main').getBoundingClientRect();
        return { x: him.left, y: him.top, w: him.width, inside: him.left >= frame.left && him.right <= frame.right && him.top >= frame.top && him.bottom <= frame.bottom };
      });
      const first = await where();
      assert.ok(first.inside, 'on the page');
      assert.ok(first.w > 20 && first.w < 60, 'small');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.wander')).pointerEvents), 'none', 'nothing to press');
      // under everything on the page: whatever is at his middle is the page's, not him
      const under = await page.evaluate(() => {
        const layer = document.querySelector('.wander');
        return getComputedStyle(layer).zIndex;
      });
      assert.equal(under, '-1', 'behind the page');
      await page.waitForFunction((from) => { const b = document.querySelector('.wander-marcus').getBoundingClientRect(); return Math.hypot(b.left - from.x, b.top - from.y) > 4; }, first, { timeout: 15000 });
      // followed no longer: gone from the world
      await page.goto(`${origin}/reels/marcus/`);
      await page.waitForSelector('.reel-cam');
      assert.equal(await page.locator('#reel-follow').getAttribute('aria-pressed'), 'true', 'still followed, when the reel is come back to');
      await page.locator('#reel-follow').click();
      assert.equal(await page.locator('#reel-follow').textContent(), 'Follow');
      await page.goto(`${origin}/`);
      await page.waitForSelector('#play:not([hidden])');
      await sleep(600);
      assert.equal(await page.locator('.wander-marcus').count(), 0);
    }),

    check('Marcus Pell, followed, with less motion asked for: standing somewhere on the home page, and still', { storage: { ...ACCOUNT, 'reel:marcus:follow:v1': true }, reducedMotion: 'reduce' }, async (page) => {
      await page.goto(`${origin}/`);
      await page.waitForSelector('.screen-home .wander-marcus');
      const at = () => page.evaluate(() => { const b = document.querySelector('.wander-marcus').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; });
      const first = await at();
      await sleep(4000);
      assert.deepEqual(await at(), first, 'he does not walk');
    }),

    check('scene one is out of the story for now: it is found from the stamp in the home page\'s corner, it is not where play goes on from, and it leads back home', { storage: ACCOUNT }, async (page) => {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#play:not([hidden])');
      assert.equal(await page.locator('#building').getAttribute('href'), '/?office');
      await page.locator('#building').click();
      await page.waitForURL(/\?office/);
      await page.waitForSelector('.screen-office .office-stage');
      await page.goto(`${origin}/`);
      await page.waitForSelector('#play:not([hidden])');
      assert.equal(await page.locator('#play').getAttribute('href'), '/?hello', 'seeing it does not move the story on');
      // somebody left in the office when it was in the story goes on from the scene after it
      await page.evaluate(() => localStorage.setItem('penny:story:v1', JSON.stringify('office')));
      await page.goto(`${origin}/`);
      await page.waitForSelector('#play:not([hidden])');
      assert.equal(await page.locator('#play').getAttribute('href'), '/?slow');
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
      // Nothing comes off a light when it twinkles: whatever is lit, however close to them, is one of the five. (Specks
      // once came off and were knocked about for a second or two: flies round a lamp. The places looked at above are too
      // far off to have seen them.) Each light's shape is drawn again here, with room round it for how far it may have
      // wandered and for its points drawn out, and anything bright outside all of them is counted. The big star is
      // touched three times, and looked at as it settles. (This is looked at before any finger is held near them: a
      // light that is warmed strays further, as it is meant to, and further than the room it is given here. And the
      // far ones, which wander most, are given the most.)
      const loose = () => page.evaluate(async () => {
        const { PICTURE, frame, nearness, starPath } = await import('/penny/stars.js');
        const view = document.querySelector('.sky-view');
        const dense = view.width / view.clientWidth;
        const place = frame(view.clientWidth, view.clientHeight);
        const cover = document.createElement('canvas');
        cover.width = view.width;
        cover.height = view.height;
        const ink = cover.getContext('2d');
        ink.lineJoin = 'round';
        ink.lineCap = 'round';
        for (const light of PICTURE) {
          const [x, y] = [place.x + light.x * place.side, place.y + light.y * place.side];
          if (light.kind === 'dot') {
            ink.setTransform(dense, 0, 0, dense, 0, 0);
            ink.beginPath();
            ink.arc(x, y, light.r * place.side + 26, 0, Math.PI * 2);
            ink.fill();
            continue;
          }
          ink.setTransform(dense * place.side, 0, 0, dense * place.side, dense * x, dense * y);
          ink.lineWidth = (2 * (16 + 10 * (1 - nearness(light)))) / place.side; // (room each side of its edge: sixteen pixels for the big star, more for the others)
          const shape = new Path2D(starPath(light, place.side));
          for (const [across, up] of [[light.a * 1.75, 0], [0, light.b * 1.75]]) { // (its points, drawn out as far as they ever are)
            shape.moveTo(-across, -up);
            shape.lineTo(across, up);
          }
          ink.fill(shape);
          ink.stroke(shape);
        }
        const lit = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
        const covered = ink.getImageData(0, 0, view.width, view.height).data;
        let pixels = 0;
        let brightest = 0;
        for (let i = 0; i < lit.length; i += 4) {
          if (lit[i] <= 46 || covered[i + 3] !== 0) continue; // (a glow is fainter than that, out there)
          pixels += 1;
          brightest = Math.max(brightest, lit[i]);
        }
        return { pixels, brightest };
      });
      for (let touches = 0; touches < 3; touches++) {
        await page.mouse.click(one.lights[4].x, one.lights[4].y);
        for (let looks = 0; looks < 5; looks++) {
          await sleep(150);
          const off = await loose();
          assert.equal(off.pixels, 0, `something is lit that is not one of the five lights: ${off.pixels} pixels of it, the brightest ${off.brightest}`);
        }
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

    // Through the mark from a long page. The night is one picture the size of the window, whatever it is come to
    // from. It once measured itself as it arrived, while the page being left still held the screen open to its own
    // length: it drew its picture for that length and was then squashed into the window, so the stars changed size as
    // the tumble landed, and stayed the wrong shape. And the picture that tumbles in is the night's own, in the same
    // place; on its way there it is only moved, turned and scaled, which is what a phone can do smoothly.
    check('through the mark from a long page: the night is the size of the window, and the picture that tumbles in lands where the night has it', { storage: { ...ACCOUNT, 'home:tab:v1': 'lobby' } }, async (page) => {
      const night = () => page.evaluate(async () => {
        const { frame } = await import('/penny/stars.js');
        const view = document.querySelector('.sky-view');
        const room = view.getBoundingClientRect();
        const place = frame(view.clientWidth, view.clientHeight);
        const sharp = Math.min(window.devicePixelRatio || 1, 2);
        return { shown: [view.clientWidth, view.clientHeight], drawnFor: [view.width / sharp, view.height / sharp], window: [window.innerWidth, window.innerHeight], picture: [room.left + place.x, room.top + place.y, place.side, place.side] };
      });
      const landed = () => page.waitForFunction(() => document.querySelector('.screen-sky') && document.querySelectorAll('#screens .screen').length === 1 && !document.querySelector('.tag-rise') && !document.documentElement.classList.contains('tumbling'), null, { timeout: 8000 });
      await page.goto(origin);
      await page.waitForSelector('.tag-hidden:not([hidden])', { timeout: 9000 });
      const long = await page.evaluate(() => document.scrollingElement.scrollHeight);
      assert.ok(long > PHONE.height + 100, `the home page, with rooms on it, is a long one (${long})`);
      // every frame of the way through: where the square with the picture in it is laid out, and where it is seen to be
      await page.evaluate(() => {
        window.tumbled = [];
        const each = () => {
          const square = document.querySelector('.tag-rise > div');
          if (square) {
            const laid = getComputedStyle(square);
            const seen = square.getBoundingClientRect();
            window.tumbled.push({ laid: [laid.left, laid.top, laid.width, laid.height].join(' '), seen: [seen.left, seen.top, seen.width, seen.height], done: square.getAnimations().every((one) => one.playState === 'finished') });
          }
          if (!window.tumbledOver) requestAnimationFrame(each);
        };
        requestAnimationFrame(each);
      });
      await page.locator('.tag-hidden').click();
      await landed();
      const frames = await page.evaluate(() => {
        window.tumbledOver = true;
        return window.tumbled;
      });
      const there = await night();
      assert.deepEqual(there.shown, there.window, 'the night is the size of the window');
      assert.deepEqual(there.drawnFor, there.shown, 'and its picture is drawn for the size it is shown at, not for the length of the page it was come to from');
      assert.ok(frames.length > 20, `the way through was watched (${frames.length} frames of it)`);
      assert.equal(new Set(frames.map((one) => one.laid)).size, 1, 'on its way the picture is laid out once: after that it is only moved, turned and scaled');
      const last = frames.filter((one) => one.done).at(-1);
      assert.ok(last, 'it landed before it was taken away');
      for (const [i, part] of ['left', 'top', 'width', 'height'].entries()) {
        assert.ok(Math.abs(last.seen[i] - there.picture[i]) <= 0.5, `where it landed is not where the night has its picture (${part}: ${last.seen[i]}, and the night's ${there.picture[i]})`);
      }
      // And for somebody who has asked for less motion, from what is kept on the home page: no tumble, and the night the size of the window all the same.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(origin);
      await page.waitForSelector('.tag-kept');
      await sleep(600);
      await page.locator('.tag-kept').click();
      await landed();
      const again = await night();
      assert.deepEqual(again.shown, again.window);
      assert.deepEqual(again.drawnFor, again.shown, 'with less motion its picture is drawn for the size it is shown at too');
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
    // Energy (shared/energy.js): every post found is kept at once and fills the bar, a spark flying from the post to
    // the end of the bar; no number is shown, and what is held is said to screen readers; finishing the board adds as
    // much again; the same board played again adds nothing for what it has already earned. The bar is everything
    // earned, in every game (BAR, about five games for now); the first time it is full, the meadow at its end blooms in
    // colour (shared/meadow.js), and the bar begins again from what was left over.
    check('energy: each post found adds to one bar for every game, finishing adds more, and a full bar is the meadow; no number on the screen', { storage: { 'postmarks:howto:v1': true, 'correspondence:energy:v1': { earned: 62, spent: 0, boards: [] } } }, async (page) => {
      const { newGame } = await import('../../postmarks/game.js');
      const { BAR } = await import('../../shared/energy.js');
      assert.equal(BAR, 70, 'this check is written for a bar of 70');
      const game = newGame({ size: 5, seed: 4, players: ['You'] });
      await page.goto(`${origin}/`);
      await page.evaluate((saved) => localStorage.setItem('postmarks:solo:v1', JSON.stringify(saved)), game);
      await page.goto(`${origin}/postmarks/`);
      await page.waitForSelector('#energy:not([hidden])');
      await page.evaluate(() => document.querySelector('dialog[open]')?.close());
      const reads = () => page.evaluate(() => ({
        count: Number(document.querySelector('#energy').getAttribute('aria-label').match(/\d+/)[0]),
        fill: Number(document.querySelector('#energy .bar i').style.getPropertyValue('--fill')),
        kept: JSON.parse(localStorage.getItem('correspondence:energy:v1')).earned,
        sparks: document.querySelectorAll('.energy-spark').length,
        meadow: document.querySelector('#energy').classList.contains('meadow'),
      }));
      assert.deepEqual(await reads(), { count: 62, fill: 62 / 70, kept: 62, sparks: 0, meadow: false }, 'all that was earned before, in other games');
      assert.equal(await page.locator('#energy').getAttribute('aria-label'), 'Energy 62; the meadow at 70');
      assert.equal(await page.locator('#turn').isVisible(), false, 'the bar is where the words of the turn were');
      assert.equal((await page.locator('#energy').innerText()).trim(), '', 'and nothing on it is written');
      const open = (row) => page.locator(`#board .cell[data-cell="${row * game.size + game.solution[row]}"]`).dblclick();
      await open(0);
      await page.waitForFunction(() => document.querySelector('.energy-spark'), null, { timeout: 2000 });
      assert.equal((await reads()).kept, 63, 'kept at once, before the spark has landed');
      await page.waitForFunction(() => document.querySelector('#energy').getAttribute('aria-label').startsWith('Energy 63') && !document.querySelector('.energy-spark'), null, { timeout: 4000 });
      assert.equal((await reads()).fill, 63 / 70, 'one post: one more on the bar');
      for (let row = 1; row < game.size; row++) { await open(row); await sleep(300); }
      await page.waitForSelector('#energy .meadow-mark.bloom', { timeout: 12000 });
      await page.waitForFunction(() => document.querySelector('#energy').getAttribute('aria-label') === 'Energy 72', null, { timeout: 12000 });
      assert.deepEqual(await reads(), { count: 72, fill: 2 / 70, kept: 72, sparks: 0, meadow: true }, 'five posts and five for finishing: the bar filled, the meadow is in colour, and the bar begins again');
      await page.waitForSelector('dialog.finale[open]', { timeout: 6000 });
      // the same board again: nothing more
      await page.evaluate((saved) => localStorage.setItem('postmarks:solo:v1', JSON.stringify(saved)), game);
      await page.reload();
      await page.waitForSelector('#energy:not([hidden])');
      await page.evaluate(() => document.querySelector('dialog[open]')?.close());
      assert.deepEqual(await reads(), { count: 72, fill: 2 / 70, kept: 72, sparks: 0, meadow: true }, 'the bar as it was left');
      await open(0);
      await sleep(1500);
      assert.deepEqual(await reads(), { count: 72, fill: 2 / 70, kept: 72, sparks: 0, meadow: true }, 'a post found again earns nothing');
    }),
    // The fourth bar filled: the owner's thanks, in words, once, before the sheet at the end of the game.
    check('energy: the fourth bar filled brings the owner\'s thanks, once, before the end of the game', { storage: { 'postmarks:howto:v1': true, 'correspondence:energy:v1': { earned: 272, spent: 0, boards: [] } } }, async (page) => {
      const { newGame } = await import('../../postmarks/game.js');
      const game = newGame({ size: 5, seed: 4, players: ['You'] });
      await page.goto(`${origin}/`);
      await page.evaluate((saved) => localStorage.setItem('postmarks:solo:v1', JSON.stringify(saved)), game);
      await page.goto(`${origin}/postmarks/`);
      await page.waitForSelector('#energy:not([hidden])');
      await page.evaluate(() => document.querySelector('dialog[open]')?.close());
      const open = (row) => page.locator(`#board .cell[data-cell="${row * game.size + game.solution[row]}"]`).dblclick();
      for (let row = 0; row < game.size - 1; row++) { await open(row); await sleep(300); }
      await sleep(2500);
      assert.equal(await page.locator('dialog.thanks').count(), 0, 'not before the bar is full');
      await open(game.size - 1);
      await page.waitForSelector('dialog.thanks[open]', { timeout: 15000 });
      assert.equal((await page.locator('dialog.thanks p').innerText()).trim(), 'Speedy! Thanks for being an early tester. We\u2019re working on your prize 🤍');
      assert.equal(await page.locator('dialog.finale[open]').count(), 0, 'the end of the game waits for it');
      await page.locator('dialog.thanks .start').click();
      await page.waitForSelector('dialog.finale[open]', { timeout: 6000 });
      assert.equal(await page.locator('dialog.thanks').count(), 0);
      // and only the once
      await page.evaluate(() => localStorage.setItem('correspondence:energy:v1', JSON.stringify({ earned: 272, spent: 0, boards: [] })));
      await page.evaluate((saved) => localStorage.setItem('postmarks:solo:v1', JSON.stringify(saved)), game);
      await page.reload();
      await page.waitForSelector('#energy:not([hidden])');
      await page.evaluate(() => document.querySelector('dialog[open]')?.close());
      for (let row = 0; row < game.size; row++) { await open(row); await sleep(300); }
      await page.waitForSelector('dialog.finale[open]', { timeout: 15000 });
      assert.equal(await page.locator('dialog.thanks').count(), 0, 'not a second time');
    }),
    // At home, under the play button, the same bar; the meadow at its end grey until it is earned, then a toggle that a
    // room follows: worn from the moment it is earned, taken off and put back on, and kept on the device.
    // The meadow's folk: none in the meadow of the first bar; found, asleep, with the second; woken by the third. Paint, as the meadow is.
    check('the meadow\'s folk: nobody in the first bar\'s meadow, found asleep with the second, awake with the third; nothing moved by them; gone with the meadow', { storage: { ...ACCOUNT, 'correspondence:energy:v1': { earned: 75, spent: 0, boards: [] } } }, async (page) => {
      const room = '11111111-1111-4111-8111-111111111111';
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const game = { id: '22222222-3333-4333-8333-333333333333', kind: 'postmarks', mode: 'coop', size: 6, status: 'playing', players: ['Sam', 'Ada'], last_player: 1, found: 2, hearts: 3, moves: 4 };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/room_get/, (route) => (route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ json: { id: room, name: 'Book club', code: 'K7M2QP', you: 0, members: ['Sam', 'Ada'], people: [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }], messages: [], games: [game] }, headers: cors })));
      const boxes = () => page.evaluate(() => [...document.querySelectorAll('.screen-room > :is(header, main) :is(button, a, input, textarea, h1, h2, .table, .rug, .seat, .mini)')]
        .filter((one) => one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return `${one.id || one.className} ${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`; }));
      const settled = () => page.evaluate(() => Promise.all(document.getAnimations().filter((one) => one.effect?.getComputedTiming().iterations !== Infinity).map((one) => one.finished.catch(() => {}))));
      const kinds = () => page.evaluate(() => [...new Set([...document.querySelectorAll('.screen-room > :is(header, main) [data-ff]')].map((one) => one.dataset.ff))].sort());
      const having = async (earned, off = false) => {
        await page.evaluate(([n, taken]) => { localStorage.setItem('correspondence:energy:v1', JSON.stringify({ earned: n, spent: 0, boards: [] })); if (taken) localStorage.setItem('correspondence:meadow:v1', JSON.stringify('off')); else localStorage.removeItem('correspondence:meadow:v1'); }, [earned, off]);
        await page.goto(`${origin}/room/?id=${room}`);
        await page.waitForSelector('#games li .mini');
        await settled();
      };
      await page.goto(`${origin}/`);
      await having(75);
      assert.deepEqual(await kinds(), [], 'the meadow just earned: nobody in it yet');
      const empty = await boxes();
      await having(135);
      assert.deepEqual(await kinds(), [], 'nor however near the second bar is to full');
      await having(140);
      const all = await kinds();
      for (const kind of ['board', 'code', 'send', 'tile', 'token']) assert.ok(all.includes(kind), `the second bar full: the ${kind} is there`);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.screen-room > main [data-ff]')].every((one) => one.dataset.ffMood === 'sleep')), true, 'every one of them asleep');
      assert.equal(await page.locator('.screen-room > main .mode[data-ff] .ff-eye').first().isVisible(), false, 'eyes shut');
      assert.equal(await page.locator('.screen-room').getAttribute('data-ff-current'), '', 'and a current goes through them');
      assert.deepEqual((await boxes()).filter((one) => !empty.includes(one)), [], 'nothing moved or resized by them');
      await having(210);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.screen-room > main [data-ff="tile"], .screen-room > main [data-ff="board"]')].some((one) => one.dataset.ffMood === 'sleep')), false, 'the third bar full: awake');
      assert.equal(await page.locator('.screen-room > main .mode[data-ff] .ff-eye').first().isVisible(), true, 'eyes open');
      await page.waitForSelector('.screen-room > main .mode[data-ff][data-ff-seen]');
      // (awake, the picture of a board sways and may be in the middle of a hop, and the people walk about the lawn: neither is pressed, and the link over a board, which is, stays)
      assert.deepEqual((await boxes()).filter((one) => !/^(mini|seat)\b/.test(one) && !empty.includes(one)), [], 'nor awake: everything there is to press where it was');
      assert.equal(await page.locator('.screen-room').getAttribute('data-ff-awake'), '', 'a breeze, and people walking');
      await page.waitForFunction(() => [...document.querySelectorAll('.screen-room > main #members .seat')].some((seat) => seat.style.translate && seat.style.translate !== '0px 0px'), null, { timeout: 15000 });
      assert.ok(await page.locator('.screen-room > header #worlds[data-ff="portal"]').count(), 'and the portal is a caterpillar curled into a ring');
      assert.ok(await page.locator('.screen-room > main h1.sign[data-ff="sign"] > .ff-back').count(), 'and a field mouse holds the name up');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ff')].every((layer) => getComputedStyle(layer).pointerEvents === 'none' && layer.closest('[aria-hidden="true"]'))), true, 'their bodies cannot be pressed, and are not read out');
      assert.equal(await page.locator('.screen-room').getAttribute('data-ff-current'), null, 'the current has done its work');
      await having(210, true);
      assert.deepEqual(await kinds(), [], 'the meadow taken off: its folk go with it');
    }),
    check('the meadow: grey at the end of the bar until it is earned; then worn by every room, and taken off and put back at home', { storage: { ...ACCOUNT, 'home:tab:v1': 'lobby', 'correspondence:energy:v1': { earned: 30, spent: 0, boards: [] } } }, async (page) => {
      const room = '11111111-1111-4111-8111-111111111111';
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/room_get/, (route) => (route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ json: { id: room, name: 'Book club', code: 'K7M2QP', you: 0, members: ['Sam'], people: [{ name: 'Sam', avatar: '🦊', color: 1, left: false }], messages: [], games: [] }, headers: cors })));
      await page.goto(`${origin}/`);
      await page.waitForSelector('#home-energy:not([hidden])');
      assert.equal(await page.locator('#meadow').isDisabled(), true, 'not yet earned');
      assert.equal(await page.locator('#home-bar').getAttribute('aria-label'), 'Energy 30; the meadow at 70');
      assert.equal(Number(await page.locator('#home-bar .bar i').evaluate((i) => i.style.getPropertyValue('--fill'))), 30 / 70);
      assert.equal((await page.locator('#home-energy').innerText()).trim(), '', 'nothing written');
      await page.goto(`${origin}/room/?id=${room}`);
      await page.waitForSelector('#house:not([hidden])');
      assert.equal(await page.locator('.screen-room').evaluate((r) => r.classList.contains('meadow')), false, 'a room as it always was');
      const boxes = () => page.evaluate(() => [...document.querySelectorAll('.screen-room > :is(header, main) :is(button, a, input, textarea, h1, h2, .table, .rug, .seat)')]
        .filter((one) => one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return `${one.id || one.className} ${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`; }));
      const settled = () => page.evaluate(() => Promise.all(document.getAnimations().filter((one) => one.effect?.getComputedTiming().iterations !== Infinity).map((one) => one.finished.catch(() => {})))); // (the furniture settles as the room opens)
      await settled();
      const plain = await boxes();
      assert.ok(plain.length > 8, 'the room is all there to measure');
      await page.evaluate(() => localStorage.setItem('correspondence:energy:v1', JSON.stringify({ earned: 80, spent: 0, boards: [] })));
      await page.goto(`${origin}/room/?id=${room}`);
      await page.waitForSelector('#house:not([hidden])');
      assert.equal(await page.locator('.screen-room').evaluate((r) => r.classList.contains('meadow')), true, 'earned: the room wears the meadow');
      assert.equal(await page.locator('.meadow-bits .sun').isVisible(), true, 'the sun is out');
      await settled();
      const worn = await boxes();
      assert.deepEqual(worn.filter((one) => !plain.includes(one)), [], 'paint only: everything there is to press, and all that would move it, in the same place and the same size');
      assert.equal(worn.length, plain.length, 'and as many of them');
      await page.goto(`${origin}/`);
      await page.waitForSelector('#meadow[aria-pressed="true"]:not([disabled])');
      assert.equal(Number(await page.locator('#home-bar .bar i').evaluate((i) => i.style.getPropertyValue('--fill'))), 10 / 70, 'and the bar begins again');
      await page.locator('#meadow').click();
      assert.equal(await page.locator('#meadow').getAttribute('aria-pressed'), 'false', 'taken off');
      await page.goto(`${origin}/room/?id=${room}`);
      await page.waitForSelector('#house:not([hidden])');
      assert.equal(await page.locator('.screen-room').evaluate((r) => r.classList.contains('meadow')), false, 'and the room is as it was');
      assert.equal(await page.locator('.meadow-bits').isVisible(), false, 'nothing of the meadow there');
      await page.goto(`${origin}/`);
      await page.locator('#meadow').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('correspondence:meadow:v1')), null, 'put back on');
    }),
    // A board played together in a room: the first time, what is particular to playing together, in place of how to play
    // (and only the first time); and energy for every post found on it, by anyone, kept for that board.
    check('a game together: its own sheet the first time, and energy for every post found on the room\'s board', { storage: ACCOUNT }, async (page) => {
      const { generatePuzzle } = await import('../../postmarks/game.js');
      const size = 6;
      const made = generatePuzzle(size, 8);
      const cells = new Array(size * size).fill(0);
      for (const row of [1, 4]) cells[row * size + made.solution[row]] = 2;
      const id = '66666666-6666-4666-8666-666666666666';
      const room = '11111111-1111-4111-8111-111111111111';
      const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
      const view = { id, room, room_name: 'Book club', you: 0, people, players: ['Sam', 'Ada'], mode: 'coop', size, regions: made.regions, cells, hearts: 3, moves: 2, status: 'playing', last: { player: 1, type: 'guess', cell: 4 * size + made.solution[4], correct: true } };
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/(postmarks_get|room_get)/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const asked = route.request().url().match(/rpc\/(\w+)/)[1];
        return route.fulfill({ json: asked === 'postmarks_get' ? view : { id: room, name: 'Book club', you: 0, people, messages: [], games: [] }, headers: cors });
      });
      await page.goto(`${origin}/postmarks/?game=${id}`);
      await page.waitForSelector('dialog.together[open]');
      assert.equal(await page.locator('dialog.howto:not(.together)[open]').count(), 0, 'not how to play');
      assert.deepEqual((await page.locator('dialog.together .card p').allTextContents()).length, 3);
      await page.locator('dialog.together .start').click();
      assert.equal(await page.locator('#turn').isVisible(), true, 'the words of the turn stay');
      assert.equal(await page.locator('#energy').getAttribute('aria-label'), 'Energy 2; the meadow at 70', 'two posts found on the board, one of them by Ada');
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('correspondence:energy:v1')));
      assert.deepEqual(kept.boards, [{ b: `${6}:${'66666666-6666-4666-8666-666666666666'}`, p: 2, w: false }], 'kept for the room\'s board');
      await page.reload();
      await page.waitForSelector('#energy:not([hidden])');
      await sleep(800);
      assert.equal(await page.locator('dialog.together[open]').count(), 0, 'the sheet only the first time');
      assert.equal(await page.locator('#energy').getAttribute('aria-label'), 'Energy 2; the meadow at 70', 'and the same posts earn nothing again');
    }),
    // Whoever starts a game together has just read its cards, at the desk's first step: the game opens on its board,
    // and does not show them the same cards again. (Anybody else's first sight of the game still brings the sheet: above.)
    check('a game together, started at the desk: its cards were the desk\'s, and the game does not show them again', { storage: ACCOUNT }, async (page) => {
      const { generatePuzzle } = await import('../../postmarks/game.js');
      const id = '77777777-7777-4777-8777-777777777777';
      const room = '11111111-1111-4111-8111-111111111111';
      const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
      let started = null;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      await page.route(/supabase\.co\/rest\/v1\/rpc\/(postmarks_get|postmarks_start|room_get)/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const asked = route.request().url().match(/rpc\/(\w+)/)[1];
        const args = JSON.parse(route.request().postData());
        if (asked === 'room_get') return route.fulfill({ json: { id: room, name: 'Book club', code: 'K7M2QP', you: 0, people, messages: [], games: [] }, headers: cors });
        if (asked === 'postmarks_start') {
          const size = args.p_size;
          started = { id, room, room_name: 'Book club', you: 0, people, players: ['Sam', 'Ada'], mode: 'coop', size, regions: args.p_regions, cells: new Array(size * size).fill(0), hearts: 3, moves: 0, status: 'playing', last: null };
        }
        return route.fulfill({ json: started ?? { id, size: 6, regions: generatePuzzle(6, 8).regions }, headers: cors });
      });
      await page.goto(`${origin}/room/?id=${room}`);
      await page.locator('#modes [data-mode="coop"]').click();
      await page.waitForSelector('#desk-how:not([hidden]) .mode-cards li');
      assert.equal(await page.locator('#desk-how .mode-cards li').count(), 3, 'how a game together is played, read at the desk');
      await page.locator('#desk-next').click();
      await page.waitForSelector('#desk-board:not([hidden]) #preview-board svg');
      await page.locator('#phrase-form .start-phrase').click();
      await page.waitForSelector('#board > *');
      await sleep(800);
      assert.ok(started, 'the game was started');
      assert.equal(await page.locator('dialog.howto[open]').count(), 0, 'no sheet over the board: not the same cards again, nor how to play');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('postmarks:howto:v1'))), id, 'the game is kept as shown');
    }),
    // A board lost together can be tried again from its end: a new game for the whole room on the same board, which
    // opens on that board, without the cards of a game together over it (whoever asks for it has just played one).
    check('a game together, lost: tried again, the same board opens with no sheet over it', { storage: ACCOUNT }, async (page) => {
      const { generatePuzzle } = await import('../../postmarks/game.js');
      const size = 6;
      const made = generatePuzzle(size, 8);
      const id = '88888888-8888-4888-8888-888888888888';
      const room = '11111111-1111-4111-8111-111111111111';
      const people = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
      const view = { id, room, room_name: 'Book club', you: 0, people, players: ['Sam', 'Ada'], mode: 'coop', size, regions: made.regions, cells: new Array(size * size).fill(0), hearts: 1, moves: 2, status: 'playing', last: { player: 1, type: 'guess', cell: 0, correct: false } };
      const wrong = made.solution[2] === 0 ? 2 * size + 1 : 2 * size; // (a square in the third row with no post in it)
      const lost = { ...view, solution: made.solution, hearts: 0, moves: 3, status: 'lost', last: { player: 0, type: 'guess', cell: wrong, correct: false } };
      let moved = false;
      let again = null;
      const second = '99999999-9999-4999-8999-999999999999';
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const asked = [];
      await page.route(/supabase\.co\/rest\/v1\/rpc\/(\w+)/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const name = route.request().url().match(/rpc\/(\w+)/)[1];
        asked.push(name);
        if (name === 'room_get') return route.fulfill({ json: { id: room, name: 'Book club', you: 0, people, messages: [], games: [] }, headers: cors });
        if (name === 'postmarks_start') again = { ...view, id: second, hearts: 3, moves: 0, last: null };
        if (again) return route.fulfill({ json: again, headers: cors });
        return route.fulfill({ json: (moved ||= name === 'postmarks_play') ? lost : view, headers: cors }); // (the last heart goes with the move)
      });
      await page.goto(`${origin}/postmarks/?game=${id}`);
      await page.waitForSelector('dialog.together[open]');
      await page.locator('dialog.together .start').click();
      await page.locator(`#board .cell[data-cell="${wrong}"]`).dblclick();
      await page.locator('#submit:not([disabled])').click();
      await page.waitForSelector('dialog.finale.lost[open]', { timeout: 15000 });
      assert.equal(await page.locator('dialog.finale h2').textContent(), 'Out of hearts');
      assert.equal(await page.locator('dialog.finale button.again').textContent(), 'Try this board again');
      await page.locator('dialog.finale button.again').click();
      await page.waitForFunction((id) => location.search.includes(id), second);
      await page.waitForSelector('#board .cell[data-state="empty"]:not(.last)');
      await sleep(800);
      assert.equal(asked.filter((name) => name === 'postmarks_start').length, 1, 'a new game, started once');
      assert.equal(await page.locator('dialog[open]').count(), 0, 'and no sheet over its board');
    }),
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

  // The two worlds, after those too: their checks watch a passage frame by frame and copy the page while
  // they do, which is heavy, and with them beside the rest the machine that checks pull requests was busy
  // enough for checks that must catch a moment (the radio's, the walk's) to miss it.
  results.push(...await Promise.all([
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
      // (at rest in the cartoon, soft and low, with no glow, as the room is: nothing louder than what is waiting on you)
      const ringPaint = () => portal.evaluate((el) => ({ filter: getComputedStyle(el).filter, glow: getComputedStyle(el, '::before').boxShadow }));
      const resting = await ringPaint();
      assert.match(resting.filter, /saturate\(0\.42\)/, `at rest in the cartoon the ring's colours are soft (${JSON.stringify(resting)})`);
      assert.equal((resting.glow.match(/rgb/g) ?? []).length, 1, `and it has no glow round it, only its rim (${resting.glow})`);
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
      await sleep(600);
      assert.equal((await ringPaint()).filter, 'none', 'and inside, where it is the way back and the one colour in black and white, its colours are full');
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
      // (the night's hidden mark lies still while the worlds cross: its copy, in the copy of the page, is never taken for
      // something it must keep clear of; and that copy is the mark as it is, kept so without copying the page again)
      const lying = await w.mark();
      assert.equal(lying.page?.hidden, false, `the night's mark has a place at the top of the room (${JSON.stringify(lying)})`);
      if (await page.evaluate(() => Boolean(document.querySelector('.screen-room > .worlds-copy')))) assert.deepEqual(lying.copy, lying.page, 'its copy is the mark as it is');
      await page.keyboard.type('across ', { delay: 60 });
      const crossed = await w.mark();
      assert.deepEqual([crossed.page.style, crossed.page.hidden], [lying.page.style, lying.page.hidden], 'the night\'s mark has not moved while the worlds cross');
      if (crossed.copy) assert.deepEqual(crossed.copy, crossed.page, 'and its copy is still the mark as it is');
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
      assert.equal(await w.filled(), 0, 'and the page was not copied again for the typing, nor for the room\'s poll putting back what was there, nor for the night\'s mark');
      const after = await w.mark();
      assert.deepEqual([after.page.style, after.page.hidden], [lying.page.style, lying.page.hidden], 'and the night\'s mark is where it was');
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
      assert.deepEqual(await ringPaint(), resting, 'and the ring rests again, soft');

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

    check('two worlds: the tiles that start a game, and what is above and beside them, keep their size in both worlds, whatever fonts the phone has', { storage: ACCOUNT, reducedMotion: 'reduce' }, async (page) => {
      // On GitHub's machine the tiles' words wrapped onto a second line in the room and not in the drama, which set
      // them in another type: the tile changed height under a finger. A wider face than ours is put on them here, as
      // another phone's fonts might be; whatever the face, both worlds must wrap the words the same.
      const w = await worldsHelpers(page);
      await page.addStyleTag({ content: '.screen-room .house :is(h2, .mode strong, .share .code) { font-size: 1.05rem; letter-spacing: 0.2em; } .screen-room .house { --font-typewriter: monospace; }' });
      const calm = await w.boxes();
      await page.evaluate(() => document.querySelector('.screen-room > header #worlds').click());
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious', null, { timeout: 8000 });
      w.same(calm, await w.boxes(), 'in the drama, with a wider face');
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

    // The shelf: each game on the table a wide card, the whole of it the way into its game, with its board large and a
    // round play button at its end. Only the first game waiting on you is lit and breathes, so a full table is never
    // several breaths at once; its button is the one red mark a game has (no seal at the board's corner). Pressed, a
    // card goes down into the table (and with reduced motion only deepens); tidying, the whole card is the way to put it away.
    check('the shelf: one tap anywhere on a card plays it; only the first game waiting on you is lit and breathes; a card pressed goes down; tidying, a tap anywhere on a card asks to put it away', { storage: ACCOUNT }, async (page) => {
      await worldsHelpers(page);
      const cards = () => page.locator('#games li').evaluateAll((all) => all.map((li) => {
        const play = li.querySelector('.play');
        const board = li.querySelector('.mini');
        return {
          state: li.dataset.state, lit: 'lit' in li.dataset,
          breathing: play.getAnimations().some((one) => one.animationName === 'play-breathe'),
          button: getComputedStyle(play).backgroundColor, board: Math.round(board.getBoundingClientRect().width),
          corner: getComputedStyle(board, '::after').display,
          pressed: 'pressed' in li.dataset, moved: [getComputedStyle(li).translate, getComputedStyle(li).scale], shadow: getComputedStyle(li).boxShadow,
        };
      }));
      // (where a card settles once pressed: its transitions are run to their end before it is read, since a page under
      // load can draw no frame for a while and a transition read by the clock may not yet have begun to move)
      const settled = () => page.locator('#games li').evaluateAll((all) => all.forEach((li) => li.getAnimations({ subtree: true }).filter((one) => one instanceof CSSTransition).forEach((one) => one.finish())));
      const rest = await cards();
      assert.deepEqual(rest.map(({ state, lit, breathing }) => [state, lit, breathing]), [['go', true, true], ['go', false, false], ['won', false, false]], 'the first game waiting on you is lit and breathes; the other waiting on you is still');
      assert.equal(new Set(rest.map((one) => one.button)).size, 3, `the lit button, the still seal-tinted one, and a quiet one are each their own colour (${rest.map((one) => one.button)})`);
      assert.deepEqual(rest.filter((one) => one.state === 'go').map((one) => one.corner), ['none', 'none'], 'no seal at a board\'s corner: the play button is the seal');
      assert.ok(rest.every((one) => one.board >= 88) && rest[0].board > rest[1].board, `the boards are large, and the lit one larger (${rest.map((one) => one.board)})`);
      // (the card's accessible name says the game, who is in it, and where it stands)
      assert.deepEqual(await page.locator('#games a.game').evaluateAll((all) => all.map((a) => a.getAttribute('aria-label'))), [
        'Together 6 × 6, with Ada and you: your move, 1 of 6 posts found, 3 hearts left', 'Time trial 6 × 6, with Ada: not started, 1 finished', 'Together 6 × 6, with Ada and you: solved in 2 turns, 3 hearts left']);
      // the whole card is the way in, or the way to put it away: no part of it is not
      const covers = () => page.locator('#games li').evaluateAll((all) => all.map((li) => {
        const way = [...li.querySelectorAll('a.game, .delete')].find((one) => one.checkVisibility());
        const [a, b] = [li, way].map((one) => one.getBoundingClientRect());
        return [a.left, a.top, a.width, a.height].map((n, i) => Math.abs(n - [b.left, b.top, b.width, b.height][i]) < 1).every(Boolean);
      }));
      assert.deepEqual(await covers(), [true, true, true]);
      const middle = async (n, across = 0.45) => {
        const box = await page.locator('#games li').nth(n).boundingBox();
        return [box.x + box.width * across, box.y + box.height / 2];
      };
      // (a finger put down on a card: on the screen, where nothing else lies over that point; with the phone's own
      // fonts the page can be long enough that the sheet, going, leaves it scrolled from where it was)
      const onCard = async (n, across) => {
        await page.locator('#games li').nth(n).scrollIntoViewIfNeeded(); // (out of the window, a point is on nothing)
        const at = await middle(n, across);
        await page.waitForFunction(([x, y, i]) => document.elementFromPoint(x, y)?.closest('#games li') === document.querySelectorAll('#games li')[i], [...at, n], { timeout: 5000 });
        return at;
      };
      // with reduced motion, a card pressed does not move: its colour deepens and its shadow is drawn in
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal((await cards())[0].breathing, false, 'and with reduced motion nothing breathes');
      await page.mouse.move(...await onCard(1));
      await page.mouse.down();
      await sleep(300);
      await settled();
      let now = await cards();
      assert.equal(now[1].pressed, true);
      assert.deepEqual(now[1].moved, ['none', 'none'], 'with reduced motion, it does not move');
      assert.notEqual(now[1].shadow, rest[1].shadow, 'its shadow is drawn in');
      await page.mouse.move(4, 4);
      await page.mouse.up();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await sleep(400);
      assert.equal((await cards()).some((one) => one.pressed), false, 'let go, it comes back up');
      // tidying: a tap anywhere on a card (here its board) asks to put it away
      await page.locator('#tidy').click();
      assert.deepEqual(await covers(), [true, true, true]);
      await page.mouse.click(...await middle(1, 0.12));
      await page.waitForSelector('dialog.ask[open] .picture svg');
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.table.tidy').count(), 0);
      // pressed, a card goes down a little into the table, its shadow drawn in; and one tap, nowhere near its button, plays it
      await page.mouse.move(...await onCard(0));
      await page.mouse.down();
      await sleep(300);
      await settled();
      now = await cards();
      assert.equal(now[0].pressed, true, 'pressed');
      assert.deepEqual(now[0].moved, ['0px 1.92px', '0.975'], 'it goes down a little');
      assert.equal(now[0].breathing, false, 'and holds its breath');
      assert.notEqual(now[0].shadow, rest[0].shadow, 'its shadow is drawn in');
      await page.mouse.up();
      await page.waitForURL(/\/postmarks\/\?game=11111111-/, { timeout: 5000 });
    }),

    // The two worlds on the quiet room: the portal is the way in and out as it was, and the drama keeps its look: every
    // game on the table a photograph in black and white, the one that is yours still nearest; the tiles steel drawers.
    check('two worlds, on the quiet room: the portal steps in and back out; inside, every game is a photograph and what is yours is still nearest; the chat, at rest, shows whole notes in either world', { storage: ACCOUNT }, async (page) => {
      const w = await worldsHelpers(page);
      const portal = page.locator('.screen-room > header #worlds');
      // (the chat at rest at its foot: no note is cut across by its top edge, where it fades)
      const cut = () => page.evaluate(() => {
        const log = document.querySelector('.screen-room > main .chat-log');
        const edge = log.getBoundingClientRect().top;
        const shown = [...log.children].filter((li) => li.getClientRects().length).map((li) => li.getBoundingClientRect());
        return { cut: shown.filter((box) => box.top < edge - 0.5 && box.bottom > edge + 0.5).length, over: log.scrollHeight > log.clientHeight + 1 };
      });
      assert.deepEqual(await cut(), { cut: 0, over: true }, 'outside, the chat runs over and is cut between notes');
      const look = () => page.evaluate(() => {
        const boards = [...document.querySelectorAll('.screen-room > main #games li')].map((li) => ({ state: li.dataset.state, paper: getComputedStyle(li.querySelector('.mini')).backgroundColor, photo: getComputedStyle(li.querySelector('.mini svg')).filter, tilt: getComputedStyle(li.querySelector('.mini')).rotate }));
        const tile = getComputedStyle(document.querySelector('.screen-room > main #modes .mode')).backgroundImage;
        return { boards, tile };
      });
      const outside = await look();
      assert.deepEqual(outside.boards.map((one) => one.state), ['go', 'go', 'won'], 'what is yours lies nearest');
      assert.ok(outside.boards.every((one) => one.paper !== 'rgb(235, 231, 222)' && !/grayscale/.test(one.photo) && one.tilt === 'none'), `outside, the boards are the room's own, lying straight (${JSON.stringify(outside.boards)})`);
      await w.watch();
      await portal.click();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'serious' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 5000 });
      assert.equal(await portal.getAttribute('aria-pressed'), 'true');
      const inside = await look();
      assert.deepEqual(inside.boards.map((one) => one.state), ['go', 'go', 'won'], 'inside, what is yours still lies nearest');
      assert.ok(inside.boards.every((one) => one.paper === 'rgb(235, 231, 222)' && /grayscale\(1\)/.test(one.photo)), `inside, every game is a photograph on its paper (${JSON.stringify(inside.boards)})`);
      assert.ok(inside.boards.every((one) => one.tilt !== 'none') && new Set(inside.boards.map((one) => one.tilt)).size > 1, `put down a little askew, each its own way (${JSON.stringify(inside.boards.map((one) => one.tilt))})`);
      assert.match(inside.tile, /gradient/, 'and the tiles are steel');
      assert.deepEqual(await cut(), { cut: 0, over: true }, 'inside, the chat the same');
      await portal.click();
      await page.waitForFunction(() => document.querySelector('.screen-room').dataset.world === 'playful' && !document.querySelector('.screen-room').dataset.passage, null, { timeout: 5000 });
      assert.deepEqual(await w.ways(), ['in', 'out'], 'in through the portal, and back out through it');
      await sleep(300);
      assert.equal(await w.left(), 0, 'back outside, nothing of the other world is left over');
      assert.deepEqual(await look(), outside, 'and the room is as it was');
      // to the desk and back: the chat, hidden while the desk is out, is fitted again as it was left, between notes
      await page.locator('#modes [data-mode="phrase"]').click();
      await page.waitForSelector('#compose:not([hidden])');
      await sleep(300);
      await page.locator('#phrase-back').click();
      await page.waitForSelector('.screen-room > main #room:not([hidden])');
      await sleep(400);
      assert.deepEqual(await cut(), { cut: 0, over: true }, 'back from the desk, the chat is cut between notes again');
    }),
  ]));

  // The shelf on the phones it is made for, alone (it opens many windows): from one game to ten, nothing runs off the
  // side, nothing to press is under 44 by 44 or lies over another, and no text is under 11px.
  results.push(await check('the shelf, on a mini (in Safari and installed), a Pro and a Pro Max, with 1 to 10 games: nothing runs off the side, and everything to press is at least 44 by 44', {}, async () => {
    const phone = require('./phone.cjs');
    const wrong = [];
    for (const name of ['mini-safari', 'mini-app', 'pro-app', 'max-app']) {
      for (let count = 1; count <= 10; count++) {
        const games = Array.from({ length: count }, (_, i) => phone.listed({
          id: `${String(i % 10).repeat(8)}-6666-4666-8666-66666666666${i % 10}`, mode: ['coop', 'trial', 'phrase'][i % 3], size: 5 + (i % 5),
          last_player: i % 2, status: i % 4 === 3 ? 'won' : 'playing', mine: i % 3 === 1 && i % 2 ? 'playing' : null,
        }));
        const { context, page, errors } = await phone.open(browser, name, { storage: phone.ACCOUNT, server: (call, args) => (call === 'room_get' ? phone.roomSays(args.p_room, 'Book club', games) : undefined) });
        await page.goto(`${origin}/room/?id=${phone.ROOM}`);
        await page.waitForFunction((n) => document.querySelectorAll('#games li').length === n, count, { timeout: 15000 });
        await sleep(700);
        const seen = await phone.measure(page);
        const at = `${name}, ${count} ${count === 1 ? 'game' : 'games'}`;
        if (seen.sideways) wrong.push(`${at}: the page scrolls sideways`);
        for (const one of seen.wide) wrong.push(`${at}: sticks out: ${one.what}`);
        for (const one of seen.press) if (one.w < 44 || one.h < 44) wrong.push(`${at}: too small to press: ${one.what} is ${one.w} by ${one.h}`);
        for (const one of seen.overlapping) wrong.push(`${at}: overlap: ${one.a} and ${one.b}`);
        for (const one of seen.tinyText) wrong.push(`${at}: text too small: ${one.what}`);
        for (const one of errors) wrong.push(`${at}: ${one}`);
        await context.close();
      }
    }
    assert.deepEqual(wrong, []);
  }));

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
      // ring, all the way round, and of points just beyond it (the way a passage faces, or else below it), how many
      // each covers.
      // (Not points on the seam itself. The copy and the film are cut along the seam's two edges, which meet at the
      // middle of the portal, and their shapes are written to a tenth of a pixel: so along an edge, inside the ring,
      // a hair of a world less than a tenth of a pixel wide may lie over the portal, or be missing beside it. The
      // points once stood at fixed angles, 0.3 radians either side of the way the passage faces; and 600 ms in, the
      // seam is from 0.24 to 0.35 radians open each side, by the way it happens to lean and where the look falls
      // between two frames: now and then its edge lay under them, and the hair was counted as the portal covered.
      // Points within 0.3 px of where the shapes are cut are left out, where the seam is at that look, and no others.)
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
        // where the shapes are cut, from the middle of the portal: the seam's two edges; and, where a part is more than
        // half a turn and so is made of two pieces, the line they join along (room/worlds.js, within)
        const cuts = edges.length === 2 ? [mid - half, mid + half, half > Math.PI / 2 ? mid : mid + Math.PI] : [];
        const clear = ([x, y]) => cuts.every((a) => {
          const [along, off] = [(x - o.x) * Math.cos(a) + (y - o.y) * Math.sin(a), (x - o.x) * Math.sin(a) - (y - o.y) * Math.cos(a)];
          return along < 0 || Math.abs(off) > 0.3;
        });
        // (the way the passage faces and 0.3 radians either side of it, as ever; and eleven more places round the ring)
        const round = [-0.3, 0, 0.3, ...Array.from({ length: 11 }, (_, i) => ((i + 1) * Math.PI) / 6 + 0.1)];
        const inner = [0.35, 0.65, 0.9].flatMap((k) => round.map((da) => at(k * o.r, mid + da))).filter(clear);
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
      // the night's hidden mark (penny/tags.js) on the page, where it lies and whether it is shown; and its twin in the copy
      mark: () => page.evaluate(() => {
        const at = (one) => one && { style: one.getAttribute('style'), hidden: one.hidden, glint: one.classList.contains('glint') };
        return { page: at(document.querySelector('.screen-room > main .tag-hidden')), copy: at(document.querySelector('.screen-room > .worlds-copy .tag-hidden')) };
      }),
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
          assert.ok(points.inner >= 36, `${way}, ${one.at} ms: the portal was looked at all the way round (${JSON.stringify(one.holed)})`);
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
      // (nor the night's hidden mark, put down on its own clock: penny/tags.js)
      hear: async () => {
        const marks = await page.evaluate(() => [...document.querySelectorAll('.screen-room .tag-hidden')].map((mark) => `- button "${mark.getAttribute('aria-label')}"`));
        return (await page.locator('.screen-room').ariaSnapshot()).split('\n').filter((line) => !marks.some((mark) => line.trimStart().startsWith(mark))).join('\n')
          .replace(/(button "The other world")(?: \[pressed\])?/, '$1')
          .replace(/( *)- textbox "Message"[^\n]*\n(?:\1 +[^\n]*\n)*/, (all, indent) => `${indent}- textbox "Message"\n`);
      },
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
        // (not the night's hidden mark: penny/tags.js puts it down on its own clock, once a screen has settled and
        // again after a scroll, wherever there is room, and holds it to the phone's rules in its own checks)
        .filter((el) => !el.closest('.tag-hidden'))
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
