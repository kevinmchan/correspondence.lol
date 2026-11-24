# Notes for Claude

Read `README.md` for how the app is built. This file holds what the README
does not: where the story is going, and how the owner likes to work.

## The story

The app is to be thought of as an **interactive movie**: scenes, not screens;
puzzles are mini-games inside the story and, at times, where the story takes
place. No narration, no instructions, no tutorials: only Penny's voice and
face. Penny cannot speak, read or write. Penny is "it".

### The owner's direction (their words, November 2026)

> I think the story has something to do about loops and sending messages to
> your future self and the growth you track and can't see along the way

Earlier, also theirs: Penny has high affect intensity, which colours its
adventures; it is being forced to reckon with the consequences of a finite
life, both beautiful and painful. Penny finds Dot a quarter of the way
through. Who Penny is searching for is revealed at the halfway mark, and
nothing in the app may say or hint at it before then.

### Proposed, not yet confirmed by the owner

These are Claude's proposals in answer to the direction above. Ask before
building on them as if they were settled.

- **The sound Penny is searching for is its own**, sent back down the post by
  a later Penny. Already true in the app and supporting this: Penny hums each
  found piece back an octave up, and each piece arrives nearer than the last.
- **No reunion.** Nobody is waiting at the end: by the time Penny arrives it
  has become the sender. Do not write an ending where the two meet.
- **The loop:** the film ends in the Dead Letter Office where it began. The
  letter that leaves in scene one is Penny, later. Scene one should be
  rewritten around that letter leaving.
- **Growth you cannot see:** Dot grows too slowly to notice; it shows only
  when something from the past comes back (an old board that is now easy, a
  letter with Dot's old, smaller stamp).
- **Messages to your future self:** pass phrase mode as the mechanic. Seal a
  phrase at the end of a chapter; Dot delivers it chapters later as a board.
  You read your own old words to Penny, who cannot read.

Open questions put to the owner: is the sender Penny's future self, or is
"loops" meant more loosely? Are the player's messages to their future self
real ones they write, or only Penny's?

### Where things stand

- Built: the walk (first quarter, five places, ends with Dot), scene one at
  `/?office`, Penny's reactions in pass phrase games.
- Scene one is **not** the opening. The owner said not to force anyone to
  start there until the first scene is figured out, and found its pacing slow.
- Not built: friends list, sounds given as gifts and carried by Dot, Dot's
  growth, anything past the first quarter.

## Working with the owner

- They playtest on a phone and report what confused them. Treat each report
  as a fault in the design, not in the player, and fix the cause.
- They want stability, reliability and coherence ahead of new features.
- "Merge" means: open a pull request from the working branch to `main`, merge
  it, and check `https://correspondence.lol/version.js` shows the new version.
  `main` deploys to the live site. Never merge without that word.
- Bump `version.js` with every release (v1.1.x), and run `npm run shell`
  after editing `index.html`.
- Run `npm test` and `npm run e2e` before saying something works. Tests must
  never reach the live database: block `supabase.co` or fake it.
- Say plainly what was not tested. The sounds have never been listened to by
  Claude, and nothing has been checked on a real phone.
