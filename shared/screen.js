// The life of one screen. The app is a single page: the home screen, a room
// and a game are mounted into it and taken away again as people move about.
// Whatever a screen sets going while it is up (listeners on the window, timers,
// subscriptions) has to stop when it leaves, or it would carry on behind the
// next screen. A screen asks its `life` for those things, and they end with it.
export function newLife() {
  const abort = new AbortController();
  const timeouts = new Set();
  const intervals = new Set();
  const endings = [];
  let over = false;

  return {
    // true once the screen has been taken away: late answers should be dropped
    get over() {
      return over;
    },
    // addEventListener on something that outlives the screen (window, document)
    on(target, type, handler, options) {
      const extra = typeof options === 'object' && options !== null ? options : { capture: options === true };
      target.addEventListener(type, handler, { ...extra, signal: abort.signal });
    },
    setTimeout(handler, ms, ...args) {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        if (!over) handler(...args);
      }, ms);
      timeouts.add(id);
      return id;
    },
    setInterval(handler, ms, ...args) {
      const id = window.setInterval(() => {
        if (!over) handler(...args);
      }, ms);
      intervals.add(id);
      return id;
    },
    // something else to do when the screen leaves
    onEnd(ending) {
      endings.push(ending);
    },
    end() {
      if (over) return;
      over = true;
      abort.abort();
      timeouts.forEach((id) => window.clearTimeout(id));
      intervals.forEach((id) => window.clearInterval(id));
      for (const ending of endings) {
        try {
          ending();
        } catch { /* one bad ending should not stop the rest */ }
      }
    },
  };
}
