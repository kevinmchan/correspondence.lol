
// --- Service worker -------------------------------------------------------
if ('serviceWorker' in navigator) {
  // A new version of the service worker takes over quietly. The page is not
  // reloaded for it: every file is fetched from the network first (see sw.js),
  // so a page that has just opened is already running the newest code, and a
  // reload would only cut across whatever is on screen, the opening animation
  // included.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// --- Installing the app -----------------------------------------------------
// People who have not installed the app get a banner across the top of the
// home page. Its Install button uses the browser's own one-tap install where there
// is one (Chrome, Edge and other Chromium browsers); elsewhere it opens a
// guide with pictures and steps that match the device.

// What installing is for, in one line: the app gets the whole screen, with no
// browser round it, and the device can be told when a friend has moved.
const INSTALL_WHY = 'Install for the full view, and notifications from your friends.';
const INSTALL_KEY = 'correspondence:install:v2'; // { until }: set far ahead once this browser has installed the app
let deferredPrompt = null; // the browser's own install prompt, when it offers one
let installGuide = null;
let installBanner = null;

const installed = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installPlatform() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox/.test(ua)) return null; // desktop Firefox cannot install web apps
  if (/Chrome|Chromium|Edg\//.test(ua)) return 'desktop';
  if (/Macintosh/.test(ua) && /Safari/.test(ua)) return 'mac-safari';
  return null;
}

const ICONS = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M8 7l4-4 4 4M7 10.5H5.5v9.5h13v-9.5H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V10M9 19.5h3M4 15h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 12.5v6M15.5 16l2.5 2.5 2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="6.5" y="13" width="11" height="2.6" rx="1.3" fill="currentColor"/><path d="M9 20h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="7" width="6" height="6" rx="1.6" fill="currentColor"/></svg>',
};

// A small picture of the device with a pulsing dot where the first tap goes.
// `bar` is where the browser's toolbar sits, `spot` how far along it (0 to 1).
function devicePicture({ shape, bar, spot, icon }) {
  const phone = shape === 'phone';
  const [w, h] = phone ? [120, 200] : [240, 150];
  const barH = phone ? 26 : 24;
  const barY = bar === 'bottom' ? h - barH - 6 : 6;
  const x = 12 + spot * (w - 24);
  const y = barY + barH / 2;
  return `<svg class="device" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${phone ? 18 : 10}" class="frame"/>
    <rect x="6" y="${barY}" width="${w - 12}" height="${barH}" rx="${phone ? 10 : 6}" class="bar"/>
    ${phone ? '' : `<rect x="40" y="${barY + 6}" width="${w - 100}" height="${barH - 12}" rx="6" class="field"/>`}
    <rect x="${w / 2 - 22}" y="${phone ? (bar === 'bottom' ? 60 : 84) : 62}" width="44" height="44" rx="11" class="app"/>
    <circle cx="${x}" cy="${y}" r="15" class="pulse"/>
    <g transform="translate(${x - 9} ${y - 9})" class="glyph"><svg width="18" height="18">${icon.replace('<svg ', '<svg width="18" height="18" ')}</svg></g>
  </svg>`;
}

const GUIDES = {
  'ios-safari': {
    picture: { shape: 'phone', bar: 'bottom', spot: 0.5, icon: ICONS.share },
    steps: [[ICONS.share, 'Tap <b>Share</b> at the bottom of Safari'], [ICONS.add, 'Choose <b>Add to Home Screen</b>'], [ICONS.home, 'Tap <b>Add</b>']],
  },
  'ios-other': {
    picture: { shape: 'phone', bar: 'top', spot: 0.92, icon: ICONS.share },
    steps: [[ICONS.share, 'Tap <b>Share</b> next to the address'], [ICONS.add, 'Choose <b>Add to Home Screen</b>'], [ICONS.home, 'Tap <b>Add</b>']],
  },
  android: {
    picture: { shape: 'phone', bar: 'top', spot: 0.95, icon: ICONS.menu },
    steps: [[ICONS.menu, 'Tap the <b>menu</b> at the top right'], [ICONS.add, 'Choose <b>Add to Home screen</b> or <b>Install app</b>'], [ICONS.home, 'Tap <b>Install</b>']],
  },
  desktop: {
    picture: { shape: 'window', bar: 'top', spot: 0.8, icon: ICONS.install },
    steps: [[ICONS.install, 'Click the <b>install</b> icon in the address bar'], [ICONS.home, 'Click <b>Install</b>']],
  },
  'mac-safari': {
    picture: { shape: 'window', bar: 'top', spot: 0.88, icon: ICONS.share },
    steps: [[ICONS.share, 'Click <b>Share</b> in the toolbar'], [ICONS.dock, 'Choose <b>Add to Dock</b>'], [ICONS.home, 'Click <b>Add</b>']],
  },
};

const readSnooze = () => {
  try {
    return JSON.parse(localStorage.getItem(INSTALL_KEY))?.until ?? 0;
  } catch {
    return 0;
  }
};

const snooze = (days) => {
  try {
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ until: Date.now() + days * 86400000 }));
  } catch {
    /* no storage: it will simply ask again next time */
  }
};

// --- What Penny needs of all this (home.js) -----------------------------------
// It wants the app installed and cannot say so, so it has to know where
// things stand and be told when they change.
//   installState()   'installed' | 'ready' (the browser will do it in one tap)
//                    | 'guide' (there are steps to follow) | 'none' (not on
//                    offer here, or already done from this browser)
//   requestInstall() what the banner's button does
// and an 'install' event on the window, with detail.what one of:
//   'ready'     a one-tap install has come on offer
//   'asked'     the button was pressed
//   'declined'  the browser's own prompt was turned down
//   'closed'    the guide of steps was closed
//   'installed'
const tell = (what) => window.dispatchEvent(new CustomEvent('install', { detail: { what } }));

window.installState = () => {
  if (installed()) return 'installed';
  if (Date.now() < readSnooze()) return 'none';
  if (deferredPrompt) return 'ready';
  return GUIDES[installPlatform()] ? 'guide' : 'none';
};

async function promptInstall() {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  if (choice?.outcome !== 'accepted') tell('declined');
}

window.requestInstall = async () => {
  if (installed()) return;
  tell('asked');
  if (deferredPrompt) await promptInstall();
  else openInstallGuide(); // no one-tap install here: show the steps
};

function openInstallGuide() {
  const platform = installPlatform();
  const guide = GUIDES[platform];
  if (installed() || (!guide && !deferredPrompt)) return;
  installGuide?.remove();

  const dialog = document.createElement('dialog');
  installGuide = dialog;
  dialog.className = 'install';
  dialog.setAttribute('aria-labelledby', 'install-title');

  // With a one-tap install on offer the picture is of the result, not the steps.
  const picture = deferredPrompt
    ? devicePicture({ shape: /Android/.test(navigator.userAgent) ? 'phone' : 'window', bar: 'top', spot: 0.5, icon: ICONS.install })
    : devicePicture(guide.picture);
  const steps = deferredPrompt ? '' : `<ol class="steps">${guide.steps
    .map(([icon, text]) => `<li><span class="icon">${icon}</span><span>${text}</span></li>`).join('')}</ol>`;

  dialog.innerHTML = `
    ${picture}
    <h2 id="install-title">Install correspondence.lol</h2>
    <p class="hint">${INSTALL_WHY}</p>
    ${steps}
    <div class="row end">
      ${deferredPrompt ? '<button type="button" data-act="install" autofocus>Install</button>' : '<button type="button" data-act="done" autofocus>Got it</button>'}
    </div>`;

  dialog.addEventListener('click', async (event) => {
    // a tap outside the guide closes it, the same as Got it
    const act = event.target.closest('[data-act]')?.dataset.act ?? (event.target === dialog ? 'done' : null);
    if (!act) return;
    dialog.close();
    if (act === 'install' && deferredPrompt) await promptInstall();
    else tell('closed');
  });
  // (the Escape key closes it without a click)
  dialog.addEventListener('cancel', () => tell('closed'));
  document.body.append(dialog);
  dialog.showModal();

}

function showInstallBanner(container) {
  if (installed() || !installPlatform()) return;
  installBanner?.remove();
  const banner = document.createElement('aside');
  installBanner = banner;
  banner.className = 'install-banner';
  banner.setAttribute('aria-label', 'Install the app');
  banner.innerHTML = `
    <img src="/icons/icon.svg" alt="" width="36" height="36">
    <p>${INSTALL_WHY}</p>
    <button type="button" data-act="install">Install</button>`;
  banner.addEventListener('click', (event) => {
    if (event.target.closest('[data-act]')?.dataset.act === 'install') window.requestInstall();
  });
  container.prepend(banner);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // keep the browser's own banner back; ours offers it instead
  deferredPrompt = event;
  tell('ready');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installGuide?.close();
  installBanner?.remove();
  installBanner = null;
  snooze(3650);
  tell('installed');
});

window.openInstallGuide = openInstallGuide; // the room's notification prompt opens it too

// The banner belongs to the home screen, where it stays until the app is
// installed. Rooms make the same offer in their notification prompt instead.
// The home screen calls this each time it is put on the page.
window.homeBanner = (screen) => {
  if (!installed() && Date.now() >= readSnooze()) showInstallBanner(screen);
  renderConnectivity();
};

// On an iPhone or iPad, attach the code to the Home Screen icon ahead of time:
// people also install straight from the browser's own menu.
if (!installed() && installPlatform()?.startsWith('ios')) {
  import('/shared/handoff.js').then(({ bakeIntoIcon }) => bakeIntoIcon()).catch(() => {});
}

// --- Connectivity ---------------------------------------------------------
function renderConnectivity() {
  const statusEl = document.getElementById('status'); // on the home screen, when it is up
  if (!statusEl) return;
  statusEl.textContent = navigator.onLine ? '' : 'You are offline — showing the saved copy.';
}

window.addEventListener('online', renderConnectivity);
window.addEventListener('offline', renderConnectivity);
renderConnectivity();
