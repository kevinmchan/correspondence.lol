// The splash: a game board that turns into the app's mark.
//
//   1. Tiles in the game's district colours drop in across the whole screen, a
//      wave running corner to corner, until it is one big board.
//   2. From the middle outwards every tile flips over. The backs are dark,
//      except for the ones that together make a letter, sealed in red.
//   3. The letter's flap is drawn down to the seal, the seal sends out rings,
//      and the name writes itself underneath.
//   4. The tiles burst away from the seal and fall, and the home page is there.
//
// Drawn on a canvas. Plays once per visit; a tap skips to the burst. The
// decision whether to play at all is made in the page's head (see index.html).
(function () {
  var root = document.getElementById('splash');
  if (!root) return;
  if (document.documentElement.classList.contains('no-splash')) {
    root.remove();
    return;
  }

  var canvas = root.querySelector('canvas');
  var text = root.querySelector('.splash-text');
  var ctx = canvas.getContext('2d');

  var COLOURS = ['#f08a76', '#f8d95a', '#7cc46a', '#2aa198', '#9ad3f7', '#5a55c8', '#f3b3e6', '#8a5a36', '#cdd6dd'];
  var INK = '#22303c';
  var CREAM = '#f6f1e7';
  var RED = '#c8442e';
  var NIGHT = '#141b22'; // behind the tiles once they have turned over

  // the letter, in tiles: 9 wide and 6 tall, with the seal one tile in from
  // the bottom. Its flap is a V drawn over the tiles, down to the seal.
  var LETTER_W = 9;
  var LETTER_H = 6;
  function letterColour(x, y) {
    return x === 4 && y === 4 ? RED : CREAM;
  }

  // when things happen, in milliseconds
  var DROP_STEP = 24; // between one diagonal of tiles and the next
  var DROP_TIME = 420;
  var FLIP_AT = 950;
  var FLIP_STEP = 46; // per tile of distance from the seal
  var FLIP_TIME = 300;
  var TEXT_AT = 1700;
  var FLAP_AT = 1380; // the flap's line starts to draw
  var FLAP_TIME = 420;
  var BURST_AT = 2800;
  var BURST_STEP = 14;
  var BURST_TIME = 640;

  var W, H, pitch, cols, rows, left, top, tiles, seal, maxDist;

  function layout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // tiles big enough that the letter (with a tile of margin) fills a phone's width
    pitch = Math.min(W / (LETTER_W + 2), H / (LETTER_H + 5));
    cols = Math.ceil(W / pitch);
    if (cols % 2 === 0) cols += 1; // an odd number, so the letter sits dead centre
    rows = Math.ceil(H / pitch) + 1;
    left = (W - cols * pitch) / 2;
    top = (H - rows * pitch) / 2;

    var letterX = (cols - LETTER_W) / 2;
    var letterY = Math.max(1, Math.round(rows * 0.4 - LETTER_H / 2));
    seal = { col: letterX + 4, row: letterY + 4, letterX: letterX, letterY: letterY };

    // districts: every tile belongs to the nearest of nine scattered points
    var seeds = COLOURS.map(function (colour) {
      return { x: Math.random() * cols, y: Math.random() * rows, colour: colour };
    });
    tiles = [];
    maxDist = 0;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var best = null;
        var bestD = Infinity;
        for (var i = 0; i < seeds.length; i++) {
          var d = Math.pow(seeds[i].x - col, 2) + Math.pow(seeds[i].y - row, 2);
          if (d < bestD) { bestD = d; best = seeds[i]; }
        }
        var lx = col - letterX;
        var ly = row - letterY;
        var inLetter = lx >= 0 && lx < LETTER_W && ly >= 0 && ly < LETTER_H;
        var dist = Math.hypot(col - seal.col, row - seal.row);
        maxDist = Math.max(maxDist, dist);
        var angle = Math.atan2(row - seal.row, col - seal.col) + (Math.random() - 0.5) * 0.9;
        tiles.push({
          col: col, row: row, dist: dist,
          front: best.colour,
          back: inLetter ? letterColour(lx, ly) : INK,
          seal: col === seal.col && row === seal.row,
          // for the burst: which way it is thrown, how hard, and how it tumbles
          vx: Math.cos(angle) * (2.5 + Math.random() * 4),
          vy: Math.sin(angle) * (2.5 + Math.random() * 4) - 1.5,
          spin: (Math.random() - 0.5) * 7,
        });
      }
    }
    // the name goes under the letter
    text.style.top = Math.round(top + (letterY + LETTER_H + 0.9) * pitch) + 'px';
  }

  function roundedSquare(size) {
    var r = size * 0.22;
    var h = size / 2;
    ctx.beginPath();
    ctx.moveTo(-h + r, -h);
    ctx.arcTo(h, -h, h, h, r);
    ctx.arcTo(h, h, -h, h, r);
    ctx.arcTo(-h, h, -h, -h, r);
    ctx.arcTo(-h, -h, h, -h, r);
    ctx.closePath();
  }

  // One tile, as in the game: a rounded square with a darker lip along the bottom.
  function drawTile(x, y, size, colour, scaleX, scaleY, turn, alpha) {
    if (alpha <= 0 || scaleX === 0) return;
    ctx.save();
    ctx.translate(x, y);
    if (turn) ctx.rotate(turn);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = alpha;
    roundedSquare(size);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(-size / 2, size / 2 - size * 0.1, size, size * 0.1);
    ctx.restore();
  }

  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var overshoot = function (p) { var c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  var ease = function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };

  var started = null;
  var burstAt = BURST_AT;
  var skipped = false;
  var done = false;

  function frame(now) {
    if (done) return;
    if (started === null) started = now;
    var t = now - started;
    var size = pitch * 0.9;
    ctx.clearRect(0, 0, W, H);

    var bursting = t >= burstAt;
    var allGone = bursting;
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var x = left + (tile.col + 0.5) * pitch;
      var y = top + (tile.row + 0.5) * pitch;
      var scaleX = 1;
      var scaleY = 1;
      var turn = 0;
      var alpha = 1;

      // 1. dropping in
      var drop = skipped ? 1 : clamp((t - (tile.col + tile.row) * DROP_STEP) / DROP_TIME);
      if (drop <= 0) continue;
      if (drop < 1) {
        y -= (1 - overshoot(drop)) * pitch * 2.2;
        alpha = Math.min(1, drop * 2.5);
        scaleX = scaleY = 0.6 + 0.4 * overshoot(drop);
      }

      // 2. turning over, a ring spreading from the seal
      var flip = skipped ? 1 : clamp((t - FLIP_AT - tile.dist * FLIP_STEP) / FLIP_TIME);
      var colour = flip < 0.5 ? tile.front : tile.back;
      if (flip > 0 && flip < 1) {
        scaleX *= Math.abs(Math.cos(flip * Math.PI));
        scaleY *= 1 + Math.sin(flip * Math.PI) * 0.12; // lifts a little as it turns
      }
      // the seal lands with a bump
      if (tile.seal && flip >= 1 && !bursting) {
        var since = t - FLAP_AT - FLAP_TIME + 80; // as the flap's two lines meet on it
        if (since > 0 && since < 420) scaleX = scaleY = 1 + Math.sin(clamp(since / 420) * Math.PI) * 0.35;
      }

      // 4. the burst
      if (bursting) {
        var out = clamp((t - burstAt - tile.dist * BURST_STEP) / BURST_TIME);
        if (out < 1) allGone = false;
        if (out > 0) {
          x += tile.vx * pitch * out;
          y += tile.vy * pitch * out + 7 * pitch * out * out; // thrown, then falling
          turn = tile.spin * out;
          alpha = 1 - out * out;
          scaleX *= 1 - out * 0.35;
          scaleY *= 1 - out * 0.35;
        }
      }
      drawTile(x, y, size, colour, scaleX, scaleY, turn, alpha);
    }

    // 3. the flap: a V from the letter's top corners down to the seal, drawn
    // from both corners at once; then rings from the seal
    var sx = left + (seal.col + 0.5) * pitch;
    var sy = top + (seal.row + 0.5) * pitch;
    var drawn = skipped ? 1 : ease(clamp((t - FLAP_AT) / FLAP_TIME));
    var fade = bursting ? 1 - clamp((t - burstAt) / 160) : 1;
    if (drawn > 0 && fade > 0) {
      var topY = top + (seal.letterY + 0.32) * pitch;
      var leftX = left + (seal.letterX + 0.32) * pitch;
      var rightX = left + (seal.letterX + LETTER_W - 0.32) * pitch;
      var tipY = sy - pitch * 0.62; // stops just short of the seal
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = INK;
      ctx.lineWidth = pitch * 0.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(leftX, topY);
      ctx.lineTo(leftX + (sx - leftX) * drawn, topY + (tipY - topY) * drawn);
      ctx.moveTo(rightX, topY);
      ctx.lineTo(rightX + (sx - rightX) * drawn, topY + (tipY - topY) * drawn);
      ctx.stroke();
      ctx.restore();
    }
    if (!bursting) {
      for (var ring = 0; ring < 3; ring++) {
        var p = clamp((t - FLAP_AT - FLAP_TIME + 60 - ring * 220) / 950);
        if (p > 0 && p < 1 && !skipped) {
          ctx.beginPath();
          ctx.arc(sx, sy, pitch * (0.5 + ease(p) * 3.4), 0, Math.PI * 2);
          ctx.strokeStyle = RED;
          ctx.globalAlpha = (1 - p) * 0.75;
          ctx.lineWidth = pitch * 0.09 * (1 - p * 0.6);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // behind the tiles: paper while they arrive, night once they have turned,
    // and nothing at all when they burst, so the page shows through
    if (bursting) root.style.background = 'transparent';
    else if (t > FLIP_AT + maxDist * FLIP_STEP * 0.5 || skipped) root.style.background = NIGHT;

    if (t > TEXT_AT && !bursting) text.classList.add('show');
    if (bursting) {
      text.classList.add('leave');
      root.style.pointerEvents = 'none';
    }
    if (allGone) {
      done = true;
      root.remove();
      window.removeEventListener('resize', layout);
      return;
    }
    requestAnimationFrame(frame);
  }

  // a tap skips ahead: whatever has not happened yet is taken as done, and the tiles burst
  root.addEventListener('pointerup', function () {
    if (started === null || burstAt < BURST_AT) return;
    var t = performance.now() - started;
    if (t >= burstAt) return;
    if (t < FLIP_AT + maxDist * FLIP_STEP + FLIP_TIME) skipped = true;
    burstAt = t;
  });

  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);
})();
