// "The Inflection Point": a reel by marcus.pell, and at its end a sponsored
// clip for this app (the owner, 26 November 2026): a social post that is also
// an ad. That it is a paid partnership is the punchline, and nothing gives it
// away early. (The story doc: Marcus is one way the character who carries
// Goodhart's law could look outside the game.)
//
// THE WORDS ARE THE OWNER'S TO WRITE (the owner, 26 November 2026: "a creative
// challenge for me to fill in the text. Maybe that's the game."). Every word
// the reel shows or says is an entry in SCRIPT, below. An empty one shows its
// name in brackets, where it will be. Nothing else in the reel has words in
// it, but for names, the network's and its people's.
//
// They are of two kinds, as reels have:
//   voice    said, as Dot says things (reels/reel.js): a bubble that fills a few
//            words at a time, a falling bell for each. Write " / " where it is to
//            break; without one it breaks every two words or so. A line has to be
//            all said in the time it is up (tests/reel.test.js says if not).
//   caption  written on the picture, whole, at once.
// Labels drawn in a picture (the chart, the choice), the post's own caption,
// the comments, the sponsor's lines, the button and the last line are written
// too: captions, of one kind or another.
//
// Times are in seconds from the start. A drawing is 360 by 640, the shape of
// the reel; it is shown whole on a phone of that shape and cut at its edges on
// any other, so what matters is kept away from them. A label written into a
// drawing has as much room as its blank, more or less.

export const SCRIPT = {
  // Marcus, to camera, in his car (voice)
  'the hook': '',
  'what his son asked': '',
  'about Mr. Alvarez': '',
  // the chart (captions over it, then the labels in it)
  'the chart, first': '',
  'the chart, second': '',
  'the chart, third': '',
  'chart title': '',
  'above the line': '',
  'below the line': '',
  'him, on the chart': '',
  'Mr. Alvarez, on the chart': '',
  'time, on the chart': '',
  // the choice (a caption, the two choices drawn, a caption)
  'the choice': '',
  'choice one': '',
  'choice two': '',
  'after the choice': '',
  // back in the car (voice)
  'the turn': '',
  'the resolve': '',
  // the footage of his son (voice over it, then off camera)
  'over the footage': '',
  'off camera': '',
  // the car, the last time (voice, then under his breath, as his views go up)
  'the ask': '',
  'under his breath': '',
  // the post, and its comments
  'the post caption': '',
  'first comment': '',
  'his reply': '',
  'third comment': '',
  'last comment': '',
  // the sponsored clip
  'sponsor, first': '',
  'sponsor, second': '',
  'call to play': '',
  'the reveal': '',
};

// What an entry says: its words, or its name in brackets while it is blank.
export const filled = (key) => String(SCRIPT[key] ?? '').trim();
export const blank = (key) => !filled(key);
export const words = (key) => filled(key) || `[${key}]`;
// A voice line in the pieces it is said in.
export function pieces(key) {
  const text = filled(key);
  if (!text) return [`[${key}]`];
  if (text.includes(' / ')) return text.split(' / ').map((piece) => piece.trim()).filter(Boolean);
  const all = text.split(/\s+/);
  const out = [];
  for (let i = 0; i < all.length; i += 2) out.push(all.slice(i, i + 2).join(' '));
  if (out.length > 1 && !out.at(-1).includes(' ')) { // (no word left on its own at the end)
    const last = out.pop();
    out[out.length - 1] += ` ${last}`;
  }
  return out;
}

export const LENGTH = 58;
export const AD_AT = 44; // where the sponsored clip begins

// Who speaks, and how their bells sound. Notes are the five the app keeps to,
// falling: a thing said comes down. `gap` is the time between one piece of a
// line and the next. Marcus's are short and bright, and quick (hurry); R. A.'s
// are long and low, with an echo (it has come a long way and took its time).
// The comments come in on their writers' bells, and a caption with a tick.
export const VOICES = {
  marcus: { notes: [1046.5, 880, 783.99, 659.25], dur: 0.1, type: 'triangle', gain: 0.05, gap: 0.17 },
  aside: { notes: [783.99, 659.25, 523.25], dur: 0.08, type: 'sine', gain: 0.025, gap: 0.22 }, // Marcus, under his breath
  jordan: { notes: [587.33, 523.25, 440], dur: 0.14, type: 'sine', gain: 0.06, gap: 0.12 },
  priya: { notes: [880, 783.99, 659.25], dur: 0.1, type: 'sine', gain: 0.045, gap: 0.1 },
  ra: { notes: [261.63, 196, 130.81], dur: 0.9, type: 'sine', gain: 0.11, gap: 0.6, echo: true },
};

// The lines, in order. A voice line is in a bubble: `where` is 'face' (over
// Marcus's head in the car), 'over' (his voice over a picture he is not in)
// or 'aside' (off camera, under his breath). A caption is written over the
// shot it is in.
export const LINES = [
  { at: 0.4, end: 2.6, kind: 'voice', who: 'marcus', where: 'face', slot: 'the hook' },
  { at: 2.8, end: 4.9, kind: 'voice', who: 'marcus', where: 'face', slot: 'what his son asked' },
  { at: 5.0, end: 7.0, kind: 'voice', who: 'marcus', where: 'face', slot: 'about Mr. Alvarez' },
  { at: 7.4, end: 9.6, kind: 'caption', slot: 'the chart, first' },
  { at: 10.6, end: 13.0, kind: 'caption', slot: 'the chart, second' },
  { at: 13.4, end: 16.0, kind: 'caption', slot: 'the chart, third' },
  { at: 16.3, end: 17.9, kind: 'caption', slot: 'the choice' },
  { at: 20.6, end: 23.0, kind: 'caption', slot: 'after the choice' },
  { at: 23.3, end: 25.1, kind: 'voice', who: 'marcus', where: 'face', slot: 'the turn' },
  { at: 25.2, end: 27.0, kind: 'voice', who: 'marcus', where: 'face', slot: 'the resolve' },
  { at: 28.0, end: 30.6, kind: 'voice', who: 'marcus', where: 'over', slot: 'over the footage' },
  { at: 30.9, end: 33.0, kind: 'voice', who: 'aside', where: 'aside', slot: 'off camera' },
  { at: 33.2, end: 34.7, kind: 'voice', who: 'marcus', where: 'face', slot: 'the ask' },
  { at: 35.2, end: 37.9, kind: 'voice', who: 'aside', where: 'aside', slot: 'under his breath' },
];

// The comments, each come in on its writer's bells.
export const COMMENTS = [
  { at: 38.2, who: 'jordan', name: 'jordan.t', face: 'JT', slot: 'first comment' },
  { at: 39.4, who: 'marcus', name: 'marcus.pell', face: 'MP', slot: 'his reply', reply: true, creator: true },
  { at: 40.6, who: 'priya', name: 'priya.n', face: 'PN', slot: 'third comment' },
  { at: 42.2, who: 'ra', name: 'r.a.', face: 'RA', slot: 'last comment' },
];

// The sponsor's words, in the clip at the end: few, and slow; then the way to
// play, and the last line.
export const AD_WORDS = [
  { at: 47.2, slot: 'sponsor, first', big: true },
  { at: 51.6, slot: 'sponsor, second' },
];
export const CTA_AT = 53.4;
export const DISCLOSE_AT = 54.6;
// The words on the feed around the reel.
export const CHROME = { caption: 'the post caption', play: 'call to play', reveal: 'the reveal' };

// Sounds that are not anyone speaking. The beds (rain, and a clock that ticks
// a little quicker as it goes) run under Marcus's part and stop at the cut.
export const CUES = [
  { at: 7.2, sound: 'rise' }, // the line on the chart, climbing
  { at: 18.0, sound: 'run' },
  { at: 19.5, sound: 'turn' },
  { at: 34.6, sound: 'count' }, // the views, going up
  { at: 44.05, sound: 'zip' }, { at: 44.3, sound: 'zip' }, { at: 44.55, sound: 'zip' }, // the express mail, gone
  { at: 46.4, sound: 'drone' }, // and then it is quiet, and low, and warm
  { at: 49.0, sound: 'window' },
  { at: 50.2, sound: 'hum' }, // Penny
];

// The shots, and when each is up. A shot may come back.
export const SHOTS = [
  { name: 'car', ranges: [[0, 7], [23, 27], [33, 38]] },
  { name: 'chart', ranges: [[7, 16]] },
  { name: 'choice', ranges: [[16, 23]] },
  { name: 'street', ranges: [[27, 33]] },
  { name: 'comments', ranges: [[38, 44]] },
  { name: 'ad', ranges: [[44, 58]] },
];

// The views on Marcus's insights card, while it is up.
export const COUNT = { from: 34.6, to: 37.8, start: 12408, end: 1204331, shown: [34.6, 38] };

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A label drawn into a picture: its words, or its blank.
const label = (key, attrs, kind = '') => `<text class="${[kind, blank(key) ? 'blank' : ''].join(' ').trim()}" ${attrs}>${escape(words(key))}</text>`;

const RAIN = (rows) => rows.map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 14}"/>`).join('');

export const DRAWINGS = {
  car: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <defs>
        <linearGradient id="reel-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b9aa8"/><stop offset="1" stop-color="#5d6c79"/></linearGradient>
        <clipPath id="reel-window"><rect x="30" y="40" width="300" height="250" rx="34"/></clipPath>
        <clipPath id="reel-face"><ellipse cx="180" cy="330" rx="64" ry="78"/></clipPath>
      </defs>
      <g class="sway">
        <rect x="-20" y="-20" width="400" height="680" fill="#353f4a"/>
        <rect x="30" y="40" width="300" height="250" rx="34" fill="url(#reel-glass)"/>
        <g clip-path="url(#reel-window)"><g class="rain" stroke="#dde6ee" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round">${RAIN([[50, 0], [90, 40], [130, 10], [170, 70], [210, 20], [250, 60], [290, 5], [320, 50], [60, 110], [110, 150], [150, 120], [200, 170], [240, 130], [280, 180], [70, 220], [130, 250], [190, 230], [260, 240], [310, 220], [40, 290], [160, 300], [300, 300]])}</g></g>
        <rect x="118" y="236" width="124" height="96" rx="42" fill="#232b33"/>
        <path d="M10 660 Q30 446 180 432 Q330 446 350 660Z" fill="#4f6078"/>
        <path d="M150 436 L180 470 L210 436" fill="none" stroke="#3d4b5f" stroke-width="6" stroke-linejoin="round"/>
        <rect x="154" y="384" width="52" height="60" fill="#d6a385"/>
        <ellipse cx="114" cy="334" rx="8" ry="14" fill="#d6a385"/><ellipse cx="246" cy="334" rx="8" ry="14" fill="#d6a385"/>
        <ellipse cx="180" cy="330" rx="64" ry="78" fill="#e0b294"/>
        <path clip-path="url(#reel-face)" d="M110 360 Q180 420 250 360 L250 420 L110 420Z" fill="#a87a5e" opacity=".3"/>
        <path d="M116 318 Q110 240 180 236 Q252 240 244 318 Q240 284 218 272 Q182 284 148 270 Q124 282 116 318Z" fill="#4a3324"/>
        <path d="M144 312 q13 -4 26 0 M190 312 q13 -4 26 0" stroke="#4a3324" stroke-width="4.6" fill="none" stroke-linecap="round"/>
        <g class="eyes" fill="#2a2320"><ellipse cx="158" cy="330" rx="5" ry="6"/><ellipse cx="202" cy="330" rx="5" ry="6"/></g>
        <path d="M178 340 q-5 16 2 20" stroke="#c48f72" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <ellipse class="mouth" cx="180" cy="372" rx="14" ry="4" fill="#8c4a46"/>
        <path d="M70 470 L320 660" stroke="#1e252c" stroke-width="26"/>
        <rect x="-20" y="-20" width="400" height="680" fill="#9fb6cc" opacity=".08"/>
      </g>
    </svg>
    <div class="reel-insights">
      <span class="lbl">Insights · 24h</span>
      <span class="views">12,408</span>
      <span class="delta">▲ 340% week on week</span>
    </div>`,

  chart: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <rect width="360" height="640" fill="#1b232d"/>
      <g stroke="#2c3743" stroke-width="1"><line x1="40" y1="140" x2="340" y2="140"/><line x1="40" y1="240" x2="340" y2="240"/><line x1="40" y1="340" x2="340" y2="340"/><line x1="40" y1="440" x2="340" y2="440"/><line x1="40" y1="540" x2="340" y2="540"/></g>
      <line x1="40" y1="100" x2="40" y2="590" stroke="#6f7c89" stroke-width="2"/><line x1="40" y1="590" x2="340" y2="590" stroke="#6f7c89" stroke-width="2"/>
      ${label('chart title', 'x="44" y="88" font-size="13" font-weight="700" fill="#8b97a4" letter-spacing="1.5"')}
      ${label('time, on the chart', 'x="312" y="612" text-anchor="end" font-size="12" fill="#8b97a4"')}
      <path class="rise" d="M40 520 C 150 500, 230 380, 296 110" stroke="#7fa8d1" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${label('above the line', 'x="60" y="190" font-size="15" font-weight="700" fill="#a9c6e3"', 'tag above')}
      ${label('below the line', 'x="150" y="505" font-size="15" font-weight="700" fill="#e8a27f"', 'tag below')}
      <circle cx="64" cy="578" r="7" fill="#8a96a3"/>${label('Mr. Alvarez, on the chart', 'x="76" y="583" font-size="11" fill="#8b97a4"')}
      <g class="you"><circle r="9" fill="#e3b04b" stroke="#1b232d" stroke-width="3"/>${label('him, on the chart', 'y="-16" text-anchor="middle" font-size="12" font-weight="700" fill="#e4e9ef"')}</g>
    </svg>`,

  choice: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <rect width="360" height="640" fill="#12171d"/>
      <g class="half run">
        <rect x="0" y="0" width="360" height="318" fill="#1e2a36"/>
        ${label('choice one', 'x="44" y="140" font-size="34" font-weight="800" fill="#e4e9ef"')}
        <path d="M60 250 L300 160" stroke="#7fa8d1" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round"/>
        <g class="runner"><circle cx="80" cy="242" r="11" fill="#e3b04b" stroke="#fff" stroke-width="3"/></g>
      </g>
      <g class="half turn">
        <rect x="0" y="322" width="360" height="318" fill="#2a2420"/>
        ${label('choice two', 'x="44" y="420" font-size="34" font-weight="800" fill="#f1ebdf"')}
        <circle cx="230" cy="520" r="11" fill="#e3b04b" stroke="#fff" stroke-width="3"/>
        <path d="M216 524 Q170 556 122 552" stroke="#e8664f" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 7"/>
        <circle cx="108" cy="556" r="9" fill="#8a96a3"/>
      </g>
    </svg>`,

  street: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <defs><linearGradient id="reel-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b9aa6"/><stop offset="1" stop-color="#5f6e7a"/></linearGradient></defs>
      <g class="cam">
        <rect x="-20" y="-20" width="400" height="680" fill="url(#reel-sky)"/>
        <rect x="-20" y="470" width="400" height="190" fill="#4a5661"/><rect x="-20" y="470" width="400" height="5" fill="#6d7a85"/>
        <rect x="292" y="250" width="6" height="225" fill="#3b4650"/><rect x="266" y="222" width="58" height="40" rx="6" fill="#2f5d8a"/>
        <rect x="278" y="236" width="34" height="5" rx="2" fill="#dfe8f0"/><rect x="278" y="246" width="22" height="5" rx="2" fill="#dfe8f0"/>
        <rect x="160" y="330" width="80" height="140" rx="28" fill="#3d4954"/>
        <circle cx="200" cy="300" r="26" fill="#6c5444"/><path d="M178 292 q22 -24 44 0" fill="#c9cdd1"/>
        <rect x="168" y="452" width="22" height="22" rx="5" fill="#2a333b"/><rect x="208" y="452" width="22" height="22" rx="5" fill="#2a333b"/>
        <rect x="88" y="396" width="44" height="76" rx="18" fill="#e3b04b"/>
        <circle cx="110" cy="378" r="18" fill="#c99a7a"/><path d="M93 372 q17 -18 34 0" fill="#4a3426"/>
        <line x1="124" y1="404" x2="170" y2="252" stroke="#2a333b" stroke-width="5" stroke-linecap="round"/>
        <path d="M96 258 Q176 150 262 254 Q246 244 232 254 Q216 242 200 254 Q184 242 168 254 Q152 242 136 254 Q120 244 96 258Z" fill="#c8442e"/>
        <g class="rain" stroke="#cfd8df" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round">${RAIN([[20, 0], [70, 60], [120, 20], [290, 40], [340, 90], [40, 160], [320, 180], [30, 300], [70, 250], [330, 320], [260, 380], [50, 420], [300, 430], [140, 520], [250, 560], [200, 120], [240, 80], [160, 60]])}</g>
      </g>
      <g fill="none" stroke="#fff" stroke-width="2" opacity=".8"><path d="M30 120 v-22 h22 M330 120 v-22 h-22 M30 500 v22 h22 M330 500 v22 h-22"/></g>
      <circle class="rec" cx="44" cy="80" r="5" fill="#ff4d4d"/>
      <text x="56" y="85" font-size="13" font-weight="700" fill="#fff" font-family="ui-monospace, Menlo, monospace">REC</text>
      <text class="timecode" x="316" y="85" text-anchor="end" font-size="13" font-weight="700" fill="#fff" font-family="ui-monospace, Menlo, monospace">00:00:14</text>
    </svg>`,

  ad: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <defs><radialGradient id="reel-warmth" cx="78%" cy="66%" r="70%"><stop offset="0" stop-color="#f3b35a" stop-opacity=".3"/><stop offset="1" stop-color="#f3b35a" stop-opacity="0"/></radialGradient></defs>
      <rect width="360" height="640" fill="#161d24"/>
      <rect class="warm" width="360" height="640" fill="url(#reel-warmth)"/>
      <path d="M0 470 L360 440 L360 640 L0 640Z" fill="#1d262f"/>
      <g fill="#e8664f">
        <g class="streak"><line x1="120" y1="404" x2="200" y2="402" stroke="#96a0a9" stroke-width="1.5" stroke-dasharray="2 6"/><rect x="200" y="395" width="20" height="13" rx="2"/></g>
        <g class="streak"><line x1="140" y1="430" x2="220" y2="428" stroke="#96a0a9" stroke-width="1.5" stroke-dasharray="2 6"/><rect x="220" y="422" width="16" height="11" rx="2"/></g>
        <g class="streak"><line x1="110" y1="380" x2="190" y2="378" stroke="#96a0a9" stroke-width="1.5" stroke-dasharray="2 6"/><rect x="190" y="372" width="13" height="9" rx="2"/></g>
      </g>
      <g class="window"><rect x="282" y="410" width="34" height="32" fill="#2a3440"/><rect x="292" y="418" width="14" height="14" fill="#f3b35a"/></g>
      <g transform="translate(70 452)">
        <ellipse cx="50" cy="70" rx="50" ry="7" fill="#000" opacity=".3"/>
        <rect x="0" y="0" width="100" height="66" rx="6" fill="#f6f1e7" stroke="#22303c" stroke-width="1.6"/>
        <path d="M2 3 L50 39 L98 3" fill="none" stroke="#22303c" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M16 54 q11 -5 25 1 q9 3 20 -1" stroke="#7d8b98" stroke-opacity=".55" stroke-width="2" fill="none"/>
        <circle class="seal-glow" cx="50" cy="39" r="17" fill="#f6a070"/>
        <circle cx="50" cy="39" r="9" fill="#c8442e"/>
        <circle cx="42" cy="22" r="2.6" fill="#22303c"/><circle cx="58" cy="22" r="2.6" fill="#22303c"/>
      </g>
    </svg>`,
};

// The reel's own page, for those who cannot see it: what happens, in order.
export const TOLD = 'A reel by marcus.pell. In his car, in the rain, he talks to the camera. A chart of a line climbing faster than he does. Two choices. Phone footage of his son holding an umbrella over Mr. Alvarez at a bus stop. His views climbing. Then the comments. Then a sponsored clip: Penny, a plain letter, left on a road as fast red mail streaks away, until the light warms and a far window is lit.';
