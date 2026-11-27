// The reels, each at an address of its own (/reels/<id>/), so that a link to one can be previewed: a messaging app
// reads the page at an address for its picture and words, and does not run the app, and the server ignores what
// follows a "?". `npm run shell` (reels/shell.js) makes each reel's copy of the app's one page, with its own preview.
// The reel itself is penny/reel.js; what the reels mean is in the story doc.
export const SITE = 'https://correspondence.lol';

// What a link to the app's home shows.
export const HOME = {
  path: '/',
  title: 'correspondence.lol',
  description: 'Open a room, invite your friends, play and chat.',
  image: '/icons/preview.png',
};

export const REELS = [
  {
    id: 'marcus',
    path: '/reels/marcus/',
    title: 'marcus.pell',
    description: 'Real talk about who gets to climb 🪜',
    image: '/reels/marcus/preview.jpg', // a frame of it: "it sure does pay to have ⚡️." (made by reels/frame.cjs)
  },
];

// The block at the top of the page that says what a link to it shows, for one address.
export function preview({ path, title, description, image }) {
  const at = (url) => SITE + url;
  return [
    '<!-- preview: what a link to this address shows (reels/reels.js; written by npm run shell) -->',
    `  <title>${title === HOME.title ? title : `${title} · correspondence.lol`}</title>`,
    `  <meta name="description" content="${description}">`,
    `  <link rel="canonical" href="${at(path)}">`,
    '  <meta property="og:site_name" content="correspondence.lol">',
    '  <meta property="og:type" content="website">',
    `  <meta property="og:url" content="${at(path)}">`,
    `  <meta property="og:title" content="${title}">`,
    `  <meta property="og:description" content="${description}">`,
    `  <meta property="og:image" content="${at(image)}">`,
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    '  <meta name="twitter:card" content="summary_large_image">',
    '  <!-- /preview -->',
  ].join('\n');
}
export const PREVIEW = /<!-- preview:[\s\S]*?<!-- \/preview -->/;
