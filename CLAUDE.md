# Working on correspondence.lol

Standing rules for anyone (or any Claude session) changing this repository. The
README says what the app is and why it is the way it is; this is how changes
are made.

## Phones

- The interface is designed for an iPhone Pro: 393 by 852 installed to the Home
  Screen, 393 by 659 inside Safari. It must go on working on a Pro Max and on a
  mini.
- `npm run e2e:mini` puts every screen on an iPhone mini and holds it to the
  rules at the top of `tests/browser/mini.e2e.cjs`. Keep it up: a new screen,
  or a new state of one (a sheet, a list that can grow, a step of a lesson),
  gets a test screen in `states()` in the same change that adds it.
- Before shipping a change to the interface, run it on every phone too:
  `PHONES=all npm run e2e:mini`.

## Look and words

- Soothing first. The app should feel soothing: soft, low-contrast colour,
  warm in the dark theme; generous space; soft shapes; slow, eased motion or
  none. Nothing is urgent unless it is truly yours to do, and even that is said
  gently. Soothing must not cost clarity: a person still sees what needs them.
  The story may turn from soothing to wrestling with the dark (README,
  "Penny"); that is the writing's choice, made on purpose in a scene, never a
  screen that happens to be harsh.
- No text descriptions, as a rule. Everything on a screen says what it is by
  its form (an icon, a shape, a mark, a state of the drawing, a behaviour), and
  labels are kept to the fewest. Labels, placeholders, hints and the words on
  buttons are descriptions too; the words a screen shows are its content
  (names, messages, a code, a phrase). What a description said stays for
  screen readers (`aria-label`, `.sr-only`). An error is a short line of its
  words beside what was tried, for as long as it stands, with a gentle shake
  of what was tried, in `role="alert"`; never behind a mark to press (the
  owner's choice, 25 November 2026). Prefer taking a thing away to swapping
  its word for a new mark.
- The one exception the owner has given is Penny's Radio as an exhibit: its
  label and its reading are words, set as a museum sets them. The second is a
  sheet that asks before something that cannot be undone ("Leave this room?",
  "Delete this game?"): its question and its buttons are words (25 November
  2026). The others the owner has given (25 November 2026): the question
  at a pass phrase's desk ("What message would you like to deliver?"); the
  words Rename and Leave in a room's options; and the lines of the sheet that
  says what is particular to a game together. Any other place where only words will do is the owner's to allow.
- An error line takes its own room: what is below it moves down for it, and
  nothing above it moves (allowed by the owner, 25 November 2026).
- Screens changed before these rules still carry words; each is brought to
  them when it is next worked on, not left as it is.

## Every pull request

- The control (`tests/pr-control.cjs`, run by GitHub once for each push to a
  pull request) wants `npm test`, `npm run e2e` and `npm run e2e:mini` all
  passing, and, of a pull request that changes a page or a stylesheet of the
  app (a `.html` or `.css` file outside `tests/`), a new test screen in the
  suite for the mini. A fix to a check or to a rule of the app goes in on its
  passing runs alone (the owner's choice, 25 November 2026). Run it before
  opening one: `node tests/pr-control.cjs --base origin/main`.
- An exception is the owner's to give, never yours. If a change really has no
  test screen to add, or a run cannot pass, stop and ask the owner. Do not put
  the `test-exception` label on a pull request yourself, and do not write an
  `Exception (...)` line they have not agreed to.
- After opening a pull request, wait for the check "New test screens and
  passing runs" to pass before merging. Merge only when the owner has said to
  deploy.

## Cloud sessions

- A cloud session's machine has 4 cores. Run at most two or three agents that
  run browser suites at the same time; past that, builds crawl and timing
  checks fail for reasons that have nothing to do with the change (#92).
- Work in order of how near it is to deploying: finish and ship before starting
  new explorations.
- One session for one feature or release. A session that goes on for days is
  summarised over and over and loses what it knew; start a new one for the
  next piece of work.

## Checks that fail now and then

- Find the root cause of a check that has failed on GitHub: never call it a
  flake, never skip it, and never just wait longer. Do not go looking for
  failures that only appear on a machine loaded past what GitHub's is: each
  hunt costs hours (the owner's choice, 25 November 2026).
- `npm run e2e` runs 8 checks at a time (`AT_ONCE`). A check sends its taps as
  separate messages, and with thirty windows open they arrived late; where the
  timing of a hand matters, ask the page what it was given (`twice`,
  `doubleTap` and the rush of scene two in `tests/browser/penny.e2e.cjs`).
- Before a pull request, run the checks for what was changed (`ONLY=<regex>`),
  not the whole control: GitHub runs all of it once, side by side, in about
  the time of its longest suite.
- The suites reach no network. The server's functions are answered by each
  check, and the live socket by `tests/browser/socket.cjs`.

## Things that have gone wrong before

- `version.js` names the offline cache and is shown on the home page. Bump it
  with an edit in place (`sed -i`), never by rewriting the file: it was once
  emptied that way, and five releases went out with no version.
- `index.html` is served at four addresses. After editing it, run
  `npm run shell` to copy it to `room/`, `postmarks/` and `jam/`.
- A new file the app loads has to be added to `PRECACHE` in `sw.js`.
- `.screen` is the class of a whole page of the app. Do not use it for anything else.
