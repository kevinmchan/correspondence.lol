// The people of a room, walking about the meadow once it is awake (shared/meadow.js).
//
// Each person's token leaves its place at the head of the table and wanders the
// strip of lawn between the hedge and the table: a few steps, a rest, a few
// more. A place is where the page laid the token out; where it is, is an offset
// from there, given as a translate, so nothing else on the page is moved by it.
// A token cannot be pressed. While anything is typed, everybody goes back to
// their place and stays. Slow: a walk is 20 px a second or so, and a rest is
// seconds long. With reduced motion nobody leaves the table (the caller does
// not start this at all). The feet under a token are room/folk.js's, and step
// while it has data-walk.
//
//   roam({ root, life, calm }) returns { measure(), step(now) }: measure()
//   after the room draws its people afresh (a token drawn again is the same
//   person, by its seat, and carries on from where it was), step() from the
//   room's one loop.

const between = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function roam({ root, life, calm = () => false }) {
  const tokens = new Map(); // seat: its token
  let last = 0;

  function measure() {
    const house = root.querySelector(':scope > main #house');
    const table = root.querySelector(':scope > main .table');
    const seats = [...root.querySelectorAll(':scope > main #members .seat')];
    const box = house?.getBoundingClientRect();
    if (!box?.width || !table) return;
    const pad = 22; // (inside the hedge)
    const now = performance.now();
    const here = new Set();
    seats.forEach((el, i) => {
      const key = el.dataset.seat ?? String(i);
      here.add(key);
      const t = tokens.get(key) ?? { at: { x: 0, y: 0 }, to: null, until: now + 900 + i * 1100 };
      tokens.set(key, t);
      if (t.el !== el) {
        t.el = el;
        el.style.translate = `${t.at.x.toFixed(1)}px ${t.at.y.toFixed(1)}px`;
      }
      const r = el.getBoundingClientRect();
      const home = { x: r.left - t.at.x, y: r.top - t.at.y };
      // how far it may go from its place: side to side within the hedge, and up as far as the hedge
      t.reach = { left: box.left + pad - home.x, right: box.right - pad - r.width - home.x, up: Math.min(0, box.top + pad - home.y) };
    });
    for (const key of [...tokens.keys()]) if (!here.has(key)) tokens.delete(key);
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const home = calm();
    for (const t of tokens.values()) {
      if (!t.reach || !t.el?.isConnected) continue;
      if (home && (t.at.x || t.at.y)) t.to = { x: 0, y: 0 };
      else if (!home && !t.to && now > t.until) {
        // a few steps somewhere on the lawn, or a rest where it is
        if (Math.random() < 0.4) t.until = now + between(2500, 6000);
        else {
          // (not onto anybody: a place a token's width clear of where the others stand or are going)
          const others = [...tokens.values()].filter((o) => o !== t && o.el?.isConnected).map((o) => { const r = o.el.getBoundingClientRect(); return { x: r.left + ((o.to?.x ?? o.at.x) - o.at.x), y: r.top + ((o.to?.y ?? o.at.y) - o.at.y) }; });
          const mine = t.el.getBoundingClientRect();
          for (let tries = 0; tries < 6 && !t.to; tries++) {
            const to = { x: clamp(t.at.x + between(-80, 80), t.reach.left, t.reach.right), y: between(t.reach.up, 0) };
            const [x, y] = [mine.left + to.x - t.at.x, mine.top + to.y - t.at.y];
            if (others.every((o) => Math.hypot(o.x - x, (o.y - y) * 2) > mine.width + 6)) t.to = to;
          }
          if (!t.to) t.until = now + between(1500, 3000);
        }
      }
      if (!t.to) continue;
      const [dx, dy] = [t.to.x - t.at.x, t.to.y - t.at.y];
      const d = Math.hypot(dx, dy);
      const go = (home ? 34 : 20) * dt;
      if (d <= go) {
        t.at = t.to;
        t.to = null;
        t.until = now + between(1800, 5000);
        t.el.removeAttribute('data-walk');
      } else {
        t.at = { x: t.at.x + (dx / d) * go, y: t.at.y + (dy / d) * go };
        t.el.setAttribute('data-walk', '');
      }
      t.el.style.translate = `${t.at.x.toFixed(1)}px ${t.at.y.toFixed(1)}px`;
    }
  }

  life.onEnd(() => {
    for (const t of tokens.values()) {
      t.el?.style.removeProperty('translate');
      t.el?.removeAttribute('data-walk');
    }
    tokens.clear();
  });
  return { measure, step };
}
