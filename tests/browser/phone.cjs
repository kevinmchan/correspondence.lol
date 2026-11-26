// The app on an iPhone: what the phone suites are built from.
//
// The interface is designed for an iPhone Pro, and has to go on working on a
// Pro Max and on a mini. A mini is where it is tightest, so that is the size
// with a suite of its own (mini.e2e.cjs); the same suite can be pointed at any
// of the others (PHONES=pro-app node tests/browser/mini.e2e.cjs).
//
// There is no WebKit here, only Chromium, so what is checked is the layout an
// iPhone's screen gives, not Safari's engine: the size of the window, touch, a
// phone's viewport, and the insets of the notch or Dynamic Island and of the
// home bar, which Chromium can be told to pretend.
//
// Each phone comes two ways, because the app is used two ways. "safari": the
// page inside Safari with its bars showing, the least room there ever is; the
// bars cover the insets, so there are none. "app": installed to the Home
// Screen, the whole screen, with the insets.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { quietSocket } = require('./socket.cjs');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain' };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// In CSS pixels.
const PHONES = {
  'mini-safari': { phone: 'iPhone 13 mini, in Safari', width: 375, height: 629, insets: null, installed: false },
  'mini-app': { phone: 'iPhone 13 mini, installed', width: 375, height: 812, insets: { top: 50, bottom: 34 }, installed: true },
  'pro-safari': { phone: 'iPhone 15 Pro, in Safari', width: 393, height: 659, insets: null, installed: false },
  'pro-app': { phone: 'iPhone 15 Pro, installed', width: 393, height: 852, insets: { top: 59, bottom: 34 }, installed: true },
  'pro17-app': { phone: 'iPhone 17 Pro, installed', width: 402, height: 874, insets: { top: 62, bottom: 34 }, installed: true },
  'max-safari': { phone: 'iPhone 15 Pro Max, in Safari', width: 430, height: 739, insets: null, installed: false },
  'max-app': { phone: 'iPhone 17 Pro Max, installed', width: 440, height: 956, insets: { top: 62, bottom: 34 }, installed: true },
};

// Serve the repository itself, as GitHub Pages does. Resolves to { origin, close }.
function serve() {
  const server = http.createServer((request, response) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) return response.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

// Somebody with an account and two rooms, as the app keeps them on the device.
const ROOM = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = {
  'correspondence:name:v1': 'Sam',
  'correspondence:rooms:v1': [{ id: ROOM, name: 'Book club', at: 1795000000000 }, { id: '22222222-2222-4222-8222-222222222222', name: 'Family', at: 1795000000000 }],
};
const PEOPLE = [{ name: 'Sam', avatar: '🦊', color: 1, left: false }, { name: 'Ada', avatar: '🐼', color: 2, left: false }];
// A game as a room lists it (rooms.room_view, in supabase/migrations).
const listed = (over) => ({ id: '33333333-3333-4333-8333-333333333333', kind: 'postmarks', mode: 'coop', size: 5, status: 'playing', hearts: 3, moves: 2, found: 1, last_player: null, phrase_by: null, finished: 0, mine: null, updated_at: '2026-11-24T10:00:00Z', ...over });
// What the server says of a room (room_get).
const roomSays = (id, name, games = []) => ({ id, name, code: 'K7M2QP', you: 0, members: PEOPLE.map((one) => one.name), people: PEOPLE, messages: [], games });

// Penny's Radio as somebody has played it, kept as jam/taste.js keeps it on the
// device (jam:taste:v1). The picks are made by a simulated taster, as in
// tests/taste.test.js: somebody who likes a fast tempo, drums, a low tune and
// no silences (as much as `taste` says: 0 is no taste at all), and leans a
// little towards the station already kept. They pick until enough(standing,
// state) says so (standing() of jam/taste-model.js, after each pick), and
// never more than `most` times. With `restart`, they then start over (the
// stake carries on) and make that many picks more. The same seed, the same radio.
async function radioPlayed(enough, { seed = 6, most = 400, taste = 1, restart = null } = {}) {
  const { FEATURES, begin, choose, features, standing, startOver } = await import('../../jam/taste-model.js');
  const { encode } = await import('../../jam/beat.js');
  const seeded = (start) => {
    let a = start >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const likes = [];
  for (const [name, much] of [['tempo', 4], ['drums', 3], ['bellsHigh', -4], ['space', -3]]) likes[FEATURES.findIndex((one) => one.key === name)] = much * taste;
  const like = (beat) => features(beat).reduce((sum, value, i) => sum + value * (likes[i] ?? 0), 0);
  const [random, own] = [seeded(seed), seeded(seed + 1000)];
  const pick = (state) => {
    const { front, back, reigning } = state.current;
    const z = like(front) - like(back) + (reigning === 'front' ? 0.3 : reigning === 'back' ? -0.3 : 0);
    choose(state, own() < 1 / (1 + Math.exp(-z)) ? 'front' : 'back', random);
  };
  let state = begin(random);
  for (let i = 0; i < most && !enough(standing(state.trials, state.carried), state); i++) pick(state);
  if (restart !== null) {
    state = startOver(state, random, { at: 1795000000000, version: 'v1.1.60' });
    for (let i = 0; i < restart; i++) pick(state);
  }
  const pack = (pair) => ({ ...pair, front: encode(pair.front), back: encode(pair.back), phantom: encode(pair.phantom) });
  return { v: 1, streak: state.streak, retired: state.retired.map(encode), trials: state.trials.map(pack), current: pack(state.current), carried: state.carried, restarts: state.restarts };
}

// A page of the app on one of the phones.
//   storage: what is on the device ({ key: value }), put there once
//   server(name, args): what the server answers to a call of its function `name`;
//     undefined is no answer at all, as when offline (which is the default)
//   reducedMotion: 'reduce' for somebody who has asked for less of it
async function open(browser, name, { storage = {}, server = () => undefined, reducedMotion = 'no-preference' } = {}) {
  const phone = PHONES[name];
  if (!phone) throw new Error(`No such phone: ${name}. There are: ${Object.keys(PHONES).join(', ')}`);
  const context = await browser.newContext({ viewport: { width: phone.width, height: phone.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE, reducedMotion });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await context.route(/supabase\.co/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const call = request.url().match(/\/rpc\/(\w+)/)?.[1];
    let args = null;
    try { args = JSON.parse(request.postData() ?? 'null'); } catch { /* not ours to read */ }
    const answer = call ? await server(call, args) : undefined;
    return answer === undefined ? route.abort() : route.fulfill({ json: answer, headers: cors });
  });
  await quietSocket(context); // (the live socket is answered here, not by the service)
  await context.addInitScript(({ store, installed }) => {
    if (installed) Object.defineProperty(navigator, 'standalone', { get: () => true }); // opened from the Home Screen: nothing offers to install it
    if (sessionStorage.getItem('phone:seeded')) return; // once a window: a reload must keep what the app has saved
    sessionStorage.setItem('phone:seeded', '1');
    for (const [key, value] of Object.entries(store)) localStorage.setItem(key, JSON.stringify(value));
  }, { store: storage, installed: phone.installed });
  const page = await context.newPage();
  if (phone.insets) {
    const devtools = await context.newCDPSession(page);
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: phone.insets.top, bottom: phone.insets.bottom, left: 0, right: 0 } });
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, phone: { name, ...phone }, errors };
}

// What is on the screen now, measured. `ignore` is a selector for things that
// are not the page's own (Penny's layer, the faint map behind) or are meant to
// run off the screen.
//   sideways: whether the page can be scrolled sideways
//   wide: what sticks out past the left or right edge
//   press: everything there is to press that can be seen, with where and how big
//   overlapping: pairs of things to press whose boxes overlap
//   unsafe: things to press that lie under the notch or the home bar and cannot
//     be brought out from under it: fixed to the window there, or at the very
//     top or bottom of the page, where no scrolling moves them clear
//   tinyText: text under 11px;  smallFields: text fields under 16px (Safari zooms the page when one is tapped)
//   clipped: text cut off by its own box
async function measure(page, { insets = null, ignore = '.pal, .map-far, .sr-only, [aria-hidden="true"]' } = {}) {
  return page.evaluate(({ safe, skip }) => {
    const say = (el) => {
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      const classes = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${classes}${label ? ` "${label}"` : ''}`;
    };
    const seen = (el) => {
      if (el.closest('template, .screen.leaving, [inert]') || (skip && el.closest(skip))) return false; // (inert: out of reach, as under a sheet)
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return false;
      for (let up = el; up; up = up.parentElement) {
        const style = getComputedStyle(up);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        // scrolled out of sight inside a box that scrolls by itself (a chat's log): not there to be pressed or read
        if (up !== el && up !== document.body && up !== document.documentElement && /auto|scroll|hidden|clip/.test(style.overflowY + style.overflowX)) {
          const frame = up.getBoundingClientRect();
          if (box.bottom < frame.top + 1 || box.top > frame.bottom - 1 || box.right < frame.left + 1 || box.left > frame.right - 1) return false;
        }
      }
      return true;
    };
    const place = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const hasText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    const [W, H] = [innerWidth, innerHeight];
    // (a sheet that is open is all there is to press: what is under it is out of reach)
    const sheet = [...document.querySelectorAll('dialog[open]')].pop();
    const within = sheet ?? document.body;
    const all = [...within.querySelectorAll('*')].filter(seen);
    const press = all.filter((el) => el.matches('a[href], button:not(:disabled), input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="radio"], [tabindex]:not([tabindex="-1"])'));
    const out = {
      screen: document.querySelector('#screens .screen:not(.leaving)')?.className.replace(/\s*(opening|page|entering|forth|back)\b/g, '') ?? null,
      width: W, height: H, pageHeight: document.scrollingElement.scrollHeight,
      sideways: document.scrollingElement.scrollWidth > W + 1,
      scrolls: document.scrollingElement.scrollHeight > H + 1,
      // (what is drawn inside a picture may run off its edges: the picture itself is what is held to the screen)
      wide: all.filter((el) => { const r = el.getBoundingClientRect(); return (r.right > W + 1 || r.left < -1) && !(el.ownerSVGElement); }).slice(0, 10).map((el) => ({ what: say(el), ...place(el) })),
      press: press.map((el) => ({ what: say(el), ...place(el) })),
      overlapping: [], unsafe: [],
      tinyText: all.filter((el) => hasText(el) && parseFloat(getComputedStyle(el).fontSize) < 11).slice(0, 10).map((el) => ({ what: say(el), px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 })),
      smallFields: all.filter((el) => el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select') && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => ({ what: say(el), px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 })),
      clipped: all.filter((el) => hasText(el) && el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(getComputedStyle(el).overflowX)).slice(0, 10).map((el) => ({ what: say(el), ...place(el) })),
    };
    for (let i = 0; i < press.length; i++) {
      const a = press[i].getBoundingClientRect();
      if (safe) {
        let fixed = false;
        for (let up = press[i]; up && !fixed; up = up.parentElement) fixed = getComputedStyle(up).position === 'fixed';
        const page = document.scrollingElement;
        // where it is in the window if fixed there; otherwise where it is on the page, whose ends are what cannot be scrolled clear
        const [top, bottom, end] = fixed ? [a.top, a.bottom, H] : [a.top + page.scrollTop, a.bottom + page.scrollTop, Math.max(page.scrollHeight, H)];
        if (top < safe.top - 1 || bottom > end - safe.bottom + 1) out.unsafe.push({ what: say(press[i]), ...place(press[i]) });
      }
      for (let j = i + 1; j < press.length; j++) {
        if (press[i].contains(press[j]) || press[j].contains(press[i])) continue;
        const b = press[j].getBoundingClientRect();
        const [across, down] = [Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)];
        if (across > 2 && down > 2 && out.overlapping.length < 10) out.overlapping.push({ a: say(press[i]), b: say(press[j]), by: `${Math.round(across)}x${Math.round(down)}` });
      }
    }
    return out;
  }, { safe: insets, skip: ignore });
}

// What "every phone" means (PHONES=all): the smallest and the largest, each both ways. What is right at both ends has
// been right in between; the Pros can still be asked for by name (the owner's choice, 26 November 2026).
const ENDS = ['mini-safari', 'mini-app', 'max-safari', 'max-app'];

module.exports = { ROOT, PHONES, ENDS, serve, open, measure, ACCOUNT, ROOM, PEOPLE, listed, roomSays, radioPlayed };
