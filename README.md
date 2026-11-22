# correspondence.lol

A static, no-build progressive web app served from the repository root at
<https://correspondence.lol>: games played by turns, together.

## Layout

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app shell |
| `manifest.webmanifest` | Install metadata (name, colours, icons) |
| `sw.js` | Service worker: offline support and caching |
| `postmarks/` | Postmarks, a co-operative logic puzzle (`game.js` is the rules, `ui.js` the page) |
| `supabase/migrations/` | Database schema for cross-device games (Supabase project `correspondence`) |
| `tests/` | Tests for the game rules and puzzle generator (`npm test`, needs only Node) |
| `icons/` | App icons, rendered from `icons/icon.svg` |
| `CNAME`, `.nojekyll` | GitHub Pages custom domain / serve files as-is |

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Service workers only run on `localhost` or HTTPS.

## Cross-device games

Postmarks can be played on one device (saved in the browser only) or across
devices. Cross-device games are stored in Supabase and reached only through four
database functions (`postmarks_create`, `postmarks_get`, `postmarks_join`,
`postmarks_move`) that enforce turn order and the rules; the table itself is not
exposed. There are no accounts: a game's link lets anyone view or join it, and
each device holds a random token (in `localStorage`) that proves which player it
is. Browsers poll for the other players' moves. `postmarks/config.js` holds the
project URL and its publishable key, which is safe to publish.

## Caching

Pages are fetched network-first, so a deploy shows up on the next load. Other
same-origin assets are served from cache and refreshed in the background, so an
asset change appears on the second load. When adding a file the app needs
offline, add it to `PRECACHE` in `sw.js` and bump `VERSION`.

## Deploy (GitHub Pages)

1. Repository **Settings → Pages**: source *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. At the DNS provider for `correspondence.lol`, add `A` records for the apex pointing to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (and optionally a `CNAME` for `www` to `kevinmchan.github.io`).
3. Back in **Settings → Pages**, confirm the custom domain and tick **Enforce HTTPS**
   once the certificate is issued. HTTPS is required for the app to be installable.
