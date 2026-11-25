/* =====================================================================
   AI审美全能 · 装饰与图形母题  window.AEOrn
   全部原创。返回 SVG 片段字符串（坐标是调用处的画布坐标），页面拼进自己的 <svg>。
   - star4      四角星：四边内凹，竖臂约为横臂的 1.15–1.4 倍
   - faceted    切面受光的小金星（吊星的星体）：八个面各一档明暗，左上亮、右下暗
   - hanging    吊星：细线 + 黄铜挂环（一身一亮边）+ 金星 + 一团窄暖光（系列异象，也是天文台里唯一的灯）
   - cone       吊星向下投的一道羽化光锥
   - CONST / constellation   十个方向的星座徽记（黄铜发丝线 + 星点）
   - hair3 / slash / diamonds 断线、斜线分隔、◆◆
   - ribbon / hollowBand / pointMark / cornerMark  内容卡的书签带（燕尾）、看点的空心带、看点列点（菱形镶座里一颗切面小星）、卡角印的角标
   吊线 2px；几何线另见 AE.lockupStrokes（1px）。
   ===================================================================== */
(function (root) {
  'use strict';
  var uid = 0;
  function id(p) { return (p || 'o') + (++uid); }
  function f(n) { return (+n).toFixed(2); }

  /* 四角星路径。k 越小越尖：装饰星 0.14，实物星 0.3 */
  function star4(cx, cy, w, h, k) {
    h = h || w * 1.16; k = k == null ? 0.14 : k;
    var rx = w / 2, ry = h / 2;
    function P(x, y) { return f(x) + ' ' + f(y); }
    return 'M' + P(cx, cy - ry) + ' Q' + P(cx + rx * k, cy - ry * k) + ' ' + P(cx + rx, cy) +
      ' Q' + P(cx + rx * k, cy + ry * k) + ' ' + P(cx, cy + ry) +
      ' Q' + P(cx - rx * k, cy + ry * k) + ' ' + P(cx - rx, cy) +
      ' Q' + P(cx - rx * k, cy - ry * k) + ' ' + P(cx, cy - ry) + 'Z';
  }
  function starSVG(w, h, color, k) {
    h = h || Math.round(w * 1.16);
    return '<svg class="ae-st" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><path d="' + star4(w / 2, h / 2, w, h, k) + '" fill="' + (color || '#C9AA68') + '"/></svg>';
  }

  /* 切面受光的小金星：八个三角面各一档明暗（左上亮、右下暗），不是两色渐变的宝石。
     tone：八个面的颜色，依次 上左、上右、右上、右下、下右、下左、左下、左上；给三个色 [受光, 中间, 背光] 时按这三档分 */
  var GOLD = ['#FFF0C8', '#F6DFA6', '#CFA35A', '#8E6A34', '#B08445', '#7A5A2C', '#A57B40', '#EBCB86'];
  var GOLD_DIM = ['#BFAE8A', '#B09C72', '#8C7444', '#5A4424', '#6E5430', '#4A3820', '#6A5230', '#A8946A'];
  function faceted(cx, cy, w, h, tone) {
    tone = tone || GOLD;
    if (tone.length === 3) tone = [tone[0], tone[1], tone[1], tone[2], tone[2], tone[1], tone[1], tone[0]];
    var rx = w / 2, ry = h / 2, k = 0.24;
    var T = [cx, cy - ry], R = [cx + rx, cy], B = [cx, cy + ry], L = [cx - rx, cy], C = [cx, cy];
    function q(sx, sy) { return [cx + sx * rx * k, cy + sy * ry * k]; }
    var tr = q(1, -1), br = q(1, 1), bl = q(-1, 1), tl = q(-1, -1);
    var faces = [[T, tl, tone[0]], [T, tr, tone[1]], [R, tr, tone[2]], [R, br, tone[3]],
                 [B, br, tone[4]], [B, bl, tone[5]], [L, bl, tone[6]], [L, tl, tone[7]]];
    return faces.map(function (fc) {
      return '<path d="M' + f(fc[0][0]) + ' ' + f(fc[0][1]) + ' L' + f(fc[1][0]) + ' ' + f(fc[1][1]) + ' L' + f(C[0]) + ' ' + f(C[1]) + ' Z" fill="' + fc[2] + '"/>';
    }).join('');
  }

  /* 吊星：o = { x, top（线从哪里垂下来）, y（星心）, size（星高）, lit 0–1（亮度）, sway（度）,
     glow（光晕半径，0 不画）, thread（线的不透明度）, tone }。
     摆动的支点在 top。线、挂环都看得见：线 2px，环外径 ≥ 10px。 */
  function hanging(o) {
    o = o || {};
    var x = o.x, top = o.top == null ? 0 : o.top, y = o.y, s = o.size || 48, w = s * 0.74;
    var lit = o.lit == null ? 1 : o.lit, sway = o.sway || 0, gid = id('hg');
    var ringR = Math.max(5, s * 0.11), capY = y - s / 2 - ringR * 0.4;
    var out = '<g transform="rotate(' + f(sway) + ' ' + f(x) + ' ' + f(top) + ')">';
    if (o.glow) {
      out += '<defs><radialGradient id="' + gid + '"><stop offset="0" stop-color="#FFE6C4" stop-opacity="' + f(0.55 * lit) + '"/>' +
        '<stop offset=".35" stop-color="#F3C9A0" stop-opacity="' + f(0.18 * lit) + '"/><stop offset="1" stop-color="#F3C9A0" stop-opacity="0"/></radialGradient></defs>' +
        '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(o.glow) + '" fill="url(#' + gid + ')"/>';
    }
    out += '<line x1="' + f(x) + '" y1="' + f(top) + '" x2="' + f(x) + '" y2="' + f(capY - ringR * 2) + '" stroke="rgba(233,220,205,' + f(o.thread == null ? 0.5 : o.thread) + ')" stroke-width="2"/>';
    // 黄铜挂环：一条暗的身子，受光（左上）一侧一根细亮边
    var rc = capY - ringR;
    out += '<circle cx="' + f(x) + '" cy="' + f(rc) + '" r="' + f(ringR) + '" fill="none" stroke="' + (o.brass || '#5E4826') + '" stroke-width="3"/>';
    out += '<path d="M' + f(x - ringR * 0.92) + ' ' + f(rc + ringR * 0.38) + ' A' + f(ringR) + ' ' + f(ringR) + ' 0 0 1 ' + f(x + ringR * 0.38) + ' ' + f(rc - ringR * 0.92) + '" fill="none" stroke="#E9CF94" stroke-opacity="' + f(0.4 + 0.6 * lit) + '" stroke-width="1.1"/>';
    out += '<rect x="' + f(x - s * 0.06) + '" y="' + f(capY - 1) + '" width="' + f(s * 0.12) + '" height="' + f(s * 0.09) + '" fill="' + (o.brass || '#5E4826') + '"/>';
    out += '<rect x="' + f(x - s * 0.06) + '" y="' + f(capY - 1) + '" width="' + f(s * 0.04) + '" height="' + f(s * 0.09) + '" fill="#E9CF94" opacity="' + f(0.3 + 0.5 * lit) + '"/>';
    var tone = o.tone || (lit > 0.5 ? GOLD : GOLD_DIM);
    out += '<g opacity="' + f(0.35 + 0.65 * lit) + '">' + faceted(x, y, w, s, tone) + '</g>';
    return out + '</g>';
  }

  /* 光锥：从 (x, y0) 往下到 y1，顶宽 w0、底宽 w1；羽化，亮度只比底高 5–10% */
  function cone(x, y0, y1, w0, w1, a, col) {
    var gid = id('cn'), mid = id('cm');
    col = col || '#F3D6B0';
    return '<defs><linearGradient id="' + gid + '" x1="0" y1="' + f(y0) + '" x2="0" y2="' + f(y1) + '" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="' + col + '" stop-opacity="' + f(a) + '"/><stop offset=".55" stop-color="' + col + '" stop-opacity="' + f(a * 0.55) + '"/>' +
      '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient>' +
      '<filter id="' + mid + '" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="' + f(Math.max(6, w1 * 0.016)) + '"/></filter></defs>' +
      '<path d="M' + f(x - w0 / 2) + ' ' + f(y0) + ' L' + f(x + w0 / 2) + ' ' + f(y0) + ' L' + f(x + w1 / 2) + ' ' + f(y1) + ' L' + f(x - w1 / 2) + ' ' + f(y1) + ' Z" fill="url(#' + gid + ')" filter="url(#' + mid + ')" style="mix-blend-mode:screen"/>';
  }

  /* ---------- 十个方向的星座徽记：p 点（0–1 归一）、l 连线、m 星等（1 最亮）、c 圆（可选） ---------- */
  function ring(cx, cy, r, n, a0) { var p = []; for (var i = 0; i < n; i++) { var a = a0 + i / n * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
  var CONST = {
    'autumn-observatory': { name: '鸟居', p: [[.04, .12], [.5, .2], [.96, .12], [.16, .38], [.84, .38], [.3, .22], [.7, .22], [.28, .96], [.72, .96]],
      l: [[0, 1], [1, 2], [3, 4], [5, 7], [6, 8]], m: [2, 3, 2, 3, 3, 2, 2, 1, 2] },
    'mygo-pv': { name: '一滴', p: [[.5, .02], [.66, .32], [.76, .6], [.66, .86], [.5, .96], [.34, .86], [.24, .6], [.34, .32], [.5, .62]],
      l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]], m: [2, 3, 3, 3, 2, 3, 3, 3, 1] },
    'greenhouse-render': { name: '钟罩', p: [[.5, .03], [.5, .14], [.24, .3], [.14, .56], [.14, .86], [.86, .86], [.86, .56], [.76, .3], [.04, .95], [.96, .95], [.5, .52]],
      l: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 7], [7, 6], [6, 5], [8, 9]], m: [2, 3, 3, 2, 3, 3, 2, 3, 2, 2, 1] },
    'nvidia-b200-web': { name: '芯片', p: [[.2, .2], [.8, .2], [.8, .8], [.2, .8], [.5, .5], [.5, .2], [.5, .02], [.8, .5], [.98, .5], [.5, .8], [.5, .98], [.2, .5], [.02, .5]],
      l: [[0, 1], [1, 2], [2, 3], [3, 0], [5, 6], [7, 8], [9, 10], [11, 12]], m: [3, 3, 3, 3, 1, 3, 2, 3, 2, 3, 2, 3, 2] },
    'sky-citadel': { name: '浮岛', p: [[.5, .02], [.5, .17], [.36, .32], [.64, .32], [.08, .55], [.92, .55], [.3, .75], [.7, .75], [.5, .97]],
      l: [[0, 1], [1, 2], [1, 3], [2, 3], [4, 5], [4, 6], [6, 8], [8, 7], [7, 5]], m: [2, 1, 3, 3, 2, 2, 3, 3, 2] },
    'pelican-22-styles': { name: '单车', p: [[.22, .74], [.78, .74], [.46, .5], [.66, .48], [.55, .24], [.92, .2], [.4, .3]],
      l: [[0, 2], [2, 1], [2, 3], [3, 1], [3, 4], [4, 5], [4, 6]], c: [[.22, .74, .2], [.78, .74, .2]], m: [2, 2, 3, 3, 1, 2, 3] },
    'water-park': { name: '泳圈', p: ring(.5, .52, .4, 6, -Math.PI / 2).concat([[.5, .52]]),
      l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]], c: [[.5, .52, .17]], m: [1, 3, 2, 3, 2, 3, 2] },
    'harbor-mecha': { name: '巨人', p: [[.5, .04], [.5, .15], [.22, .22], [.78, .22], [.5, .37], [.12, .5], [.88, .5], [.38, .58], [.62, .58], [.33, .97], [.67, .97]],
      l: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [2, 5], [3, 6], [4, 7], [4, 8], [7, 9], [8, 10]], m: [2, 3, 2, 2, 1, 3, 3, 3, 3, 2, 2] },
    'floating-isles-game-ui': { name: '宝箱', p: [[.1, .44], [.9, .44], [.2, .18], [.8, .18], [.5, .08], [.12, .93], [.88, .93], [.5, .6]],
      l: [[0, 1], [0, 2], [2, 4], [4, 3], [3, 1], [0, 5], [5, 6], [6, 1]], m: [3, 3, 3, 3, 2, 2, 2, 1] },
    'anime-game-logo': { name: '铅字', p: [[.16, .97], [.5, .03], [.84, .97], [.31, .62], [.69, .62], [.5, .62]],
      l: [[0, 1], [1, 2], [3, 5], [5, 4]], m: [2, 2, 2, 3, 3, 1] }
  };

  /* 画一个星座：o = { line, star, lw, la（线不透明度）, sizes:[一等,二等,三等], reveal 0–1（按连线顺序点亮）} */
  function constellation(key, x, y, w, h, o) {
    o = o || {};
    var C = CONST[key];
    if (!C) return '';
    var line = o.line || '#C9AA68', star = o.star || '#E4D2A0', lw = o.lw || 2, la = o.la == null ? 0.8 : o.la;
    var sz = o.sizes || [Math.max(12, w * 0.16), Math.max(10, w * 0.115), Math.max(8, w * 0.08)];
    var rv = o.reveal == null ? 1 : o.reveal;
    var P = C.p.map(function (q) { return [x + q[0] * w, y + q[1] * h]; });
    var out = '<g class="ae-const">';
    (C.c || []).forEach(function (c) {
      out += '<circle cx="' + f(x + c[0] * w) + '" cy="' + f(y + c[1] * h) + '" r="' + f(c[2] * Math.min(w, h)) + '" fill="none" stroke="' + line + '" stroke-width="' + lw + '" opacity="' + f(la * Math.min(1, rv * 1.4)) + '"/>';
    });
    C.l.forEach(function (l, i) {
      var k = Math.max(0, Math.min(1, rv * C.l.length - i));
      if (k <= 0) return;
      var a = P[l[0]], b = P[l[1]], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), g = Math.min(o.gap == null ? sz[2] * 0.75 : o.gap, d * 0.2);
      var ex = a[0] + dx / d * g + (dx - 2 * dx / d * g) * k, ey = a[1] + dy / d * g + (dy - 2 * dy / d * g) * k;
      out += '<line x1="' + f(a[0] + dx / d * g) + '" y1="' + f(a[1] + dy / d * g) + '" x2="' + f(ex) + '" y2="' + f(ey) + '" stroke="' + line + '" stroke-width="' + lw + '" stroke-linecap="round" opacity="' + f(la) + '"/>';
    });
    P.forEach(function (q, i) {
      var m = C.m[i] || 3, s = sz[m - 1];
      out += '<path d="' + star4(q[0], q[1], s, s * 1.18) + '" fill="' + star + '" opacity="' + f(Math.min(1, rv * 1.6)) + '"/>';
    });
    return out + '</g>';
  }

  /* 三截断线（62|18|1021|18|74 的比例），2px */
  function hair3(x, y, w, col) {
    col = col || 'rgba(233,220,205,.42)';
    var u = w / 1193, a = 62 * u, g = 18 * u, b = 1021 * u;
    return '<g fill="' + col + '"><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(a) + '" height="2"/>' +
      '<rect x="' + f(x + a + g) + '" y="' + f(y) + '" width="' + f(b) + '" height="2"/>' +
      '<rect x="' + f(x + a + g + b + g) + '" y="' + f(y) + '" width="' + f(74 * u) + '" height="2"/></g>';
  }
  /* 名单里的细斜线分隔（代替一串金星） */
  function slashHTML(color) {
    return '<span class="ae-slash" aria-hidden="true"><svg viewBox="0 0 20 40" width="20" height="40"><line x1="15" y1="5" x2="5" y2="35" stroke="' + (color || 'rgba(201,170,104,.7)') + '" stroke-width="2" stroke-linecap="round"/></svg></span>';
  }
  function diamonds(color) {
    return '<span class="ae-dm" aria-hidden="true"><svg viewBox="0 0 30 14" width="30" height="14"><path d="M7 1 L13 7 L7 13 L1 7Z M22 1 L28 7 L22 13 L16 7Z" fill="' + (color || '#C9AA68') + '"/></svg></span>';
  }

  /* ---------- 卡与列表上的小件（介绍页的内容卡和看点，网站题目页同用） ---------- */
  /* 书签带的轮廓：上沿平，下端剪成燕尾（剪口深 notch）。返回 path 的 d，SVG 和 canvas（new Path2D(d)）都能用 */
  function ribbon(x, y, w, h, notch) {
    notch = notch == null ? w * 0.26 : notch;
    return 'M' + f(x) + ' ' + f(y) + 'H' + f(x + w) + 'V' + f(y + h) + 'L' + f(x + w / 2) + ' ' + f(y + h - notch) + 'L' + f(x) + ' ' + f(y + h) + 'Z';
  }
  /* 空心的带：上端是一个尖（正好插进上面那条书签带的燕尾剪口），下端也剪成燕尾。只描边 */
  function hollowBand(x, y, w, h, notch) {
    notch = notch == null ? w * 0.22 : notch;
    var X = function (v) { return f(x + v); }, Y = function (v) { return f(y + v); };
    return 'M' + X(0.5) + ' ' + Y(0) + 'L' + X(w / 2) + ' ' + Y(-notch) + 'L' + X(w - 0.5) + ' ' + Y(0) + 'V' + Y(h) +
      'L' + X(w / 2) + ' ' + Y(h - notch * 0.8) + 'L' + X(0.5) + ' ' + Y(h) + 'Z';
  }
  /* 看点的列点：一枚菱形镶座（1px 细框），座里一颗切面小星，星的四个尖正好顶到镶座；左边一截引线把它挂到左侧的带子上。
     r 是镶座的半对角线；o = { tones: [受光, 中间, 背光]（星的三档，取这一题的点亮色）, line（镶座和引线的线色）, lead（引线往左伸多长，0 不画） } */
  function pointMark(cx, cy, r, o) {
    o = o || {};
    var line = o.line || 'rgba(233,220,205,.45)', sh = r * 1.72, lead = o.lead || 0;
    var out = '<path d="M' + f(cx) + ' ' + f(cy - r) + 'L' + f(cx + r) + ' ' + f(cy) + 'L' + f(cx) + ' ' + f(cy + r) + 'L' + f(cx - r) + ' ' + f(cy) + 'Z" fill="none" stroke="' + line + '" stroke-width="1"/>';
    if (lead > 0) out += '<path d="M' + f(cx - r - lead) + ' ' + f(cy) + 'H' + f(cx - r) + '" stroke="' + line + '" stroke-width="1"/>';
    return out + faceted(cx, cy, sh * 0.84, sh, o.tones);
  }
  /* 卡角上印的角标：一折细线（臂长 s），折角一颗小菱形，里面再一道短的平行折线。dx、dy 是两臂伸出的方向（±1） */
  function cornerMark(x, y, dx, dy, s, col) {
    col = col || '#2B2723'; s = s || 22;
    var d = Math.max(2.6, s * 0.15), k = s * 0.32, m = s * 0.6;
    return '<path d="M' + f(x + dx * s) + ' ' + f(y) + 'H' + f(x) + 'V' + f(y + dy * s) + '" fill="none" stroke="' + col + '" stroke-opacity=".62" stroke-width="1"/>' +
      '<path d="M' + f(x + dx * k) + ' ' + f(y + dy * k) + 'H' + f(x + dx * m) + 'M' + f(x + dx * k) + ' ' + f(y + dy * k) + 'V' + f(y + dy * m) + '" fill="none" stroke="' + col + '" stroke-opacity=".3" stroke-width="1"/>' +
      '<path class="ae-cm-dot" d="M' + f(x) + ' ' + f(y - d) + 'L' + f(x + d) + ' ' + f(y) + 'L' + f(x) + ' ' + f(y + d) + 'L' + f(x - d) + ' ' + f(y) + 'Z" fill="' + col + '" fill-opacity=".72"/>';
  }

  root.AEOrn = {
    star4: star4, starSVG: starSVG, faceted: faceted, GOLD: GOLD, hanging: hanging, cone: cone,
    CONST: CONST, constellation: constellation, hair3: hair3, slashHTML: slashHTML, diamonds: diamonds,
    ribbon: ribbon, hollowBand: hollowBand, pointMark: pointMark, cornerMark: cornerMark, uid: id
  };
})(typeof window !== 'undefined' ? window : globalThis);
