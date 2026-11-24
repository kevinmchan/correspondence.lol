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
  for (const name of ['home', 'open', 'join', 'penny', 'office', 'walk', 'room', 'game', 'jam']) assert.ok(shell.includes(`<template id="screen-${name}">`), name);
});
