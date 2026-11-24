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
  screen readers (`aria-label`, `.sr-only`); an error is a shake and a mark,
  with its words in `role="alert"`. Prefer taking a thing away to swapping its
  word for a new mark.
- The one exception the owner has given is Penny's Radio as an exhibit: its
  label and its reading are words, set as a museum sets them. Any other place
  where only words will do is the owner's to allow.
- Screens changed before these rules still carry words; each is brought to
  them when it is next worked on, not left as it is.

## Every pull request

- The control (`tests/pr-control.cjs`, run by GitHub on every pull request)
  wants a new test screen in the suite for the mini, and `npm test`,
  `npm run e2e` and `npm run e2e:mini` all passing. Run it before opening one:
  `node tests/pr-control.cjs --base origin/main`.
- An exception is the owner's to give, never yours. If a change really has no
  test screen to add, or a run cannot pass, stop and ask the owner. Do not put
  the `test-exception` label on a pull request yourself, and do not write an
  `Exception (...)` line they have not agreed to.
- After opening a pull request, wait for the check "New test screens and
  passing runs" to pass before merging. Merge only when the owner has said to
  deploy.

## Things that have gone wrong before

- `version.js` names the offline cache and is shown on the home page. Bump it
  with an edit in place (`sed -i`), never by rewriting the file: it was once
  emptied that way, and five releases went out with no version.
- `index.html` is served at four addresses. After editing it, run
  `npm run shell` to copy it to `room/`, `postmarks/` and `jam/`.
- A new file the app loads has to be added to `PRECACHE` in `sw.js`.
- `.screen` is the class of a whole page of the app. Do not use it for anything else.
