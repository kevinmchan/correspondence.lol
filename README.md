# correspondence.lol

A static, no-build progressive web app served from the repository root at
<https://correspondence.lol>.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `home.js`, `styles.css`, `app.js` | Home page (open a room, your rooms) and shared styles |
| `penny/` | Penny: her voice (`penny.js`), herself at life size (`pal.js`), the map walked with her at `/?walk` (`walk.js`, `places.js`), the sounds in the posts (`mail.js`), and her story at `/?penny` (`story.js`) |
| `room/` | A room: members, invitation link, games list, chat |
| `postmarks/` | Postmarks, a co-operative logic puzzle (`game.js` is the rules, `ui.js` the page) |
| `shared/` | Server calls (`api.js`, `config.js`), device identity (`identity.js`), profiles and avatars (`profile.js`), chat (`chat.js`), live updates (`live.js`) |
| `vendor/` | Third-party code committed as-is (the Supabase Realtime client) |
| `supabase/migrations/` | Database schema (Supabase project `correspondence`) |
| `tests/` | Tests for the game rules and puzzle generator (`npm test`, needs only Node) |
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

Penny is a letter and Dot is a stamp. Penny cannot speak, read or write, so
nothing she is part of uses words. What she has is a voice, a closed-mouth hum
that comes from her seal (`penny/penny.js`), and her feelings, which show.

### Where she is

The screen is a map seen from far above, and Penny is not on it. She stands at
the bottom edge of the window, in the viewer's own space, life size, with Dot
beside her, and looks up at the map with you (`penny/pal.js`). She is one layer
over the whole app, so screens slide past and she stays; a screen that wants
her asks for her, and she goes back under the edge when no screen does. At
present the home page and the map ask for her.

Everything she says is a feeling. A mood sets her face and how she holds
herself (the point of her flap works as a brow); a gesture is one movement; she
looks at things, leans towards them, and walks along the edge to stand under
whatever she wants you to see, which is the nearest she has to pointing. Her
seal glows with how warm she feels and brightens with every note she hums, so
her voice can be seen with sound off. She never blocks the page: she only comes
all the way up where that covers nothing there is to press, a tap that lands on
her over a button goes to the button, and while something is being typed she
ducks under.

### What she wants

She is looking for someone, and all she knows of them is a sound: every post
has a sound inside, and one of them is theirs (`penny/mail.js`). Most posts
hold other people's mail, small bright things in voices of their own. The
sound she is after is a breath across something hollow, low and far off. It is
found in pieces, never the whole of it, each piece nearer than the last, and
what has been heard is kept on the device. **Who or what makes it is not
decided, and nothing in the app says or hints**: that belongs to the middle of
a longer story, of which only the opening exists.

On the home page she wants two things, and shows them by coming up and standing
under them.

- **The portal**, top left, a place on the map. Until the first places have
  been walked she keeps coming back to it: she calls, walks under it, looks up
  at it and back at you. Sometimes she shuts her eyes first and the sound she
  remembers can be heard, a long way off.
- **The app installed.** Once you have been through a portal with her, she
  stands under the Install button and pleads. She asks at most three times in
  a visit, leaving it twice as long each time; a no to the browser's prompt is
  a no for the rest of the visit, and she lets it be. Nothing waits on it.
  When the app is installed, and the first time it is opened as an app, she is
  as glad as she gets. (`app.js` tells her where installing stands through
  `installState()`, `requestInstall()` and an `install` event.)

A tap on her does whatever she is asking for at that moment. With nothing
asked, it opens her story.

### Walking the map

Through the portal is the map itself (`/?walk`, `penny/walk.js`): a few
districts lit, the rest of it faint all round. There is no tutorial. There are
five places, each a small piece of the game with one more rule than the last
(`penny/places.js`), and you play them while she stands beside you:

1. a double tap opens a post
2. one post per colour
3. one post per row and column
4. posts cannot touch
5. a tap or a drag crosses squares out

She does not know where the posts are; she is looking too. How she feels about
a square comes from the only two things she has to go on. One is the rules: a
square the posts already found rule out, and a colour, row or column with one
square left. The other is her ear: close to a post she can hear it through the
map, from two squares off in the first places and only under your finger by
the last. Touch a square, or slide a finger across the map, and she tells you
with her whole face what she makes of it: thrilled, hopeful, unsure, or a shake
of the head and a glance at the post that says no. Left alone she starts
looking for herself, first at whatever the rules have made certain, and then,
with nothing certain, listening.

When a post is opened, the squares the place's newest rule takes away light up
one after another, so the rule is seen as a shape; rules a place does not have
yet take nothing away. Then the post's sound comes out and she holds still to
listen. In every place after the first, the last post found has a piece of the
sound she is after, and she hums it back. What has been heard of it is drawn
at the top of the map, a mark a note, and can be played again from there.

A wrong guess costs nothing. In the last place a tap makes a cross, as in the
game; she cannot take one off, and a cross over a post she can hear frightens
her until it is gone. A place that has given up all its posts opens a portal,
one square further down the map, and the last portal leads out to a real solo
game.

### Her story

Once the first places have been walked, a tap on Penny at rest opens her story
(`/?penny`, `penny/story.js`), where the only sound is her voice. She is alone
in the rain, feels something warm inside her that she cannot read, calls out
and hears nothing, and then hums into a post box that Dot leads her to. After
that she waits, and the story does not go on by itself: the answer is a touch
from whoever is watching. The app's music stands aside while the screen is up.

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
page (`app.js`): "Install to receive notifications from your friends." Its
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
