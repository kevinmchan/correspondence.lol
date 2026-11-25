// The control on pull requests. `node tests/pr-control.cjs --base origin/main`
//
// Nothing goes into main without two things:
//
//   1. NEW TEST SCREENS. The pull request adds at least one test screen to the
//      suite for the iPhone mini (tests/browser/mini.e2e.cjs): a state of the
//      app that is put on a phone and held to the suite's rules. There must be
//      more of them after the pull request than before, and at least one with
//      a name that was not there.
//      This is asked only of a pull request that changes the interface: a page
//      or a stylesheet of the app (a .html or .css file outside tests/). One
//      that mends a check, a rule of a game or the words of the README has no
//      new state to put on a phone, and goes in on its passing runs (the
//      owner's choice, 25 November 2026). What it takes away still counts: a
//      pull request may not leave fewer test screens than it found.
//   2. PASSING RUNS. The three suites pass: the unit tests (npm test), Penny in
//      a browser (npm run e2e) and the app on a mini (npm run e2e:mini). A
//      browser that is missing is a failure here, not a skip.
//
// Not having either takes an EXCEPTION, and an exception is two things, both
// on the pull request, so that it is seen and can be found again:
//
//   - the label `test-exception`, which is the owner's to give; and
//   - a line in the description saying which rule and why, one for each rule
//     it is asked for:
//         Exception (no new test screens): the reason, in a sentence
//         Exception (failing tests): the reason, in a sentence
//
// A reason of a few words is not one: it has to be a sentence (20 characters).
// An exception lets the pull request through and says so, loudly, in the
// result. It does not hide what failed.
//
// On GitHub the suites are run side by side, each on a machine of its own, and
// the browser suite as two halves (`--suite e2e` with SHARD=1/2 and 2/2); a
// last job then judges (`--judge`), told how each went (RESULT_UNIT,
// RESULT_E2E_1, RESULT_E2E_2, RESULT_MINI: "success" or not). The wait is the
// longest of them, not the sum. Run by hand with neither, it runs all three
// here, one after another, and judges.
//
// On GitHub this is run by .github/workflows/pr-control.yml, which hands it
// the description (PR_BODY) and the labels (PR_LABELS, as JSON). It can be run
// the same way by hand, before a pull request is opened, to see what it will say.

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LABEL = 'test-exception';
const RULES = { screens: 'no new test screens', tests: 'failing tests' };
const SUITES = [
  { key: 'unit', name: 'the unit tests', command: ['npm', 'test'] },
  { key: 'e2e', name: 'Penny in a browser', command: ['npm', 'run', 'e2e'], browser: true },
  { key: 'mini', name: 'the app on an iPhone mini', command: ['npm', 'run', 'e2e:mini'], browser: true },
];

// A pull request that changes only words (.md files) cannot change what a
// browser shows: its browser suites are not run. The unit tests always are
// (some of them read the README).
const onlyWords = (changed) => Array.isArray(changed) && changed.length > 0 && changed.every((file) => /\.md$/i.test(file));
const SUITE = path.join('tests', 'browser', 'mini.e2e.cjs');

// The exceptions a description asks for: { screens: reason, tests: reason }.
// A line of its own, the rule named exactly, and a reason that is a sentence.
function exceptionsIn(body) {
  const asked = {};
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const found = line.match(/^\s*(?:[-*]\s*)?Exception \(([^)]+)\):\s*(.*?)\s*$/i);
    if (!found) continue;
    const rule = Object.keys(RULES).find((key) => RULES[key] === found[1].trim().toLowerCase());
    if (rule && found[2].length >= 20) asked[rule] = found[2];
  }
  return asked;
}

// A file of the interface: a page or a stylesheet of the app.
const isInterface = (file) => /\.(html|css)$/i.test(file) && !/^tests\//.test(file);

// What the control makes of a pull request.
//   before, after: the names of the test screens on the base and on the pull request
//   suites: [{ name, passed }]
//   body: the description;  labels: the labels on it
// Gives { passes, lines: what to say, exceptions: the ones that were used }.
//   changed: the files it changes (null: not known, and then the screens are asked for)
function verdict({ before, after, suites, body = '', labels = [], changed = null }) {
  const asked = exceptionsIn(body);
  const labelled = labels.includes(LABEL);
  const added = after.filter((name) => !before.includes(name));
  const removed = before.filter((name) => !after.includes(name));
  const failed = suites.filter((suite) => !suite.passed);
  const lines = [];
  const exceptions = [];
  let passes = true;

  const excused = (rule, what) => {
    if (asked[rule] && labelled) {
      exceptions.push({ rule: RULES[rule], reason: asked[rule] });
      lines.push(`EXCEPTION (${RULES[rule]}): ${asked[rule]}`);
      return;
    }
    passes = false;
    lines.push(`NOT MET: ${what}`);
    if (asked[rule]) lines.push(`  An exception is asked for in the description ("${asked[rule]}") but the pull request does not have the label "${LABEL}", which is the owner's to give.`);
    else if (labelled) lines.push(`  The pull request has the label "${LABEL}" but its description has no line "Exception (${RULES[rule]}): <why, in a sentence>".`);
    else lines.push(`  To go in without it takes an exception: the label "${LABEL}", given by the owner, and a line in the description: "Exception (${RULES[rule]}): <why, in a sentence>".`);
  };

  const grew = after.length > before.length && added.length > 0;
  const faces = changed === null ? null : changed.filter(isInterface);
  if (faces !== null && faces.length === 0 && !grew && removed.length === 0) {
    lines.push(`NOT ASKED: new test screens. It changes no page or stylesheet of the app. There are ${after.length}, as before.`);
  } else if (grew) {
    lines.push(`MET: new test screens. ${after.length} where there were ${before.length}. New: ${added.join('; ')}.`);
  } else {
    const why = added.length === 0 ? 'none of its test screens is new' : `it adds ${added.length} and takes ${removed.length} away, so there are no more than before`;
    excused('screens', `new test screens. There were ${before.length} and there are ${after.length}: ${why}.`);
  }
  if (removed.length) lines.push(`  Test screens that are gone: ${removed.join('; ')}.`);

  if (failed.length === 0) {
    lines.push(`MET: passing runs. ${suites.map((suite) => suite.name).join(', ')}.`);
  } else {
    excused('tests', `passing runs. Failed: ${failed.map((suite) => suite.name).join(', ')}.`);
  }
  return { passes, lines, exceptions, added, removed };
}

// The names of the test screens at a commit: its own suite, asked for its list.
// A commit from before there was a suite has none.
function screensAt(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-control-'));
  try {
    execFileSync('git', ['worktree', 'add', '--detach', '--quiet', dir, ref], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (!fs.existsSync(path.join(dir, SUITE))) return [];
    const listed = spawnSync(process.execPath, [SUITE, '--list'], { cwd: dir, encoding: 'utf8' });
    if (listed.status !== 0) return []; // a suite from before it could list itself
    return JSON.parse(listed.stdout).map((one) => one.name);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { stdio: 'ignore' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function changedSince(base) {
  const diff = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return diff.status === 0 ? diff.stdout.split('\n').filter(Boolean) : null;
}

function runSuite(suite) {
  console.log(`\n=== ${suite.name}: ${suite.command.join(' ')} ===`);
  const run = spawnSync(suite.command[0], suite.command.slice(1), { stdio: 'inherit', env: { ...process.env, REQUIRE_BROWSER: '1' } });
  return run.status === 0;
}

function main() {
  const at = process.argv.indexOf('--base');
  const base = at > 0 ? process.argv[at + 1] : 'origin/main';
  const changed = changedSince(base);
  const skipBrowsers = onlyWords(changed);

  // one suite, on a machine of its own
  const one = process.argv.indexOf('--suite');
  if (one > 0) {
    const suite = SUITES.find((each) => each.key === process.argv[one + 1]);
    if (!suite) { console.error(`No such suite: ${process.argv[one + 1]}. There are: ${SUITES.map((each) => each.key).join(', ')}`); process.exit(2); }
    if (suite.browser && skipBrowsers) { console.log(`NOT RUN: ${suite.name}. Only words are changed (${changed.join(', ')}).`); process.exit(0); }
    process.exit(runSuite(suite) ? 0 : 1);
  }
  let labels = [];
  try { labels = JSON.parse(process.env.PR_LABELS || '[]'); } catch { labels = String(process.env.PR_LABELS).split(',').map((one) => one.trim()); }

  const before = screensAt(base);
  const listed = spawnSync(process.execPath, [SUITE, '--list'], { encoding: 'utf8' });
  if (listed.status !== 0) {
    console.error(`The suite could not list its test screens:\n${listed.stderr}`);
    process.exit(1);
  }
  const after = JSON.parse(listed.stdout).map((one) => one.name);

  // every suite is run, whatever the one before it did: all of what is wrong is wanted, not the first of it
  // (or, judging, each was run elsewhere and how it went is told)
  const told = { unit: [process.env.RESULT_UNIT], e2e: [process.env.RESULT_E2E_1, process.env.RESULT_E2E_2], mini: [process.env.RESULT_MINI] };
  const judging = process.argv.includes('--judge');
  const suites = SUITES.map((suite) => {
    if (judging) return { name: suite.name, passed: told[suite.key].every((result) => result === 'success') };
    if (suite.browser && skipBrowsers) { console.log(`\nNOT RUN: ${suite.name}. Only words are changed.`); return { name: suite.name, passed: true }; }
    return { name: suite.name, passed: runSuite(suite) };
  });

  const result = verdict({ before, after, suites, body: process.env.PR_BODY, labels, changed });
  const heading = result.passes ? (result.exceptions.length ? 'PASSES, BY EXCEPTION' : 'PASSES') : 'DOES NOT PASS';
  console.log(`\n=== The control on this pull request: ${heading} ===`);
  for (const line of result.lines) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## The control on this pull request: ${heading}\n\n${result.lines.map((line) => (line.startsWith('  ') ? `  ${line.trim()}` : `- ${line}`)).join('\n')}\n`);
  }
  process.exit(result.passes ? 0 : 1);
}

if (require.main === module) main();
module.exports = { LABEL, RULES, exceptionsIn, verdict, isInterface, onlyWords };
