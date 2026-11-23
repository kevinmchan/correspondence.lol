// The splash: one pull-back.
//
// It opens on a screen of solid red: the wax seal of the app's mark, seen from
// so close that it fills everything. Then a single, unbroken move draws back.
// The seal becomes a dot on a letter, the letter sits on its dark tile, and
// the tile comes to rest as the mark at the top of the home page, which has
// been fading in around it. Nothing bounces, spins or pops: one idea, one
// motion, about a second and a half.
//
// Drawn on a canvas so the shapes stay sharp at any scale. Plays each time the
// page is loaded on the home screen; a tap finishes it at once. Whether it plays at all is decided in the
// page's head (see index.html).
(function () {
  var root = document.getElementById('splash');
  if (!root) return;
  if (document.documentElement.classList.contains('no-splash')) {
    root.remove();
    return;
  }
  // the home screen is put on the page a moment after this starts: until its
  // mark is there to pull back to, the screen simply stays red
  var mark = null;
  var waited = 0;

  var canvas = root.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var INK = '#22303c';
  var CREAM = '#f6f1e7';
  var RED = '#c8442e';
  var paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || CREAM;

  var HOLD = 260; // a beat of plain red before anything moves
  var MOVE = 1350; // the pull-back
  var W, H, dpr;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  // slow away, quick through the middle, slow to rest
  var ease = function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var started = null;
  var hurry = null; // set by a tap: when, and how far along it was

  function frame(now) {
    if (!mark) {
      mark = document.querySelector('#screens .mark');
      if (!mark) {
        if (++waited > 240) { root.remove(); return; } // it never came: get out of the way
        requestAnimationFrame(frame);
        return;
      }
      root.style.background = 'transparent'; // the canvas takes over from the plain red
    }
    if (started === null) started = now;
    var p = clamp((now - started - HOLD) / MOVE);
    if (hurry) p = clamp(hurry.from + (1 - hurry.from) * (now - hurry.at) / 260);
    var e = ease(p);

    // where the mark sits on the page beneath, and the point everything turns
    // on: the centre of its seal (the mark is drawn in a 512 x 512 space)
    var box = mark.getBoundingClientRect();
    var unit = box.width / 512;
    var sealX = box.left + 256 * unit;
    var sealY = box.top + 290 * unit;
    // far enough in that the seal alone covers the furthest corner of the screen
    var reach = Math.max(
      Math.hypot(sealX, sealY), Math.hypot(W - sealX, sealY),
      Math.hypot(sealX, H - sealY), Math.hypot(W - sealX, H - sealY));
    var closest = (reach * 1.05) / (30 * unit);
    // a zoom that looks steady moves by ratio, not by amount
    var zoom = Math.exp(Math.log(closest) * (1 - e));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // the page comes up through the paper as the tile draws clear of the edges
    ctx.globalAlpha = 1 - ease(clamp((p - 0.5) / 0.42));
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.translate(sealX, sealY);
    ctx.scale(unit * zoom, unit * zoom);
    ctx.translate(-256, -290);
    roundedRect(0, 0, 512, 512, 112.6); // the tile (the page rounds its mark's corners by 22%)
    ctx.fillStyle = INK;
    ctx.fill();
    roundedRect(116, 166, 280, 180, 14); // the letter
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.beginPath(); // its flap
    ctx.moveTo(122, 176);
    ctx.lineTo(256, 276);
    ctx.lineTo(390, 176);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath(); // the seal
    ctx.arc(256, 290, 30, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();

    if (p >= 1) {
      // it now lies exactly over the page's own mark: take it away
      root.remove();
      window.removeEventListener('resize', size);
      return;
    }
    requestAnimationFrame(frame);
  }

  root.addEventListener('pointerup', function () {
    if (hurry || started === null || !mark) return;
    var now = performance.now();
    hurry = { at: now, from: clamp((now - started - HOLD) / MOVE) };
  });

  window.addEventListener('resize', size);
  size();
  requestAnimationFrame(frame);
})();
