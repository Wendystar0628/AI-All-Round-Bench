/* =====================================================================
   re1999-design · 纹理与画面生成（Canvas + 少量 SVG 滤镜）
   经典脚本，挂在 window.ReTexture（在打包环境里用 globalThis.ReTexture）。
   每个生成函数都收 seed：同一 seed 画出同一张，逐帧渲染视频时用帧号做 seed 即可复现。
   分寸见 references/ornament-texture.md、references/imagery.md。
   ===================================================================== */
(function (root) {
  'use strict';

  /* 可复现的随机数（mulberry32） */
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
    if (typeof OffscreenCanvas !== 'undefined' && !root.document) return new OffscreenCanvas(w, h);
    var c = root.document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function hex(c) {
    c = c.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  /* 平滑的值噪声（1D、2D），给版画线和粗糙边用 */
  function valueNoise(seed) {
    var r = rng(seed), p = new Float32Array(512);
    for (var i = 0; i < 512; i++) p[i] = r();
    function fade(t) { return t * t * (3 - 2 * t); }
    return function (x, y) {
      y = y || 0;
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      function h(a, b) { return p[((a * 73856093) ^ (b * 19349663)) & 511]; }
      var u = fade(xf), v = fade(yf);
      var a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
      var b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
      return a + (b - a) * v;
    };
  }

  /* 1. 颗粒：以 128 灰为中心的单色噪声。
     amount 0–1 是起伏幅度；scale>1 时先画小图再放大，颗粒变粗（像高感光胶片）。
     默认配合 soft-light、alpha 0.2：暗底上平整处起伏约 3 级（与 CSS 的 .re-grain 相当）。 */
  function grain(w, h, opt) {
    opt = opt || {};
    var scale = opt.scale || 1;
    var cw = Math.max(1, Math.ceil(w / scale)), ch = Math.max(1, Math.ceil(h / scale));
    var c = canvas(cw, ch), ctx = c.getContext('2d');
    var img = ctx.createImageData(cw, ch), d = img.data, r = rng(opt.seed || 7);
    var amp = 127 * (opt.amount == null ? 0.9 : opt.amount);
    for (var i = 0; i < d.length; i += 4) {
      var v = (r() + r() + r() - 1.5) / 1.5;          /* 近似正态，范围 −1..1 */
      var g = Math.max(0, Math.min(255, 128 + v * amp * 1.6));
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (scale === 1) return c;
    var out = canvas(w, h), o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.drawImage(c, 0, 0, w, h);
    return out;
  }

  /* 叠颗粒。暗底用 soft-light（默认 alpha .2，约 3 级）；纸面用 { blend:'multiply', alpha:.055 }；
     平面图形段用 alpha .4（约 6 级）。三维和绘画画面不要调用。 */
  function applyGrain(ctx, w, h, opt) {
    opt = opt || {};
    ctx.save();
    ctx.globalCompositeOperation = opt.blend || 'soft-light';
    ctx.globalAlpha = opt.alpha == null ? 0.2 : opt.alpha;
    ctx.drawImage(grain(w, h, opt), 0, 0);
    ctx.restore();
  }

  /* 2. 纸：底色 + 低频旧渍 + 纤维 + 一角渗桃色 + 细颗粒。
     远看是一块平的暖白，近看才有纤维：纤维透明度不超过 0.12。 */
  function paper(w, h, opt) {
    opt = opt || {};
    var c = canvas(w, h), ctx = c.getContext('2d'), r = rng(opt.seed || 3);
    ctx.fillStyle = opt.base || '#E8E2D8';
    ctx.fillRect(0, 0, w, h);
    var m = Math.min(w, h), i, x, y, rad, g;
    for (i = 0; i < (opt.blotches == null ? 14 : opt.blotches); i++) {
      x = r() * w; y = r() * h; rad = m * (0.10 + r() * 0.28);
      g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      var dark = r() < 0.6;
      g.addColorStop(0, dark ? 'rgba(110,88,66,0.045)' : 'rgba(255,253,248,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    var fibers = opt.fibers == null ? Math.round(w * h / 2600) : opt.fibers;
    for (i = 0; i < fibers; i++) {
      x = r() * w; y = r() * h;
      var len = 6 + r() * 22, ang = r() * Math.PI * 2;
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * 6, (y + y2) / 2 + (r() - 0.5) * 6, x2, y2);
      ctx.lineWidth = 0.5 + r() * 0.6;
      ctx.strokeStyle = r() < 0.7 ? 'rgba(84,66,48,' + (0.05 + r() * 0.07).toFixed(3) + ')' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
    }
    if (opt.peach !== false) {
      var px = opt.peachX == null ? w : opt.peachX, py = opt.peachY == null ? h : opt.peachY;
      g = ctx.createRadialGradient(px, py, 0, px, py, w * 0.42);
      g.addColorStop(0, 'rgba(227,167,143,' + (opt.peachAlpha || 0.5) + ')');
      g.addColorStop(1, 'rgba(227,167,143,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    applyGrain(ctx, w, h, { seed: (opt.seed || 3) + 101, amount: 0.6, alpha: 0.05, blend: 'multiply' });
    return c;
  }

  /* 3. 点画渐变：用颗粒散开的过渡带代替平滑渐变（丝网、喷枪的质感）。
     stops：2–4 个颜色，按 t = 0..1 排列；angle：渐变方向（度，0 = 从左到右，90 = 从上到下）；
     radial：{ x, y, r }（占宽高的比例）时改为径向；spread：过渡带的散开程度 0–1（默认 .35）。
     画到 ctx 的 (x, y, w, h) 里，返回生成的那张 canvas。 */
  function stipple(ctx, x, y, w, h, opt) {
    opt = opt || {};
    var stops = (opt.stops || ['#0B1117', '#1E2C38']).map(hex), n = stops.length;
    var c = canvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    var r = rng(opt.seed || 21), spread = opt.spread == null ? 0.35 : opt.spread;
    var ang = (opt.angle == null ? 90 : opt.angle) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    var rad = opt.radial, ease = opt.ease || function (t) { return t; };
    var proj0 = Math.min(0, w * ca) + Math.min(0, h * sa), proj1 = Math.max(0, w * ca) + Math.max(0, h * sa);
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var t;
        if (rad) {
          var dx = (i / w - rad.x) * w, dy = (j / h - rad.y) * h;
          t = Math.sqrt(dx * dx + dy * dy) / (rad.r * Math.max(w, h));
        } else {
          t = ((i * ca + j * sa) - proj0) / (proj1 - proj0);
        }
        t = ease(Math.max(0, Math.min(1, t)));
        var tn = t + ((r() + r()) * 0.5 - 0.5) * spread;
        var k = Math.round(Math.max(0, Math.min(1, tn)) * (n - 1));
        var col = stops[k], o = (j * w + i) * 4;
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

  /* 4. 版画线：顺着一个方向走的平行细线，线宽随 tone(fx, fy)（0 亮 – 1 暗）变化。
     用来做海、天、地形、墙这类暗纹；颜色只比底亮 3–6%。 */
  function flowLines(ctx, x, y, w, h, opt) {
    opt = opt || {};
    var gap = opt.spacing || 8, amp = opt.amp == null ? 6 : opt.amp, freq = opt.freq || 0.006;
    var wMin = opt.minWidth == null ? 0.5 : opt.minWidth, wMax = opt.maxWidth == null ? 1.8 : opt.maxWidth;
    var tone = opt.tone || function () { return 0.5; };
    var noise = valueNoise(opt.seed || 9), step = 10;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = opt.color || 'rgba(233,220,205,0.05)';
    ctx.lineCap = 'round';
    for (var yy = -amp * 2, row = 0; yy < h + amp * 2; yy += gap, row++) {
      var prevX = null, prevY = null;
      for (var xx = -step; xx <= w + step; xx += step) {
        var ny = y + yy + (noise(xx * freq, row * 0.21) - 0.5) * 2 * amp + Math.sin(xx * freq * 2.3 + row * 0.7) * amp * 0.25;
        var nx = x + xx;
        if (prevX !== null) {
          var tt = Math.max(0, Math.min(1, tone((xx) / w, yy / h)));
          ctx.lineWidth = wMin + (wMax - wMin) * tt;
          ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(nx, ny); ctx.stroke();
        }
        prevX = nx; prevY = ny;
      }
    }
    ctx.restore();
  }

  /* 5. 一盏打在墙上的光（大圆、红日）：羽化的边、往下渐暗、表面颗粒。
     opt：{ core:'#A63A39', edge:'#8F3433', feather:.03（直径的比例）, sink:.3（下沿被吃掉的比例）, grain:.3 } */
  function lightDisc(ctx, cx, cy, r, opt) {
    opt = opt || {};
    var core = opt.core || '#A63A39', edge = opt.edge || '#8F3433';
    var f = (opt.feather == null ? 0.03 : opt.feather) * 2 * r;
    var c = canvas(Math.ceil(2 * r + 4 * f), Math.ceil(2 * r + 4 * f)), x = c.getContext('2d');
    var ox = c.width / 2, oy = c.height / 2;
    var g = x.createRadialGradient(ox - r * 0.12, oy - r * 0.18, r * 0.05, ox, oy, r + f);
    g.addColorStop(0, core); g.addColorStop(Math.max(0, (r - f) / (r + f)) * 0.82, core);
    g.addColorStop(Math.max(0, (r - f) / (r + f)), edge);
    var e = hex(edge);
    g.addColorStop(1, 'rgba(' + e[0] + ',' + e[1] + ',' + e[2] + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    /* 下沿被暗角吃掉 */
    var sink = opt.sink == null ? 0.3 : opt.sink;
    var lg = x.createLinearGradient(0, oy + r * (1 - 2 * sink), 0, oy + r + f);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = lg; x.fillRect(0, 0, c.width, c.height);
    /* 表面颗粒：先按圆的形状把颗粒裁出来，再用柔光叠上去，不把圆冲灰 */
    var gc = grain(c.width, c.height, { seed: opt.seed || 31, amount: 0.9 }), gx = gc.getContext('2d');
    gx.globalCompositeOperation = 'destination-in'; gx.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'soft-light';
    x.globalAlpha = opt.grain == null ? 0.35 : opt.grain;
    x.drawImage(gc, 0, 0);
    ctx.drawImage(c, cx - ox, cy - oy);
    return c;
  }

  /* 6. 胶片损伤：第 frame 帧的划痕与尘点。一帧里 0–2 根竖划痕、0–5 粒尘，
     各自只活 1–3 帧；只给平面图形段和年代感的字卡，三维与绘画画面不加。 */
  function filmDamage(ctx, w, h, frame, opt) {
    opt = opt || {};
    var r = rng(((opt.seed || 5) * 7919 + (frame | 0) * 104729) >>> 0);
    var i;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (r() < (opt.scratchChance == null ? 0.55 : opt.scratchChance)) {
      var n = 1 + (r() < 0.3 ? 1 : 0);
      for (i = 0; i < n; i++) {
        var x = r() * w, drift = (r() - 0.5) * 6;
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.bezierCurveTo(x + drift, h * 0.3, x - drift, h * 0.7, x + drift * 0.5, h + 10);
        ctx.lineWidth = 0.6 + r() * 0.7;
        ctx.strokeStyle = 'rgba(255,250,240,' + (0.05 + r() * 0.09).toFixed(3) + ')';
        ctx.stroke();
      }
    }
    var dust = Math.floor(r() * (opt.maxDust == null ? 6 : opt.maxDust));
    for (i = 0; i < dust; i++) {
      var dx = r() * w, dy = r() * h, rad = 0.6 + r() * 1.8;
      ctx.globalCompositeOperation = r() < 0.5 ? 'screen' : 'multiply';
      ctx.fillStyle = ctx.globalCompositeOperation === 'screen' ? 'rgba(255,248,236,0.35)' : 'rgba(10,8,6,0.45)';
      ctx.beginPath();
      ctx.ellipse(dx, dy, rad, rad * (0.5 + r() * 0.7), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 7. 网点：45° 栅格，点的半径随 falloff(fx, fy) 从 maxR 渐小到 0。
     颜色只比底色亮 10–20%，不要用纯白点。 */
  function halftone(ctx, x, y, w, h, opt) {
    opt = opt || {};
    var step = opt.step || 8, maxR = opt.maxR || step * 0.36;
    var ang = (opt.angle == null ? 45 : opt.angle) * Math.PI / 180;
    var falloff = opt.falloff || function (fx) { return 1 - fx; };
    var cos = Math.cos(ang), sin = Math.sin(ang), span = Math.hypot(w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = opt.color || 'rgba(233,220,205,0.16)';
    for (var v = -span; v <= span; v += step) {
      for (var u = -span; u <= span; u += step) {
        var px = x + w / 2 + u * cos - v * sin, py = y + h / 2 + u * sin + v * cos;
        if (px < x - step || px > x + w + step || py < y - step || py > y + h + step) continue;
        var t = falloff((px - x) / w, (py - y) / h);
        var rr = maxR * Math.max(0, Math.min(1, t));
        if (rr < 0.35) continue;
        ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* 8. SVG 滤镜：竖笔加粗（高反差宋）与粗糙边。注入一次，CSS 里用 filter:url(#re-stem-2)。
     re-stem-N：竖画左右各加宽 N px（1、1-5、2、2-5、3、4）；按字号 × 0.018 选最接近的一个。
     re-rough：0.5–1.5px 的手剪轮廓；re-rough-2：更明显的剪纸边。字和细线不要用 re-rough。 */
  function injectFilters(doc) {
    doc = doc || root.document;
    if (!doc || doc.getElementById('re-filters')) return doc && doc.getElementById('re-filters');
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('id', 're-filters'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    var html = '';
    [['1', 1], ['1-5', 1.5], ['2', 2], ['2-5', 2.5], ['3', 3], ['4', 4]].forEach(function (s) {
      html += '<filter id="re-stem-' + s[0] + '" x="-5%" y="-5%" width="110%" height="110%"><feMorphology operator="dilate" radius="' + s[1] + ' 0"/></filter>';
    });
    html += '<filter id="re-rough" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>';
    html += '<filter id="re-rough-2" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="5" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter>';
    svg.innerHTML = html;
    (doc.body || doc.documentElement).appendChild(svg);
    return svg;
  }
  function stemFilter(fontSizePx) {
    var r = fontSizePx * 0.018, list = [[1, '1'], [1.5, '1-5'], [2, '2'], [2.5, '2-5'], [3, '3'], [4, '4']], best = list[0];
    list.forEach(function (s) { if (Math.abs(s[0] - r) < Math.abs(best[0] - r)) best = s; });
    return 'url(#re-stem-' + best[1] + ')';
  }

  /* 9. Canvas 里的竖笔加粗：同一行字在水平方向错开画几遍。r 为左右各加宽的像素。 */
  function fillTextStem(ctx, text, x, y, r) {
    r = r == null ? 2 : r;
    for (var dx = -r; dx <= r + 1e-6; dx += 0.5) ctx.fillText(text, x + dx, y);
  }

  /* 10. 让一张 canvas 上的颗粒“活”起来：预先算 frames 张，按 fps 轮换（12fps 像胶片抖动）。
     系统打开“减少动态效果”时只画一张。返回 stop()。 */
  function animateGrain(el, opt) {
    opt = opt || {};
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
    el.width = w; el.height = h;
    var ctx = el.getContext('2d'), frames = [], n = opt.frames || 6, i;
    for (i = 0; i < n; i++) frames.push(grain(w, h, { seed: (opt.seed || 11) + i * 31, amount: opt.amount, scale: opt.scale || dpr }));
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var k = 0, last = 0, interval = 1000 / (opt.fps || 12), raf = 0;
    function draw() { ctx.clearRect(0, 0, w, h); ctx.drawImage(frames[k % n], 0, 0); }
    draw();
    if (reduce) return function () {};
    function tick(t) {
      if (t - last >= interval) { last = t; k++; draw(); }
      raf = root.requestAnimationFrame(tick);
    }
    raf = root.requestAnimationFrame(tick);
    return function stop() { root.cancelAnimationFrame(raf); };
  }

  root.ReTexture = {
    rng: rng, valueNoise: valueNoise, grain: grain, applyGrain: applyGrain, paper: paper,
    stipple: stipple, flowLines: flowLines, lightDisc: lightDisc,
    filmDamage: filmDamage, halftone: halftone,
    injectFilters: injectFilters, stemFilter: stemFilter, fillTextStem: fillTextStem,
    animateGrain: animateGrain
  };
})(typeof window !== 'undefined' ? window : globalThis);
