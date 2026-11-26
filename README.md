# correspondence.lol

A static, no-build progressive web app served from the repository root at
<https://correspondence.lol>.

## What the app is

A network of interactive story clips, reached through portals, with games of
the story between them as pauses: see [the story](https://claude.ai/artifact/Ducds4iaTSYyUefz14Amvu).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `home.js`, `styles.css`, `app.js` | Home page (open a room, your rooms) and shared styles |
| `penny/` | Penny: the introduction at `/?hello` (`hello.js`), scene two of the film, where you draw, at `/?slow` (`slow.js`); its voice (`penny.js`), Penny at life size (`pal.js`), the first quarter of the adventure at `/?walk` (`walk.js`, `places.js`), the sounds in the posts (`mail.js`), scene one of the film at `/?office` (`office.js`), the night at `/?sky` (`sky.js`, with its rules in `stars.js` and its sounds in `chimes.js`), and the tags hidden in the app (`tags.js`) |
| `room/` | A room, drawn as a building on the map (`room.css`): members, invitation code, games, chat; and its other world, through a portal (`worlds.js`, `worlds.css`); the meadow it wears once earned (`meadow.css`), and the meadow's folk (`folk.js`, `folk.css`) and its people walking about (`roam.js`) |
| `postmarks/` | Postmarks, a co-operative logic puzzle (`game.js` is the rules, `ui.js` the page) |
| `shared/` | Server calls (`api.js`, `config.js`), device identity (`identity.js`), profiles and avatars (`profile.js`), chat (`chat.js`), live updates (`live.js`), a room's colour, roof and the small boards on its table (`place.js`), energy (`energy.js`) and the meadow it earns (`meadow.js`) |
| `vendor/` | Third-party code committed as-is (the Supabase Realtime client) |
| `supabase/migrations/` | Database schema (Supabase project `correspondence`) |
| `tests/` | Tests for the game rules, the puzzle generator, Penny's places and the night's rules (`npm test`, needs only Node); `tests/browser/` plays Penny's part of the app in a real browser (`npm run e2e`, needs Playwright and takes a couple of minutes) and puts every screen on an iPhone mini (`npm run e2e:mini`); `tests/pr-control.cjs` is the control on pull requests |
| `.github/workflows/` | What GitHub runs on every pull request: the control (`pr-control.yml`) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Install metadata, offline caching, app icons |
| `CNAME`, `.nojekyll` | GitHub Pages custom domain / serve files as-is |

## The film

**The introduction** (`/?hello`, `penny/hello.js`; the owner, 26 November
2026; a first draft). The first time Penny is seen, and the beginning of the
story (see "How the story is reached", below). It begins with Penny alone on plain ground, large, in the middle of
the screen, going through what it can feel, one feeling after another: at
rest, curious, glad, shy, startled, sad, listening, excited. This is where
Penny's character is worked out, for use everywhere Penny goes (the owner, 26
November 2026); one feeling can be held to be looked at
(`/?hello&emote=sad`). Nothing happens until Penny is touched: a touch knocks
it back, startled, all the way down the street, and it hides behind a
mailbox; then it leans out round one side, and back; then the other side,
for longer. Penny comes out and comes
up the street towards you, cautious and curious at once, all the way to the
glass, until Penny is wider than the screen, and looks you over from the other
side of it: one eye up close, a breath that fogs the glass, a tap on it, and
eyes that follow a finger. Then a portal opens behind Penny: it is heard, and
its light comes round Penny's edges, because Penny is in the way. Penny
starts, jumps back, and there it is; looks at it, and at you, and jumps in.
The portal stays open, and you are expected to follow; nothing hurries you. It
leads, for now, to scene one.

**How the story is reached** (the owner, 26 November 2026). Two ways, and they
differ on purpose. The portal on the home page always goes back to the
beginning: the introduction, then the film, then the first places, in order.
Play goes on from where you are: the first time, that is the beginning too;
after that, the furthest scene reached (the introduction, scene one, scene
two or the walk, at the place it had got to). Once the first places have been
walked, play is a board of your own, and the story is the portal's. How far
the story has got is kept on the device (`penny/penny.js`: `reach()`,
`playAt()`); seeing an earlier scene again does not lose the place. A tap on
Penny on the home page goes through the portal with it.

**Starting the story over** (the owner, 26 November 2026). At the foot of the
profile sheet, once any of the story has been seen: "Start the story over",
asked first. It forgets everything the story and its walkthroughs keep on the
device (how far the story has got, the first places walked, Dot found, the
pieces of the sound heard, the night found in the game, the radio shown and
its story told, the first game's how-to) and energy with what it brought (the
meadow, and the thanks on the fourth bar; the owner: "reset the energy too"),
and opens the app afresh, so play begins at the beginning. What was made
stays: games, rooms, beats, what the radio has learnt of your taste, and
settings (`penny/penny.js`, `forgetStory()`).

How Penny comes up the street is still being played with, so there are three
ways of it, chosen in the address (`/?hello&gait=zigzag`): `tiptoe` (as it is
unless asked: straight up the middle a few steps at a time, losing its nerve
once), `zigzag` (from one side of the street to the other, half out of sight
at each edge) and `edges` (round the outside of the screen itself: in at one
edge, in at the other, then up from underneath, eyes first). On the way up a
touch sends Penny back a step, twice at most; at the glass a touch is welcome.
A beat can be gone to directly (`&at=street`, `&at=glass`, `&at=portal`).

**How Penny moves** (the owner, 26 November 2026: not floating, dragged or
zoomed; and no legs, which asked for more realism than the rest of Penny has).
Penny never slides and never simply grows: it moves by its own effort, a step
at a time, and stands still between steps. How it moves is how it feels. Shy,
it rocks on its corners: over onto one bottom corner, the other swung round,
like a card edging along (and creeping, the same, smaller). Braver, it
bounces: a low spring off its bottom edge, a sway in the air, its paper
squashing as it lands. Excited or startled, it hops: a crouch, a spring and a
landing. Its paper bends and its
corners curl as it goes, which is most of what it says: top corners folded
forward when it is shy, flared when it is startled, lifted a little when it is
glad; a corner lifts as it leaves the ground. The camera is at the height of
Penny's eyes, so its eyes are always on the horizon: nearer is bigger and
lower together, and only ever by walking. Each way of moving can be tried for
the whole scene from the address (`&walk=rock`, `&walk=bounce`, `&walk=hop`).

Its face has four kinds of eyes (open, happy arches, closed, heavy-lidded) and
five mouths (a smile, a grin, an o, a wobble and a frown); sad, it also sits
lower and wider, and its seal all but goes out.

The app is meant to become a film that is played. Its first scene, the Dead
Letter Office (`/?office`, `penny/office.js`), is still being worked out. The
app opens on the home page, never in the film: the film is reached through
the introduction, by the portal or by play, and a door in its corner leads
back.

## Phones

The interface is designed for an iPhone Pro (393 by 852 installed to the Home
Screen, 393 by 659 inside Safari with its bars showing), and has to go on
working on a Pro Max and on a mini. The mini is where it is tightest, so it
has a suite of its own: `npm run e2e:mini` (`tests/browser/mini.e2e.cjs`) goes
through every screen of the app, in every state worth looking at, on a mini
both ways (375 by 629 in Safari; 375 by 812 installed, with the notch and the
home bar), and holds each to the same rules:

- the page cannot be scrolled sideways, and nothing sticks out past its edges;
- everything there is to press is at least 44 by 44 (the few things that are
  not are named in the suite, each with its reason);
- no two things to press overlap;
- installed, nothing to press lies under the notch or the home bar;
- no text is under 11px, and no text field under 16px (Safari zooms the whole
  page when a smaller one is tapped);
- no text is cut off by its own box;
- a screen meant to be seen whole is whole: it does not scroll, and the things
  named for it are entirely on the screen.

The same suite can be pointed at any of the phones in `tests/browser/phone.cjs`:
`PHONES=pro-app,max-app npm run e2e:mini`, or `PHONES=all` (the mini in Safari and
installed, and the Pro Max installed); and at one screen:
`ONLY=radio npm run e2e:mini`. There is no WebKit where the suites run, only
Chromium told to be a phone (its size, touch, a phone's viewport and the
insets of the notch and the home bar): what is checked is the layout an
iPhone's screen gives, not Safari's own engine.

A new screen, or a new state of one, gets a test screen in the suite in the
same change that adds it.

## The control on pull requests

Nothing goes into `main` without two things (`tests/pr-control.cjs`, run on
every pull request by `.github/workflows/pr-control.yml`):

1. **New test screens.** The pull request adds at least one test screen to the
   suite for the mini: there are more after it than before, and at least one
   has a name that was not there. Renaming one, or swapping one for another, is
   not adding one.
   This is asked only of a pull request that changes the interface (a `.html`
   or `.css` file outside `tests/`): a fix to a check or to a rule of the app
   has no new state to put on a phone, and goes in on its passing runs. No
   pull request may leave fewer test screens than it found.
2. **Passing runs.** `npm test`, `npm run e2e` and `npm run e2e:mini` all
   pass. A browser that is missing is a failure there, not a skip.

Besides which, every screen the app has must have at least one test screen at
all times (`tests/control.test.js`).

Not having either takes an **exception**, and an exception is two things, both
on the pull request:

- the label `test-exception`, which is the owner's to give; and
- a line of its own in the description for each rule it is asked for, with the
  reason in a sentence:
  `Exception (no new test screens): …` or `Exception (failing tests): …`

On GitHub the suites run side by side, each on a machine of its own, the
browser suite as two halves (`SHARD=1/2`, `SHARD=2/2`), and a last job judges:
the wait is the longest of them, not their sum. A pull request that changes
only words (`.md`) is not put in a browser at all.

An exception lets the pull request through and says so in the result of the
check; it does not hide what failed. The control can be run by hand before a
pull request is opened: `node tests/pr-control.cjs --base origin/main`.

For the control to be a bar and not only a report, `main` has to be protected
on GitHub (Settings, Branches): require a pull request, and require the status
check "New test screens and passing runs".

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Service workers only run on `localhost` or HTTPS.

## Effects and sound

Every event on the board has an animation and a sound (`postmarks/ui.js`
decides which, `postmarks/postmarks.css` draws them, `postmarks/sound.js` plays
them). Finding a post is the big one: the tile bursts open, a ring spreads
across the board, and the crosses it brings ripple outwards with ticks that
climb in pitch. Sounds are synthesised in the browser, so there are no audio
files; they start after the first tap, as browsers require, and a button at the
top of the game turns them off. Animations are skipped for people who ask their
device for reduced motion.

At the end of a game that was won, what was kept hops, one after another: the
hearts of a game won alone, the faces of everyone in one won together.

To the browser all the app's stylesheets are one sheet, so every animation
has a name of its own: a second animation of the same name anywhere takes the
place of the first everywhere, and nothing says so. `npm test` checks that no
two share a name, and that every animation asked for is one there is.

The envelopes on the board are called posts, so that "letters" only ever means
the letters of a phrase. A double tap on a square guesses a post there.

## Penny

**What the story means is in the owner's living doc, [the story](https://claude.ai/artifact/Ducds4iaTSYyUefz14Amvu)** (the
owner, 26 November 2026): what the app is, what the story is about, who Penny
is, how a place says it, and the shape of the adventure. Read it before
writing anything Penny is in, and write changes to the story there, not here;
this README keeps how Penny's part of the app is built. A comment in the code
that cites this README for "Penny", "How a place says it", "The question
Penny's Radio asks" or the shape of "The adventure" means that part of the
doc.

In one line, for when the doc cannot be reached: the story is about rejecting
a scarcity mindset, as Penny, left behind by a world in a hurry, slowly finds
the world alive and ready to hold it up; and it shows this, never says it.

### The adventure

Its shape, and what is not decided, are in the doc. How the campaign is built:

**The solo campaign runs on energy, earned by work (the owner, 25 November
2026).** Penny earns energy by completing work, and the work is how Penny meets
new characters. What the energy is spent on is not decided yet. How it is
earned and shown has begun (the owner, 25 November 2026): in every game,
alone or in a room, every post found is energy at once, and finishing the board
entirely earns as much again (`shared/energy.js`). **The bar is a stat of the
whole app, not of one game** (the owner, 25 November 2026): one bar for
everything earned, which about five games fill, for now (`BAR`, 70; the owner,
26 November 2026: "for now, make each stage 5 games long"; twenty at first,
then ten: boards are drawn
at sizes 5 to 9, so a game finished earns 14 on average). It is under the play
button on the home page, and in a game where the words of the turn were (in a
room, beside them), with a current running through it and a spark flickering
at the end it has reached; no mark on it and no number (the owner: "no
electric icon, just an animated, electrified bar"; and then no count). What is
held in all is said only to screen readers. A post found sends a spark from
itself to the end of the bar, which throws off sparkles as it lands, and the
bar takes it in; a board finished sends a shower from every post on it, and
the sheet at the end waits until it has landed.

**The meadow is what the first bar is for** (the owner, 25 November 2026:
"while we figure out and build out the game play dynamics, let the meadow-y
skin be the reward"). At the end of the bar is a round glimpse of it, sun on
grass and a daisy, grey and faint until the bar is full. The moment it fills,
the bar flares, the glimpse blooms into colour, and the bar begins again from
what was left over. From then on every room wears the meadow
(`shared/meadow.js`, `room/meadow.css`): grass in the map's squares with
flowers in some of them, a hedge in flower for walls, the table a picnic
blanket in gingham of the room's colour, the chat a patch of clover with a
fringe of daisies, the tiles that start a game stepping stones, the sun out in
a corner and two tall flowers swaying in the other, the shadows of clouds going
over and a butterfly wandering about (in the dark: the moon asleep, fireflies,
and a firefly for the butterfly). It is paint only, as the drama is: nothing
that can be pressed moves or changes size, and the drama through the portal is
the drama still. On the home page the glimpse is then a toggle (pressed, with a
soft ring of light): it takes the meadow off and puts it back on, and the
choice is kept on the device.

**The meadow comes alive in three stages, a bar each** ("one bar per
stage"; the owner, 26 November 2026: "First, there are no characters for the buttons. Then Penny
discovers there's an energy flowing through everything and the buttons are
actually alive but they are asleep. More energy and wonder brings them alive
in the next stage."). This is the first stretch of the campaign with a shape
of its own (`folkOf` in `shared/energy.js`, `room/folk.js`).

- *The first bar: a meadow, and things in it.* The work brings Penny
  somewhere. The map's squares are grass and the rooms stand in a meadow: a
  sun, tall flowers, a butterfly. The things to press are things: tiles, a
  button, a code on a mat.
- *The second bar: the discovery.* Penny finds that the energy it has been
  earning is not only its own: it runs through everything. A soft light goes
  through the things of the room one after another, and by that light they
  are seen for what they were all along: alive, and asleep. A tile that
  starts a game is a flower with its eyes shut; there is a hedgehog curled
  under the room's code, a bluebell where the bell is, butterflies at rest on
  the notes of the chat, a little bird on the send button, feet under the
  people's tokens; the games' own boards are little cartoons of the old
  rubber-hose kind (pie-cut eyes over the top edge, a white glove, big
  shoes), a field mouse holds up the room's name, and the portal is a
  caterpillar curled into a ring. Nobody is woken. They
  were here before Penny was.
- *The third bar: more energy, and wonder.* They open their eyes, all of
  them, and from then on the meadow is alive: they blink and breathe and look
  about, glance at each other and at whoever comes by, fidget each in its own
  way, stop and look at a finger that comes near (and never dodge it), and
  are glad of a press. The game that waits on you waves. While anything is
  typed they hold still and watch. The current has done its work and is not
  seen again. With reduced motion they are drawn awake and at rest.

What wakes them is the energy and Penny's wonder at them together: attention
is what the story is about, and here it is what brings a thing to life. They
are the first of the "others" of the story's themes (the doc). What each of them is to
Penny, and whether any of them knows anything of the sound, is not written.
Like the meadow they are paint: drawn round the things of the room in layers
that cannot be pressed, so that nothing that can be pressed moves or changes
size; they are not in the night through the portal; and taking the meadow off
on the home page takes them with it. Awake, three more things happen (not with reduced motion). The people walk
about: each token leaves its place at the head of the table and wanders the
strip of lawn between the hedge and the table, a few steps and a rest, on the
feet it was found to have, keeping clear of the others, and goes back to its
place while anything is typed (`room/roam.js`). A breeze crosses the meadow:
what is on a thing to press, its mark and its body, sways a very little, each
in its own time, while its own box and plate stay where they are; with a
finger near, it is still. And the portal is a caterpillar curled into a ring
(it is not there in the night). The moment of each stage (the bar filling, in a game) has no scene of
its own yet: the room is simply different the next time it is opened.

The fourth time the bar fills, a sheet over the game says, in the owner's
words, "Speedy! Thanks for being an early tester. We're working on your
prize 🤍", with the meadow over it and a heart to go on; once, and before the
sheet at the end of the game. (The owner gave these words for the second bar,
25 November 2026, before the bars after the first had rewards of their own;
they have moved to the first bar that has none, where they are still true.)
What later bars are for is not decided.

A bigger board earns more; a faster one no more;
hints are free; a board played again earns only for what it has not earned
before. It is held to two things unless the owner says
otherwise: it is earned by care and never bought, waited out or nagged for
(an energy that pressures people to come back or to pay is the opposite of
this story); and the people met at work are the "others" of the story's themes (the doc),
who can light up parts of Penny it has lost touch with.

### Where Penny is

The screen is a map seen from far above, and Penny is not on it. Penny stands
at the bottom edge of the window, in the viewer's own space, life size, and
looks up at the map with you (`penny/pal.js`). It is one layer over the whole
app, so screens slide past and Penny stays; a screen that wants Penny asks,
and Penny goes back under the edge when no screen does. At present the home
page, the map, the game itself, the music maker and its radio ask. In the game Penny has no part in the
play and gives nothing away: it is glad when a post is found, flinches at a
miss, and feels how the game ends (a time trial it takes as play: see Game
modes); and the board there, as on the walk, is a
few lit districts of a larger map that goes on, faint, all round. Once Dot has been found, Dot stands tucked in beside it.

Everything Penny says is a feeling. A mood sets its face and how it holds
itself (the point of its flap works as a brow); a gesture is one movement; it
looks at things, leans towards them, and walks along the edge to stand under
whatever it wants you to see, which is the nearest it has to pointing. It
rests low and comes up for what matters, so rising is itself a feeling. Its
seal glows with how warm it feels and brightens with every note it hums, so
its voice can be seen with sound off. On the map, its mood also throws a
light of its own colour up the screen, and the strongest feelings make the
map itself richer or drain it.

Penny never blocks the page. It ducks down to the top of its flap where
something that can be pressed is under it, a tap that lands on it over a button
goes to the button, it gets out of the way at once if the page is pressed or
scrolled while it is up, and while something is being typed it goes right
under.

### What Penny wants

On the home page, which is the same map seen from much further up, Penny wants
two things, and shows them by coming up and standing by them.

- **The portal**, at the foot of the page on the left, the one place marked
  on the map. Until the first places have been walked Penny keeps coming back
  to it: it calls, walks along to stand beside the portal, looks at it and
  back at you. The first time in a visit, and
  sometimes after, it shuts its eyes first and what it remembers of the sound
  can be heard, a long way off: at the start that is one note, the beginning,
  which is all Penny has. Going through is a rush up through the portal, not a
  slide to another screen.
- **The app installed.** Once you have been through a portal with it, Penny
  stands under the Install button and pleads. It asks at most three times in a
  visit, however often the home page is come back to, leaving it twice as long
  each time; a no to the browser's prompt is a no for the rest of the visit,
  and Penny lets it be. Nothing waits on it. When
  the app is installed, and the first time it is opened as an app, Penny is as
  glad as it gets. (`app.js` tells it where installing stands through
  `installState()`, `requestInstall()` and an `install` event.)

A tap on Penny while it is asking for the app to be installed is a yes to
that. Any other tap goes through the portal with it: the story, from the
beginning.

### Walking the map

Through the portal is the map itself (`/?walk`, `penny/walk.js`): a few
districts lit, the rest faint all round. The way on is always up the screen,
and the places already walked stay on the map, flat, below. There is no
tutorial, nothing is told, and no gesture is shown to be copied: no ring, no
arrow, no rhythm in a hum. There are five places (`penny/places.js`), and you play them
while Penny stands beside you. Every one is played by all the rules of the
game, so nothing on the map ever contradicts it: a post found crosses out its
colour, its row and column, and the squares that touch it. What changes is the
one thing each place is there to show:

1. a double tap opens a post
2. one post per colour
3. one post per row and column
4. posts cannot touch
5. nothing to hear: the rules alone

The hand has the same things to do as in the game. A double tap opens a
square. A finger on a square, or slid across the map, asks Penny to listen
there. And from the second place on, a finger lifted again quickly leaves a
cross as well, and the next quick tap takes it off. Two tiles in the bottom corners, left and right,
go back to the place before and on to the place after, as far as has been
reached.

Penny does not know where the posts are; it is looking too. How it feels about
the square under your finger comes from two things and nothing else.

- **Its head: the rules.** A square that the posts already found rule out gets
  a shake of the head and a glance at the post that says so. A colour, row or
  column with one square left gets a yes Penny is sure of. Both are instant.
- **Its ear.** Some posts are loud enough to be heard through the map by a
  finger close to them; the rest are quiet until opened. To hear, Penny shuts
  its eyes and listens for a moment, and then the post is right here, or close
  by on that side, or far off, or Penny cannot tell and says so. Fewer posts
  are loud in each place, and in the last none is.

What Penny hears is shown on the square that was touched as well as on Penny,
because that is where anyone is looking: a faint warm edge for something far
off, a glow for something close, a beating light for a post right there, a
moment's greying for nothing. It fades, except "right there", which stays
until the post is opened. Penny comes right up for anything close, and a
finger sliding across the map is answered square by square.

**This difference is what the places are for**, so it is put on the squares,
where the eyes are, and the two are made to look nothing alike. What Penny
hears is an amber warmth under your finger. What Penny knows is its own red
seal, stamped on a square that nobody touched, the moment a rule leaves a
colour, row or column with one square. The second place opens with it: one
square is the only one of its colour, the seal lands on it before anything is
pressed, and opening that post settles the rest of the place one square at a
time. The third and fourth begin the same way, with one square alone in its
colour, so there is never any wondering where to start; what follows from
opening it is the rule that place is there to show. Each time a post's crosses
spread and a seal lands on a square nobody has touched, that is a rule, seen. In the later places the seal holds back a while, to leave the working
out to you.

So a rule is learnt by Penny no longer needing to listen. Penny can be unsure,
and can be outdone: open a post it had no idea about and it is amazed at you.

In the first place, which is one square, a tap leaves it ajar for as long as a
second tap would count, and if Penny thinks there is a post in it, Penny holds
its breath for exactly that long; the wait grows with each tap left alone.

When a post is opened, the crosses of the rule the place is there to show come
first and slowly, lit one after another, so the rule is seen as a shape, and
Penny's eyes follow it. The other rules' crosses follow quickly.
Then, every time, this could be the one: Penny can hardly bear it, and holds
still to listen. If it is somebody else's mail, Penny is glad of the find with
you; that it was not the one is a breath and a glance up the map, no more.
Penny's feelings are kept in proportion to what has happened between the two
of you: a post found is the big thing, a cross is a small one. In the second, third and fourth places the last
post found has a piece of the sound Penny is after; it hums the piece back,
holds on to it a moment longer than it lasts, and looks a long way up the map.
What has been heard is drawn at the top of the map, a mark a note, and can be
played again from there, always further off than it was when it was heard.

A guess that finds nothing leaves a cross and costs nothing; Penny flinches,
and it is over. Penny cannot take a cross of yours off. One over a post it has
heard, or is sure of, frightens it; one that leaves a colour with nowhere
troubles it.

The last place is where Penny hears nothing, and it is made to be gentle. A
slide makes crosses there too, as in the game, and your crosses are Penny's
memory: a cross it can see the reason for gets a nod, and one it cannot gets
its doubt. One cross in the right corner leaves a colour with a single square,
and after the first post the rest follow one at a time.

Left alone, Penny looks at whatever it has sealed, and later goes and stands
underneath. With nothing known it waits for your finger, and now and then a
loud post stirs of its own accord.

One day passes over the five places: early light in the first, evening by the
last. In the last post of the last place there is no sound. There is Dot, who
looks out, map-small, and then crosses over to stand beside Penny. The portal
that opens after that leads out to a real solo game, and Penny and Dot come
through with you.

The places can be walked again afterwards, by going through the story again
from the portal, now quieter.
Dot is beside Penny from the start then, and is not found a second time: that
last post is somebody's ordinary mail. Nothing already heard is lost.

### Seeing the film again

The portal on the home page, or a tap on Penny there, plays the story again
from its beginning, the introduction (`/?hello`), and the film follows it.

The story is gone through by swiping up. The scene is a handful of screens,
and none of them moves on by itself: a swipe up turns to the next at once (the
up arrow and a wheel do the same), and a swipe up from the last, once one
square of the map is lit, goes on to scene two.

Each screen is a loop. It plays, and plays again, for as long as it is left
up, and no two turns of it are quite alike: the small differences are the
story. Nothing is lost by swiping early, and whoever stays is told more:
which is the theme, in the one thing the scene asks of you.

| Screen | Every turn | What changes | The room |
| --- | --- | --- | --- |
| The shelves | A letter of express mail, striped at the edge, lights, leaves its pigeonhole and goes into the map; Penny, who has no stripes, watches. | There is one fewer each time, and each goes quicker than the last. Penny gets up for the last, and hums after it. Then nothing leaves, and Penny looks along the shelves anyway. | The hand of the clock on the wall races, faster with every letter, and goes on racing when there is nothing left to hurry for. |
| The rush | Penny tries to be as quick as they were. | A dash across the floor to the map, and a call. Then from further back, faster, and louder, and it sags. Then a run with no heart in it. Then it stops. | Faster than ever while Penny runs. Only once it has stopped does the clock ease, turn by turn, and the dust begin to show in the lamplight. |
| The sound | One far-off sound out of the map, long and slow. | First Penny only starts at it. Then it answers under its breath. Then it walks, in its own time, to stand under the square it came from, which warms, and answers as if it were known. | Slow. The clock's hand has paled from red; the dust drifts; the lamplight is warmer. The sound was not to be heard over the hurry. |
| You | Penny looks from the map to you. | It turns; takes one unhurried step towards you, and a square lights. After that it asks, and every other turn it plays: it races you to the square, the same dash as before, and trills at getting there first. | The hand of the clock is a second hand and no more, and stays so while Penny dashes: a race for fun is not a hurry. The lit square breathes slowly. |

Nobody is told any of this in words. Whoever is caught waiting on the first
screen is shown by Penny, between turns of the loop: it looks out at them, then
down at the floor, and a fingertip of light slides up the room from there with
Penny's eyes on it. Nothing on the screen moves under a swipe, and the page
does not scroll.
That is after the first letter has gone, then after every second turn, and
after any turn in which the screen was tapped. Only the first screen does it.

The scene is silent until the first touch, with Penny's seal beating slowly
as the sign that there is something to hear. (An older scene of
Penny's story lived at `/?penny`; that address now opens scene one, and what
the film still uses of its styles is in `penny/story.css`.)

### Scene two: what slow hands make

Scene one is about stopping. Scene two (`/?slow`, `penny/slow.js`) is the
reason it is worth it: slowing down is beautiful because of what can be made.
It is the same room, slowed, and it is yours to draw in. There is nothing to
solve and nothing is counted. What a finger makes depends on one thing only,
how fast it goes:

| The hand | What it leaves |
| --- | --- |
| Fast | A thin cold scratch, straight, gone almost as it is made. |
| Slow | A wide warm ribbon in the game's colours, which stays. Shoots grow out of it, curl away and end in buds: the slower the line, the more of them and the longer they grow. |
| Still | A flower, opening for as long as the finger is held there. |

Everything is drawn twice, once each side of the middle of the screen, as ink
goes through a letter folded while it is wet. The room keeps to the rules in
"How a place says it": the clock on the wall goes at the speed of your hand,
its hand red in a rush and pale at rest. Penny watches the finger, winces at
a rush and warms to anything slow, and hums a note for a slow line now and
then, higher the higher up the screen it is. The arrow keys draw too, at a
walk (with shift, at a rush).

Whoever is caught waiting is shown, as in scene one: Penny looks out, and a
fingertip of light crosses the room slowly, leaving what a slow hand leaves.
That fades; it was only to show. Once a little has been made slowly, a portal
opens in the corner and leads on to the walk. It opens for slowness and never
for speed, and it does not hurry anybody through. What was drawn is not kept
when the scene is left.

## The home page

With an account, the home page has two tabs, drawn as two chunky tiles: the
one that is up is pressed in and lit.

- **Feed**: what is waiting on you, across your rooms. A game played together
  in which it is your move (with whoever moved last, and how far along it is),
  and invitations: time trials and pass phrases that somebody has started and
  you have not finished. Moves come first, then what you have begun, then
  what is new. Each is a tile that opens the game. The number waiting sits on
  the tab. Games that are over, games you are waiting on someone else in, and
  phrases you wrote yourself are left out.
- **Lobby**: everything else. Your rooms, and the tiles for opening or
  joining a room, Liv Radio (making music) and Museum (the radio).

Above both tabs is the one wide button of the page: play, a board of your own
at once (`/postmarks/`). Your account is your face in the top right corner.

**Play is the first places first, once, for everybody** (the owner, 26
November 2026): until the five places have been walked on this device, the
button leads through the portal to the walk with Penny (`/?walk`, "Walking the
map"), where the rules are shown one at a time, and goes on leading there, to
the place that had been reached, whatever has been played already. The last of
them opens onto a board, and from then on play is a board and the walk is the
portal's, at the foot of the page. Only this button is turned: a game somebody
shared, or one in a room, still opens as itself.

Someone with rooms starts on the feed; after that the tab last up is
remembered. The feed is worked out in the browser (`shared/feed.js`) from what
each room already tells its own page, so the server has nothing new: it asks
the dozen rooms most recently opened, on arriving, every half minute, and on
coming back to the app. What it last found is kept, to show at once next time.
Without an account there are no tabs, only the two ways to get one.

## Loops, the music maker

**Play is lit for a beat that has just arrived.** When a shared beat is
opened by its link it is on the board, and silent: the play button wears a
ring in the accent with a soft light that comes and goes slowly, until it is
played. Not otherwise, and not on a first visit.

`/jam/` (`jam/jam.js`) is a board of tiles, eight steps across and seven rows
high, with four instruments that loop together. Its name is not written on
the page (it was, over the board, until v1.1.82): it is the window's title,
and is said to screen readers. It is built on the same
things as the game's background music (`postmarks/sound.js`), so that what
is made there sounds like it belongs with it:

- **The harmony moves.** The board is played four times over, once for each of
  the game's four chords (C, A minor, F, G), and a row is a place in the chord
  being played, not a fixed note: the bottom row is its root. Eight steps
  tapped once come back four ways. Four lights over the board show which chord
  is playing.
- **A chord is held under it**, quietly, swelling in and out with each bar.
- **There is room round it.** Bells and keys have an echo a step and a half
  behind them, in time with the tempo. Bass and drums are kept dry.
- **It is played, not triggered.** Beats are struck harder than what falls
  between them, no two notes quite alike, and the off-steps come a little late.
- **The dice write a tune the way the game does**: likelier on the beats,
  moving by small steps, leaving rests; the bass keeps mostly to the root.

**Penny dances to it.** Penny stands at the bottom edge of the window, as
everywhere, still until the loop plays. Then every move it makes is on the
beat and comes from what is being played: a hop on a kick or a tom, a wiggle
on a snare or a clap, a hop on the beat itself where no drum marks it, a nod
for a note that falls between, a jump when the four chords come round to the
start, and a step to one side and back with each bar. Dot, once found, hops
to the bells. Penny does not hum here: the music is yours. When the loop stops,
so does it. This page is longer than the window, and is scrolled under it,
so here it looks again whenever the page moves or the list of beats grows:
it comes only as far up as leaves every button to be seen (never more than
half of one behind it, anywhere along the step it takes), and where there is
no such place, as when the last saved beat lies along the bottom edge, it
goes under the edge until there is room again (`clear()` in `penny/pal.js`).
And on every screen a tap that lands on Penny where something of the page's
can be pressed goes to that.

**Saving and sharing a beat.** Save keeps the beat on the board under a name
that can be changed by tapping it; each saved beat shows as a small picture of
its board, and a tap on that puts it back on the board. Each saved beat has
its own share button, and that is the only one: a beat is saved, and then
shared (there was a second at the top of the page until v1.1.80). Share hands over a
link (through the phone's share sheet, or copied where there is none) with
the whole beat written into it: 39 characters after `/jam/?b=`
(`jam/beat.js`), so a link never stops working. Whoever opens it finds the
beat on their own board, to play and to change. Putting a beat on the board,
from the list or from a link, never loses what was there: if that was not
already saved, it is put by as "Unsaved beat" (one at a time, and on this
device only).

**Saved beats follow the account.** The list belongs to the profile, like the
rooms: it is kept on the server (`beats_get`, `beats_put`, `beats_drop`, in
`supabase/migrations/20261124000000_beats.sql`), thirty at most, and every
device in the same profile has the same one. The device keeps a copy, so the
list is there at once and offline, and brings it into line with the server
when the screen opens, when the app is come back to, and after anything is
saved, renamed or deleted. A beat saved offline is sent when it can be; one
deleted on another device goes from this one too.

**The drawer of sounds.** The drawer, beside the bin (drawn as a drawer: it
was a microphone until v1.1.81), opens on the sounds there are for the
instrument that is chosen: the instrument itself, the other three
instruments, and every sound that has been recorded, newest first. Any of
the four instruments can be played in any place: the keys where the bass is,
the drums in a fifth place. It sounds there as it does in its own place, the
place's button wears its mark and its name, and the rows are its rows (kept
for the place as `kind:0` to `kind:3`, in `jam:slots:v1`). Record, at the top of the drawer,
makes a new sound each time and never takes the place of another
(`jam/mic.js`): it listens for three seconds at most, or until it is pressed
again, and the loop is quiet meanwhile. The new sound is called "Sound 1" (2,
3…) until its name is changed, by tapping it, to anything of twelve letters or
fewer; and it can be deleted. Pressing a sound in the drawer swaps it into the
chosen instrument's place, and pressing the instrument itself swaps that back.
The instrument's button on the board then wears the microphone and the
sound's name, and the drawer beside the bin is lit in its colour. The same
sound can be in more than one instrument's place.

What was heard is cut to the sound itself, a second and a half at most, and
is played faster for a higher row and slower for a lower one
(`jam/sample.js`). If the sound has a note (a hum, a whistle, a struck
glass), the note is found and the sound is played in tune with the chords, in
whichever octave leaves it nearest to how it was heard; a clap or a word has
none, and is moved by as much. In the drums' place the rows are seven heights
of the sound, and the chords leave them alone. A microphone that is refused,
or hears nothing, says so under Record.

**The deck holds up to eight.** The four instruments are always on it, and
beside them there is room for four sounds more. "Add", at the end of the deck,
opens the drawer for a new place: a sound pressed or recorded there, or one
of the four instruments, becomes a
button of its own, in a colour of its own, with its own part on the board
(in tune with the chords if the sound has a note, seven heights of it if it
has none). In the drawer for such a place the first row is "None", which
takes the place off the deck and its part with it. A beat with a part for
any of those four is written the long way, 76 characters instead of 39
(`jam/beat.js`); one without is written as it always was.

**A shared beat brings the deck with it.** Where a place plays another of
the instruments, the link says so after the beat, a letter for each of the
eight places (`&o=--1-----`: the keys, where the bass is), and whoever opens
it has the deck as it was shared.

**A shared beat brings the deck's sounds with it.** When there are recorded
sounds on the deck, sharing leaves a copy of them on the server (`share_put`,
in `supabase/migrations/20261126010000_shares.sql`) and the link says where:
`/jam/?b=…&s=…`. Whoever opens it gets the beat on their board, the sounds
in their drawer (theirs from then on, kept in their own profile) and on
their deck in the places they were in. The copy is the sounds as they were
when shared: renaming or deleting one afterwards changes nothing shared. A
profile's twenty most recent shares are kept; an older link, or one shared
while the server could not be reached, still has its beat in it and is played
by the instruments.

**The sounds follow the account**, as saved beats do: twenty-four at most,
kept on the server by profile (`sounds_get`, `sounds_fetch`, `sounds_put`,
`sounds_drop`, in `supabase/migrations/20261126000000_sounds.sql`) as 16-bit
samples, and a copy on the device (the browser's own database), so the drawer
is there at once and offline. The two are brought into line when the screen
opens, when the app is come back to, and after a sound is recorded, named or
deleted: a new sound is sent whole, once, and only its name after that; one
recorded offline is sent when it can be; one made on another device is
fetched; one deleted on another device goes from this one too. Which sound is
on which place of the deck is the device's own, and a saved beat is its
notes: it is played by whatever is on the deck when it is opened.

A loop played here is played as it is written; the long form that Penny's
Radio gives a loop (`jam/form.js`) is for listening, not for composing.

What it still does not have, next to the game's music: more than eight steps,
notes of different lengths, any way to choose the chords, and a deck that
is saved with each beat.

## Liv Radio

`/jam/?taste` (`jam/taste.js`), "Museum" on the home page's menu and a
radio at the top of the music maker, is a work in a gallery. To whoever plays
it, it is a radio; behind that, it is an experiment: can a model of what you
like in a loop predict your choices, and can that be shown to be more than
chance? It is played, and it is read about. Playing it has no words in it but
the gallery's label and the set's own markings, which are part of the drawing;
the words to read are in the reading.

**The gallery.** A world afraid of losing its music to the averaging of taste
keeps a gallery for it, and the radio is one of the works there. The screen is
a room of it, at dusk, and the room is built of the world: a deep blue-green
wall, never the white of a page, with the map's squares faint on it; a light
from above that falls on the work and washes the wall behind it; and a floor
that is the map laid flat, its squares going away from you, small at the wall
and wider at your feet. The radio stands on a pale plinth, drawn as the set is
drawn (a face, a top its feet stand on, a side in shadow), and the plinth
stands on the floor, a little nearer than the wall. Penny stands at the bottom
edge in front of it, a visitor, as you are. Everything in the room is low and
soft, and nothing in it moves but the light. The plinth takes the room under
the set that a line of words used to, and no more, so the set is as big as it
was on every phone; the set and the plinth are as wide as each other by one
rule (`--work-w`).

**The label.** On the face of the plinth, where it is read first, is the
gallery's label, written as a gallery writes one: the title in italic, what it
is made of, and whose it is.

> *Liv Radio*
> Steel, enamel
> Two stations, one listener
> Anonymous loan

A screen reader reads it as the work's caption. It says what the gallery says,
and leaves out the rest: nothing on it says the radio is an experiment, who lent
it, or what the tag on its side is.

**The light.** While the one who shows how is there the light is cold, and when
it has gone the light warms, slowly (as in every place: cold in a hurry, warmer
once things have slowed). That is all it does. It follows the story, and not
the learning: it is the same on the first day and after a thousand stations,
whatever the experiment makes of them, because a light that changed with the
learning would say something about it (closer could be read as kept, or as
narrowed), and the room does not take a side in the question the piece asks.
Nothing else in the room follows the experiment either, but the meter on the
set, which is the experiment's own (below), and takes no side either.

**The set.** A small portable radio: a handle, an aerial, a plate with its
name, a speaker with a meter set into its end and a lamp beside it, a dial, a
display, a readout, and along the bottom a tuning knob, play and pause, five
preset lamps and Keep, and a tag hanging from its right side with a flask on
it. It is drawn flat and given depth the way a drawing is: a solid edge down
its right side and along its underside, a shadow on the plinth, a slight lean.
All of it is always on the screen, at any size (everything on it is sized from
its own width).

**Playing it.** Two stations are on the dial at a time, each a loop, each at a
place on the dial worked out from the loop itself (so a loop is always the
same station). A swipe across the set, or a press on the knob, tunes from one
to the other, with a moment of static; the needle crosses the dial, the knob
turns, and the readout gives the station in its own colour. A double tap, or
Keep, keeps the station that is tuned in. It stays on the dial, marked "Kept 2
of 5", and a new station comes in beside it: something new, or the kept one
changed a little, more often the first: mostly near relations of a favourite
is the sharper test of it, and the same thing over and over to listen to. A
station kept five times running is saved to a preset and lights a lamp, and
two new stations take the dial, so that no early favourite sits there for
ever. A press on the lamps opens a sheet of the presets, which has no words,
since it is part of what is played: the set's five lamps, lit as they are on
the set, and each station saved, the latest first, as its picture on a small
display and its place on the dial, with an arrow, the way out; a press on one
opens it in the music maker. A screen reader is told what each is and where it
goes, and that a station kept five times running is saved there. A round key
at its foot shuts it.

**A station is a piece, not a loop.** A loop is one bar of eight steps, and
played round and round as it stands it is pleasant for a quarter of a minute
and then a thing stuck: the same tune, the same kick in the same place. So a
station plays its loop in a long form (`jam/form.js`): a loop inside a longer
loop inside a longer one, each changing something the one inside it left
alone. Which bar it is, counted from when the radio was turned on, says where
it is in all of them at once:

| The loop | How long (at 100 beats a minute) | What changes round it |
| --- | --- | --- |
| A bar in its phrase | 4 bars, ten seconds | The chord. And the tune goes said, answered (its second half a step higher), said again, turned round (its second half backwards). |
| A phrase in its section | 16 bars, forty seconds | How hard it is played: stated; lighter (half the hats, the kick only on the one, the keys quieter); the keys answering half a bar late; a build, with a fill on the drums to end it. |
| A section in its movement | 64 bars, two and a half minutes | The order of the four chords, different in each; a section with the bass only on the beats; and one that opens with a phrase of rest: no kick, no snare, no bass, the chord held under what is left. |
| A movement in its piece, and the piece in whatever is longer, without end | 256 bars, ten minutes; then forty; and on | The key: each of these moves the whole thing up or down a few notes and brings it home again. |

Nothing in it is chance: the same loop at the same bar is always the same, and
the rules are the same for every station, so two stations side by side are at
the same place in the same form and neither is flattered by it. It is still
the loop it was: the tune is as written in more than half its bars. The
display shows the bar that is being played, so it changes with the form. The
clock of the form runs on from one pair of stations to the next, so a station
that is kept is heard further into its piece each time, not from the top
again; where it stood when a station was kept is written down with the pick.
The music maker does not do this: there, what is on the board is what is
heard.

**Somebody shows how, and never why.** The first time the radio is on,
somebody else comes to stand by it: an express letter, a red and blue stripe
round its edge, all hurry, the kind of post Penny was left behind by; in the
gallery, the attendant, in a peaked cap. It hangs its orders over the
gallery's label, on a sign of cold enamel in its livery, one at a time: its how
over the gallery's what. A fingertip drawn across (swipe), the play sign, an
ear (listen), the fingertip drawn back (the other one), a fingertip in two
rings (tap twice to keep one), each pointed at again every few seconds until it
has been done, and an hourglass for a station kept before both have been heard.
Signs and not words, because the radio is played without words; and a sign
that needs none, the same in every building, is the hurry's own way of saying
a thing. It never says why, and it does not cheer: when a thing is done it
ticks. Penny watches it from under the edge, unsure, and shuts its eyes and
listens when you listen. When a station has been kept it ticks a last time,
looks at you, and is gone up the side of the radio, and takes its sign off the
label as it goes: the label can be read again. Its name, Dash, is in the code
only. (A screen reader is given the orders in words, and they name the buttons
too: "Swipe, or press Tune." The sign itself is a picture, hidden from it.)

**Penny notices the tag.** The tag on the side of the set is in plain sight
from the start, and can be pressed at any time. It is not the gallery's, and
the label does not mention it. When the one who showed how has gone, Penny
looks at the label, which is words, and cannot read it; then it sees the tag,
which is a picture. It goes and stands under it, in front of the plinth and
clear of the label, looks at you, throws a fingertip of light at it and hums a
question; the first time round it asks again, harder, jumping for it. Then it
tries to say what it is, and cannot: the note sticks, and it sinks. Penny
cannot speak, read or write.

**Dot says it.** If Dot has been found, Penny turns to Dot. The radio goes
quiet; Penny looks the way the express letter went, at the tag, and back at
Dot, and pleads; Dot nods, and says it for Penny, as an audio guide speaks at a
work, in a bubble, a few words at a time on three falling bells: "You're part
of an experiment." This is where the visitor first learns that the radio is an
experiment; the question is in the reading. Then the reading opens by itself,
once, and not while a finger is on the screen. Without Dot nothing is said and
nothing opens by itself: Penny waits under the tag, asks once more, and goes
back. Whenever the tag is pressed, that is what Penny wanted, and it is
thrilled.

After that Penny only keeps time, one small hop at the top of each bar, the
same whatever is playing: it gives no opinion of a station. It nods when one
is kept, jumps for a preset, and shakes its head at a station kept before
both have been heard. It hums for the tag, and otherwise only before the
radio is on. All of this happens once on a device; "Show me how again", in the
reading, plays it all again.

Two things are there for the experiment's sake: a station cannot be kept
until both have been heard for a second and a half each (three bars of signal
fill as one is listened to, and its mark on the dial fills in), and a coin
decides which is tuned in when a new pair arrives. The set also answers to
the arrow keys and Enter.

**The display is lit by the loop.** It shows the station as the board, a dot
for every note. Four lamps hang over it, one for each instrument, and each
throws a beam when its instrument sounds. A note that sounds jumps and flares,
and a ring spreads from it; a bar of light crosses with the beat; the display
glows in the colour of what has just sounded, harder on the beat; and at the
top of every bar a gleam runs across it. At rest the notes twinkle. Both
stations are lit by the same rules. With reduced motion only the bar moves.

**The meter.** Set into the end of the speaker, beside the name plate, is a
small panel meter with a cream face, and on the speaker beside it a pilot lamp.
Its needle is the stake of the test behind the radio (below): how far the
evidence has got. The scale is a log scale, even in multiples: ×1 at the left
stop, ×20 at a heavy mark, and past the mark a wash of warm honey on the face,
fading out towards the right stop, at about ×31 (a wash, not a band along the
scale, so that it reads as where it has got to and not as a VU meter's
overload zone). Below ×1 the needle rests on the left stop, and dims the
further the stake has sunk, from full at ×1 to about half at ×1/20, so that
how far below it is can be seen and not only that it is. A sliver of brass in
the needle's own shape stays at the most it has been, as the drag pointer of a
real meter is pushed up and left there. When the stake reaches ×20 the lamp
warms up and stays lit, for good: that is significance at the 5% level, and
starting over (below) does not put it out, whatever stake is carried on. Before the
model is on record (the first ten picks of an experiment) the face is unlit,
and ten small pips along an arc inside the scale light, one for each pick. There are no words or numbers on it; to a screen
reader it is a meter, "Evidence ×5.9 of ×20; at most ×8.2", with
"significant since pick 47" once it is ("significant since pick 47, before it
was started over", if it got there in an experiment before this one). The
numbers are in the reading.

Soothing first. It moves slowly, as a meter's needle settles, with the least
overshoot; with reduced motion it is put where it stands. The lamp and the
band past ×20 are a neutral, warm honey, never green, which says "good", nor
red, which says "bad": the meter shows how far the test has got, and leaning
either way would tilt the question the piece asks. The one moment it marks is
the lamp coming on: as the needle gets there the lamp warms, a soft glow
spreads a little way from it, once, and one low bell sounds, the same for
whoever it is and whatever was kept. Only a pick can do that: not arriving at a
radio that is lit already, and not starting over. Penny takes no notice of it,
as Penny gives no opinion of a station.

It moves after a station is kept, and at no other time. Everything it shows is
worked out from picks already made (`meter()` in `jam/taste-model.js`); the
model's call on the pair that is up is never on the radio, not on the meter,
nor anywhere else on its face. Were it there, whoever could see it could
follow it, the needle would rise for following, and it would no longer be a
measure of taste. So nothing on the meter is so much as written to between a
pair coming up and a station being kept: not tuning, not listening, not a
station refused, not a sheet opened, not a reload, not even with the model's
call on that pair turned round. (The browser checks, `ONLY=meter npm run e2e`,
hold it to this with a watch on every change to it and a whole copy of it
compared before and after.)

It keeps the set at its size: it is taller than the speaker it is set into,
and its bezel overlaps the margin above and the gap below, so the set is the
size it was on every phone.

**The reading.** Nothing on the face of the radio says it is an experiment but
the tag on its side and the meter, which does not say it in words, and nothing
on its label. The tag opens the reading, a
sheet over the work: the gallery's entry for it, set as a gallery sets its
words. (To a screen reader the tag is "Read about this radio": what pressing it
does, and nothing of what is there.) At the top, small, the name of the place
(The Gallery of Kept Music); the title in italic, and the label under it. Once
Dot has said it, Dot's line, as the audio guide's stop for the work, and under
it whose words they are:

> "You're part of an experiment."
> AUDIO GUIDE
> Dot, for Penny, who saw it first and had no words for it.

That is the moment the writing keeps coming back to (Penny, above): somebody
else says for Penny what Penny could not, and something that was in plain sight
is out in the light. The reading shows it in a caption and does not say what it
means. Then what the label leaves out: "The tag on its side, in plain sight all
along, is not the gallery's: this radio is also an experiment." And then,
before anything of how the experiment stands, so that a visitor meets it
without reading past the numbers, set apart between two rules, a sentence of
why there is a gallery at all and the question the piece asks:

> The gallery keeps music for a world afraid of losing it, as taste is
> averaged ever more efficiently.
>
> *Is a radio that learns one person's taste a defence of that taste, or one
> more step in the averaging?*

The reading asks it and leaves it open: nothing in it answers the question or
leans either way, and nothing after it comes back to it. Nothing right after it
reads as a reply: under a small heading of its own, "Where the test stands",
comes the test as a figure, whose caption says what is measured and never
begins with a yes, a no or a "not yet", does not count down, and is set the
same however the test stands; then the numbers; what the model thinks you go
for; the phantoms, drawn (the station you kept, a challenger that is heard, and
its eight twins, made alongside it and never heard, a stack of dashed outlines,
each captioned: "Its eight twins, never heard: the phantoms"); how it works,
folded; and what the sheet is used for: copying the data out, starting over (which asks
first), and showing how again. Going back to the radio is in a foot that does
not scroll, so it is always in reach. The sheet keeps clear of the notch and
the home bar. It opens at its title, with the title focused for a screen
reader, wherever the phone would rather it opened. It is printed on the
plinth's warm stone, never the white of a page, and in the dark theme on a warm
charcoal, and it comes up slowly over the room (with reduced motion, it is
simply there); the presets' sheet is the same. With the label, it is the one
place on the screen with words to read; the set's own markings are part of the
drawing.

**The model** (`jam/taste-model.js`). A loop is turned into fifteen numbers:
tempo, how busy each instrument is, kick, snare and hats, how much falls off
the beat, how high the tune and the keys sit, how far the tune leaps, whether
the bass keeps to the root, how thick and how sparse it is, and whether there
are drums. The model is a logistic regression on the difference between the
two loops, with three more terms for habits that are not taste: a leaning to
one side of the card, to the reigning loop, and to whichever was heard first.
It is learnt afresh after every pick, and from the tenth pick on it says in
advance which loop will be picked.

**The test.** Being called right is not proof: someone who always keeps the
reigning loop is easy to call and has shown no taste. So each time a
challenger is needed, nine are made in exactly the same way (the same call,
fresh randomness) and eight are thrown away unheard, the phantoms. Before the
pick the model is asked about all nine, with the same weights, the same loop
reigning and the same coin for which is heard first: how likely the pick to
come would be with the real challenger (r), and with each phantom in its place
(f1 to f8). If the music made no difference to the pick, the real challenger
would be no better a guide to it than any phantom: it would be one of nine made
alike, as likely to be any of them, whatever the habits. A stake starting at 1
is multiplied after each pick by 0.1 + 0.9 × 9r / (r + f1 + … + f8): nine
tenths of it ride on how much likelier the actual pick was with the real one
than with the nine on average, and a tenth is held back so that one confident
mistake never takes it all. Were the real one any of the nine, that ratio
would be 1 on average, exactly, however the model came by its chances: a fair
bet. Such a stake reaches ×20 less than one time in twenty against a fair bet,
however long one plays and however often one looks (Ville's inequality), so
×20 is significance at the 5% level with no number of picks fixed beforehand.
That is why the meter can be looked at all the time, and why it may move only
after a pick.

**Starting over** throws away the picks, the model and the presets, and asks
first (in the words it always has: what is carried is for the reading to
explain); but the stake carries on from where it stands, into the new
experiment, which warms up again. The product of one experiment's stake and the
next is still a fair bet, so starting over never wipes out a loss, and cannot be
used to reach ×20 by starting again whenever it sags. And so the stakes carried
from one experiment to the next are one test, one test martingale, and its
reaching ×20 at any point of the whole history is the event Ville's inequality
bounds: once the lamp has lit it stays lit, and the test is significant, whatever
stake is carried on afterwards, even one below ×20 (the owner, 25 November
2026). `standing()` has it from the record of the restarts, each with the peak
of its experiment and the pick at which it reached ×20 (`significant` and `best`
are for the whole history, `reached` says where in it, `{ experiment, pick }`;
`peak` and `reachedAt` are this experiment's). On the meter the needle stays
where it was, the pointer at the peak comes back to it (the most it has been,
since: the pointer is this experiment's own), and the face warms up again with
the model; the lamp, if it was lit, stays lit. Only a pick sets off the moment
the lamp comes on: a start over or a reload never plays it again.

**Picks made before (v1.1.59 and earlier)** had one phantom, and a share of the
stake rode on which of the two predictions gave the pick the higher chance, as
far as two fifths. Each pick keeps the rule it was made under, fixed when its
pair came up, before it was made: those picks, which have no `pPhantoms`, are
worked out as they always were, to the last digit, so whoever had a stake, a
peak and a ×20 under the old rule has the same stake, the same peak and the same
lamp on the meter, and the stake carries on from there under the new one. (The
pair that was up when the radio was last saved under the old rule was called
with one phantom, so it is bet on by that rule too.) A fair bet followed by a
fair bet is still a fair bet. Radios saved by v1.1.58 itself
(`tests/fixtures/radio-saved-v1.1.58.json`: histories played with v1.1.58's own
model, then two stations kept by hand on v1.1.58's radio in a browser, which
saved them) hold it to this, in the unit tests and the browser checks.

The reading shows where it stands after every choice: the stake; what it was
carried over at, if it has been started over; a plain rule filling towards a
mark at ×20 as far as the stake has ever got (in the whole history, before any
start over too), in the colour of neither a win
nor a loss (the gallery shows how far it has got, and does not cheer it); how
often the model called the pick right, how often habit alone would have, how
often the real challenger beat the phantoms (gave the pick a higher chance
than they did on average), and what the model thinks you go for, in words.

**What is written down.** The picks are kept on the device, each with its pair,
what the model said of it beforehand (`p`, `q`, `pPhantom`, and since v1.1.60
`pPhantoms`), the pick, and when (`at`), how long it took and how often the two
were tuned between, and where the long form was (`bar`). Since the meter each
is also written down with:

- `metered`: true only if the needle was showing the stake (the model on record,
  past its warm-up, so the pick was bet on) and the meter was in sight as the
  pick was made (on the screen, at least half of it, not under a sheet, not
  faded out, nothing over its middle, in a window that is not hidden); false
  otherwise. Picks made before the meter have
  no such field, and are the baseline: what was picked with no evidence in
  sight. With it, "the model learnt my taste" can be told from "I learnt to
  please the meter".
- `heard`: how long each side was listened to, `{ front, back }`, in
  milliseconds; `decideMs`: from the pair coming up to the pick (both counted on
  that visit: a reload starts them again). (`ms`, `heardFront` and `heardBack`
  are the same numbers, under the names they were first kept by.)
- `version`: the app's.

Each time it is started over is written down too (`restarts`: when, after
which pick of the experiment it ended, the stake carried, the peak it had
reached, the pick at which it reached ×20, `reachedAt`, and the version), with the stake the experiment now under way
started from (`carried`), so that a restart is never invisible in the data.
The pair that was up and was thrown away unpicked goes with it (`voided`: its
loops, what the model had said of it, `p`, `q` and `pPhantoms`, whether it was
bet on, `bet`, which side was tuned in, `up`, and how long each had been
heard). That matters: after the warm-up the pair that is up is a bet, and
somebody who starts over whenever the pick they are about to make looks like a
loser can raise the stake with no taste at all (the decision to void depends on
the music, so this is not the null the test covers, and Ville is not broken;
but it is "pleasing the meter"). The record lets whoever studies the data see
whether pairs were voided selectively. (Whether a pair voided after the
warm-up should also be settled at the worse of its two outcomes, which would
make voiding never pay and keep the test valid, is a change to the rule fixed
on 24 November and is the owner's to make: it stays as it is, only
written down, for now, and is logged as issue #101.) A save that is there and cannot be
read is never written over: it is put aside under a key of its own
(`jam:taste:v1:lost:…`), and a new experiment begins with the stake carried on
from it as far as the picks' records give it, written down as a start over
marked `lost`.

Each time the model is looked at is written down as well (`looked`: the reading
opened, `reading`, or the data copied out, `copy`, with after which pick, when,
and the version), so that picks made after looking at the model can be told from
picks made without. The reading's "So far it thinks you go for …" and the
exported weights tell anyone who wants to know which way the model leans on the
pair that is up; and the picks alone determine the model (it can be fitted again
from them). Following the model is a way to please the meter with no taste;
`looked` is how the report can see who might have.

"Copy the data" gives out all of it, with where the test stands, the model's
weights and the version; never the pair that is up, nor what the model says of
it.

**What a radio cannot hide.** It runs on the device, so the pair that is up,
with the model's call on it and on its phantoms, is in the browser's storage in
plain words, and anyone with the browser's developer tools can read it and win
every bet. That is an inherent limit of a test run on the player's own device,
and is accepted; the meter is a measure for somebody who plays the radio, not
proof against somebody who takes it apart. The radio open in two windows is not
a way round it: each save is marked, a window writes only over the save it last
read or wrote, and a window whose pair has been overtaken by a pick made in the
other refuses its own pick, with a shake, and takes up the radio as the other
left it (otherwise the other side of the same pair could be kept in the second
window after seeing the needle fall in the first, undoing the loss).

In the study's simulation (below) a marked taste is found in about 51 picks,
a mild one in about 87, and someone with no taste and a strong habit fools it
no more often than the 1 in 20 allows; `tests/taste.test.js` holds the model to
finding a marked taste, and not being fooled by habit. What it can find is
limited to what the fifteen numbers can say. Nothing about how challengers are
made looks at who has been winning beyond the length of the present reign.

**Decided before any picks were looked at (24 November 2026).** A study of
the test by simulation alone found it valid, including for someone who
watches the stake and chases it, and found three changes worth making. The
owner agreed to them before anyone's real picks had been looked at, and they
went in with the meter on the radio's face, in v1.1.60 (picks made before keep
their rule, as above):

- **Eight phantoms, and the bet as their likelihood ratio.** Each challenger
  is drawn nine times in the same way and eight are never heard; the stake is
  multiplied by 0.1 + 0.9 × 9r / (r + f1 + … + f8), r and the f's being the
  chances of the actual pick with the real challenger and with each phantom.
  In simulation this reaches ×20 about two fifths sooner (a marked taste in
  about 51 picks rather than 87, a mild one in about 87 rather than 148), with
  no more than 1 in 20 for no taste.
- **The stake carries on through "Start over".** Without this, someone with no
  taste who starts over whenever the stake sags reaches ×20 about one time in
  five; with it, under one in twenty.
- **The model's fitting takes halving steps.** It could fall into a two-step
  cycle in its first thirty picks and never learn; the fix is to the model,
  not the bet, and is valid with any bet.

The rule is not to be tuned again on anyone's real picks. Many devices, or
many strategies, each reaching ×20 now and then, are many tests: what is found
by exploring is to be confirmed afresh on one device, from the start.

## Seasons

Some features are to come for a season and go again, as seasons do in games.
The first is **the two worlds**, and its season has come: a room's other
self, the same room as a serious, adult, live-action drama at night, a story
split between animation and live action, comedy and drama. It is entered
through a portal, a ring of light in a room's top bar with no words on it, there
for members, on that one screen (Rooms, "Two worlds"). The room stays soothing
for anybody who does not step through; stepping through is the turn from
soothing to wrestling with the dark, taken on purpose, and the portal is as
much the way back out. Nothing of it is kept: every visit to a room begins
outside. Of the two prototypes made (a film splice; a seam that splits the room
in two), the seam is the one in the app. It keeps the rules they were built to:
never more than three flashes a second, nothing for anyone who asks for reduced
motion but a slow cross-fade in and out and a still drama between, and nothing
moving under a finger; and one more, for a world that is entered: the way out
is always within reach. Outside its season, and outside the portal, the app is
soothing (CLAUDE.md, "Look and words").

## Tags, and the night

A tag is something hidden in the app, to be found and kept, as on a scavenger
hunt (`penny/tags.js`). Nothing in the app says that there are any. Whoever
notices one and touches it has found it: it is theirs from then on (on this
device), and it is kept on the home page's map, at its foot, beside the
portal. There is one so far.

**Where it hides.** On a screen, somewhere in what is empty of it, and
somewhere else each visit: a small mark, the picture described below, printed
in the page's own ink and as faintly as the map itself. On the map behind the
board of a game it is in one of the map's own faint squares, and which square
changes from game to game. It is never up against the board, where a slip of
the finger would be a move, nor where Penny is standing, nor on or beside
anything else on the page, nor on the places already walked that lie below
the one Penny is at; if the page changes under it, it moves; and it is
not there at all while a time trial is being run. Nothing points at it, and
Penny, who gives nothing away, neither looks at it nor makes way for it. It
glints, now and then, but only once nothing has been pressed for a few
seconds: like everything else in Penny's world, it is found by whoever is not
in a hurry. (It can also be reached with the Tab key: it is the last thing
on every page.)

**It is small, and it is still something to press.** So it is held to what
everything to press on a phone is held to (`CLAUDE.md`,
`tests/browser/mini.e2e.cjs`). However small it is drawn, the room it has for
a finger is never under 44 by 44. Its box never overlaps the box of anything
else there is to press, and is put a little way off from all of them. And it
is never under a phone's notch or its home bar. What follows from that is
that it is only where there is room for it. In a room, which is a building
that fills the page, that is on the map outside the door, beside the path, at
the bottom of the page. In the music maker, on a phone, there is seldom room
for it (only on the taller screen the app has when it is installed, and only
until a beat has been saved), and where there is none it is not there:
between two buttons is no place for something that is found by a slip of the
finger. Everywhere else it has been tried, on every phone the app is held
to, there is a place for it.

**It is a way through**, and it goes on being one after it has been found.
The mark stays wherever it has room, a little plainer for being known, so
that from nearly anywhere there is a way out into the night. (On the home
page it is where it is kept, and nowhere else.)

**Going through is a tumble.** The screen falls away, turning as it goes,
down into the place the mark was, with the night coming up behind it; and the
picture comes up out of that place, turning a whole turn the other way and
growing, until it is upright exactly where the night has it. The way back
from the night leads to wherever it was gone from, and tumbles the other way:
the screen comes turning up out of the dark, and rights itself. With reduced
motion there is no tumble, only the one screen and then the other.

The picture that tumbles in is the night's own, to the pixel: the same shapes
drawn from the same path (`starPath` in `penny/stars.js`), the same colour, in
the same place, which is on whole pixels. When it has landed the night's
lights are lit under it and it is taken away, and nothing can be seen to
change. On its way it is only moved, turned and scaled, never laid out or
drawn again, which is what a phone can do smoothly. And the night is always
the size of the window: it fits its picture to its own room whenever that
changes, and a screen being left is out of the layout before the next one is
put on the page (`shared/nav.js`), so that a screen measuring itself as it
arrives is not as long as the one it was come to from.

### The night

`/?sky` (`penny/sky.js`) is a picture, come to life. The picture came first:
five lights on black, three stars with four points falling in a line from the
top left, each bigger than the last, and two small round ones, one either
side of the line. The places, the sizes and the black are measured off the
picture, and so is the shape of a star (`penny/stars.js`): 1.4 times as tall
as it is wide, with sides that curve in until its points are needles.

The screen opens on that picture, as still as a picture: in a square window
the size of it, laid one over the other, 98% of what is lit in either is lit
in both. Only it is far dimmer, at well under half the picture's brightness:
something to look at in the dark for a long time. And it is slightly warm:
the black is the picture's own, and against it the lights are the colour of a
lamp seen a long way off, not of a screen, with a glow a little warmer than
they are. Then it wakes, a light at a time, in the order it is read, left to
right, each with its note.

**Nothing is ever added to it.** No more stars, no sky round them, no colour,
and nobody standing under it: Penny is not in this scene. It is the same five
lights for as long as it is looked at. What is alive is how they are there.

- **They wander.** Each strays a little from its place, the way a speck in
  water does, and is pulled back the further it goes: about a hundredth of
  the picture's side, on a path with no corners in it that never repeats.
- **They are afloat.** The whole picture drifts a little as well, more slowly,
  as whoever is looking at it does; and what is near goes by faster than what
  is far, which is what makes it deep.
- **They are not solid.** A light is itself, faintly, and six fainter copies
  of itself laid over it, each a little out of place. Where they lie on one
  another they add up to its brightness; at its edges and along its points it
  is soft, and never the same twice.
- **They glow**, a little, and the glow breathes with them.
- **They twinkle.** Their brightness comes and goes, the far ones' by a good
  deal and the near one's hardly, as stars' does and a planet's does not. And
  now and then one twinkles outright: its copies fall into place, it is sharp
  and brighter for a moment (though never as bright as the picture), and its
  points draw out. That is when it is heard. Nothing comes off it: the five
  lights are all there is. (Specks that came off a light and were knocked
  about for a second or two looked like flies round a lamp.)

A light that is touched twinkles. A touch anywhere else, and the nearest one
answers, more quietly. A finger run across them sounds each as it is reached,
and a finger held near them warms them: they stray further, twinkle oftener
and turn towards the colour of an ember for as long as it is there. The keys 1 to 5 are the five lights, and
the space bar is each of them in turn.

**How it is heard.** These are the two columns of "How a place says it", as
sound (`penny/chimes.js`).

- **Up and down is pitch**, on the five notes the rest of the app keeps to,
  ten rows to the picture's side. That makes the stars E, C, and E again an
  octave down, with a G and a D from the dots between them.
- **Size is nearness.** What is near is loud and full, rings for seconds, has
  a low note under it and comes straight. What is far is quiet and dull, and
  most of what arrives is echo. A dot is short and bright, an octave up.
- **The picture is read once to each turn of the night**, which is 22
  seconds, and not always the same way: a dot may keep quiet, or say itself
  twice, or the big star take its time. Between readings each light twinkles
  in its own time, more softly.
- **The night turns under it.** One chord is held very low for each turn: the
  game's four, C, A minor, F and G. The lights' notes never change. What is
  under them does, and that alone turns the same phrase from glad to sad and
  back; none of the chords has a third of its own, so which it is, is left to
  the lights.

All of it is synthesised from sine waves and one burst of generated air for
the room, and written so that it can be rendered without a speaker, which is
how its levels were set. Until the first touch there is no sound; the first
touch wakes it, and the picture is read again from the start, aloud. The way
back is dim, and gone when the picture has been left alone a moment. The
night does not go on without you: with the page out of sight it stops, and
picks up where it was. With reduced motion nothing moves: the lights are
where the picture has them, and their brightness comes and goes slowly.

## Game modes

A Postmarks game in a room is one of three kinds, chosen when it is started:

- **Together**: one board for the whole room, taking turns. Each move is drafted and then submitted. Whoever made the last move waits until someone else has moved, even when alone in the room; the last submitted move is outlined on the board.
- **Time trial**: a solo mode, and a friendly race. Everyone solves their own copy of the same board; the clock starts when you press Start and the board is withheld until then. Three wrong guesses put you out. Results are ranked by time, and that is as seriously as it is taken: hints are there throughout, cost nothing and are not counted. This is the playful competition of Penny's story. Penny is all for the start, pleased when a hint is asked for, as glad of a last place as a first, and takes running out of hearts as an oops.
- **Pass phrase**: a solo mode. Everyone solves their own copy of the same board, and each letter found turns over one token of a hidden phrase. The phrase is split into exactly as many tokens as the board has letters: whole words where the counts match, with long words split and short neighbours joined otherwise (`tokenize` in `postmarks/game.js`, mirrored by `postmarks.tokenize` in the database). You can guess the whole phrase at any point (right wins, wrong costs a heart). Results are ranked by how few letters were opened. Whoever starts the game may write the phrase, in which case they have no board and watch the results, or leave it empty for a random one. The board is sized to the phrase so each word has its own letter. This is where the game meets Penny's story: a phrase is a letter somebody wrote, and Penny cannot read. It looks the face-down cards over when they are put down; each time one turns it looks at the word and then at you, asking what it says (you read for it, as it listens for you on the walk); and when the whole phrase is out it does not cheer but goes still and hums, before it is glad: it is a letter too, and has never been opened.

In the solo modes there are no turns and no Submit: moves are played at once. Any game can be shared by its link: room members open it directly, and anyone else joins the room first and is then taken to the game.

Any member of a room can delete any of its games. A deleted game is kept in the database but marked, and is gone as far as the app is concerned: off the room's list, not found when opened, and closed to further moves.

The board is generated in the browser of whoever starts the game, so that player's device briefly knows the solution. That is accepted for games among friends; it is not a defence against cheating.

## Rooms

People gather in rooms. A room has members, a chat and games; any member can
start a game and every member can play in it, each on their own device. In
Postmarks anyone may take the next turn except whoever took the last one.
A solo game needs no room and is saved in the browser only.

**A room is a place.** It is drawn as a building on the map, seen from above
like everything else in the game (`room/room.css`, `shared/place.js`). Each
room keeps one of the game's seven colours and one of three roofs (a ridge,
hipped, or flat with a parapet), chosen from its id, so it is the same
building wherever it is drawn.

**A room is quiet.** It should feel like a warm room in the evening: soft,
low colours (the room's own softened towards dusk, and the dark theme a warm
dark, never black), round shapes in soft shadow rather than hard edges,
nothing patterned, room between things, and slow movement or none. In the
dark the whole of a room's screens is that evening, past the ends of the page
too, and the browser's bar is tinted to match. One thing in it is loud, and
only one: what is waiting on you. A person should see in half a second
whether the room needs them. Nothing is written that the room can show
instead; what a word said is kept for screen readers. The words left on a
room are its content: names, notes, the code.

- **Inside**, the roof is off. The walls are in the room's colour and the
  floor is plain. Its name is the map's label for it, written over the
  building. The people in it are tokens at the head of a table, with their
  names over them. The games lie on the table as small boards, with nothing
  written on them. A game that is yours to play lies nearest, on a line of
  its own: the one board in its full colours, lifted, in a pool of lamplight,
  with a red seal that breathes slowly (a glow, never a beat). Games others
  are playing lie further off, small, keeping about half their colour (soft,
  never grey: the table keeps its colours); finished ones softer still, with a
  tick if solved, greyed if lost. A small
  tag at a board's corner is its kind (a stopwatch, a key; a game together is
  the plain one). The boards are not the games' own districts: a room is not
  told those, as they would give the game away. They are made from the game's
  id, the same each time, so a game keeps its face. Who started a game, which
  the chat said, is said by its board to screen readers. One bin at the
  table's corner tidies it: pressed, each board can be put away with a tap,
  and the sheet that asks shows that board, not its name.
  Three tiles start a game, quiet until touched, with only the kind of game
  drawn on each. One tap on a tile goes to its desk, which tells nobody; the
  game is started there, with one tap on the play mark, and then the whole
  room is told (the owner, 25 November 2026: one tap for every kind). On the
  shelf, the round button at the end of each card carries the kind of game in
  place of a play mark. The chat is
  notes passed across a rug: who and when only where somebody starts to speak,
  what the room says as a soft line that leads to its game, and every note
  alike (nothing is marked as new). A game being started is not said there
  while the game is on the table (the line is matched whole, as the server
  words it now and has worded it before; a pass phrase solved is never taken
  for one); once the game is gone from the table, its line is back. At rest at
  its foot, the chat shows whole notes, its top falling between two of them,
  so that nothing half cut off lingers in the fade there. At the door is the
  mat, with the code friends join with, a bell while notifications are off,
  and a bush either side.
- **Something that went wrong** (the server says no, or cannot be reached) is
  said in a short line of its words beside what was tried, for as long as it
  stands, and what was tried (the tiles, the desk, the name, a door, the
  chat's box) shakes gently, once, as they come; there is no mark to press for
  them (the owner's choice, 25 November 2026). The words are in the page's
  `role="alert"`, so a screen reader says them at once. With less motion
  asked for, nothing shakes: the words simply come. They stand until the thing
  is tried again, another board is drawn, or what was typed is changed. They
  come after what was tried, so that it does not move, nor anything beside
  it: under the desk's play mark, a door, the chat's box; under the name,
  they lie over the building's top wall, above the people, and nothing in the
  room moves for them. What is asked in a sheet (leaving the room, putting a game away) is
  tried with the sheet still open: refused, the sheet shakes and the words
  come in it, under the question, while its answers stay where they were
  under the finger; it can be tried again or put away. A link that leads
  nowhere is the empty plot with the words in it. The room's options, under
  the three dots, are a pencil and a door with the way out of it, each with
  its word, Rename and Leave (the owner's choice, 25 November 2026); while
  they are open, the room under them is out of reach, and a tap anywhere else
  only puts them away. The sheets they lead to ask their question with no
  words of explanation.
- **Setting up a game** is the same room, at its desk, with the same two steps
  for every kind of game (the owner, 25 November 2026). First, how it is
  played: three cards, each a picture on a tile of its colour and a line of
  words (the owner's choice), and an arrow on. Then the board it will be
  played on, drawn ahead, its districts in their colours and nothing of where
  the posts are, with a button of turning arrows beside it that draws another
  (for a game together or a time trial, at a size drawn again too). For a
  pass phrase this step asks, in words, "What message would you like to
  deliver?" (the owner's choice), with the box and beside it a die: lit while
  the box is empty, which is when a phrase picked at random is used (kept
  secret from its starter too, who can then play); thrown with a message
  written, it empties the box for one. The board is drawn at the size the
  message needs, and drawn again only when that changes. The play mark starts
  the game with one tap. Back, a round button at the desk's top left level
  with the kind of game, goes back a step, and from the first, to the room.
- **A game together**, the first time it is opened on a device, shows what is
  particular to playing together in place of how to play (which is always
  under the question mark): one board for the whole room; take turns, after
  your move someone else goes next; three hearts, shared by everyone. Each is
  a picture on a tile of its colour and a line of words (the owner's choice).
  Whoever started the game has just read those cards at the desk, so for them
  it opens on its board: nobody is told twice.
- **Energy in a room's games**: a game together earns for every post found on
  the room's board, by anyone, and for its finish; a time trial or a pass
  phrase, for your own run; a phrase's author's test run, nothing. In a game
  together the bar is shorter, beside the words of the turn.
- **Outside**, for somebody who is not in it, it is the same building, as
  it is inside (the owner's choice, 26 November 2026), so that somebody sent
  a link knows the place when they are in it: its walls and floor, its table
  with whoever is in at the head of it, each with their name, and a board on
  the table. A link to a game lays that game's board there, under a lamp;
  otherwise a board at rest (nobody outside is told what games a room has,
  so it is a picture of what the room is for, not one of its games). At the
  door is the mat, in one row as the code and the bell are inside: the face
  whoever has come will go in with, their name to write beside it, and the
  way in. The face is their profile's, or the one last chosen on the device;
  for somebody new it is picked there, never one already at the table, and
  it is theirs from then on. In the dark a low pool of warm light lies under
  the door, as under the doors on the street. (There is no way to bring an
  account from another device here: that is on the home page. The owner's
  choice, 26 November 2026.)
- **On the home page** your rooms are a street of little shops seen from in
  front, the last opened first: a strip of roof, a board over the window in
  the room's colour with the room's name lettered on it (two lines at most,
  then an ellipsis; a new name is 24 letters at most), and under it a wide
  window and a door. Where the door is goes by the room, so the street is not
  one shop over and over. They are soft as the room is: no hard edges, low
  contrast, one soft shadow. In the dark it is night on the street and each
  shop is lit by the lantern at its door: warm round it, dark at the far
  corners, a little pool of light on the ground no wider than the shop. A
  room with something waiting on you has its window lit, glowing slowly. **Opening
  a room** is a plot staked out on the map, with a board planted in it to
  write the name on. **Joining one** is a grey building, its colour not yet
  known, with its mat to write the code on; the box shows the shape of a code
  (`•••-•••`), not an example of one. Each door's button is held back until
  there is what it needs (a name, a whole code; at a room's own door, a name),
  so that nobody is told off for pressing it too soon; and the fields keep a
  soft edge, so that they do not vanish in the dark.

**Two worlds.** Inside a room, a member has a portal in the top bar: a ring of
light like the home page's, with no words on it, still until somebody passes
through it (`room/worlds.js`, `room/worlds.css`). In the cartoon at rest it
rests as the room does, its colours soft and low and no glow round it, so that
it is never louder than what is waiting on you; it comes to its full colours
while somebody passes through it, and inside the drama, where it is the way
back. Through it is the room's other self, the same room shot as live action, a
drama, at night: concrete and floorboards for the map's squares, a lamp over a
walnut table, the games as photographs in black and white on their paper, put
down a little askew (the one that is yours still nearest, the rest further off
in the dark beyond the lamp), the people as passport photographs, the tiles as
steel drawers, typed cards across a dark rug, a brass plate for the code, a
title card for the name, and grain and hard light over all of it; the browser's
own bars go dark with it, and so does the ground past the ends of the page.
Stepping in is a passage: a seam is drawn down out of the portal, a hairline of
light, and its two edges sweep apart across the room with the drama between
them, until they meet again above the portal. Inside, the drama is the room,
and while the portal is in sight the cartoon breaks back through it now and
then (the first time soon after stepping in, then every quarter of a minute to
a minute): a seam crosses the room, the cartoon on one side and the drama on
the other, and travels, waits, sometimes takes the whole screen, and goes back.
The portal is the way back, and the way back is always within reach: scrolled
down to the games or the chat, where the portal is out of sight, nothing breaks
through, and whatever had begun goes back gently, by a seam, with no cut.
Stepping out is as much a passage as stepping in: the seam is drawn out of the
portal again and sweeps back the other way, the drama closing into it until it
is gone; then everything stops. A press on the way through turns round; a press
while the cartoon is breaking through lets the seam go on and give the cartoon
the room. Being inside is not kept: every visit to a room, and every reload,
begins outside. The serious world is paint and never geometry, so nothing that
can be pressed or typed in moves; where both worlds are seen, the other is an
inert copy of the page that taps go through, with a hole where the portal is,
which belongs to neither world. Never more than three changes come in a second
(a passage turning round is one), however often the portal is pressed, and each
way a passage goes is kept at least half a second, so that no part of the
window changes more often either. With reduced motion, stepping in and out are
slow cross-fades that never turn round, each world is kept a while before the
next, and nothing moves inside. While the page is hidden nothing comes, and
nothing jumps when it is back; leaving the room stops it all where it is. It is
only on this screen.

Rooms live in Supabase and are reached only through database functions
(`room_create`, `room_get`, `room_join`, `room_leave`, `room_profile`, `room_say`,
`postmarks_start`, `postmarks_get`, `postmarks_play`, `postmarks_trial_start`,
`postmarks_guess_phrase`, `postmarks_delete`) that enforce membership and the rules; no
table is exposed. There are no accounts: a room's link lets anyone see its name
and member names and join it, while chat and games are for members. Each device
holds a random token (in `localStorage`) that proves which member it is, and
only a hash of it is stored. `shared/config.js` holds the project URL and its publishable key, which
is safe to publish.

Members can leave a room. Their place is kept, marked as left, so their name
still shows on old messages and results, but their device loses access, they
stop being notified, and they no longer count towards turn-taking. Opening the
room's link again lets them rejoin with the same place. Rooms are not removed
when everyone has left.

## Real-time updates

Pages keep a WebSocket open to Supabase Realtime (`shared/live.js`) and listen
on the public channel `room:<id>` for a content-free `changed` event; on hearing
one they refetch through the functions above. The event is sent by database
triggers on every chat message and game move, and also by each browser after
its own action. Because the event carries nothing, listening to a channel
reveals nothing about the room. Polling continues underneath (every 20 s while
the socket is live, every 3 s when it is not), so a dropped connection or a
lost event only costs a short delay.

`vendor/realtime.js` is Supabase's `@supabase/realtime-js` client bundled into
one file, since the site has no build step. To update it:

```sh
npm install --no-save @supabase/realtime-js esbuild
echo "export { RealtimeClient } from '@supabase/realtime-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=none --outfile=vendor/realtime.js
```

Then restore the two comment lines at the top of the file and bump the version in `version.js`.

## Installing

People who have not installed the app see a banner across the top of the home
page (`app.js`): "Install for the full view, and notifications from your
friends." It gives both reasons to install: the app gets the whole screen,
with no browser round it, and the device can be told when a friend has moved. Its
Install button triggers the browser's one-tap install where there is one.
Elsewhere it opens a guide with a picture and steps for the device: iPhone and
iPad (Safari and other browsers), Android, desktop Chrome and Edge, and Safari
on a Mac. The banner stays until the app is installed and cannot be dismissed.
It is not shown in desktop Firefox, which cannot install web apps. Room pages
have no banner; where installing is needed for notifications, the bell at the
room's door opens the same guide (and says so to screen readers).

## Notifications

Room members can get a push notification when a game is started in their room,
when someone else has moved and it is their turn, and when someone says
something in the room's chat. A device registers for
push from the room page (`shared/push.js`); on iPhone and iPad that is only
possible once the app is installed. The service worker shows the notification
and opens the game when it is tapped.

The database decides who to tell: everyone in the room except whoever acted and
anyone who has the room or one of its games on screen (pages report that with
`room_seen`). It then calls the `push` edge function
(`supabase/functions/push`) through `pg_net` with the recipients and the
message, and the function sends them. The signing keys and a shared secret live
in `rooms.settings`, which no API role can read; the keys are generated by the
function itself the first time, so no secret needs to be configured by hand.

## Caching

While online, the service worker fetches every page and file from the network
and revalidates it, so a deploy shows up on the next load; the cache is only the
offline fallback. When `sw.js` itself changes, open pages reload once to pick up
the new version. The app's version is set in `version.js`: bump it with every
release. It names the offline cache and is shown at the bottom of the home
page. When adding a file the app needs offline, also add it to `PRECACHE` in
`sw.js`: `npm test` fails if anything the page loads is missing from that
list, or if anything on the list is not there to be fetched (with one file
missing, nothing at all is kept).

## Deploy (GitHub Pages)

1. Repository **Settings → Pages**: source *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. At the DNS provider for `correspondence.lol`, add `A` records for the apex pointing to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (and optionally a `CNAME` for `www` to `kevinmchan.github.io`).
3. Back in **Settings → Pages**, confirm the custom domain and tick **Enforce HTTPS**
   once the certificate is issued. HTTPS is required for the app to be installable.
