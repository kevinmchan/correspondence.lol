# correspondence.lol

A static, no-build progressive web app served from the repository root at
<https://correspondence.lol>.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `home.js`, `styles.css`, `app.js` | Home page (open a room, your rooms) and shared styles |
| `penny/` | Penny: its voice (`penny.js`), Penny at life size (`pal.js`), the first quarter of the adventure at `/?walk` (`walk.js`, `places.js`), the sounds in the posts (`mail.js`), and Penny's story at `/?penny` (`story.js`) |
| `room/` | A room: members, invitation link, games list, chat |
| `postmarks/` | Postmarks, a co-operative logic puzzle (`game.js` is the rules, `ui.js` the page) |
| `shared/` | Server calls (`api.js`, `config.js`), device identity (`identity.js`), profiles and avatars (`profile.js`), chat (`chat.js`), live updates (`live.js`) |
| `vendor/` | Third-party code committed as-is (the Supabase Realtime client) |
| `supabase/migrations/` | Database schema (Supabase project `correspondence`) |
| `tests/` | Tests for the game rules, the puzzle generator and Penny's places (`npm test`, needs only Node); `tests/browser/` plays Penny's part of the app in a real browser (`npm run e2e`, needs Playwright and takes a couple of minutes) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Install metadata, offline caching, app icons |
| `CNAME`, `.nojekyll` | GitHub Pages custom domain / serve files as-is |

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

The envelopes on the board are called posts, so that "letters" only ever means
the letters of a phrase. A double tap on a square guesses a post there.

## Penny

Penny is a letter. Penny cannot speak, read or write, so nothing Penny is part
of uses words (the lines for screen readers aside). What Penny has is a voice,
a closed-mouth hum that comes from its seal (`penny/penny.js`), and feelings,
which show.

**Penny feels things hard.** Its highs are very high and its lows go all the
way down, and both pass quickly. That intensity is what the adventure looks
like: on the map, what Penny feels colours what Penny sees.

**Penny's life is finite, and it is finding that out.** It was posted long ago
and never delivered; the rain that smudged its address did not come off. A
sound is heard once and is over. A day goes one way. This is meant to be both
things at once, beautiful and painful, and nothing should resolve it.

### The adventure

Only the first quarter is built. The shape of the whole:

| Mark | What happens | State |
| --- | --- | --- |
| The start | Penny, alone, wants to take you through a portal. It is looking for someone, and all it knows of them is a sound. | built |
| To a quarter | Five places on the map, played with Penny beside you. Pieces of the sound turn up, never the whole. One day passes over them. | built |
| **A quarter** | **Penny finds a friend, Dot**, a stamp, in the last post of the fifth place. From here on Penny is not alone. | built |
| To a half | The search goes on, with Dot. | not written |
| **A half** | **Who Penny is searching for is revealed.** | not written, and not decided |
| The second half | | not written |

**Who or what makes the sound is not decided, and nothing in the app says or
hints.** Dot is a friend met on the way, not the one being looked for.

### Where Penny is

The screen is a map seen from far above, and Penny is not on it. Penny stands
at the bottom edge of the window, in the viewer's own space, life size, and
looks up at the map with you (`penny/pal.js`). It is one layer over the whole
app, so screens slide past and Penny stays; a screen that wants Penny asks,
and Penny goes back under the edge when no screen does. At present the home
page and the map ask. Once Dot has been found, Dot stands tucked in beside it.

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
two things, and shows them by coming up and standing under them.

- **The portal**, top left, the one place marked on the map. Until the first
  places have been walked Penny keeps coming back to it: it calls, walks under
  the portal, looks up at it and back at you. The first time in a visit, and
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
that. Any other tap goes through the portal with it, until the first places
have been walked, and after that opens Penny's story.

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
that opens after that leads out to a real solo game.

The places can be walked again afterwards, from the same portal, now quieter.
Dot is beside Penny from the start then, and is not found a second time: that
last post is somebody's ordinary mail. Nothing already heard is lost.

### Penny's story

Once the first places have been walked, a tap on Penny (when it is not asking
for the app to be installed) opens its story
(`/?penny`, `penny/story.js`), where the only sound is Penny's voice. Penny is
alone in the rain, feels something warm inside that it cannot read, calls out
and hears nothing; morning comes, and a post box with it, and Penny hums into
the post. After that it waits, and the story does not go on by itself: it
waits for a touch. Then an answer comes, a light from a long way off. Whose it
is the story does not say; it is why Penny is searching. Dot is not in this
story: Dot is met later. The app's music stands aside while the screen is up.

## Game modes

A Postmarks game in a room is one of three kinds, chosen when it is started:

- **Together**: one board for the whole room, taking turns. Each move is drafted and then submitted. Whoever made the last move waits until someone else has moved, even when alone in the room; the last submitted move is outlined on the board.
- **Time trial**: a solo mode. Everyone solves their own copy of the same board; the clock starts when you press Start and the board is withheld until then. Three wrong guesses put you out. Results are ranked by time.
- **Pass phrase**: a solo mode. Everyone solves their own copy of the same board, and each letter found turns over one token of a hidden phrase. The phrase is split into exactly as many tokens as the board has letters: whole words where the counts match, with long words split and short neighbours joined otherwise (`tokenize` in `postmarks/game.js`, mirrored by `postmarks.tokenize` in the database). You can guess the whole phrase at any point (right wins, wrong costs a heart). Results are ranked by how few letters were opened. Whoever starts the game may write the phrase, in which case they have no board and watch the results, or leave it empty for a random one. The board is sized to the phrase so each word has its own letter.

In the solo modes there are no turns and no Submit: moves are played at once. Any game can be shared by its link: room members open it directly, and anyone else joins the room first and is then taken to the game.

Any member of a room can delete any of its games. A deleted game is kept in the database but marked, and is gone as far as the app is concerned: off the room's list, not found when opened, and closed to further moves.

The board is generated in the browser of whoever starts the game, so that player's device briefly knows the solution. That is accepted for games among friends; it is not a defence against cheating.

## Rooms

People gather in rooms. A room has members, a chat and games; any member can
start a game and every member can play in it, each on their own device. In
Postmarks anyone may take the next turn except whoever took the last one.
A solo game needs no room and is saved in the browser only.

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
have no banner; where installing is needed for notifications, the room's
notification prompt says so and opens the same guide.

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
`sw.js`.

## Deploy (GitHub Pages)

1. Repository **Settings → Pages**: source *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. At the DNS provider for `correspondence.lol`, add `A` records for the apex pointing to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (and optionally a `CNAME` for `www` to `kevinmchan.github.io`).
3. Back in **Settings → Pages**, confirm the custom domain and tick **Enforce HTTPS**
   once the certificate is issued. HTTPS is required for the app to be installable.
