import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { HOME, PREVIEW, REELS, SITE, preview } from '../reels/reels.js';

// The app is one page, served at several addresses so that each opens directly.
// The copies are made with `npm run shell`; this catches a forgotten run.
test('every address serves the same page', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const copy of ['../room/index.html', '../postmarks/index.html', '../jam/index.html']) {
    assert.equal(readFileSync(new URL(copy, import.meta.url), 'utf8'), shell, `${copy} differs from index.html: run npm run shell`);
  }
  // a reel's page is the same page, but for what a link to it shows (reels/reels.js)
  for (const reel of REELS) {
    const own = readFileSync(new URL(`..${reel.path}index.html`, import.meta.url), 'utf8');
    assert.equal(own, shell.replace(PREVIEW, preview(reel)), `${reel.path}index.html is not index.html with its own preview: run npm run shell`);
  }
});

// A link to the app, or to a reel, shows a picture, a title and a line: a messaging app reads them from the page at
// that address (it does not run the app). Each says its own address, and its picture is there, at the size it says,
// and small enough for WhatsApp to show (which shows none over about 300 KB).
test('a link to the app, or to each reel, shows its own picture, title and line', () => {
  for (const one of [HOME, ...REELS]) {
    const page = readFileSync(new URL(`..${one.path}index.html`, import.meta.url), 'utf8');
    const tag = (property) => page.match(new RegExp(`<meta property="og:${property}" content="([^"]*)">`))?.[1];
    assert.equal(tag('url'), SITE + one.path, `${one.path}: its own address`);
    assert.equal(tag('title'), one.title, `${one.path}: its title`);
    assert.equal(tag('description'), one.description, `${one.path}: its line`);
    assert.equal(tag('image'), SITE + one.image, `${one.path}: its picture, whole address and all`);
    const picture = new URL(`..${one.image}`, import.meta.url);
    assert.ok(existsSync(picture), `${one.image} is there`);
    const bytes = readFileSync(picture);
    assert.ok(bytes.length < 300 * 1024, `${one.image} is under 300 KB (it is ${Math.round(bytes.length / 1024)})`);
    const size = one.image.endsWith('.png') ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : jpegSize(bytes);
    assert.deepEqual(size, [1200, 630], `${one.image} is 1200 by 630`);
  }
});
// (a JPEG's size, from its frame header)
function jpegSize(bytes) {
  for (let at = 2; at < bytes.length;) {
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    at += 2 + length;
  }
  return null;
}

test('the page has a template for each screen', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const name of ['home', 'open', 'join', 'hello', 'office', 'slow', 'walk', 'sky', 'reel', 'room', 'game', 'jam', 'taste']) assert.ok(shell.includes(`<template id="screen-${name}">`), name);
});

// The version names the offline cache and is shown on the home page. A release
// once went out with this file empty: the page showed nothing, and the cache
// was named after nothing.
test('the app has a version', () => {
  const script = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
  assert.match(script, /^self\.APP_VERSION = 'v\d+\.\d+\.\d+';$/m);
});

// --- What the page is made of ---------------------------------------------------------
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Every stylesheet the page links, in the order it links them, without its comments.
const sheets = () => [...read('index.html').matchAll(/<link rel="stylesheet" href="\/([^"]+)">/g)].map(([, file]) => ({ file, css: read(file).replace(/\/\*[\s\S]*?\*\//g, '') }));
const animations = () => {
  const named = new Map(); // a name, and the files that have an animation of that name
  for (const { file, css } of sheets()) {
    for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) named.set(name, [...(named.get(name) ?? []), file]);
  }
  return named;
};

// To the browser the page's stylesheets are one sheet: a second animation of
// a name takes the place of the first, everywhere, and nothing says so. The
// game's letters once arrived under the name the page itself arrives by, and
// its finale hopped under Penny's. So every screen the app opened on spun into
// place the way a letter does, and Penny had never hopped the way it is drawn to.
test('no two animations have the same name', () => {
  const twice = [...animations()].filter(([, files]) => files.length > 1).map(([name, files]) => `${name} (${files.join(', ')})`);
  assert.deepEqual(twice, []);
});

// And an animation asked for by a name that nothing has is no animation at
// all: nothing says so either. Nor is there an animation that nothing asks
// for: one left over is either dead, or the rule that was to ask for it is
// broken. (What is not a name: a time, a count, one of the words below,
// anything in brackets, or !important.)
const NOT_NAMES = new Set('ease ease-in ease-out ease-in-out linear step-start step-end infinite normal reverse alternate alternate-reverse none forwards backwards both running paused inherit initial unset revert'.split(' '));
test('every animation asked for is one there is, and every one there is is asked for', () => {
  const named = animations();
  assert.ok(named.size > 100, 'the animations were found');
  const asked = new Map();
  for (const { file, css } of sheets()) {
    for (const [, value] of css.matchAll(/[;{\s]animation(?:-name)?\s*:\s*([^;}]+)/g)) {
      let plain = value.replace(/!\s*important/g, ' '); // a priority, never a name
      while (/\([^()]*\)/.test(plain)) plain = plain.replace(/[\w-]*\([^()]*\)/g, ' '); // var(…), calc(…), cubic-bezier(…)
      for (const word of plain.split(/[\s,]+/)) {
        if (word && !NOT_NAMES.has(word) && !/^[-+]?[\d.]+(m?s)?$/.test(word)) asked.set(word, file);
      }
    }
  }
  assert.ok(asked.size > 100, 'what is asked for was found');
  assert.deepEqual([...asked].filter(([name]) => !named.has(name)).map(([name, file]) => `${name} (${file})`), [], 'asked for, and there is none');
  assert.deepEqual([...named].filter(([name]) => !asked.has(name)).map(([name, files]) => `${name} (${files.join(', ')})`), [], 'there, and nothing asks for it');
});

// Offline, the app is what the service worker put by when it was installed
// (sw.js): nothing else. So everything the page loads has to be on that list:
// its stylesheets and its scripts, and every script those bring in, however
// far down. A file left off the list is missed by nobody until the day they
// have no signal. And every file on the list has to be there to be fetched:
// with one of them missing, none of it is kept.
test('everything the app loads is kept for offline, and everything kept is there', () => {
  const kept = [...read('sw.js').match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(([, url]) => url);
  assert.equal(new Set(kept).size, kept.length, 'nothing is on the list twice');
  const fileOf = (url) => new URL(`..${url}${url.endsWith('/') ? 'index.html' : ''}`, import.meta.url);
  for (const url of kept) assert.ok(existsSync(fileOf(url)), `${url} is on the list, and there is no such file`);

  const shell = read('index.html');
  const loaded = new Set(['/', '/room/', '/postmarks/', '/jam/', ...REELS.map((reel) => reel.path)]); // the addresses the page is served at
  for (const [, url] of shell.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(\/[^"]+)"/g)) loaded.add(url);
  // every script, and whatever it brings in: by name, and when it is asked to
  const follow = (url) => {
    if (!url.endsWith('.js')) return;
    const script = readFileSync(fileOf(url), 'utf8');
    for (const [, to] of script.matchAll(/\b(?:import|export)\b[^'"`;()]*?(?:\bfrom\s*|\(\s*)?['"]([./][^'"]+)['"]/g)) {
      const next = new URL(to, `https://app${url}`).pathname;
      if (loaded.has(next)) continue;
      loaded.add(next);
      follow(next);
    }
  };
  for (const url of [...loaded]) follow(url);
  assert.ok(loaded.size > 50, 'what is loaded was found');
  assert.deepEqual([...loaded].filter((url) => !kept.includes(url)).sort(), [], 'loaded, and not kept for offline');
});
