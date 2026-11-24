import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The app is one page, served at several addresses so that each opens directly.
// The copies are made with `npm run shell`; this catches a forgotten run.
test('every address serves the same page', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const copy of ['../room/index.html', '../postmarks/index.html', '../jam/index.html']) {
    assert.equal(readFileSync(new URL(copy, import.meta.url), 'utf8'), shell, `${copy} differs from index.html: run npm run shell`);
  }
});

test('the page has a template for each screen', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const name of ['home', 'open', 'join', 'office', 'slow', 'walk', 'sky', 'room', 'game', 'jam', 'taste']) assert.ok(shell.includes(`<template id="screen-${name}">`), name);
});

// The version names the offline cache and is shown on the home page. A release
// once went out with this file empty: the page showed nothing, and the cache
// was named after nothing.
test('the app has a version', () => {
  const script = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
  assert.match(script, /^self\.APP_VERSION = 'v\d+\.\d+\.\d+';$/m);
});
