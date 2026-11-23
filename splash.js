// The splash: a game board that turns into the app's mark.
//
//   1. Nine districts bloom across the screen in the game's colours, each
//      spreading tile by tile from its own starting point until they meet
//      and the screen is one big board.
//   2. From the middle outwards every tile flips over. The backs are dark,
//      except for the ones that together make a letter, sealed in red.
//   3. The letter's flap is drawn down to the seal, the seal sends out rings,
//      and the name writes itself underneath.
//   4. The dark tiles shrink away in a ring widening from the seal, showing the
//      home page, while the letter glides up and settles into the mark at the
//      top of that page.
//
// Drawn on a canvas. Plays once per visit; a tap skips to the leaving. The
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
  var BLOOM_STEP = 52; // per tile of distance from a district's starting point
  var BLOOM_STAGGER = 40; // between one district starting and the next
  var BLOOM_TIME = 360;
  var FLIP_AT = 950;
  var FLIP_STEP = 46; // per tile of distance from the seal
  var FLIP_TIME = 300;
  var TEXT_AT = 1700;
  var FLAP_AT = 1380; // the flap's line starts to draw
  var FLAP_TIME = 420;
  var LEAVE_AT = 2800;
  var LEAVE_STEP = 22; // the ring of shrinking tiles, per tile of distance from the seal
  var SHRINK_TIME = 340;
  var GLIDE_AT = 140; // the letter sets off a moment after the ring starts
  var GLIDE_TIME = 680;

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
    var seeds = COLOURS.map(function (colour, i) {
      return { x: Math.random() * cols, y: Math.random() * rows, colour: colour, order: i };
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
        tiles.push({
          col: col, row: row, dist: dist,
          front: best.colour,
          back: inLetter ? letterColour(lx, ly) : INK,
          letter: inLetter,
          seal: col === seal.col && row === seal.row,
          // when its district's bloom reaches it
          bloomAt: best.order * BLOOM_STAGGER + Math.sqrt(bestD) * BLOOM_STEP,
          spin: (Math.random() - 0.5) * 1.6, // a small twist as it shrinks away
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
  var leaveAt = LEAVE_AT;
  var skipped = false;
  var done = false;

  function frame(now) {
    if (done) return;
    if (started === null) started = now;
    var t = now - started;
    var size = pitch * 0.9;
    ctx.clearRect(0, 0, W, H);

    var leaving = t >= leaveAt;
    var since = t - leaveAt;
    var shrinking = false; // any dark tile still on its way out

    // where the letter is: in place, or gliding to the mark on the page beneath
    var glide = leaving ? ease(clamp((since - GLIDE_AT) / GLIDE_TIME)) : 0;
    var letterCx = left + (seal.letterX + LETTER_W / 2) * pitch;
    var letterCy = top + (seal.letterY + LETTER_H / 2) * pitch;
    var goal = leaving ? markGoal() : null;
    var groupX = letterCx;
    var groupY = letterCy;
    var groupScale = 1;
    var groupAlpha = 1;
    if (goal) {
      groupX += (goal.x - letterCx) * glide;
      groupY += (goal.y - letterCy) * glide - Math.sin(glide * Math.PI) * pitch * 0.9; // a slight arc
      groupScale = 1 + (goal.scale - 1) * glide;
      groupAlpha = 1 - clamp((glide - 0.82) / 0.18); // melts into the real mark as it lands
    }

    for (var pass = 0; pass < 2; pass++) {
      // the dark tiles first, then the letter over them
      if (pass === 1) {
        ctx.save();
        ctx.translate(groupX, groupY);
        ctx.scale(groupScale, groupScale);
        ctx.translate(-letterCx, -letterCy);
      }
      for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        if (tile.letter !== (pass === 1)) continue;
        var x = left + (tile.col + 0.5) * pitch;
        var y = top + (tile.row + 0.5) * pitch;
        var scaleX = 1;
        var scaleY = 1;
        var turn = 0;
        var alpha = pass === 1 ? groupAlpha : 1;

        // 1. blooming in
        var bloom = skipped ? 1 : clamp((t - tile.bloomAt) / BLOOM_TIME);
        if (bloom <= 0) continue;
        if (bloom < 1) {
          scaleX = scaleY = Math.max(0, overshoot(bloom));
          alpha *= Math.min(1, bloom * 3);
        }

        // 2. turning over, a ring spreading from the seal
        var flip = skipped ? 1 : clamp((t - FLIP_AT - tile.dist * FLIP_STEP) / FLIP_TIME);
        var colour = flip < 0.5 ? tile.front : tile.back;
        if (flip > 0 && flip < 1) {
          scaleX *= Math.abs(Math.cos(flip * Math.PI));
          scaleY *= 1 + Math.sin(flip * Math.PI) * 0.12; // lifts a little as it turns
        }
        // the seal lands with a bump as the flap's two lines meet on it
        if (tile.seal && flip >= 1 && !leaving) {
          var landed = t - FLAP_AT - FLAP_TIME + 80;
          if (landed > 0 && landed < 420) scaleX = scaleY = 1 + Math.sin(clamp(landed / 420) * Math.PI) * 0.35;
        }

        // 4. leaving: the dark tiles shrink to nothing, nearest the seal first
        if (leaving && pass === 0) {
          var out = clamp((since - tile.dist * LEAVE_STEP) / SHRINK_TIME);
          if (out >= 1) continue;
          shrinking = true;
          var small = 1 - ease(out);
          scaleX *= small;
          scaleY *= small;
          turn = tile.spin * out;
        }
        drawTile(x, y, size, colour, scaleX, scaleY, turn, alpha);
      }
      if (pass === 1) {
        // 3. the flap: a V from the letter's top corners down to the seal,
        // drawn from both corners at once. It travels with the letter.
        var sx = left + (seal.col + 0.5) * pitch;
        var sy = top + (seal.row + 0.5) * pitch;
        var drawn = skipped ? 1 : ease(clamp((t - FLAP_AT) / FLAP_TIME));
        if (drawn > 0 && groupAlpha > 0) {
          var topY = top + (seal.letterY + 0.32) * pitch;
          var leftX = left + (seal.letterX + 0.32) * pitch;
          var rightX = left + (seal.letterX + LETTER_W - 0.32) * pitch;
          var tipY = sy - pitch * 0.62; // stops just short of the seal
          ctx.globalAlpha = groupAlpha;
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
          ctx.globalAlpha = 1;
        }
        // then rings from the seal
        if (!leaving && !skipped) {
          for (var ring = 0; ring < 3; ring++) {
            var p = clamp((t - FLAP_AT - FLAP_TIME + 60 - ring * 220) / 950);
            if (p > 0 && p < 1) {
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
        ctx.restore();
      }
    }
    var bursting = leaving;
    var allGone = leaving && !shrinking && (glide >= 1 || !goal);

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

  // Where the letter is heading: the mark at the top of the home page, which
  // has the same letter in it (the letter is 280 of the mark's 512 units wide).
  function markGoal() {
    var mark = document.querySelector('main .mark');
    var box = mark && mark.getBoundingClientRect();
    if (!box || !box.width) return null;
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      scale: (box.width * 280 / 512) / (LETTER_W * pitch),
    };
  }

  // a tap skips ahead: whatever has not happened yet is taken as done, and it leaves
  root.addEventListener('pointerup', function () {
    if (started === null || leaveAt < LEAVE_AT) return;
    var t = performance.now() - started;
    if (t >= leaveAt) return;
    if (t < FLAP_AT + FLAP_TIME) skipped = true;
    leaveAt = t;
  });

  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);
})();
