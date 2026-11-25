/* =====================================================================
   AI审美全能 · 画面纹理（Canvas）  window.AETex
   每个函数都收 seed：同一个 seed 永远画出同一张，逐帧渲染时画面只由时间决定。
   静态层（墙、天、版画线、纸）在页面载入时画一次，frame(t) 里只动会动的东西。
   分寸见 设计系统.md「纹理与材质」：
   - 大面积明暗用点画渐变，不用平滑渐变；
   - 会动的雨线不细于 2px，按 12fps 换帧；满屏的平行线（版画线、木纹、布纹的横纹）不再画；
   - 颗粒是一张静止的瓦片（textures.css 的 .ae-grain），不逐帧重画。
   起点是 re1999-design-skill 的 texture-kit.js，按本专题的规矩改过。
   ===================================================================== */
(function (root) {
  'use strict';

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvas(w, h) {
    var c = root.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }

  function hex(c) {
    c = c.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function rgba(c, a) { var h = hex(c); return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + (a == null ? 1 : a) + ')'; }

  /* 平滑值噪声（2D） */
  function valueNoise(seed) {
    var r = rng(seed), p = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) p[i] = r();
    function fade(t) { return t * t * (3 - 2 * t); }
    function h(a, b) { return p[(((a * 73856093) ^ (b * 19349663)) >>> 0) & 1023]; }
    return function (x, y) {
      y = y || 0;
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = fade(xf), v = fade(yf);
      var a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
      var b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
      return a + (b - a) * v;
    };
  }
  function fbm(seed, oct) {
    var ns = [], o = oct || 3;
    for (var i = 0; i < o; i++) ns.push(valueNoise(seed + i * 101));
    return function (x, y) {
      var s = 0, a = 0.5, f = 1, n = 0;
      for (var i = 0; i < o; i++) { s += ns[i](x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
      return s / n;
    };
  }

  /* 点画渐变：两三级色阶之间用噪声散开的过渡带（丝网、喷枪），代替平滑渐变。
     opt.stops 2–9 个颜色；angle 度（90 = 从上到下）；radial {x,y,r}（占宽高的比例）改为径向；
     spread 0–1 过渡带散开程度；ease(t) 改变分布。画进 ctx 的 (x,y,w,h)，返回那张 canvas。 */
  function stipple(ctx, x, y, w, h, opt) {
    opt = opt || {};
    w = Math.round(w); h = Math.round(h);
    var stops = (opt.stops || ['#080C13', '#141D2B']).map(hex), n = stops.length;
    var c = canvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    var r = rng(opt.seed || 21), spread = opt.spread == null ? 0.3 : opt.spread;
    var ang = (opt.angle == null ? 90 : opt.angle) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    var rad = opt.radial, ease = opt.ease || function (t) { return t; };
    var p0 = Math.min(0, w * ca) + Math.min(0, h * sa), p1 = Math.max(0, w * ca) + Math.max(0, h * sa);
    var big = Math.max(w, h);
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var t;
        if (rad) {
          var dx = i - rad.x * w, dy = (j - rad.y * h) / (rad.sy || 1);
          t = Math.sqrt(dx * dx + dy * dy) / (rad.r * big);
        } else t = ((i * ca + j * sa) - p0) / (p1 - p0);
        t = ease(Math.max(0, Math.min(1, t)));
        var tn = t + ((r() + r()) * 0.5 - 0.5) * spread;
        var k = Math.round(Math.max(0, Math.min(1, tn)) * (n - 1)), col = stops[k], o = (j * w + i) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    if (ctx) {
      ctx.save();
      ctx.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
      if (opt.blend) ctx.globalCompositeOperation = opt.blend;
      ctx.drawImage(c, x, y);
      ctx.restore();
    }
    return c;
  }

  /* 一团光：径向渐变，最后一个色标完全透明（收干净，不留硬边）。sy 压扁；op 合成方式 */
  function glow(ctx, x, y, r, col, a, sy, op) {
    ctx.save();
    if (op) ctx.globalCompositeOperation = op;
    ctx.translate(x, y); ctx.scale(1, sy || 1);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r), h = hex(col);
    var s = h[0] + ',' + h[1] + ',' + h[2];
    g.addColorStop(0, 'rgba(' + s + ',' + a + ')');
    g.addColorStop(0.42, 'rgba(' + s + ',' + (a * 0.45) + ')');
    g.addColorStop(1, 'rgba(' + s + ',0)');
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  /* 星点：大多是 1–3px 的点，亮度不一；avoid(x,y) 返回 true 的地方不放 */
  function pinStars(ctx, n, box, seed, o) {
    o = o || {};
    var r = rng(seed), col = hex(o.color || '#F0EADF');
    for (var i = 0; i < n; i++) {
      var x = box[0] + r() * box[2], y = box[1] + r() * box[3];
      var m = Math.pow(r(), 2.4), rad = 0.7 + m * (o.max || 1.5), a = (o.minA || 0.12) + m * (o.maxA || 0.6);
      if (o.avoid && o.avoid(x, y)) continue;
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.4);
      g.addColorStop(0, 'rgba(' + col + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.5).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* 雨：斜向 2px 的短线；t 秒时的位置（下落速度 speed px/s），按 12fps 取整，像胶片一拍二 */
  function rain(ctx, x, y, w, h, opt) {
    opt = opt || {};
    var r = rng(opt.seed || 77), n = opt.n || 220, t = Math.floor((opt.t || 0) * 12) / 12;
    var ang = (opt.angle == null ? 14 : opt.angle) * Math.PI / 180, speed = opt.speed || 1400;
    var col = opt.color || 'rgba(200,214,228,0.18)';
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var len = (opt.len || 46) * (0.6 + r() * 0.8), lw = (opt.width || 2) * (0.85 + r() * 0.3);
      var px = x + r() * (w + 200) - 100, py0 = r() * (h + len), sp = speed * (0.8 + r() * 0.4);
      var py = y + ((py0 + t * sp) % (h + len)) - len;
      var shift = (py - y) * Math.tan(ang);
      if (opt.colorAt) ctx.strokeStyle = opt.colorAt(px + shift, py);
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(px + shift, py); ctx.lineTo(px + shift + Math.sin(ang) * len, py + Math.cos(ang) * len); ctx.stroke();
    }
    ctx.restore();
  }

  /* 纸：底色 + 低频旧渍 + 纤维 + 一角渗桃 + 纸颗粒（远看是一块干净的暖白） */
  function paper(w, h, opt) {
    opt = opt || {};
    var c = canvas(w, h), ctx = c.getContext('2d'), r = rng(opt.seed || 3), i, x, y, rad, g;
    ctx.fillStyle = opt.base || '#EFE5D2'; ctx.fillRect(0, 0, w, h);
    var m = Math.min(w, h);
    for (i = 0; i < 12; i++) {
      x = r() * w; y = r() * h; rad = m * (0.15 + r() * 0.4);
      g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, r() < 0.6 ? 'rgba(110,88,66,0.05)' : 'rgba(255,253,248,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    var fibers = Math.round(w * h / 2200);
    for (i = 0; i < fibers; i++) {
      x = r() * w; y = r() * h;
      var len = 6 + r() * 22, a = r() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * len / 2 + (r() - .5) * 6, y + Math.sin(a) * len / 2 + (r() - .5) * 6, x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.lineWidth = 0.6 + r() * 0.6;
      ctx.strokeStyle = r() < 0.75 ? 'rgba(84,66,48,' + (0.05 + r() * 0.06).toFixed(3) + ')' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
    }
    if (opt.peach !== false) {
      var px = opt.peachX == null ? w : opt.peachX, py = opt.peachY == null ? h : opt.peachY;
      g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(w, h) * 0.4);
      g.addColorStop(0, 'rgba(227,167,143,' + (opt.peachA || 0.42) + ')'); g.addColorStop(1, 'rgba(227,167,143,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    grainInto(ctx, w, h, { seed: (opt.seed || 3) + 101, amount: 0.6, alpha: 0.06, blend: 'multiply' });
    return c;
  }

  /* 颗粒画进 canvas（给离屏的纸、物件贴图用；整屏颗粒用 CSS 瓦片） */
  function grainInto(ctx, w, h, opt) {
    opt = opt || {};
    var c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data, r = rng(opt.seed || 7);
    var amp = 127 * (opt.amount == null ? 0.9 : opt.amount);
    for (var i = 0; i < d.length; i += 4) {
      var v = (r() + r() + r() - 1.5) / 1.5, q = Math.max(0, Math.min(255, 128 + v * amp * 1.6));
      d[i] = d[i + 1] = d[i + 2] = q; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = opt.blend || 'soft-light';
    ctx.globalAlpha = opt.alpha == null ? 0.2 : opt.alpha;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  /* 一片枫叶（七裂掌状）：r 半径，返回 Path2D，原点在叶柄与叶片交点 */
  function mapleLeaf(r, seed) {
    var p = new Path2D(), rr = rng(seed || 1);
    var lobes = [[-90, 1.0], [-45, 0.86], [-5, 0.66], [35, 0.36], [145, 0.36], [185, 0.66], [225, 0.86]];
    var pts = [];
    lobes.forEach(function (lb, i) {
      var a = lb[0] * Math.PI / 180, L = r * lb[1] * (0.92 + rr() * 0.16);
      var aL = a - 0.2, aR = a + 0.2;
      pts.push([Math.cos(aL) * L * 0.42, Math.sin(aL) * L * 0.42]);
      pts.push([Math.cos(a) * L, Math.sin(a) * L]);
      pts.push([Math.cos(aR) * L * 0.42, Math.sin(aR) * L * 0.42]);
    });
    p.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }

  /* =====================================================================
     聚集点画、椭圆上取点。约定：画进的 canvas 用设备像素；unit 是每个设计像素对应几个设备像素，
     颗粒按设计像素算大小，换分辨率不变粗细。seed 可以是数字或字符串。
     ===================================================================== */
  function seedOf(s) {
    if (typeof s === 'number') return s >>> 0;
    var h = 1779033703;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0;
    return h;
  }

  /* 聚集点画：光的过渡带用成簇的小点（看得出是“印”出来的），不是逐像素抖动；只在过渡带里放。
     field(X, Y) 返回 0–1 的密度（设计像素坐标）；o = { seed, unit, count, size（设计像素）, alpha } */
  function stippleField(ctx, w, h, field, color, o) {
    o = o || {};
    var u = o.unit || 1, sd = seedOf(o.seed || 'st'), r = rng(sd), n = fbm(sd + 1, 2), N = o.count || 60000;
    ctx.save(); ctx.fillStyle = color;
    for (var k = 0; k < N; k++) {
      var i = r() * w, j = r() * h, X = i / u, Y = j / u, f = field(X, Y);
      if (f <= 0 || r() > f * (0.4 + n(X / 18, Y / 18) * 1.2)) continue;
      ctx.globalAlpha = (o.alpha || 0.5) * (0.4 + r() * 0.6);
      ctx.beginPath(); ctx.arc(i, j, (o.size || 1.6) * (0.5 + r()) * u, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* 椭圆轨道上取点（rot 弧度） */
  function ellipsePt(cx, cy, rx, ry, rot, t) {
    var px = rx * Math.cos(t), py = ry * Math.sin(t);
    return [cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)];
  }

  root.AETex = {
    seedOf: seedOf, stippleField: stippleField, ellipsePt: ellipsePt,
    rng: rng, canvas: canvas, hex: hex, rgba: rgba, valueNoise: valueNoise, fbm: fbm,
    stipple: stipple, glow: glow, pinStars: pinStars, rain: rain,
    paper: paper, grainInto: grainInto, mapleLeaf: mapleLeaf
  };
})(typeof window !== 'undefined' ? window : globalThis);
