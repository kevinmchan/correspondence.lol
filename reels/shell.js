// `npm run shell`: the app is one page (index.html), served at several addresses so that each opens directly. This
// copies it to each of them: the room, the game and the music maker, exactly; and each reel (reels/reels.js), with
// the block that says what a link to it shows made its own.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { HOME, PREVIEW, REELS, preview } from './reels.js';

const at = (file) => new URL(`../${file}`, import.meta.url);
let page = readFileSync(at('index.html'), 'utf8');
if (!PREVIEW.test(page)) throw new Error('index.html has no preview block to fill');
page = page.replace(PREVIEW, preview(HOME));
writeFileSync(at('index.html'), page);
for (const copy of ['room', 'postmarks', 'jam']) writeFileSync(at(`${copy}/index.html`), page);
for (const reel of REELS) {
  mkdirSync(at(`reels/${reel.id}`), { recursive: true });
  writeFileSync(at(`reels/${reel.id}/index.html`), page.replace(PREVIEW, preview(reel)));
}
