// The pictures a link shows (reels/reels.js): drawn from the app's own drawings, at the size messaging apps want
// (1200 by 630), and kept in the repository. Made again by hand when a drawing changes:
//   node reels/frame.cjs
// It needs Playwright and Chromium, as the browser checks do, and an emoji font for the ⚡️.

const { chromium } = require('playwright');
const path = require('node:path');
const { serve } = require('../tests/browser/phone.cjs');

const ROOT = path.join(__dirname, '..');
const W = 1200;
const H = 630;

// Marcus Pell's reel: Marcus in his room, his brows up, saying the line the frame is named for.
async function marcus(page) {
  await page.evaluate(async ({ W, H }) => {
    const { body } = await import('/penny/marcus.js');
    const { ROOM } = await import('/penny/reel.js');
    document.head.innerHTML = '<meta charset="utf-8">';
    document.body.innerHTML = `
      <div class="frame">
        <svg viewBox="-40 52 540 283" preserveAspectRatio="xMidYMid slice" width="${W}" height="${H}">
          <rect x="-400" y="-60" width="1300" height="760" fill="url(#reel-wall)"/>
          ${ROOM}<g transform="translate(0 -100)">${body({ named: false })}</g>
          <rect x="-200" y="-100" width="900" height="800" fill="url(#foot)"/>
          <defs><linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs>
        </svg>
        <p class="said">it sure does pay<br>to have ⚡️.</p>
        <span class="play"><svg viewBox="0 0 24 24"><path d="M7 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L8.5 4.74a1 1 0 0 0-1.5.86z"/></svg></span>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      html, body { margin: 0; }
      .frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; font-family: Inter, system-ui, sans-serif; }
      .frame > svg { position: absolute; inset: 0; }
      .said { position: absolute; right: 70px; top: 150px; margin: 0; padding: 28px 40px; border-radius: 36px; background: rgb(255 253 248 / 0.95);
        color: #22303c; font-size: 54px; font-weight: 600; line-height: 1.25; text-align: center; box-shadow: 0 14px 40px rgb(20 28 36 / 0.22); }
      .play { position: absolute; right: 70px; bottom: 44px; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center;
        background: rgb(255 253 248 / 0.92); box-shadow: 0 8px 24px rgb(20 28 36 / 0.28); }
      .play svg { width: 44px; height: 44px; fill: #22303c; }`;
    document.head.append(style);
  }, { W, H });
}

// The home page: the app's mark, its name, and its line, on its paper.
async function home(page) {
  await page.evaluate(({ W, H }) => {
    const mark = document.querySelector('link[rel="icon"][type="image/svg+xml"], link[rel="icon"]')?.href ?? '/icons/icon.svg';
    document.head.innerHTML = '<meta charset="utf-8">';
    document.body.innerHTML = `
      <div class="frame"><img src="${mark}" alt=""><p class="name">correspondence<b>.lol</b></p><p class="line">Open a room, invite your friends, play and chat.</p></div>`;
    const style = document.createElement('style');
    style.textContent = `
      html, body { margin: 0; }
      .frame { width: ${W}px; height: ${H}px; display: grid; place-content: center; justify-items: center; gap: 18px; background: #f6f1e7; color: #22303c; }
      .frame img { width: 190px; height: 190px; border-radius: 22%; box-shadow: 0 12px 34px rgb(34 48 60 / 0.2); }
      .name { margin: 14px 0 0; font: 400 84px/1 Georgia, "Times New Roman", serif; letter-spacing: -0.01em; }
      .name b { font-weight: 400; color: #c8442e; }
      .line { margin: 0; font: 400 34px/1.3 Inter, system-ui, sans-serif; color: #6b7680; }`;
    document.head.append(style);
  }, { W, H });
}

(async () => {
  const browser = await chromium.launch();
  const { origin, close } = await serve();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // (a JPEG for the picture of his room: WhatsApp shows no picture over about 300 KB, and as a PNG it is 450)
  for (const [draw, file] of [[marcus, 'reels/marcus/preview.jpg'], [home, 'icons/preview.png']]) {
    await page.goto(`${origin}/?frame`);
    await page.waitForLoadState('networkidle');
    await draw(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, file), clip: { x: 0, y: 0, width: W, height: H }, ...(file.endsWith('.jpg') ? { type: 'jpeg', quality: 86 } : {}) });
    console.log(`made ${file}`);
  }
  await browser.close();
  close();
})();
