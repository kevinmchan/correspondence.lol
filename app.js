const statusEl = document.getElementById('status');
const installBtn = document.getElementById('install');

// --- Service worker -------------------------------------------------------
if ('serviceWorker' in navigator) {
  // When an updated service worker takes over, reload once so the page is not
  // left running the previous version's scripts.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// --- Install prompt (Chromium; iOS installs via Share > Add to Home Screen) -
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installBtn) installBtn.hidden = true;
});

// --- Connectivity ---------------------------------------------------------
function renderConnectivity() {
  if (!statusEl) return;
  statusEl.textContent = navigator.onLine ? '' : 'You are offline — showing the saved copy.';
}

window.addEventListener('online', renderConnectivity);
window.addEventListener('offline', renderConnectivity);
renderConnectivity();
