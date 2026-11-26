// "The Inflection Point": a reel by marcus.pell, and at its end a sponsored
// clip for this app (the owner, 26 November 2026). A satire, in the world of
// the app: a social post that is also an ad. Nothing says it is a paid
// partnership until the very end: that is the punchline, and it is not given
// away early (no #ad, no label by his name).
//
// Marcus is sincere. He says that the middle class must choose between
// outrunning the line of inequality and reaching back across it, and keeps
// running without seeing it: his son's kindness is done again for the shot,
// and the views are counted before Q1. Pressed, he answers well. The man he
// made content of is the one who asks how he is. (The story doc: he is one
// way the character who carries Goodhart's law could look outside the game.)
//
// The reel's people speak as Dot does: in a bubble, a few words at a time, a
// falling bell for each (reels/reel.js). Penny, in the sponsored clip, only hums.
//
// Times are in seconds from the start. A drawing is 360 by 640, the shape of
// the reel; it is shown whole on a phone of that shape and cut at its edges on
// any other, so what matters is kept away from them.

export const LENGTH = 58;
export const AD_AT = 44; // where the sponsored clip begins

// Who speaks, and how their bells sound. Notes are the five the app keeps to,
// falling: a thing said comes down. `gap` is the time between one piece of a
// line and the next. Marcus's are short and bright, and quick (hurry); R. A.'s
// are long and low, with an echo (it has come a long way and took its time).
export const VOICES = {
  marcus: { notes: [1046.5, 880, 783.99, 659.25], dur: 0.1, type: 'triangle', gain: 0.05, gap: 0.17 },
  aside: { notes: [783.99, 659.25, 523.25], dur: 0.08, type: 'sine', gain: 0.025, gap: 0.22 }, // Marcus, under his breath
  jordan: { notes: [587.33, 523.25, 440], dur: 0.14, type: 'sine', gain: 0.06, gap: 0.12 },
  priya: { notes: [880, 783.99, 659.25], dur: 0.1, type: 'sine', gain: 0.045, gap: 0.1 },
  ra: { notes: [261.63, 196, 130.81], dur: 0.9, type: 'sine', gain: 0.11, gap: 0.6, echo: true },
};

// What is said. `where` places the bubble: 'face' over Marcus's head in the
// car, 'over' for his voice over a picture he is not in, 'aside' for what he
// says off camera, under his breath.
export const LINES = [
  { at: 0.4, end: 2.6, who: 'marcus', where: 'face', said: ['I almost', 'didn’t', 'post this.'] },
  { at: 2.8, end: 4.9, who: 'marcus', where: 'face', said: ['My son asked', 'why we have', 'two cars'] },
  { at: 5.0, end: 7.0, who: 'marcus', where: 'face', said: ['and Mr. Alvarez', 'walks', 'in the rain.'] },
  { at: 7.4, end: 9.6, who: 'marcus', where: 'over', said: ['So I made', 'a chart.'] },
  { at: 10.6, end: 13.0, who: 'marcus', where: 'over', said: ['The line', 'keeps', 'climbing.'] },
  { at: 13.4, end: 16.0, who: 'marcus', where: 'over', said: ['Faster', 'than us.'] },
  { at: 16.3, end: 17.9, who: 'marcus', where: 'over', said: ['So the middle', 'gets a choice.'] },
  { at: 20.6, end: 23.0, who: 'marcus', where: 'over', said: ['You can’t', 'do both.'] },
  { at: 23.3, end: 25.1, who: 'marcus', where: 'face', said: ['Not choosing', 'is choosing', 'one.'] },
  { at: 25.2, end: 27.0, who: 'marcus', where: 'face', said: ['This year', 'I’ll be', 'slower.'] },
  { at: 28.0, end: 30.6, who: 'marcus', where: 'over', said: ['He’s seven.', 'He got there', 'before I did.'] },
  { at: 30.9, end: 33.0, who: 'aside', where: 'aside', said: ['Okay buddy,', 'one more', 'time.'] },
  { at: 33.2, end: 34.7, who: 'marcus', where: 'face', said: ['Repost', 'if this', 'moved you.'] },
  { at: 35.2, end: 37.9, who: 'aside', where: 'aside', said: ['Gotta keep', 'this going', 'till Q1.'] },
];

// The comments, each come in with its writer's bells.
export const COMMENTS = [
  { at: 38.2, who: 'jordan', name: 'jordan.t', face: 'JT', text: 'Easy to say with two cars.' },
  { at: 39.4, who: 'marcus', name: 'marcus.pell', face: 'MP', text: 'If I stop running, who catches my kids?', reply: true, creator: true },
  { at: 40.6, who: 'priya', name: 'priya.n', face: 'PN', text: 'Is the chart a course? 🙏' },
  { at: 42.2, who: 'ra', name: 'r.a.', face: 'RA', text: 'Tell your boy thanks for the umbrella. You alright, Marcus?' },
];

// The sponsor's words, in the clip at the end: few, and slow.
export const AD_WORDS = [
  { at: 47.2, text: 'Feel behind? So did Penny.', big: true },
  { at: 51.6, text: 'Somewhere a window is lit.' },
];
export const CTA_AT = 53.4;
export const DISCLOSE_AT = 54.6;

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
      <text x="44" y="88" font-size="13" font-weight="700" fill="#8b97a4" letter-spacing="1.5">THE LINE</text>
      <text x="336" y="612" text-anchor="end" font-size="12" fill="#8b97a4">years →</text>
      <path class="rise" d="M40 520 C 150 500, 230 380, 296 110" stroke="#7fa8d1" stroke-width="5" fill="none" stroke-linecap="round"/>
      <text class="tag above" x="60" y="190" font-size="15" font-weight="700" fill="#a9c6e3">money makes money</text>
      <text class="tag below" x="150" y="505" font-size="15" font-weight="700" fill="#e8a27f">money makes rent</text>
      <circle cx="64" cy="578" r="7" fill="#8a96a3"/><text x="76" y="583" font-size="11" fill="#8b97a4">Mr. A.</text>
      <g class="you"><circle r="9" fill="#e3b04b" stroke="#1b232d" stroke-width="3"/><text y="-16" text-anchor="middle" font-size="12" font-weight="700" fill="#e4e9ef">you</text></g>
    </svg>`,

  choice: `
    <svg viewBox="0 0 360 640" class="reel-art">
      <rect width="360" height="640" fill="#12171d"/>
      <g class="half run">
        <rect x="0" y="0" width="360" height="318" fill="#1e2a36"/>
        <text x="44" y="140" font-size="52" font-weight="800" fill="#e4e9ef">1. Run.</text>
        <path d="M60 250 L300 160" stroke="#7fa8d1" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round"/>
        <g class="runner"><circle cx="80" cy="242" r="11" fill="#e3b04b" stroke="#fff" stroke-width="3"/></g>
      </g>
      <g class="half turn">
        <rect x="0" y="322" width="360" height="318" fill="#2a2420"/>
        <text x="44" y="420" font-size="32" font-weight="800" fill="#f1ebdf">2. Turn around.</text>
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
export const TOLD = 'A reel by marcus.pell. In his car, in the rain, he talks to the camera. A chart of a line climbing faster than him. Run, or turn around. Phone footage of his son holding an umbrella over Mr. Alvarez at a bus stop. His views climbing. Then the comments. Then a sponsored clip: Penny, a plain letter, left on a road as fast red mail streaks away, until the light warms and a far window is lit. It was a paid partnership.';
