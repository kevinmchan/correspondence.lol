import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The type is one system (#136): its faces, sizes, weights, line heights and
// tracking are tokens at the top of styles.css, and every stylesheet sets its
// words from them. Type that is part of a drawing (an emoji in a circle, a glyph
// on a button, a thing drawn in em) keeps its own value, and says so with
// /* drawn */ just before it.

const root = new URL('../', import.meta.url);
const sheets = execFileSync('git', ['ls-files', '*.css'], { cwd: root }).toString().trim().split('\n').filter((file) => !file.startsWith('tests/'));
const tokens = readFileSync(new URL('styles.css', root), 'utf8').match(/^:root \{[\s\S]*?^\}/m)[0];
const defined = new Set([...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map(([, name]) => name));
const PREFIX = { 'font-family': '--font-', 'font-size': '--text-', 'font-weight': '--weight-', 'line-height': '--leading-', 'letter-spacing': '--track-' };
const FREE = new Set(['inherit', '0', 'normal']);

// Every type declaration of every stylesheet, but the tokens' own.
function declarations() {
  const found = [];
  for (const file of sheets) {
    const css = readFileSync(new URL(file, root), 'utf8');
    const lines = css.split('\n');
    lines.forEach((line, i) => {
      if (file === 'styles.css' && tokens.includes(line) && /^\s*--/.test(line)) return;
      for (const [, drawn, prop, value] of line.matchAll(/(\/\*\s*drawn\b[^*]*\*\/\s*)?(?<![\w-])(font|font-family|font-size|font-weight|line-height|letter-spacing):\s*([^;}]+?)(?:\s*!important)?\s*(?=[;}]|\/\*|$)/g)) {
        found.push({ at: `${file}:${i + 1}`, drawn: Boolean(drawn), prop, value: value.trim() });
      }
    });
  }
  return found;
}

test('every word is set from the type tokens, or is marked as drawn', () => {
  const loose = declarations().filter(({ drawn, prop, value }) => {
    if (drawn || FREE.has(value)) return false;
    if (prop === 'font') return true; // the shorthand hides what it sets: written out instead
    const used = [...value.matchAll(/var\((--[\w-]+)\)/g)].map(([, name]) => name);
    if (prop === 'line-height' && /^[\d.]+rem$/.test(value)) return false; // a box's own height, said as such
    return used.length === 0 || used.some((name) => !name.startsWith(PREFIX[prop]));
  });
  assert.deepEqual(loose.map(({ at, prop, value }) => `${at} ${prop}: ${value}`), [], 'use a token (styles.css, :root), or mark type that belongs to a drawing /* drawn */');
});

test('every type token used is defined', () => {
  const used = declarations().flatMap(({ value }) => [...value.matchAll(/var\((--(?:font|text|weight|leading|track)-[\w-]+)\)/g)].map(([, name]) => name));
  assert.deepEqual([...new Set(used)].filter((name) => !defined.has(name)), []);
});

test('the scale is small, and grows', () => {
  const steps = [...tokens.matchAll(/^\s*--text-[\w-]+:\s*([\d.]+)rem/gm)].map(([, rem]) => Number(rem) * 16);
  assert.ok(steps.length >= 6 && steps.length <= 8, `${steps.length} steps`);
  assert.equal(steps[0], 11, 'no step is under 11px, the least the phone suite allows');
  steps.slice(1).forEach((px, i) => assert.ok(px > steps[i], 'each step is bigger than the last'));
  const body = Number(tokens.match(/--text-body:\s*([\d.]+)rem/)[1]) * 16;
  assert.ok(body >= 16, 'the body, and every field, at 16px or more (Safari zooms the page for a smaller field)');
  assert.ok([...tokens.matchAll(/^\s*--weight-[\w-]+:/gm)].length <= 3, 'three weights at most');
});
