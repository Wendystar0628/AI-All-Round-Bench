/* =====================================================================
   bg.js — 衬托界面的简洁背景：天空 / 云海 / 远岛 / 火山竞技场 / 星空
   全部程序化绘制，画面完全由时刻 t 决定（可逐帧导出）
   ===================================================================== */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  /* ---------- 精灵生成 ---------- */
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  // 积云：先叠出柔和的密度，再按高度上色，最后逐团加受光与背光
  function cloudSprite(seed, W, H, pal, res = 1) {
    const cv = mk(W * res, H * res);
    const x = cv.getContext('2d');
    x.scale(res, res);
    const R = G.rng(seed);
    const puffs = [];
    const flat = pal.flat || 0;
    const n = 16 + Math.floor(R() * 10);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n + (R() - 0.5) * 0.04;
      const bell = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.8);
      const r = H * (0.1 + (0.2 - flat * 0.08) * bell * (0.6 + 0.4 * R()));
      puffs.push({ cx: W * (0.08 + 0.84 * u), cy: H * 0.78 - r * 0.55 - H * (0.18 - flat * 0.1) * bell * R(), r });
    }
    for (let i = 0; i < n * 0.8; i++) {
      const u = 0.16 + 0.68 * R();
      const bell = Math.sin(Math.PI * u);
      const r = H * (0.07 + (0.15 - flat * 0.06) * bell * (0.5 + R() * 0.5));
      puffs.push({ cx: W * u, cy: H * 0.64 - H * (0.3 - flat * 0.16) * bell * R(), r });
    }
    let top = H, bot = 0;
    for (const p of puffs) { top = Math.min(top, p.cy - p.r); bot = Math.max(bot, p.cy + p.r); }
    // 1 密度
    for (const p of puffs) {
      const g = x.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, p.r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.62, 'rgba(255,255,255,.96)');
      g.addColorStop(0.84, 'rgba(255,255,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(p.cx, p.cy, p.r, 0, TAU); x.fill();
    }
    // 2 按高度上色
    x.globalCompositeOperation = 'source-in';
    const vg = x.createLinearGradient(0, top, 0, bot);
    vg.addColorStop(0, pal.light);
    vg.addColorStop(0.42, pal.mid);
    vg.addColorStop(0.82, pal.shadow);
    vg.addColorStop(1, pal.base || pal.shadow);
    x.fillStyle = vg;
    x.fillRect(0, 0, W, H);
    // 3 逐团的受光与背光
    x.globalCompositeOperation = 'source-atop';
    const lx = pal.lx != null ? pal.lx : -0.35, ly = pal.ly != null ? pal.ly : -0.94;
    for (const p of puffs) {
      const gs = x.createRadialGradient(p.cx - lx * p.r * 0.45, p.cy - ly * p.r * 0.45, 0, p.cx - lx * p.r * 0.45, p.cy - ly * p.r * 0.45, p.r * 0.9);
      gs.addColorStop(0, pal.shade || 'rgba(60,70,120,.22)');
      gs.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gs;
      x.fillRect(p.cx - p.r * 2, p.cy - p.r * 2, p.r * 4, p.r * 4);
    }
    for (const p of puffs) {
      const hx = p.cx + lx * p.r * 0.42, hy = p.cy + ly * p.r * 0.42;
      const g = x.createRadialGradient(hx, hy, 0, hx, hy, p.r * 0.78);
      g.addColorStop(0, pal.hl || pal.light);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.globalAlpha = pal.hlA == null ? 0.7 : pal.hlA;
      x.fillStyle = g;
      x.fillRect(hx - p.r, hy - p.r, p.r * 2, p.r * 2);
    }
    x.globalAlpha = 1;
    // 4 底部渐隐
    x.globalCompositeOperation = 'destination-out';
    const fo = x.createLinearGradient(0, bot - (bot - top) * 0.22, 0, bot);
    fo.addColorStop(0, 'rgba(0,0,0,0)');
    fo.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = fo;
    x.fillRect(0, 0, W, H);
    return cv;
  }
  // 浮岛：草顶 + 倒锥形岩体（岩层、岩面、垂根）+ 树冠 + 瀑布，整体再罩一层空气透视
  function islandSprite(seed, W, H, pal, res = 1) {
    const cv = mk(W * res, H * res);
    const x = cv.getContext('2d');
    x.scale(res, res);
    const R = G.rng(seed);
    const top = H * 0.27;
    const L = W * 0.05, Rr = W * 0.95;
    const tipX = W * (0.4 + R() * 0.2), tipY = H * (0.86 + R() * 0.1);
    const sunR = (pal.sun == null ? 0.25 : pal.sun) >= 0.5;
    // ---- 岩体轮廓
    const pts = [[L, top + H * 0.02]];
    const N = 30;
    for (let i = 1; i < N; i++) {
      const u = i / N;
      const px = L + (Rr - L) * u;
      const side = px < tipX ? (px - L) / (tipX - L) : (Rr - px) / (Rr - tipX);
      const depth = Math.pow(G.clamp(side, 0, 1), 1.7);
      const jag = (i % 2 ? 1 : -0.4) * H * 0.035 * (0.3 + depth) * R();
      pts.push([px + (R() - 0.5) * W * 0.012, top + H * 0.05 + depth * (tipY - top - H * 0.05) + jag]);
    }
    pts.push([Rr, top + H * 0.02]);
    const body = () => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); };
    body();
    const rg = x.createLinearGradient(0, top, 0, tipY);
    rg.addColorStop(0, pal.cliff);
    rg.addColorStop(0.45, pal.rock);
    rg.addColorStop(1, pal.fade);
    x.fillStyle = rg;
    x.fill();
    x.save();
    body();
    x.clip();
    // 岩层：横向的明暗带
    for (let i = 0; i < 7; i++) {
      const yy = top + H * (0.06 + i * 0.075) + R() * H * 0.02;
      x.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(20,20,50,.09)';
      x.beginPath();
      x.moveTo(L - 10, yy);
      for (let k = 0; k <= 16; k++) x.lineTo(L + (Rr - L) * (k / 16), yy + Math.sin(k * 1.7 + i) * H * 0.008 + (R() - 0.5) * H * 0.01);
      x.lineTo(Rr + 10, yy + H * 0.03);
      x.lineTo(L - 10, yy + H * 0.03);
      x.fill();
    }
    // 岩面：向下收拢的楔形，形成棱角
    for (let i = 0; i < 9; i++) {
      const u = 0.08 + 0.84 * R();
      const px = L + (Rr - L) * u;
      const w = W * (0.025 + R() * 0.04);
      const len = H * (0.2 + R() * 0.45);
      x.fillStyle = (px < tipX) === sunR ? 'rgba(15,15,45,.14)' : 'rgba(255,245,230,.1)';
      x.beginPath();
      x.moveTo(px - w, top + H * 0.04);
      x.lineTo(px + w, top + H * 0.04);
      x.lineTo(px + (tipX - px) * 0.35, top + len);
      x.closePath();
      x.fill();
    }
    // 受光面与背光面
    const lg = x.createLinearGradient(L, 0, Rr, 0);
    const lit = pal.lit || 'rgba(255,230,200,.35)';
    lg.addColorStop(0, sunR ? 'rgba(15,15,50,.22)' : lit);
    lg.addColorStop(0.55, 'rgba(0,0,0,0)');
    lg.addColorStop(1, sunR ? lit : 'rgba(15,15,50,.22)');
    x.fillStyle = lg;
    x.fillRect(0, 0, W, H);
    // 草皮下的阴影
    const ao = x.createLinearGradient(0, top, 0, top + H * 0.08);
    ao.addColorStop(0, 'rgba(10,10,40,.35)');
    ao.addColorStop(1, 'rgba(10,10,40,0)');
    x.fillStyle = ao;
    x.fillRect(0, top, W, H * 0.08);
    x.restore();
    // ---- 垂根
    x.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const u = 0.1 + 0.8 * R();
      const px = L + (Rr - L) * u;
      const len = H * (0.08 + R() * 0.16);
      x.strokeStyle = pal.root || 'rgba(60,70,100,.35)';
      x.lineWidth = Math.max(1, W * (0.003 + R() * 0.003));
      x.beginPath();
      x.moveTo(px, top + H * 0.045);
      x.bezierCurveTo(px + (R() - 0.5) * 18, top + len * 0.4, px + (R() - 0.5) * 22, top + len * 0.7, px + (R() - 0.5) * 10, top + len);
      x.stroke();
    }
    // ---- 草顶
    const cap = () => {
      x.beginPath();
      x.moveTo(L - W * 0.02, top + H * 0.02);
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        x.lineTo(L + (Rr - L) * u, top - H * 0.028 * Math.sin(Math.PI * u) - R() * H * 0.007);
      }
      x.lineTo(Rr + W * 0.02, top + H * 0.02);
      x.quadraticCurveTo(W / 2, top + H * 0.085, L - W * 0.02, top + H * 0.02);
      x.closePath();
    };
    cap();
    const tg = x.createLinearGradient(0, top - H * 0.035, 0, top + H * 0.06);
    tg.addColorStop(0, pal.topHi || pal.top);
    tg.addColorStop(0.55, pal.top);
    tg.addColorStop(1, pal.cliff);
    x.fillStyle = tg;
    x.fill();
    // 草沿高光
    x.strokeStyle = pal.topHi || 'rgba(255,255,255,.4)';
    x.globalAlpha = 0.6;
    x.lineWidth = Math.max(1, H * 0.006);
    x.beginPath();
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const px = L + (Rr - L) * u, py = top - H * 0.028 * Math.sin(Math.PI * u);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
    x.globalAlpha = 1;
    // ---- 树冠
    const nt = 3 + Math.floor(R() * 4);
    for (let i = 0; i < nt; i++) {
      const u = 0.14 + 0.72 * R();
      const tx = L + (Rr - L) * u, r = H * (0.028 + R() * 0.03);
      const ty = top - H * 0.026 * Math.sin(Math.PI * u) - r * 0.55;
      const blobs = [[0, 0, 1], [r * 0.85, r * 0.3, 0.72], [-r * 0.8, r * 0.35, 0.62], [r * 0.2, -r * 0.55, 0.7]];
      x.fillStyle = pal.tree;
      x.beginPath();
      blobs.forEach(([dx, dy, k]) => { x.moveTo(tx + dx + r * k, ty + dy); x.arc(tx + dx, ty + dy, r * k, 0, TAU); });
      x.fill();
      const hx = tx + (sunR ? r * 0.45 : -r * 0.45), hy = ty - r * 0.45;
      const hg = x.createRadialGradient(hx, hy, 0, hx, hy, r * 1.3);
      hg.addColorStop(0, pal.treeHi || pal.tree);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      x.save();
      x.beginPath();
      blobs.forEach(([dx, dy, k]) => { x.moveTo(tx + dx + r * k, ty + dy); x.arc(tx + dx, ty + dy, r * k, 0, TAU); });
      x.clip();
      x.fillStyle = hg;
      x.fillRect(tx - r * 2.5, ty - r * 2.5, r * 5, r * 5);
      x.restore();
    }
    // ---- 瀑布
    if (pal.fall) {
      const fx = L + (Rr - L) * (0.2 + R() * 0.15);
      const fw = Math.max(3, W * 0.014);
      const fg = x.createLinearGradient(0, top, 0, H);
      fg.addColorStop(0, pal.fall);
      fg.addColorStop(0.55, 'rgba(255,255,255,.18)');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = fg;
      x.beginPath();
      x.moveTo(fx, top + H * 0.02);
      x.lineTo(fx + fw, top + H * 0.02);
      x.lineTo(fx + fw * 1.8, H);
      x.lineTo(fx - fw * 0.8, H);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(fx + fw * 0.35, top + H * 0.02, Math.max(1, fw * 0.22), (H - top) * 0.5);
    }
    // ---- 空气透视
    if (pal.haze) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = pal.haze;
      x.fillRect(0, 0, W, H);
    }
    return cv;
  }
  // 云海底：连续的一层柔光云
  function seaBand(ctx, y, h, cTop, cBot) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, cTop);
    g.addColorStop(1, cBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 1920, h);
  }

  /* ---------- 画家 ---------- */
  const cache = {};
  function sprites(key, build) {
    if (!cache[key]) cache[key] = build();
    return cache[key];
  }
  function vgrad(ctx, stops, y0 = 0, y1 = 1080) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1920, 1080);
  }
  function glow(ctx, x, y, r, c0, c1 = 'rgba(0,0,0,0)', mid) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c0);
    if (mid) g.addColorStop(mid[0], mid[1]);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function rays(ctx, x, y, t, n, len, color, spread = 0.07, speed = 0.000018) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * speed);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.sin(i * 7.3) * 0.2;
      const w = spread * (0.6 + 0.6 * G.hash(i + 3));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.0006 + i * 1.7));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, len, a - w, a + w);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // 云层：横向循环漂移
  function cloudLayer(ctx, list, t, speed, y, scale, alpha = 1, span = 2600) {
    ctx.globalAlpha = alpha;
    list.forEach((s, i) => {
      const w = s.width / s._res * scale, h = s.height / s._res * scale;
      let px = (s._x * span + t * speed * 0.001) % span;
      if (px < 0) px += span;
      px -= (span - 1920) / 2 + w / 2;
      const py = y + s._y;
      ctx.drawImage(s, px, py, w, h);
    });
    ctx.globalAlpha = 1;
  }
  function makeClouds(seed0, n, W, H, pal, res, spread) {
    const out = [];
    const R = G.rng(seed0);
    for (let i = 0; i < n; i++) {
      const w = W * (0.7 + R() * 0.6), h = H * (0.75 + R() * 0.5);
      const s = cloudSprite(seed0 * 31 + i * 7 + 1, w, h, pal, res);
      s._res = res;
      s._x = i / n + R() * 0.05;
      s._y = (R() - 0.5) * spread;
      out.push(s);
    }
    return out;
  }
  function motes(ctx, t, n, color, seed = 1, area = [0, 0, 1920, 1080], size = 2.2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const h1 = G.hash(i * 3.1 + seed), h2 = G.hash(i * 5.7 + seed * 2), h3 = G.hash(i * 9.3 + seed * 3);
      const life = 7000 + h3 * 9000;
      const p = ((t + h1 * life) % life) / life;
      const x = area[0] + area[2] * h2 + Math.sin(t * 0.0005 + i) * 30;
      const y = area[1] + area[3] * (1 - p);
      const a = Math.sin(Math.PI * p) * (0.4 + 0.6 * G.hash(i + 11));
      ctx.globalAlpha = a;
      const r = size * (0.5 + h3);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  function vignette(ctx, a = 0.55, c = '0,0,0') {
    const g = ctx.createRadialGradient(960, 560, 380, 960, 560, 1250);
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(1, `rgba(${c},${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1920, 1080);
  }
  function drawIslands(ctx, list, t) {
    list.forEach((s, i) => {
      const bob = Math.sin(t * 0.00045 + i * 1.9) * s._bob;
      ctx.globalAlpha = s._a;
      ctx.drawImage(s, s._x, s._y + bob, s.width / s._res, s.height / s._res);
    });
    ctx.globalAlpha = 1;
  }
  function makeIslands(defs, pal, res) {
    return defs.map((d, i) => {
      const s = islandSprite(d.seed, d.w, d.h, Object.assign({}, pal, d.pal || {}), res);
      Object.assign(s, { _x: d.x, _y: d.y, _a: d.a == null ? 1 : d.a, _bob: d.bob || 6, _res: res });
      return s;
    });
  }

  const P = {};
  /* 标题：黎明 */
  P.dawn = (ctx, t) => {
    const cp = { light: '#fff4e4', mid: '#f3cbbf', shadow: '#a19bc9', base: '#9592c6', shade: 'rgba(96,92,165,.22)', hl: '#fffaf2', lx: 0.55, ly: -0.8 };
    const S = sprites('dawn', () => ({
      far: makeClouds(11, 7, 520, 200, Object.assign({ flat: 0.35 }, cp), 1, 50),
      mid: makeClouds(23, 6, 820, 290, Object.assign({ flat: 0.2 }, cp), 1, 50),
      near: makeClouds(37, 6, 1180, 410, Object.assign({ flat: 0.25 }, cp), 1, 40),
      isl: makeIslands([
        { seed: 5, x: 70, y: 280, w: 440, h: 330, bob: 7, pal: { fall: 'rgba(240,248,255,.7)', sun: 0.9 } },
        { seed: 9, x: 1530, y: 230, w: 300, h: 240, bob: 5, pal: { sun: 0.1, haze: 'rgba(175,175,220,.3)' } },
        { seed: 17, x: 1330, y: 470, w: 150, h: 120, bob: 3, pal: { sun: 0.2, haze: 'rgba(190,185,225,.55)' } },
        { seed: 21, x: 640, y: 520, w: 110, h: 92, bob: 3, pal: { sun: 0.9, haze: 'rgba(190,185,225,.6)' } },
      ], { top: '#6f9a83', topHi: '#f0e2b0', tree: '#3f6a66', treeHi: '#b6d2a2', cliff: '#7d7d9f', rock: '#a3a0c4', fade: 'rgba(185,175,215,0)', line: 'rgba(70,70,125,.16)', root: 'rgba(60,60,110,.35)', lit: 'rgba(255,214,180,.45)', haze: 'rgba(165,165,212,.16)' }, 1),
    }));
    vgrad(ctx, [[0, '#07164a'], [0.26, '#1a479e'], [0.48, '#5a8ed6'], [0.62, '#b4b5d8'], [0.7, '#f1c4a4'], [0.78, '#ffdcb2'], [1, '#f2d9c8']]);
    glow(ctx, 1260, 690, 900, 'rgba(255,214,160,.55)', 'rgba(255,200,150,0)');
    rays(ctx, 1260, 690, t, 14, 1500, 'rgba(255,236,200,.13)');
    glow(ctx, 1260, 690, 170, 'rgba(255,253,240,1)', 'rgba(255,230,180,0)', [0.35, 'rgba(255,240,205,.9)']);
    cloudLayer(ctx, S.far, t, -6, 500, 0.72, 0.9);
    drawIslands(ctx, S.isl.slice(2), t);
    cloudLayer(ctx, S.mid, t, -11, 590, 0.9, 0.97);
    drawIslands(ctx, S.isl.slice(0, 2), t);
    seaBand(ctx, 740, 340, 'rgba(240,206,198,.92)', '#aaa5d4');
    cloudLayer(ctx, S.near, t, -18, 740, 1.12, 1);
    motes(ctx, t, 50, 'rgba(255,240,210,1)', 3, [0, 200, 1920, 880], 1.8);
    vignette(ctx, 0.45, '8,16,48');
  };
  /* 剧情：黄昏航行 */
  P.dusk = (ctx, t) => {
    const cp = { light: '#ffd9ad', mid: '#e8907c', shadow: '#5c4280', base: '#4a3570', shade: 'rgba(50,30,90,.3)', hl: '#ffe8c8', lx: -0.7, ly: -0.6 };
    const S = sprites('dusk', () => ({
      far: makeClouds(41, 7, 620, 200, Object.assign({ flat: 0.4 }, cp), 1, 60),
      mid: makeClouds(53, 6, 880, 290, Object.assign({ flat: 0.3 }, cp), 1, 60),
      near: makeClouds(67, 6, 1220, 400, Object.assign({ flat: 0.3 }, cp), 1, 50),
    }));
    vgrad(ctx, [[0, '#110d31'], [0.28, '#382564'], [0.48, '#86477a'], [0.6, '#df7866'], [0.68, '#ffae6e'], [0.74, '#ffd398'], [1, '#5a3a68']]);
    glow(ctx, 520, 760, 820, 'rgba(255,170,110,.55)', 'rgba(255,120,90,0)');
    glow(ctx, 520, 760, 130, 'rgba(255,246,220,1)', 'rgba(255,200,140,0)', [0.4, 'rgba(255,220,170,.9)']);
    rays(ctx, 520, 760, t, 12, 1400, 'rgba(255,200,150,.10)');
    // 远方火山岛：剧情中的目的地
    ctx.save();
    ctx.fillStyle = '#4a2a5c';
    ctx.beginPath();
    ctx.moveTo(1300, 770);
    ctx.quadraticCurveTo(1420, 700, 1515, 604);
    ctx.lineTo(1560, 594);
    ctx.lineTo(1604, 608);
    ctx.quadraticCurveTo(1700, 700, 1820, 770);
    ctx.closePath();
    ctx.fill();
    glow(ctx, 1560, 596, 90, 'rgba(255,130,70,.9)', 'rgba(255,80,40,0)');
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.00006 + i / 8) % 1;
      glow(ctx, 1560 + p * 170 + Math.sin(i * 3 + t * 0.0004) * 14, 584 - p * 300, 46 + p * 90, `rgba(80,46,90,${0.6 * (1 - p)})`, 'rgba(80,46,90,0)');
    }
    ctx.restore();
    cloudLayer(ctx, S.far, t, -40, 560, 0.7, 0.85);
    cloudLayer(ctx, S.mid, t, -95, 660, 0.9, 0.95);
    seaBand(ctx, 780, 300, 'rgba(200,110,110,.85)', '#3c2a58');
    cloudLayer(ctx, S.near, t, -180, 800, 1.15, 1);
    // 速度线：飞行感
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const h = G.hash(i * 4.7);
      const y = 140 + h * 820;
      const life = 900 + G.hash(i * 2.3) * 900;
      const p = ((t + h * life * 3) % life) / life;
      const x = 2100 - p * 2600;
      const len = 160 + h * 260;
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      g.addColorStop(0, 'rgba(255,230,210,0)');
      g.addColorStop(0.3, `rgba(255,230,210,${0.18 * Math.sin(Math.PI * p)})`);
      g.addColorStop(1, 'rgba(255,230,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, len, 1.6);
    }
    ctx.restore();
    vignette(ctx, 0.6, '18,10,40');
  };
  /* 任务柜台：晴空 */
  P.day = (ctx, t) => {
    const cp = { light: '#ffffff', mid: '#eaf3fd', shadow: '#a9c0e3', base: '#9fb8e0', shade: 'rgba(80,110,170,.18)', hl: '#ffffff', lx: -0.5, ly: -0.85 };
    const S = sprites('day', () => ({
      far: makeClouds(71, 7, 560, 190, Object.assign({ flat: 0.3 }, cp), 1, 60),
      mid: makeClouds(83, 6, 920, 300, Object.assign({ flat: 0.15 }, cp), 1, 60),
      isl: makeIslands([
        { seed: 31, x: 1360, y: 150, w: 380, h: 290, bob: 6, pal: { fall: 'rgba(255,255,255,.75)' } },
        { seed: 43, x: 110, y: 450, w: 230, h: 180, bob: 4, pal: { haze: 'rgba(200,220,245,.4)' } },
        { seed: 47, x: 990, y: 380, w: 120, h: 94, bob: 3, pal: { haze: 'rgba(205,225,248,.6)' } },
      ], { top: '#6fae8a', topHi: '#e2f2c0', tree: '#3f7f6a', treeHi: '#b2e0a8', cliff: '#8a96b8', rock: '#a9b6d8', fade: 'rgba(200,215,240,0)', line: 'rgba(70,90,140,.14)', root: 'rgba(60,80,130,.3)', lit: 'rgba(255,255,240,.38)', sun: 0.1, haze: 'rgba(190,210,240,.18)' }, 1),
    }));
    vgrad(ctx, [[0, '#1a5bcc'], [0.35, '#4c94e9'], [0.62, '#9bcaf7'], [0.82, '#d6ebfd'], [1, '#eef7ff']]);
    glow(ctx, 260, -60, 900, 'rgba(255,255,240,.55)', 'rgba(255,255,255,0)');
    rays(ctx, 260, -60, t, 10, 1500, 'rgba(255,255,255,.12)', 0.05);
    cloudLayer(ctx, S.far, t, -8, 500, 0.75, 0.92);
    drawIslands(ctx, S.isl, t);
    seaBand(ctx, 820, 260, 'rgba(235,244,253,.85)', '#c4d8f2');
    cloudLayer(ctx, S.mid, t, -16, 700, 1.05, 1);
    vignette(ctx, 0.35, '10,30,80');
  };
  /* 编队：夕照 */
  P.golden = (ctx, t) => {
    const cp = { light: '#fff2da', mid: '#f4c79b', shadow: '#9384ae', base: '#8a7aa8', shade: 'rgba(90,70,130,.24)', hl: '#fff6e6', lx: 0.65, ly: -0.7 };
    const S = sprites('golden', () => ({
      far: makeClouds(91, 7, 600, 200, Object.assign({ flat: 0.35 }, cp), 1, 50),
      mid: makeClouds(97, 6, 960, 310, Object.assign({ flat: 0.2 }, cp), 1, 50),
      isl: makeIslands([
        { seed: 61, x: 50, y: 240, w: 320, h: 240, bob: 5, pal: { sun: 0.9 } },
        { seed: 67, x: 1560, y: 330, w: 270, h: 200, bob: 5, pal: { fall: 'rgba(255,240,220,.6)', sun: 0.8, haze: 'rgba(225,190,190,.35)' } },
      ], { top: '#7f957c', topHi: '#ffd9a0', tree: '#4f6a62', treeHi: '#d8c890', cliff: '#8c7ca6', rock: '#ab9cc0', fade: 'rgba(220,190,195,0)', line: 'rgba(70,60,100,.16)', root: 'rgba(70,60,100,.3)', lit: 'rgba(255,205,160,.5)', haze: 'rgba(215,185,195,.18)' }, 1),
    }));
    vgrad(ctx, [[0, '#182c6c'], [0.3, '#4962a6'], [0.55, '#c697a2'], [0.7, '#f5c38b'], [0.85, '#ffe0b0'], [1, '#f2d6bc']]);
    glow(ctx, 1620, 620, 900, 'rgba(255,200,130,.5)', 'rgba(255,190,120,0)');
    rays(ctx, 1620, 620, t, 12, 1600, 'rgba(255,225,180,.11)');
    cloudLayer(ctx, S.far, t, -7, 540, 0.75, 0.92);
    drawIslands(ctx, S.isl, t);
    seaBand(ctx, 800, 280, 'rgba(244,200,170,.85)', '#9a88b4');
    cloudLayer(ctx, S.mid, t, -14, 720, 1.1, 1);
    motes(ctx, t, 40, 'rgba(255,236,200,1)', 7, [0, 300, 1920, 780], 1.8);
    vignette(ctx, 0.5, '20,20,60');
  };
  /* 结算：凯旋晴空 */
  P.victory = (ctx, t) => {
    const cp = { light: '#ffffff', mid: '#f4eaee', shadow: '#a3b3df', base: '#97aadc', shade: 'rgba(80,100,170,.2)', hl: '#ffffff', lx: -0.3, ly: -0.95 };
    const S = sprites('victory', () => ({
      far: makeClouds(101, 7, 620, 200, Object.assign({ flat: 0.3 }, cp), 1, 60),
      mid: makeClouds(107, 6, 1000, 330, Object.assign({ flat: 0.2 }, cp), 1, 50),
    }));
    vgrad(ctx, [[0, '#0e3896'], [0.35, '#3d7ddf'], [0.6, '#92c1f5'], [0.78, '#f2dbc0'], [1, '#ffe8c6']]);
    glow(ctx, 520, 300, 1000, 'rgba(255,240,200,.55)', 'rgba(255,240,200,0)');
    rays(ctx, 520, 300, t, 18, 1700, 'rgba(255,248,220,.12)', 0.05, 0.00003);
    cloudLayer(ctx, S.far, t, -9, 590, 0.75, 0.92);
    seaBand(ctx, 820, 260, 'rgba(245,236,236,.85)', '#b8c4ea');
    cloudLayer(ctx, S.mid, t, -16, 760, 1.1, 1);
    motes(ctx, t, 70, 'rgba(255,244,210,1)', 9, [0, 100, 1920, 980], 2);
    vignette(ctx, 0.45, '10,24,70');
  };
  /* 章节标题卡：星空 */
  P.night = (ctx, t) => {
    vgrad(ctx, [[0, '#040818'], [0.5, '#0a1638'], [1, '#160f30']]);
    glow(ctx, 960, 540, 900, 'rgba(60,90,180,.35)', 'rgba(20,30,80,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) {
      const x = G.hash(i * 1.37) * 1920, y = G.hash(i * 2.71) * 1080;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.002 * (0.5 + G.hash(i)) + i));
      ctx.globalAlpha = tw * (0.3 + 0.7 * G.hash(i * 7.7));
      ctx.fillStyle = i % 9 === 0 ? '#ffe2a8' : '#dbe8ff';
      const r = 0.6 + G.hash(i * 3.3) * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    vignette(ctx, 0.7, '0,0,10');
  };
  /* 战斗：火山熔岩竞技场 */
  P.volcano = (ctx, t, st) => {
    const S = sprites('volcano', () => ({
      smoke: makeClouds(131, 6, 700, 260, { light: '#3a1c16', mid: '#2a1512', shadow: '#5a2216', base: '#1a0c0a', shade: 'rgba(0,0,0,.12)', hl: '#6a2a18', hlA: 0.22, lx: 0.1, ly: 0.95, flat: 0.1 }, 1, 80),
      cracks: (() => {
        const cv = mk(1920, 440);
        const x = cv.getContext('2d');
        const R = G.rng(77);
        x.lineCap = 'round';
        for (let i = 0; i < 46; i++) {
          let px = R() * 1920, py = 20 + R() * 420;
          const persp = 0.25 + (py / 440) * 1.2;
          x.beginPath();
          x.moveTo(px, py);
          const segs = 4 + Math.floor(R() * 6);
          for (let k = 0; k < segs; k++) {
            px += (R() - 0.5) * 120 * persp;
            py += (R() - 0.3) * 22 * persp;
            x.lineTo(px, py);
          }
          x.strokeStyle = `rgba(255,${90 + R() * 80},30,${0.35 + R() * 0.5})`;
          x.lineWidth = (0.8 + R() * 2.6) * persp;
          x.shadowColor = 'rgba(255,90,20,.9)';
          x.shadowBlur = 10 * persp;
          x.stroke();
        }
        return cv;
      })(),
    }));
    const shake = (st && st.shake) || { x: 0, y: 0 };
    ctx.save();
    ctx.translate(shake.x, shake.y);
    vgrad(ctx, [[0, '#0d0507'], [0.25, '#22090b'], [0.45, '#4a120e'], [0.58, '#a3301a'], [0.62, '#ff7a32'], [0.66, '#5a1a10'], [1, '#100607']], -40, 1120);
    // 远山与火山
    ctx.fillStyle = '#1d0a0b';
    ctx.beginPath();
    ctx.moveTo(-40, 670);
    ctx.lineTo(220, 560); ctx.lineTo(380, 600); ctx.lineTo(560, 540); ctx.lineTo(760, 640);
    ctx.lineTo(1100, 660); ctx.lineTo(1320, 360); ctx.lineTo(1380, 340); ctx.lineTo(1440, 352); ctx.lineTo(1700, 600); ctx.lineTo(1960, 650); ctx.lineTo(1960, 720); ctx.lineTo(-40, 720);
    ctx.closePath();
    ctx.fill();
    const cg = ctx.createLinearGradient(0, 340, 0, 640);
    cg.addColorStop(0, 'rgba(255,140,60,.85)');
    cg.addColorStop(0.3, 'rgba(255,90,40,.25)');
    cg.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1384, 350); ctx.quadraticCurveTo(1360, 450, 1300, 520); ctx.quadraticCurveTo(1270, 560, 1250, 640);
    ctx.moveTo(1400, 352); ctx.quadraticCurveTo(1440, 470, 1500, 560);
    ctx.stroke();
    glow(ctx, 1382, 340, 160, 'rgba(255,170,80,.95)', 'rgba(255,80,30,0)');
    // 烟柱
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const p = (t * 0.00004 + i / 9) % 1;
      ctx.globalAlpha = 0.85 * (1 - p) * Math.min(1, p * 5);
      const s = S.smoke[i % S.smoke.length];
      const w = 300 + p * 700, h = w * (s.height / s.width);
      ctx.drawImage(s, 1382 - w / 2 + p * 380 + Math.sin(i * 2.1) * 40, 330 - h * 0.7 - p * 420, w, h);
    }
    ctx.restore();
    // 地平线热光
    glow(ctx, 960, 690, 1100, 'rgba(255,110,40,.42)', 'rgba(255,60,20,0)');
    // 地面裂纹
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.0012);
    ctx.drawImage(S.cracks, 0, 660, 1920, 440);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 竞技场符文环
    ctx.save();
    ctx.translate(960, 846);
    ctx.scale(1, 0.2);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const r = k ? 560 : 700;
      ctx.strokeStyle = `rgba(255,${k ? 170 : 120},60,${k ? 0.5 : 0.35})`;
      ctx.lineWidth = k ? 6 : 10;
      ctx.shadowColor = 'rgba(255,100,30,1)';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.rotate(t * 0.00005);
    ctx.fillStyle = 'rgba(255,180,90,.55)';
    for (let i = 0; i < 48; i++) {
      ctx.save();
      ctx.rotate((i / 48) * TAU);
      ctx.fillRect(610, -10, i % 4 ? 22 : 46, 20);
      ctx.restore();
    }
    ctx.restore();
    // 火星
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
      const h1 = G.hash(i * 1.3), h2 = G.hash(i * 2.9), h3 = G.hash(i * 4.1);
      const life = 3500 + h3 * 5000;
      const p = ((t + h1 * life) % life) / life;
      const x = h2 * 2000 - 40 + Math.sin(t * 0.0011 + i) * 40 + p * 160;
      const y = 1120 - p * (700 + h1 * 500);
      ctx.globalAlpha = Math.sin(Math.PI * p) * (0.5 + 0.5 * Math.sin(t * 0.01 + i * 3));
      ctx.fillStyle = i % 3 ? '#ffb347' : '#ff6a2a';
      const r = 1 + h3 * 2.6;
      ctx.fillRect(x, y, r, r * 1.6);
    }
    ctx.restore();
    ctx.restore();
    vignette(ctx, 0.7, '10,0,0');
  };

  G.BG = {
    c: null,
    name: null,
    state: {},
    init() {
      this.c = G.canvas(G.$('#bg'), { q: 0.8, maxK: 2.4 });
      G.onFrame((t) => this.draw(t));
    },
    set(name) {
      this.name = name;
    },
    draw(t) {
      const ctx = G.begin2d(this.c);
      const p = P[this.name];
      if (p) p(ctx, t, this.state);
      else { ctx.fillStyle = '#050a18'; ctx.fillRect(0, 0, 1920, 1080); }
    },
    warm() {
      // 预先生成各背景的精灵（画到离屏小画布上，不影响当前画面）
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 54;
      const ctx = c.getContext('2d');
      ctx.scale(96 / 1920, 54 / 1080);
      for (const k in P) { try { P[k](ctx, 0, { shake: { x: 0, y: 0 } }); } catch (e) { console.error(e); } }
    },
  };
})();
