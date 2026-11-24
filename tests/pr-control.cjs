// The control on pull requests. `node tests/pr-control.cjs --base origin/main`
//
// Nothing goes into main without two things:
//
//   1. NEW TEST SCREENS. The pull request adds at least one test screen to the
//      suite for the iPhone mini (tests/browser/mini.e2e.cjs): a state of the
//      app that is put on a phone and held to the suite's rules. There must be
//      more of them after the pull request than before, and at least one with
//      a name that was not there.
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
  { name: 'the unit tests', command: ['npm', 'test'] },
  { name: 'Penny in a browser', command: ['npm', 'run', 'e2e'] },
  { name: 'the app on an iPhone mini', command: ['npm', 'run', 'e2e:mini'] },
];
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

// What the control makes of a pull request.
//   before, after: the names of the test screens on the base and on the pull request
//   suites: [{ name, passed }]
//   body: the description;  labels: the labels on it
// Gives { passes, lines: what to say, exceptions: the ones that were used }.
function verdict({ before, after, suites, body = '', labels = [] }) {
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
  if (grew) {
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

function main() {
  const at = process.argv.indexOf('--base');
  const base = at > 0 ? process.argv[at + 1] : 'origin/main';
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
  const suites = SUITES.map((suite) => {
    console.log(`\n=== ${suite.name}: ${suite.command.join(' ')} ===`);
    const run = spawnSync(suite.command[0], suite.command.slice(1), { stdio: 'inherit', env: { ...process.env, REQUIRE_BROWSER: '1' } });
    return { name: suite.name, passed: run.status === 0 };
  });

  const result = verdict({ before, after, suites, body: process.env.PR_BODY, labels });
  const heading = result.passes ? (result.exceptions.length ? 'PASSES, BY EXCEPTION' : 'PASSES') : 'DOES NOT PASS';
  console.log(`\n=== The control on this pull request: ${heading} ===`);
  for (const line of result.lines) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## The control on this pull request: ${heading}\n\n${result.lines.map((line) => (line.startsWith('  ') ? `  ${line.trim()}` : `- ${line}`)).join('\n')}\n`);
  }
  process.exit(result.passes ? 0 : 1);
}

if (require.main === module) main();
module.exports = { LABEL, RULES, exceptionsIn, verdict };
