import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

// Live updates for a room over a WebSocket (Supabase Realtime).
//
// The channel room:<id> carries only a content-free "changed" event. On
// hearing one, the page refetches through the usual member-checked functions,
// so listening to the channel reveals nothing. Events come from two places:
// the database broadcasts one on every change, and each browser sends one
// after its own action. Polling continues underneath at a slower pace, so if
// the socket is down or an event is lost the page still catches up.
export function watchRoom(roomId, onChange) {
  let channel = null;
  let live = false;
  let pending = null;
  let stopped = false;

  // Several events can arrive together; refetch once.
  const changed = () => {
    if (stopped) return;
    clearTimeout(pending);
    pending = setTimeout(onChange, 50);
  };

  import('/vendor/realtime.js')
    .then(({ RealtimeClient }) => {
      const client = new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, { params: { apikey: SUPABASE_KEY } });
      if (stopped) return;
      channel = client
        .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'changed' }, changed)
        .subscribe((status) => {
          const now = status === 'SUBSCRIBED';
          if (now && !live) changed(); // catch up on anything missed while (re)connecting
          live = now;
        });
    })
    .catch(() => {
      /* no socket: polling carries on */
    });

  return {
    // The screen that was listening has gone: hang up.
    stop() {
      stopped = true;
      clearTimeout(pending);
      try {
        channel?.unsubscribe();
      } catch { /* already gone */ }
    },
    // True while the socket is connected and listening.
    get live() {
      return live;
    },
    // Tell everyone else in the room that something changed.
    poke() {
      if (!live) return;
      try {
        Promise.resolve(channel.send({ type: 'broadcast', event: 'changed', payload: {} })).catch(() => {});
      } catch {
        /* best effort */
      }
    },
  };
}

// How often to poll: rarely while the socket is live, briskly when it is not.
export const pollDelay = (watcher, fallback = 3000) => (watcher?.live ? 20000 : fallback);
