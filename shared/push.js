import { rpc } from './api.js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { myToken } from './identity.js';

// Push notifications: a game was started in one of your rooms, or it is your
// turn. The server sends them; this module registers the device and tells the
// server when a room is on screen so it does not notify about what you can see.

// 'granted' | 'default' (can ask) | 'denied' | 'install-first' (iPhone and iPad
// only allow notifications once the app is on the home screen) | 'unsupported'
export function pushState() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios && !standalone ? 'install-first' : 'unsupported';
  }
  return Notification.permission;
}

function keyBytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Make sure this device is registered with the server. Safe to call often;
// does nothing unless notifications have been allowed.
export async function syncPush() {
  if (pushState() !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const key = await rpc('push_key', {});
    if (!key) return false; // the server is not set up for push
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  const { endpoint, keys } = subscription.toJSON();
  await rpc('push_subscribe', { p_token: myToken(), p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth });
  return true;
}

// Ask for permission (must be called from a tap) and register. Returns the
// resulting pushState().
export async function enablePush() {
  if (pushState() === 'default') await Notification.requestPermission();
  if (pushState() === 'granted') await syncPush();
  return pushState();
}

// While a room (or one of its games) is on screen, keep telling the server, so
// it skips notifications about things happening in front of you. Returns a
// function that stops it. Going from a room into one of its games, the two
// screens overlap for a moment: "gone" is only said when the last one leaves.
const watching = new Map(); // room id -> how many screens are showing it

export function watchPresence(roomId) {
  let timer = null;
  const say = (here) => {
    // keepalive lets the "gone" message out even as the page is being closed
    fetch(`${SUPABASE_URL}/rest/v1/rpc/room_seen`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_room: roomId, p_token: myToken(), p_here: here }),
    }).catch(() => {});
  };
  const update = () => {
    clearInterval(timer);
    if (document.hidden) {
      say(false);
    } else {
      say(true);
      timer = setInterval(() => say(true), 25000);
    }
  };
  const gone = () => say(false);
  watching.set(roomId, (watching.get(roomId) ?? 0) + 1);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', gone);
  update();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('pagehide', gone);
    const left = (watching.get(roomId) ?? 1) - 1;
    watching.set(roomId, left);
    if (left <= 0) say(false);
  };
}
