import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LABEL, exceptionsIn, verdict } = require('./pr-control.cjs');
const here = (file) => new URL(file, import.meta.url);

// The suite for the iPhone mini lists its own test screens (no browser needed).
const screens = JSON.parse(execFileSync(process.execPath, [here('./browser/mini.e2e.cjs').pathname, '--list'], { encoding: 'utf8' }));

test('every screen the app has is put on a phone: each has a test screen in the suite for the mini', () => {
  const shell = readFileSync(here('../index.html'), 'utf8');
  const has = [...shell.matchAll(/<template id="screen-([a-z-]+)">/g)].map((found) => found[1]);
  assert.ok(has.length >= 10, 'the templates were not found');
  const tested = new Set(screens.map((one) => one.screen));
  for (const name of has) assert.ok(tested.has(name), `screen-${name} has no test screen: add a state for it to tests/browser/mini.e2e.cjs`);
  for (const one of screens) assert.ok(has.includes(one.screen), `the test screen "${one.name}" is for screen-${one.screen}, which the app does not have`);
});

const passing = [{ name: 'the unit tests', passed: true }, { name: 'the app on an iPhone mini', passed: true }];
const failing = [{ name: 'the unit tests', passed: true }, { name: 'the app on an iPhone mini', passed: false }];

test('a pull request passes the control when it adds a test screen and its runs pass', () => {
  const result = verdict({ before: ['a', 'b'], after: ['a', 'b', 'c'], suites: passing });
  assert.equal(result.passes, true);
  assert.deepEqual(result.exceptions, []);
  assert.deepEqual(result.added, ['c']);
});

test('without a new test screen it does not pass: renaming one, or swapping one for another, is not adding one', () => {
  assert.equal(verdict({ before: ['a', 'b'], after: ['a', 'b'], suites: passing }).passes, false, 'nothing added');
  assert.equal(verdict({ before: ['a', 'b'], after: ['a', 'c'], suites: passing }).passes, false, 'one renamed');
  assert.equal(verdict({ before: ['a', 'b'], after: ['a'], suites: passing }).passes, false, 'one taken away');
  assert.equal(verdict({ before: ['a', 'b'], after: ['c', 'd', 'e'], suites: passing }).passes, true, 'more than before, and new');
  assert.equal(verdict({ before: [], after: ['a'], suites: passing }).passes, true, 'the first there has ever been');
});

test('with a run that fails it does not pass, whatever it adds', () => {
  const result = verdict({ before: ['a'], after: ['a', 'b'], suites: failing });
  assert.equal(result.passes, false);
  assert.match(result.lines.join('\n'), /Failed: the app on an iPhone mini/);
});

test('an exception is the label and a reason, both: either alone is not one', () => {
  const body = 'Fixes a typo.\n\nException (no new test screens): only the README changes, no screen is touched.';
  assert.deepEqual(exceptionsIn(body), { screens: 'only the README changes, no screen is touched.' });
  const same = { before: ['a'], after: ['a'], suites: passing };
  assert.equal(verdict({ ...same, body, labels: [LABEL] }).passes, true);
  assert.deepEqual(verdict({ ...same, body, labels: [LABEL] }).exceptions.map((one) => one.rule), ['no new test screens']);
  assert.equal(verdict({ ...same, body, labels: [] }).passes, false, 'a reason without the label');
  assert.equal(verdict({ ...same, body: 'Fixes a typo.', labels: [LABEL] }).passes, false, 'the label without a reason');
  assert.equal(verdict({ ...same, body: 'Exception (no new test screens): docs', labels: [LABEL] }).passes, false, 'a reason that is not a sentence');
  assert.equal(verdict({ ...same, body: 'We might want an Exception (no new test screens): because this is only words in a sentence.', labels: [LABEL] }).passes, false, 'not on a line of its own');
});

test('an exception is for the rule it names and no other', () => {
  const screensOnly = 'Exception (no new test screens): only the README changes, no screen is touched.';
  const both = `${screensOnly}\n- Exception (failing tests): the suite for the mini is being written in this very change.`;
  const broken = { before: ['a'], after: ['a'], suites: failing };
  assert.equal(verdict({ ...broken, body: screensOnly, labels: [LABEL] }).passes, false, 'excused for screens, not for failing tests');
  const result = verdict({ ...broken, body: both, labels: [LABEL] });
  assert.equal(result.passes, true);
  assert.equal(result.exceptions.length, 2);
  assert.match(result.lines.join('\n'), /EXCEPTION \(failing tests\)/, 'and it says so');
  assert.deepEqual(exceptionsIn('Exception (anything I like): because I would rather not do the work today.'), {}, 'a rule there is not');
});
